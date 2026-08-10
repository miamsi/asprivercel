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
  ChevronRight,
  Tag,
  AlertTriangle,
  Lock,
  Mail,
  Loader2
} from 'lucide-react';
import { humanizeDue } from '@/lib/time_utils';
import { CATEGORY_EMOJI, PRIORITY_EMOJI } from '@/lib/connectors/todos';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

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

  const [activeFilter, setActiveFilter] = useState<'open' | 'today' | 'overdue' | 'upcoming' | 'done' | 'all'>('open');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [overdueTodos, setOverdueTodos] = useState<Todo[]>([]);
  const [todayTodos, setTodayTodos] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! How can I help you manage your tasks and notes today?" }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

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
      query = query.eq('is_done', false).lte('due_at', todayEnd.toISOString()).gte('due_at', new Date(new Date().setHours(0,0,0,0)).toISOString());
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
      .gte('due_at', new Date(new Date().setHours(0,0,0,0)).toISOString());

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
      fetchNotes(userId)
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
          userId: sessionUser.id 
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

  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans antialiased">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">✅ To-Do Chat</h1>
            <p className="text-xs text-slate-400 mt-1">Your to-do list, managed entirely by chatting.</p>
          </div>

          <div className="flex rounded-xl bg-slate-950/60 p-1 border border-slate-800 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'login' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400'
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signup' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400'
              }`}
            >
              Sign up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{authMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Email address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="your email"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2"
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
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500/30 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-slate-800/60 bg-slate-900/40 backdrop-blur-xl flex flex-col justify-between shrink-0">
        <div className="flex flex-col min-h-0 flex-1">
          
          {/* User Account Bar */}
          <div className="p-3.5 mx-3 mt-3 rounded-xl border border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-xs shadow-md shadow-emerald-500/10">
                MS
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-200 truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-slate-400 font-medium">Pro Workspace</span>
                </div>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              className="text-slate-400 hover:text-slate-200 p-1.5 hover:bg-slate-800/60 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Filters */}
          <div className="px-3 pt-4 pb-2">
            <p className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Filters</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveFilter(key)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      active 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Container */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 custom-scrollbar">
            
            {/* Task Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tasks</span>
                <span className="text-[10px] text-slate-500 font-mono">{todos.length} Active</span>
              </div>
              <div className="space-y-1.5">
                {todos.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border border-dashed border-slate-800/80 text-xs text-slate-500">
                    Nothing here — ask me to add something!
                  </div>
                ) : (
                  todos.map(todo => {
                    const category = todo.category || 'other';
                    const catEmoji = CATEGORY_EMOJI[category] || '📌';
                    const priority = todo.priority || 'medium';
                    const priorityEmoji = PRIORITY_EMOJI[priority] || '🟡';

                    return (
                      <div 
                        key={todo.id}
                        className="group relative p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/80 hover:bg-slate-900/80 transition-all shadow-sm"
                      >
                        <div className="flex items-start gap-2.5">
                          <button 
                            onClick={() => toggleTodo(todo)}
                            className="mt-0.5 text-slate-500 hover:text-emerald-400 transition-colors"
                          >
                            {todo.is_done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium leading-snug ${todo.is_done ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                              {todo.task}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-medium">
                                <span>{catEmoji}</span>
                                <span>{category}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                                <span>{priorityEmoji}</span>
                              </span>
                              {todo.due_at && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono ml-auto">
                                  <Clock className="w-2.5 h-2.5 text-slate-500" />
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

            {/* Notes Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>Notes</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{notes.length} saved</span>
              </div>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border border-dashed border-slate-800/80 text-xs text-slate-500">
                    No notes yet — try "note that..."
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl bg-slate-900/30 border border-slate-800/50 hover:border-slate-700/60 transition-all text-xs text-slate-300 leading-relaxed group">
                      <p className="line-clamp-4 font-mono text-[11px] text-slate-300/90">{note.content}</p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(note.content)}
                          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* MAIN WORKSPACE PANEL */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <header className="h-14 border-b border-slate-800/60 px-6 flex items-center justify-between bg-slate-950/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">To-Do Assistant</h1>
              <p className="text-[10px] text-slate-400">Groq Orchestrator • Low-Latency Response</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/50 text-[10px] font-mono text-slate-400">
              v1.0 (Next.js)
            </span>
          </div>
        </header>

        {/* Suggestion Bar */}
        <div className="px-6 py-2 border-b border-slate-800/40 bg-slate-900/20 flex items-center gap-2 text-xs text-slate-400 overflow-x-auto z-10 no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <span>Try</span>
            <ChevronRight className="w-3 h-3" />
          </span>
          <button 
            onClick={() => handleSend("remind me to check my inbox about performance review tomorrow at 10am")}
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 text-slate-300 text-xs transition-all whitespace-nowrap"
          >
            "remind me to check my inbox about performance review tomorrow at 10am"
          </button>
          <button 
            onClick={() => handleSend("what's due today?")}
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 text-slate-300 text-xs transition-all whitespace-nowrap"
          >
            "what's due today?"
          </button>
          <button 
            onClick={() => handleSend("note that the wifi password is x")}
            className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 text-slate-300 text-xs transition-all whitespace-nowrap"
          >
            "note that the wifi password is x"
          </button>
        </div>

        {/* Alert Banners */}
        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-6 pt-3 space-y-2 z-10">
            {overdueTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>⏰ {overdueTodos.length} overdue: {overdueTodos.slice(0, 3).map(t => t.task).join(', ')}{overdueTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>📅 Due today: {todayTodos.slice(0, 3).map(t => t.task).join(', ')}{todayTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 z-10 custom-scrollbar">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                msg.role === 'user' 
                  ? 'bg-slate-800 border border-slate-700 text-slate-200' 
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              }`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-none' 
                  : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-start gap-3 max-w-3xl">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-4 rounded-2xl text-sm leading-relaxed bg-slate-900/90 border border-slate-800 text-slate-400 rounded-tl-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Command Bar */}
        <div className="p-4 z-10">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="max-w-3xl mx-auto relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what to do..."
              className="w-full bg-slate-900/90 border border-slate-800 focus:border-emerald-500/80 rounded-2xl pl-4 pr-12 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 shadow-xl backdrop-blur-xl transition-all"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="absolute right-2 p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:hover:bg-emerald-500 text-slate-950 font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
