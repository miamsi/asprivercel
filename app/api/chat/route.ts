import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ALL_CONNECTORS, getConnectorForTool, toolsFor, promptsFor } from '@/lib/connectors';
import { getOrderedModels, markRateLimited } from '@/lib/model_selector';
import { nowLabel } from '@/lib/time_utils';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const ROUTER_MODEL = 'llama-3.1-8b-instant';
const READ_ONLY_TOOLS = new Set(['list_todos', 'search_todos', 'list_notes', 'search_notes']);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Router helper --------------------------------------------------------
async function routeConnectors(userPrompt: string): Promise<string[]> {
  if (Object.keys(ALL_CONNECTORS).length <= 1) {
    return Object.keys(ALL_CONNECTORS);
  }

  const manifest = Object.values(ALL_CONNECTORS)
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n');

  const routerPrompt = `Given the catalogue of capabilities below, return a JSON array of the capability names relevant to the user's message. If the message is generic (greeting, small talk, unclear) or could need more than one, include all of them.

Capabilities:
${manifest}

User message: "${userPrompt}"

Respond with ONLY a JSON array, e.g. ["todos"].`;

  try {
    const res = await groq.chat.completions.create({
      model: ROUTER_MODEL,
      messages: [{ role: 'user', content: routerPrompt }],
      temperature: 0.0,
      max_tokens: 60,
    });
    const text = res.choices[0]?.message?.content || '';
    const match = text.match(/\[.*?\]/s);
    if (match) {
      const names = JSON.parse(match[0]);
      if (Array.isArray(names)) {
        const valid = names.filter(n => ALL_CONNECTORS[n]);
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // Fallback to all connectors
  }
  return Object.keys(ALL_CONNECTORS);
}

// --- Malformed tool call salvage (Groq Llama quirk) ------------------------
function recoverMalformedToolCall(text: string): { name: string; args: Record<string, any> } | null {
  const match = text.match(/<function=(\w+)>?\s*(\{.*)/s);
  if (!match) return null;

  const name = match[1];
  const rawArgs = match[2].replace(/<\/function>.*$/s, '').trim();

  let depth = 0;
  let end = -1;
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '{') depth++;
    else if (rawArgs[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    const args = JSON.parse(rawArgs.slice(0, end));
    return { name, args };
  } catch {
    return null;
  }
}

// --- Plain completion for post-tool final response -------------------------
async function plainComplete(candidateModels: string[], messages: any[]): Promise<string> {
  for (const model of candidateModels) {
    try {
      const res = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
      });
      return res.choices[0]?.message?.content || '';
    } catch (err: any) {
      if (err?.status === 429) {
        await markRateLimited(model, 60);
      }
      continue;
    }
  }
  return '';
}

// --- Main API handler -----------------------------------------------------
export async function POST(req: Request) {
  try {
    const { message, history, userId = 'default_user' } = await req.json();

    const activeConnectors = await routeConnectors(message);
    const selectedTools = toolsFor(activeConnectors);
    const domainPrompts = promptsFor(activeConnectors);

    const systemPrompt = `You are a sharp, time-aware personal assistant living inside a chat app.

Right now it is: ${nowLabel()}.

You have access to the following capabilities right now: ${activeConnectors.join(', ')}.
Always use a tool when the user wants to add, list, complete, reschedule, delete, or search something that fits one of your capabilities. Only reply with plain text (no tool call) for greetings, small talk, or clarifying questions.

${domainPrompts}

GENERAL RULES:
- Keep your final spoken replies short, warm, and conversational. Use at most one emoji.`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ];

    const candidateModels = await getOrderedModels(DEFAULT_MODEL);
    let dbChanged = false;

    for (const model of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          tool_choice: selectedTools.length > 0 ? 'auto' : undefined,
          temperature: 0.2,
        });

        const responseMessage = completion.choices[0]?.message;
        if (!responseMessage) continue;

        const content = responseMessage.content || '';

        // Check for Groq's malformed tool call text
        if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
          if (content.includes('<function=')) {
            const recovered = recoverMalformedToolCall(content);
            if (recovered) {
              const conn = getConnectorForTool(recovered.name);
              const result = conn
                ? await conn.handle(recovered.name, recovered.args, userId)
                : { status: 'error', message: `No connector handles ${recovered.name}` };

              if (!READ_ONLY_TOOLS.has(recovered.name)) dbChanged = true;

              messages.push({
                role: 'system',
                content: `[internal only — do not repeat this to the user] You just performed the action '${recovered.name}' with parameters ${JSON.stringify(recovered.args)}. Result: ${JSON.stringify(result)}. Now reply to the user naturally and briefly, as if you simply did the thing. Never mention tool or function names, parameters, or the word 'calling'.`,
              });

              const finalReply = await plainComplete(candidateModels, messages);
              return NextResponse.json({ reply: finalReply || 'Done!', changed: dbChanged });
            }
          }

          // Plain text response (no tool needed)
          return NextResponse.json({ reply: content || '...', changed: false });
        }

        // Standard tool call array execution
        messages.push({
          role: 'assistant',
          content: content,
          tool_calls: responseMessage.tool_calls,
        });

        for (const call of responseMessage.tool_calls) {
          const toolName = call.function.name;
          let args = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            args = {};
          }

          if (!READ_ONLY_TOOLS.has(toolName)) {
            dbChanged = true;
          }

          const conn = getConnectorForTool(toolName);
          const result = conn
            ? await conn.handle(toolName, args, userId)
            : { status: 'error', message: `no connector handles tool '${toolName}'` };

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        // Generate final human-readable response summarizing tool outputs
        const finalReply = await plainComplete(candidateModels, messages);
        return NextResponse.json({
          reply: finalReply || 'Done — check your task list in the sidebar!',
          changed: dbChanged,
        });
      } catch (err: any) {
        const cooldown = err?.status === 404 ? 3600 : 60;
        await markRateLimited(model, cooldown);
        continue;
      }
    }

    return NextResponse.json({
      reply: "Sorry, I'm having trouble reaching the model right now — please try again shortly.",
      changed: false,
    });
  } catch (err: any) {
    return NextResponse.json({ reply: `Error: ${err.message}`, changed: false }, { status: 500 });
  }
}
