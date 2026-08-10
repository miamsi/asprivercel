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
  AlertTriangle,
  Lock,
  Mail,
  Loader2,
  Menu,
  X
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

  // Sidebar toggle state (collapsible & responsive overlay)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // Handle responsive sidebar behavior on initial load
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

  // Auth Screen (Pastel Teal Flat Theme)
  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-teal-50/80 p-4 font-sans antialiased text-teal-950">
        <div className="w-full max-w-md rounded-2xl border border-teal-100 bg-white p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-teal-100/70 border border-teal-200/60 text-teal-700 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-teal-950">✅ To-Do Chat</h1>
            <p className="text-xs text-teal-600/80 mt-1">Your to-do list, managed entirely by chatting.</p>
          </div>

          <div className="flex rounded-xl bg-teal-50/80 p-1 border border-teal-100 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'login' ? 'bg-white text-teal-800 shadow-sm border border-teal-100' : 'text-teal-600 hover:text-teal-900'
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signup' ? 'bg-white text-teal-800 shadow-sm border border-teal-100' : 'text-teal-600 hover:text-teal-900'
              }`}
            >
              Sign up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{authMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-teal-700 block mb-1.5">Email address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-teal-400 absolute left-3" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="your email"
                  className="w-full bg-teal-50/50 border border-teal-200/80 focus:border-teal-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-teal-950 placeholder-teal-400 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-teal-700 block mb-1.5">Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-teal-400 absolute left-3" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-teal-50/50 border border-teal-200/80 focus:border-teal-500 rounded-xl pl-9 pr-4 py-2.5 text-xs text-teal-950 placeholder-teal-400 focus:outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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
    <div className="flex h-screen bg-teal-50/40 text-teal-950 font-sans antialiased selection:bg-teal-200/60 overflow-hidden relative">
      
      {/* Mobile Drawer Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-teal-950/20 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* SIDEBAR (Collapsible & Mobile Responsive) */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-40 w-80 max-w-[85vw] border-r border-teal-100 bg-white flex flex-col justify-between shrink-0 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          
          {/* Sidebar Top Header with Close Button for Mobile */}
          <div className="p-3.5 mx-3 mt-3 rounded-xl border border-teal-100 bg-teal-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white text-xs shadow-xs shrink-0">
                MS
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-teal-950 truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  <span className="text-[10px] text-teal-600 font-medium">Pro Workspace</span>
                </div>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              title="Sign out"
              className="text-teal-600 hover:text-teal-950 p-1.5 hover:bg-teal-100/60 rounded-lg transition-colors ml-1 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Filters */}
          <div className="px-3 pt-4 pb-2">
            <p className="px-2 text-[10px] font-bold text-teal-600/70 uppercase tracking-wider mb-2">Filters</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveFilter(key);
                      // On small mobile screens, optionally auto-close on selection:
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      active 
                        ? 'bg-teal-600 text-white font-semibold shadow-xs' 
                        : 'text-teal-700 hover:text-teal-950 hover:bg-teal-100/50 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-teal-500'}`} />
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
                <span className="text-[10px] font-bold text-teal-600/70 uppercase tracking-wider">Tasks</span>
                <span className="text-[10px] text-teal-600 font-mono">{todos.length} Active</span>
              </div>
              <div className="space-y-1.5">
                {todos.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border border-dashed border-teal-200/80 text-xs text-teal-500">
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
                        className="group relative p-2.5 rounded-xl bg-white border border-teal-100 hover:border-teal-200 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-start gap-2.5">
                          <button 
                            onClick={() => toggleTodo(todo)}
                            className="mt-0.5 text-teal-400 hover:text-teal-600 transition-colors"
                          >
                            {todo.is_done ? (
                              <CheckCircle2 className="w-4 h-4 text-teal-600" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium leading-snug ${todo.is_done ? 'line-through text-teal-400' : 'text-teal-950'}`}>
                              {todo.task}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200/60 text-teal-800 font-medium">
                                <span>{catEmoji}</span>
                                <span>{category}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-teal-100/60 text-teal-800 font-medium">
                                <span>{priorityEmoji}</span>
                              </span>
                              {todo.due_at && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-teal-600 font-mono ml-auto">
                                  <Clock className="w-2.5 h-2.5 text-teal-500" />
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
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-600/70 uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-teal-500" />
                  <span>Notes</span>
                </div>
                <span className="text-[10px] text-teal-600 font-mono">{notes.length} saved</span>
              </div>
              <div className="space-y-2">
                {notes.length === 0 ? (
                  <div className="p-3 text-center rounded-xl border border-dashed border-teal-200/80 text-xs text-teal-500">
                    No notes yet — try "note that..."
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl bg-white border border-teal-100 transition-all text-xs text-teal-800 leading-relaxed group">
                      <p className="line-clamp-4 font-mono text-[11px] text-teal-900">{note.content}</p>
                      <div className="mt-2.5 pt-2 border-t border-teal-100 flex items-center justify-between text-[10px] text-teal-500">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(note.content)}
                          className="flex items-center gap-1 text-teal-600 hover:text-teal-800 transition-opacity"
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
      <main className="flex-1 flex flex-col h-full bg-teal-50/20 relative overflow-hidden">

        {/* Top Header */}
        <header className="h-14 border-b border-teal-100 px-4 sm:px-6 flex items-center justify-between bg-white/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            {/* Sidebar Toggle Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 transition-colors border border-teal-100"
              title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-semibold text-teal-950">To-Do Assistant</h1>
                <p className="text-[10px] text-teal-600 hidden sm:block">Groq Orchestrator • Low-Latency Response</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-teal-100/60 border border-teal-200/50 text-[10px] font-mono text-teal-700">
              v1.0 (Next.js)
            </span>
          </div>
        </header>

        {/* Suggestion Bar */}
        <div className="px-4 sm:px-6 py-2 border-b border-teal-100 bg-teal-50/50 flex items-center gap-2 text-xs text-teal-700 overflow-x-auto z-10 no-scrollbar">
          <span className="text-[11px] font-semibold text-teal-600/80 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <span>Try</span>
            <ChevronRight className="w-3 h-3" />
          </span>
          <button 
            onClick={() => handleSend("remind me to check my inbox about performance review tomorrow at 10am")}
            className="px-3 py-1 rounded-lg bg-white border border-teal-100 hover:bg-teal-100/60 text-teal-800 text-xs transition-all whitespace-nowrap shadow-xs shrink-0"
          >
            "remind me to check my inbox about performance review tomorrow at 10am"
          </button>
          <button 
            onClick={() => handleSend("what's due today?")}
            className="px-3 py-1 rounded-lg bg-white border border-teal-100 hover:bg-teal-100/60 text-teal-800 text-xs transition-all whitespace-nowrap shadow-xs shrink-0"
          >
            "what's due today?"
          </button>
          <button 
            onClick={() => handleSend("note that the wifi password is x")}
            className="px-3 py-1 rounded-lg bg-white border border-teal-100 hover:bg-teal-100/60 text-teal-800 text-xs transition-all whitespace-nowrap shadow-xs shrink-0"
          >
            "note that the wifi password is x"
          </button>
        </div>

        {/* Alert Banners */}
        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2 z-10">
            {overdueTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>⏰ {overdueTodos.length} overdue: {overdueTodos.slice(0, 3).map(t => t.task).join(', ')}{overdueTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                <span>📅 Due today: {todayTodos.slice(0, 3).map(t => t.task).join(', ')}{todayTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 z-10 custom-scrollbar">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2.5 sm:gap-3 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-teal-100/80 border border-teal-200/60 text-teal-800'
              }`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-tr-none shadow-xs' 
                  : 'bg-white border border-teal-100 text-teal-950 rounded-tl-none shadow-xs'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-start gap-2.5 sm:gap-3 max-w-3xl">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold bg-teal-100/80 border border-teal-200/60 text-teal-800">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed bg-white border border-teal-100 text-teal-600 rounded-tl-none shadow-xs flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Command Bar */}
        <div className="p-3 sm:p-4 z-10 bg-white/40 backdrop-blur-xs border-t border-teal-100">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="max-w-3xl mx-auto relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what to do..."
              className="w-full bg-white border border-teal-200/80 focus:border-teal-500 rounded-2xl pl-4 pr-12 py-2.5 sm:py-3 text-xs sm:text-sm text-teal-950 placeholder-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 shadow-xs transition-all"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="absolute right-2 p-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-30 disabled:hover:bg-teal-600 text-white font-bold rounded-xl transition-all shadow-xs"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
