import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ALL_CONNECTORS, getConnectorForTool, toolsFor, promptsFor } from '@/lib/connectors';
import { getOrderedModels, markRateLimited } from '@/lib/model_selector';
import { nowLabel } from '@/lib/time_utils';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const ROUTER_MODEL = 'llama-3.1-8b-instant';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function routeConnectors(userPrompt: string): Promise<string[]> {
  const manifest = Object.values(ALL_CONNECTORS)
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n');

  const routerPrompt = `You are an intent router for a personal assistant.
Available modules:
${manifest}

User request: "${userPrompt}"

Which modules are needed to fulfill this? Respond ONLY with a JSON array of names, e.g. ["todos"] or ["todos", "notes"]. No markdown or explanations.`;

  try {
    const res = await groq.chat.completions.create({
      model: ROUTER_MODEL,
      messages: [{ role: 'user', content: routerPrompt }],
      temperature: 0.0,
    });
    const content = res.choices[0]?.message?.content?.trim() || '[]';
    
    // Strip markdown formatting if the model wraps JSON in ```json ... ```
    const cleanContent = content.replace(/```json|```/gi, '').trim();
    const names = JSON.parse(cleanContent);
    
    if (Array.isArray(names) && names.length > 0) {
      const filtered = names.filter(n => ALL_CONNECTORS[n]);
      if (filtered.length > 0) return filtered;
    }
  } catch {
    // Fallback to all connectors on parse failure
  }
  return Object.keys(ALL_CONNECTORS);
}

export async function POST(req: Request) {
  try {
    const { message, history, userId = 'default_user' } = await req.json();

    const activeConnectors = await routeConnectors(message);
    const selectedTools = toolsFor(activeConnectors);
    const domainPrompts = promptsFor(activeConnectors);

    const systemMessage = {
      role: 'system',
      content: `Current time: ${nowLabel()}

You are a helpful to-do and notes assistant.

CRITICAL INSTRUCTIONS:
- You do not know the user's tasks or notes in memory.
- Whenever the user asks to see, check, list, or retrieve tasks or notes (e.g., "bring me my tasks", "what is due today"), you MUST call the appropriate retrieval tool before formulating your answer.
- NEVER claim that the task or note list is empty without querying the database via a tool first.

${domainPrompts}`,
    };

    const messages = [systemMessage, ...(history || []), { role: 'user', content: message }];
    const candidateModels = await getOrderedModels(DEFAULT_MODEL);

    let finalReply = '';
    let dbChanged = false;

    for (const model of candidateModels) {
      try {
        let currentMessages = [...messages];
        let attempts = 0;

        while (attempts < 5) {
          attempts++;
          const completion = await groq.chat.completions.create({
            model,
            messages: currentMessages as any,
            tools: selectedTools.length > 0 ? selectedTools : undefined,
            tool_choice: selectedTools.length > 0 ? 'auto' : undefined,
            temperature: 0.2,
          });

          const responseMessage = completion.choices[0]?.message;
          if (!responseMessage) break;

          currentMessages.push(responseMessage as any);

          if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            for (const toolCall of responseMessage.tool_calls) {
              const name = toolCall.function.name;
              const args = JSON.parse(toolCall.function.arguments || '{}');
              const conn = getConnectorForTool(name);

              // Only flag dbChanged for mutation operations, not read operations
              if (!name.startsWith('get') && !name.startsWith('fetch') && !name.startsWith('list') && !name.startsWith('search')) {
                dbChanged = true;
              }

              let result: Record<string, any>;
              if (conn) {
                result = await conn.handle(name, args, userId);
              } else {
                result = { status: 'error', message: `No connector handles ${name}` };
              }

              currentMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              } as any);
            }
          } else {
            finalReply = responseMessage.content || '';
            break;
          }
        }

        if (finalReply) break;
      } catch (err: any) {
        const cooldown = err?.status === 404 ? 3600 : 60;
        await markRateLimited(model, cooldown);
        continue;
      }
    }

    return NextResponse.json({ reply: finalReply || 'Done.', changed: dbChanged });
  } catch (err: any) {
    return NextResponse.json({ reply: `Error: ${err.message}`, changed: false }, { status: 500 });
  }
}
