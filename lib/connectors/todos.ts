import { Connector } from './base';
import * as db from '../db';
import { humanizeDue } from '../time_utils';
import { getEmbedding } from '../jina';

export const CATEGORY_EMOJI: Record<string, string> = {
  work: '💼', personal: '🙂', errand: '🏃',
  health: '🩺', finance: '💰', shopping: '🛒',
  study: '📚', other: '📌',
};

export const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴', medium: '🟡', low: '🟢',
};

const SYSTEM_PROMPT = `
TODOS — TIME AWARENESS (important):
- Whenever the user mentions timing — "tomorrow", "tonight", "next Monday", "in 2 hours",
  "this weekend", "on the 15th", "next week" — resolve it into an absolute ISO 8601 datetime
  relative to the current moment given above, and pass it as \`due_at\` when adding or
  rescheduling a task.
- If a date is given without a specific time, default the time to 09:00.
- If the user gives no timing info at all, omit \`due_at\` entirely — don't invent a date.

TODOS — SMART CLASSIFICATION (important):
- For every task you add, infer \`category\` (work, personal, errand, health, finance, shopping,
  study, or other) and \`priority\` (low, medium, high) from context, even if the user didn't state
  them. Words like "urgent", "asap", "important", "deadline" imply high priority. Routine chores
  default to medium. Vague someday-maybe items default to low.
- Don't infer category purely from how a word sounds or looks.
- If the user says a task was tagged wrong ("that's actually work, not health"), use
  reclassify_todo to fix it — don't just apologize in text.

TODOS — OTHER RULES:
- When adding a task, extract just the core task text (strip filler like "please", "remind me to")
  but keep it natural and readable.
- Treat statements about a task already being done as a request to call complete_todo.
- complete_todo, reopen_todo, and delete_todo can match more than one task if wording is broad.
  If phrasing implies every matching task ("all", "both", "every"), set match_all=true.
- Mention due dates in natural human language ("tomorrow at 9am"), not raw ISO text.
`;

const TOOLS: Connector['tools'] = [
  {
    type: 'function',
    function: {
      name: 'add_todo',
      description: 'Add a new task or reminder to the user\'s to-do list.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The core task text to add.' },
          due_at: { type: 'string', description: 'Absolute ISO 8601 datetime.' },
          category: {
            type: 'string',
            enum: ['work', 'personal', 'errand', 'health', 'finance', 'shopping', 'study', 'other'],
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_todos',
      description: 'List the user\'s tasks.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'open', 'done', 'today', 'overdue', 'upcoming'],
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: 'Mark a task as done.',
      parameters: {
        type: 'object',
        properties: {
          task_query: { type: 'string' },
          match_all: { type: 'boolean' },
        },
        required: ['task_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reopen_todo',
      description: 'Mark a previously completed task as open again.',
      parameters: {
        type: 'object',
        properties: {
          task_query: { type: 'string' },
          match_all: { type: 'boolean' },
        },
        required: ['task_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_todo',
      description: 'Change the due date/time of an existing task.',
      parameters: {
        type: 'object',
        properties: {
          task_query: { type: 'string' },
          due_at: { type: 'string' },
        },
        required: ['task_query', 'due_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reclassify_todo',
      description: 'Correct category and/or priority of an existing task.',
      parameters: {
        type: 'object',
        properties: {
          task_query: { type: 'string' },
          category: {
            type: 'string',
            enum: ['work', 'personal', 'errand', 'health', 'finance', 'shopping', 'study', 'other'],
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['task_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Permanently delete a task.',
      parameters: {
        type: 'object',
        properties: {
          task_query: { type: 'string' },
          match_all: { type: 'boolean' },
        },
        required: ['task_query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_todos',
      description: 'Semantically search tasks by meaning.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

function fmt(t: any) {
  return {
    task: t.task,
    is_done: t.is_done,
    due: humanizeDue(t.due_at),
    category: t.category || 'other',
    priority: t.priority || 'medium',
  };
}

async function handle(name: string, args: Record<string, any>, userId: string): Promise<Record<string, any>> {
  if (name === 'add_todo') {
    const task = args.task.trim();
    const embedding = await getEmbedding(task);

    if (embedding) {
      const candidates = await db.semanticSearch(userId, embedding, 1);
      if (candidates && candidates.length > 0 && !candidates[0].is_done && candidates[0].similarity >= 0.90) {
        return { status: 'duplicate', existing: fmt(candidates[0]) };
      }
    }

    const row = await db.addTodo(userId, task, embedding, args.due_at, args.category, args.priority);
    if (!row) return { status: 'error', message: 'could not save task' };
    return { status: 'ok', added: fmt(row) };
  }

  if (name === 'list_todos') {
    const filter = args.filter || 'open';
    const todos = await db.listTodos(userId, filter);
    return { status: 'ok', filter, todos: todos.map(fmt) };
  }

  if (['complete_todo', 'reopen_todo', 'delete_todo', 'reschedule_todo', 'reclassify_todo'].includes(name)) {
    const query = args.task_query;
    const matchAll = Boolean(args.match_all);
    const status = name === 'reopen_todo' ? 'done' : 'open';
    let matches = await db.findMatchingTodos(userId, query, status);

    if (matches.length === 0) {
      const emb = await getEmbedding(query);
      if (emb) {
        let results = await db.semanticSearch(userId, emb, 3);
        const wantedDone = status === 'done';
        results = results.filter((r: any) => Boolean(r.is_done) === wantedDone);
        if (results.length > 0) matches = [results[0]];
      }
    }

    if (matches.length === 0) {
      return { status: 'not_found', query };
    }

    if (name === 'reschedule_todo') {
      const match = matches[0];
      const updated = await db.rescheduleTodo(match.id, args.due_at);
      return { status: 'ok', rescheduled: match.task, new_due: humanizeDue(updated?.due_at) };
    }

    if (name === 'reclassify_todo') {
      const match = matches[0];
      const updated = await db.reclassifyTodo(match.id, args.category, args.priority);
      if (!updated) return { status: 'error', message: 'nothing to update' };
      return {
        status: 'ok',
        reclassified: match.task,
        category: updated.category,
        priority: updated.priority,
      };
    }

    if (matches.length > 1 && !matchAll) {
      return { status: 'ambiguous', query, candidates: matches.map(m => m.task) };
    }

    const targets = matchAll ? matches : matches.slice(0, 1);
    const doneList: string[] = [];
    for (const t of targets) {
      if (name === 'complete_todo') await db.completeTodo(t.id);
      else if (name === 'reopen_todo') await db.reopenTodo(t.id);
      else if (name === 'delete_todo') await db.deleteTodo(t.id);
      doneList.push(t.task);
    }

    const keyMap: Record<string, string> = { complete_todo: 'completed', reopen_todo: 'reopened', delete_todo: 'deleted' };
    return { status: 'ok', [keyMap[name]]: doneList };
  }

  if (name === 'search_todos') {
    const query = args.query;
    const emb = await getEmbedding(query);
    if (!emb) return { status: 'error', message: 'embedding unavailable' };
    const results = await db.semanticSearch(userId, emb, 5);
    return { status: 'ok', matches: results.map((r: any) => ({ ...fmt(r), similarity: Number(r.similarity.toFixed(3)) })) };
  }

  return { status: 'error', message: `unknown todos tool ${name}` };
}

export const connector: Connector = {
  name: 'todos',
  description: 'Time-aware to-do list and reminders.',
  tools: TOOLS,
  handle,
  systemPrompt: SYSTEM_PROMPT,
};
