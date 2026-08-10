import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export interface TodoRow {
  id: string;
  user_id: string;
  task: string;
  is_done: boolean;
  due_at?: string | null;
  category?: string | null;
  priority?: string | null;
  embedding?: number[] | null;
  created_at?: string;
  updated_at?: string;
}

export async function addTodo(
  userId: string,
  task: string,
  embedding: number[] | null,
  dueAt?: string | null,
  category?: string | null,
  priority?: string | null
): Promise<TodoRow | null> {
  const sb = getSupabaseClient();
  const payload: Partial<TodoRow> = {
    user_id: userId,
    task,
    is_done: false,
    due_at: dueAt || null,
    category: category || 'other',
    priority: priority || 'medium',
  };
  if (embedding) payload.embedding = embedding;

  const { data, error } = await sb.from('todos').insert(payload).select().single();
  if (error || !data) return null;
  return data as TodoRow;
}

export async function listTodos(userId: string, filterType: string = 'open'): Promise<TodoRow[]> {
  const sb = getSupabaseClient();
  let query = sb.from('todos').select('*').eq('user_id', userId);

  const now = new Date().toISOString();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (filterType === 'open') {
    query = query.eq('is_done', false);
  } else if (filterType === 'done') {
    query = query.eq('is_done', true);
  } else if (filterType === 'today') {
    query = query.eq('is_done', false).lte('due_at', todayEnd.toISOString()).gte('due_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
  } else if (filterType === 'overdue') {
    query = query.eq('is_done', false).lt('due_at', now);
  } else if (filterType === 'upcoming') {
    query = query.eq('is_done', false).gte('due_at', now).lte('due_at', nextWeek);
  }

  const { data } = await query.order('created_at', { ascending: false });
  return (data || []) as TodoRow[];
}

export async function findMatchingTodos(userId: string, queryText: string, status: 'open' | 'done' = 'open'): Promise<TodoRow[]> {
  const todos = await listTodos(userId, status === 'open' ? 'open' : 'done');
  const term = queryText.toLowerCase().trim();
  return todos.filter(t => t.task.toLowerCase().includes(term));
}

export async function completeTodo(id: string): Promise<void> {
  const sb = getSupabaseClient();
  await sb.from('todos').update({ is_done: true, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function reopenTodo(id: string): Promise<void> {
  const sb = getSupabaseClient();
  await sb.from('todos').update({ is_done: false, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function deleteTodo(id: string): Promise<void> {
  const sb = getSupabaseClient();
  await sb.from('todos').delete().eq('id', id);
}

export async function rescheduleTodo(id: string, dueAt: string | null): Promise<TodoRow | null> {
  const sb = getSupabaseClient();
  const { data } = await sb
    .from('todos')
    .update({ due_at: dueAt, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return (data || null) as TodoRow | null;
}

export async function reclassifyTodo(id: string, category?: string, priority?: string): Promise<TodoRow | null> {
  const sb = getSupabaseClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (category) updates.category = category;
  if (priority) updates.priority = priority;

  const { data } = await sb.from('todos').update(updates).eq('id', id).select().single();
  return (data || null) as TodoRow | null;
}

export async function semanticSearch(userId: string, embedding: number[], matchCount: number = 5): Promise<any[]> {
  const sb = getSupabaseClient();
  const { data } = await sb.rpc('match_todos', {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: matchCount,
  });
  return data || [];
}
