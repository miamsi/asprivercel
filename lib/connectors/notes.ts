import { Connector } from './base';
import { getSupabaseClient } from '../db';
import { getEmbedding } from '../jina';

const SYSTEM_PROMPT = `
NOTES — RULES:
- Use add_note for anything the user wants to jot down or remember that ISN'T an actionable task
  with a deadline (e.g. "note that the wifi password is X").
- Use search_notes for meaning-based lookups ("what did I write about the wifi?").
- Keep replies short and confirm what was saved in your own words.
`;

const TOOLS: Connector['tools'] = [
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: 'Save a freeform note for later reference.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'The note text to save.' } },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List the user\'s saved notes, most recent first.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Semantically search the user\'s notes by meaning.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note based on a description.',
      parameters: {
        type: 'object',
        properties: { note_query: { type: 'string' } },
        required: ['note_query'],
      },
    },
  },
];

async function _addNote(userId: string, content: string, embedding: number[] | null) {
  const sb = getSupabaseClient();
  const row: Record<string, unknown> = { user_id: userId, content };
  if (embedding) row.embedding = embedding;
  const { data } = await sb.from('notes').insert(row).select().single();
  return data || {};
}

async function _listNotes(userId: string) {
  const sb = getSupabaseClient();
  const { data } = await sb.from('notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return data || [];
}

export async function getNotes(userId: string) {
  return _listNotes(userId);
}

async function _findNotes(userId: string, snippet: string) {
  const list = await _listNotes(userId);
  const snippetL = snippet.toLowerCase().trim();
  return list.filter((n: any) => n.content.toLowerCase().includes(snippetL));
}

async function _deleteNote(noteId: string) {
  const sb = getSupabaseClient();
  await sb.from('notes').delete().eq('id', noteId);
}

async function handle(name: string, args: Record<string, any>, userId: string): Promise<Record<string, any>> {
  if (name === 'add_note') {
    const content = args.content.trim();
    const embedding = await getEmbedding(content);
    const row = await _addNote(userId, content, embedding);
    if (!row || !row.content) return { status: 'error', message: 'could not save note' };
    return { status: 'ok', added: row.content };
  }

  if (name === 'list_notes') {
    const notes = await _listNotes(userId);
    return { status: 'ok', notes: notes.map((n: any) => n.content) };
  }

  if (name === 'search_notes') {
    const embedding = await getEmbedding(args.query);
    if (!embedding) return { status: 'error', message: 'embedding unavailable' };
    const sb = getSupabaseClient();
    const { data } = await sb.rpc('match_notes', {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: 5,
    });
    return { status: 'ok', matches: (data || []).map((r: any) => ({ content: r.content, similarity: Number(r.similarity.toFixed(3)) })) };
  }

  if (name === 'delete_note') {
    const query = args.note_query;
    const matches = await _findNotes(userId, query);
    if (matches.length === 0) return { status: 'not_found', query };
    if (matches.length > 1) return { status: 'ambiguous', query, candidates: matches.map((n: any) => n.content) };
    await _deleteNote(matches[0].id);
    return { status: 'ok', deleted: matches[0].content };
  }

  return { status: 'error', message: `unknown notes tool ${name}` };
}

export const connector: Connector = {
  name: 'notes',
  description: 'Freeform notes and reference info.',
  tools: TOOLS,
  handle,
  systemPrompt: SYSTEM_PROMPT,
};
