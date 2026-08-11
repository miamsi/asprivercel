'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CheckCircle2,
  Circle,
  FileText,
  LogOut,
  Send,
  Calendar,
  AlertCircle,
  Clock,
  CheckCheck,
  ListFilter,
  Sparkles,
  Bot,
  User,
  ExternalLink,
  AlertTriangle,
  Lock,
  Mail,
  Loader2,
  Menu,
  X,
  Pin,
} from 'lucide-react';
import { humanizeDue } from '@/lib/time_utils';
import { CATEGORY_EMOJI, PRIORITY_EMOJI } from '@/lib/connectors/todos';

// --- Supabase client -------------------------------------------------------
// Guarded so a missing env var fails loudly at runtime instead of crashing
// the entire Next.js build during static prerendering.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars are missing — auth/data features will not work.');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

// --- Design tokens -----------------------------------------------------
// canvas #FAF7FF · ink #170F26 · violet #6D28D9 · rose #FB4D67
// amber #FFC53D · emerald #16C172 · sky #2F8FFF
const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const CATEGORY_PALETTE = [
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', dot: 'bg-sky-500' },
] as const;

function categoryStyle(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

const FILTER_STYLES: Record<string, { active: string; ring: string; icon: string }> = {
  open: { active: 'bg-[#6D28D9] text-white', ring: 'ring-violet-200', icon: 'text-violet-500' },
  today: { active: 'bg-[#FFC53D] text-[#170F26]', ring: 'ring-amber-200', icon: 'text-amber-500' },
  overdue: { active: 'bg-[#FB4D67] text-white', ring: 'ring-rose-200', icon: 'text-rose-500' },
  upcoming: { active: 'bg-[#2F8FFF] text-white', ring: 'ring-sky-200', icon: 'text-sky-500' },
  done: { active: 'bg-[#16C172] text-white', ring: 'ring-emerald-200', icon: 'text-emerald-500' },
  all: { active: 'bg-[#170F26] text-white', ring: 'ring-zinc-300', icon: 'text-zinc-500' },
};

interface Todo {
  id: string;
  user_id: string;
  task: string;
  is_done: boolean;
  due_at?: string | null;
  category?: string | null;
  priority?: string | null;
}

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AspriDashboard() {
  const [sessionUser, setSessionUser] = useState<{ id: string; email: string } | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'open' | 'today' | 'overdue' | 'upcoming' | 'done' | 'all'>('open');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [overdueTodos, setOverdueTodos] = useState<Todo[]>([]);
  const [todayTodos, setTodayTodos] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! How can I help you manage your tasks and notes today?" },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSessionUser({ id: session.user.id, email: session.user.email || '' });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionUser({ id: session.user.id, email: session.user.email || '' });
      } else {
        setSessionUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTodos = useCallback(async (userId: string, filterType: string) => {
    let query = supabase.from('todos').select('*').eq('user_id', userId);
    const now = new Date().toISOString();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (filterType === 'open') {
      query = query.eq('is_done', false);
    } else if (filterType === 'done') {
      query = query.eq('is_done', true);
    } else if (filterType === 'today') {
      query = query.eq('is_done', false).lte('due_at', todayEnd.toISOString()).gte('due_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    } else if (filterType === 'overdue') {
      query = query.eq('is_done', false).lt('due_at', now);
    } else if (filterType === 'upcoming') {
      query = query.eq('is_done', false).gte('due_at', now).lte('due_at', nextWeek);
    }

    const { data } = await query.order('created_at', { ascending: false });
    setTodos((data || []) as Todo[]);
  }, []);

  const fetchBanners = useCallback(async (userId: string) => {
    const now = new Date().toISOString();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: overdue } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .eq('is_done', false)
      .lt('due_at', now);

    const { data: today } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .eq('is_done', false)
      .lte('due_at', todayEnd.toISOString())
      .gte('due_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

    setOverdueTodos((overdue || []) as Todo[]);
    setTodayTodos((today || []) as Todo[]);
  }, []);

  const fetchNotes = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    setNotes((data || []) as Note[]);
  }, []);

  const refreshAllData = useCallback(async (userId: string) => {
    await Promise.all([
      fetchTodos(userId, activeFilter),
      fetchBanners(userId),
      fetchNotes(userId),
    ]);
  }, [fetchTodos, fetchBanners, fetchNotes, activeFilter]);

  useEffect(() => {
    if (sessionUser) {
      refreshAllData(sessionUser.id);
    }
  }, [sessionUser, activeFilter, refreshAllData]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    setAuthLoading(true);

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setAuthMessage('Account created! Please check your email to confirm registration.');
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
    setMessages([{ role: 'assistant', content: "Hi! How can I help you manage your tasks and notes today?" }]);
  };

  const toggleTodo = async (todo: Todo) => {
    if (!sessionUser) return;
    const nextState = !todo.is_done;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_done: nextState } : t));

    await supabase
      .from('todos')
      .update({ is_done: nextState, updated_at: new Date().toISOString() })
      .eq('id', todo.id);

    refreshAllData(sessionUser.id);
  };

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isSending || !sessionUser) return;

    const userMsg: Message = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsSending(true);

    try {
      const history = messages.slice(-10);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history,
          userId: sessionUser.id,
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Request completed.' }]);

      if (data.changed) {
        refreshAllData(sessionUser.id);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection issue. Please verify API endpoints.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const FontImport = () => (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500&display=swap');
    `}</style>
  );

  // --- Auth screen -----------------------------------------------------
  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7FF] p-4 font-sans antialiased text-[#170F26]">
        <FontImport />
        <div className="w-full max-w-md rounded-3xl border-2 border-[#170F26] bg-white p-6 sm:p-8 shadow-[6px_6px_0_0_#170F26]">
          <div className="text-center mb-6">
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-[#6D28D9] text-white mb-3 rotate-[-3deg] shadow-[3px_3px_0_0_#170F26]">
              <span style={{ fontFamily: FONT_DISPLAY }} className="text-2xl font-bold">A</span>
            </div>
            <h1 style={{ fontFamily: FONT_DISPLAY }} className="text-2xl font-bold text-[#170F26]">Aspri</h1>
            <p className="text-xs text-zinc-500 mt-1">Your to-do list, managed entirely by chatting.</p>
          </div>

          <div className="flex rounded-2xl bg-[#FAF7FF] p-1 border-2 border-[#170F26] mb-6">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                authMode === 'login' ? 'bg-[#6D28D9] text-white shadow-[2px_2px_0_0_#170F26]' : 'text-zinc-500 hover:text-[#170F26]'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                authMode === 'signup' ? 'bg-[#6D28D9] text-white shadow-[2px_2px_0_0_#170F26]' : 'text-zinc-500 hover:text-[#170F26]'
              }`}
            >
              Sign up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border-2 border-[#FB4D67] text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border-2 border-[#16C172] text-emerald-800 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{authMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[#170F26] block mb-1.5">Email address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="your email"
                  className="w-full bg-white border-2 border-zinc-200 focus:border-[#6D28D9] rounded-xl pl-9 pr-4 py-2.5 text-xs text-[#170F26] placeholder-zinc-400 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#170F26] block mb-1.5">Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3" />
                <input
                  type="password"
                  name="password"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border-2 border-zinc-200 focus:border-[#6D28D9] rounded-xl pl-9 pr-4 py-2.5 text-xs text-[#170F26] placeholder-zinc-400 focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-[#170F26] hover:bg-[#2A1E42] disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-[3px_3px_0_0_#6D28D9] flex items-center justify-center gap-2"
            >
              {authLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{authMode === 'login' ? 'Log in' : 'Create account'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filterOptions = [
    { key: 'open', label: 'Open', icon: Circle },
    { key: 'today', label: 'Today', icon: Clock },
    { key: 'overdue', label: 'Overdue', icon: AlertCircle },
    { key: 'upcoming', label: 'Upcoming', icon: Calendar },
    { key: 'done', label: 'Done', icon: CheckCheck },
    { key: 'all', label: 'All', icon: ListFilter },
  ] as const;

  return (
    <div className="flex h-screen bg-[#FAF7FF] text-[#170F26] font-sans antialiased selection:bg-violet-200/60 overflow-hidden relative">
      <FontImport />

      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-[#170F26]/30 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 w-80 max-w-[85vw] border-r-2 border-[#170F26] bg-white flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden hidden'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          <div className="p-3.5 mx-3 mt-3 rounded-2xl border-2 border-[#170F26] bg-[#FAF7FF] flex items-center justify-between shadow-[3px_3px_0_0_#170F26]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#6D28D9] flex items-center justify-center font-bold text-white text-xs shrink-0 rotate-[-3deg]">
                <span style={{ fontFamily: FONT_DISPLAY }}>MS</span>
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-[#170F26] truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16C172]" />
                  <span className="text-[10px] text-zinc-500 font-semibold">Pro Workspace</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                title="Hide sidebar"
                className="text-[#170F26] hover:text-[#6D28D9] p-1.5 hover:bg-violet-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="text-[#170F26] hover:text-[#FB4D67] p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-3 pt-4 pb-2">
            <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Filters</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                const style = FILTER_STYLES[key];
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveFilter(key);
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold transition-all border-2 ${
                      active
                        ? `${style.active} border-[#170F26] shadow-[2px_2px_0_0_#170F26]`
                        : 'text-zinc-500 border-transparent hover:border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? '' : style.icon}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 custom-scrollbar">
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tasks</span>
                <span style={{ fontFamily: FONT_MONO }} className="text-[10px] text-[#6D28D9] font-semibold">{todos.length} Active</span>
              </div>
              <div className="space-y-2">
                {todos.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border-2 border-dashed border-zinc-200 text-xs text-zinc-400">
                    Nothing here — ask me to add something!
                  </div>
                ) : (
                  todos.map(todo => {
                    const category = todo.category || 'other';
                    const catEmoji = CATEGORY_EMOJI[category] || '📌';
                    const priority = todo.priority || 'medium';
                    const priorityEmoji = PRIORITY_EMOJI[priority] || '🟡';
                    const cs = categoryStyle(category);

                    return (
                      <div
                        key={todo.id}
                        className={`group relative p-2.5 pl-3 rounded-xl bg-white border-2 border-zinc-200 hover:border-[#170F26] hover:shadow-[2px_2px_0_0_#170F26] hover:-translate-y-0.5 transition-all border-l-4 ${cs.border}`}
                      >
                        <Pin className={`w-3 h-3 absolute -top-1.5 -left-1.5 ${cs.text} rotate-[-3deg] opacity-70`} />
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => toggleTodo(todo)}
                            className="mt-0.5 text-zinc-300 hover:text-[#16C172] transition-colors"
                          >
                            {todo.is_done ? (
                              <CheckCircle2 className="w-4 h-4 text-[#16C172]" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold leading-snug ${todo.is_done ? 'line-through text-zinc-400' : 'text-[#170F26]'}`}>
                              {todo.task}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-bold ${cs.bg} ${cs.border} ${cs.text}`}>
                                <span>{catEmoji}</span>
                                <span>{category}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-bold">
                                <span>{priorityEmoji}</span>
                              </span>
                              {todo.due_at && (
                                <span style={{ fontFamily: FONT_MONO }} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 ml-auto">
                                  <Clock className="w-2.5 h-2.5 text-zinc-400" />
                                  {humanizeDue(todo.due_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-zinc-400" />
                  <span>Notes</span>
                </div>
                <span style={{ fontFamily: FONT_MONO }} className="text-[10px] text-[#6D28D9] font-semibold">{notes.length} saved</span>
              </div>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border-2 border-dashed border-zinc-200 text-xs text-zinc-400">
                    No notes yet — try "note that..."
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl bg-[#FFFBEB] border-2 border-amber-200 transition-all text-xs text-zinc-800 leading-relaxed group">
                      <p style={{ fontFamily: FONT_MONO }} className="line-clamp-4 text-[11px] text-[#170F26]">{note.content}</p>
                      <div className="mt-2.5 pt-2 border-t border-amber-200 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(note.content)}
                          className="flex items-center gap-1 text-[#6D28D9] hover:text-[#4C1D95] font-bold transition-opacity"
                        >
                          <span>Copy</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full bg-[#FAF7FF] relative overflow-hidden">
        <div className="p-3 sm:p-4 pb-0 z-20 flex items-center">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl bg-white border-2 border-[#170F26] shadow-[2px_2px_0_0_#170F26] hover:bg-violet-50 transition-all flex items-center gap-1.5 text-xs font-bold text-[#170F26]"
            title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <Menu className="w-4 h-4 text-[#170F26]" />
            <span className="hidden sm:inline">{isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}</span>
          </button>
        </div>

        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2 z-10">
            {overdueTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-[#FB4D67] border-2 border-[#170F26] text-white text-xs font-semibold flex items-center gap-2 shadow-[2px_2px_0_0_#170F26]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>⏰ {overdueTodos.length} overdue: {overdueTodos.slice(0, 3).map(t => t.task).join(', ')}{overdueTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-[#FFC53D] border-2 border-[#170F26] text-[#170F26] text-xs font-semibold flex items-center gap-2 shadow-[2px_2px_0_0_#170F26]">
                <Clock className="w-4 h-4 shrink-0" />
                <span>📅 Due today: {todayTodos.slice(0, 3).map(t => t.task).join(', ')}{todayTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 z-10 custom-scrollbar">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 sm:gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold border-2 border-[#170F26] ${
                msg.role === 'user'
                  ? 'bg-[#6D28D9] text-white'
                  : 'bg-white text-[#170F26]'
              }`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed border-2 border-[#170F26] ${
                msg.role === 'user'
                  ? 'bg-[#6D28D9] text-white rounded-tr-none shadow-[3px_3px_0_0_#170F26]'
                  : 'bg-white text-[#170F26] rounded-tl-none shadow-[3px_3px_0_0_#170F26]'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-start gap-2.5 sm:gap-3 max-w-3xl">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold border-2 border-[#170F26] bg-white text-[#170F26]">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed bg-white border-2 border-[#170F26] text-zinc-500 rounded-tl-none shadow-[3px_3px_0_0_#170F26] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#6D28D9]" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 z-10 bg-white border-t-2 border-[#170F26]">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="max-w-3xl mx-auto relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what to do..."
              className="w-full bg-white border-2 border-zinc-200 focus:border-[#6D28D9] rounded-2xl pl-4 pr-12 py-2.5 sm:py-3 text-xs sm:text-sm text-[#170F26] placeholder-zinc-400 focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="absolute right-2 p-2 bg-[#6D28D9] hover:bg-[#4C1D95] disabled:opacity-30 disabled:hover:bg-[#6D28D9] text-white font-bold rounded-xl transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
