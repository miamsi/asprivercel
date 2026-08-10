'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// FIXED: Using a valid placeholder URL bypasses the Next.js static generation error on Vercel.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
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

  // Auto-scroll reference
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

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

  // Auth Screen (Apple iOS Style)
  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F2F7] p-5 font-sans antialiased text-slate-900">
        <div className="w-full max-w-sm rounded-[32px] bg-white/80 p-8 shadow-xl backdrop-blur-2xl border border-white/40">
          <div className="text-center mb-8">
            <div className="inline-flex p-3.5 rounded-2xl bg-teal-500/10 text-teal-600 mb-3">
              <Sparkles className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
            <p className="text-sm text-slate-500 mt-1 font-normal">Manage tasks naturally.</p>
          </div>

          <div className="flex rounded-full bg-[#E5E5EA] p-1 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
                authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
                authMode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{authMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-slate-400 absolute left-4" />
              <input
                type="email"
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-[#F2F2F7] focus:bg-white rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all border border-transparent focus:border-teal-500/30"
              />
            </div>

            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-4" />
              <input
                type="password"
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-[#F2F2F7] focus:bg-white rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all border border-transparent focus:border-teal-500/30"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold rounded-2xl text-sm transition-all shadow-md shadow-teal-600/20 flex items-center justify-center gap-2 mt-2"
            >
              {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{authMode === 'login' ? 'Continue' : 'Create Account'}</span>
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
    <div className="flex h-dvh bg-[#F2F2F7] text-slate-900 font-sans antialiased overflow-hidden relative">
      
      {/* Mobile Drawer Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/20 backdrop-blur-md z-40 md:hidden transition-opacity"
        />
      )}

      {/* SIDEBAR */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-white/90 backdrop-blur-2xl border-r border-slate-200/60 flex flex-col justify-between shrink-0 transition-transform duration-300 ease-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center font-bold text-white text-sm shadow-sm shrink-0">
                {sessionUser.email.slice(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-slate-900 truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Personal Space</span>
                </div>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              title="Sign out"
              className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-full transition-colors ml-1 shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 pt-4 pb-2">
            <p className="px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Views</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveFilter(key);
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      active 
                        ? 'bg-teal-500/10 text-teal-700 font-semibold' 
                        : 'text-slate-600 hover:bg-slate-100/70 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 custom-scrollbar">
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tasks</span>
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{todos.length}</span>
              </div>
              <div className="space-y-1.5">
                {todos.length === 0 ? (
                  <div className="p-4 text-center rounded-2xl bg-slate-50/50 border border-slate-100 text-xs text-slate-400">
                    No active tasks
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
                        className="group relative p-3 rounded-2xl bg-white border border-slate-100 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-2.5">
                          <button 
                            onClick={() => toggleTodo(todo)}
                            className="mt-0.5 text-slate-300 hover:text-teal-500 transition-colors"
                          >
                            {todo.is_done ? (
                              <CheckCircle2 className="w-5 h-5 text-teal-500" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium leading-relaxed ${todo.is_done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {todo.task}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200/60 text-slate-600 font-medium">
                                <span>{catEmoji}</span>
                                <span className="capitalize">{category}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200/60 text-slate-600 font-medium">
                                <span>{priorityEmoji}</span>
                              </span>
                              {todo.due_at && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium ml-auto">
                                  <Clock className="w-3 h-3 text-slate-400" />
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
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Notes</span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{notes.length}</span>
              </div>
              <div className="space-y-2 pb-4">
                {notes.length === 0 ? (
                  <div className="p-4 text-center rounded-2xl bg-slate-50/50 border border-slate-100 text-xs text-slate-400">
                    No notes recorded
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3.5 rounded-2xl bg-white border border-slate-100 transition-all text-xs text-slate-700 leading-relaxed group">
                      <p className="line-clamp-4 font-mono text-[11px] text-slate-800 whitespace-pre-wrap">{note.content}</p>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(note.content)}
                          className="flex items-center gap-1 text-slate-400 hover:text-teal-600 transition-colors"
                        >
                          <span>Copy</span>
                          <ExternalLink className="w-3 h-3" />
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
      <main className="flex-1 flex flex-col h-full relative">

        <header className="h-14 px-4 sm:px-6 flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-slate-200/60 z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-full bg-slate-100 hover:bg-slate-200/60 text-slate-700 transition-colors"
              title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
              <h1 className="text-sm font-semibold tracking-tight text-slate-900">Assistant</h1>
            </div>
          </div>
        </header>

        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2 z-10 w-full max-w-3xl mx-auto shrink-0">
            {overdueTodos.length > 0 && (
              <div className="px-4 py-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-800 text-xs flex items-center gap-2 backdrop-blur-md">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span><strong>{overdueTodos.length} overdue:</strong> {overdueTodos.slice(0, 2).map(t => t.task).join(', ')}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs flex items-center gap-2 backdrop-blur-md">
                <Clock className="w-4 h-4 shrink-0 text-amber-500" />
                <span><strong>Due today:</strong> {todayTodos.slice(0, 2).map(t => t.task).join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 w-full max-w-3xl mx-auto custom-scrollbar">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2.5 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white border border-slate-200/60 text-slate-600 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-[82%] sm:max-w-[75%] p-3.5 sm:p-4 rounded-[20px] text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-br-sm' 
                  : 'bg-white border border-slate-200/60 text-slate-800 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-start gap-2.5 sm:gap-3 justify-start">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white border border-slate-200/60 text-slate-600 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3.5 sm:p-4 rounded-[20px] text-sm leading-relaxed bg-white border border-slate-200/60 text-slate-500 rounded-bl-sm shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                <span>Thinking...</span>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} className="h-2" />
        </div>

        <div className="bg-[#F2F2F7]/90 backdrop-blur-xl border-t border-slate-200/60 p-3 sm:p-4 z-20 shrink-0 pb-safe">
          <div className="max-w-3xl mx-auto w-full space-y-3">
            
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
              <button 
                onClick={() => handleSend("Remind me to check my inbox about performance review tomorrow at 10am")}
                className="px-4 py-1.5 rounded-full bg-white border border-slate-200/60 hover:bg-slate-50 active:scale-95 text-slate-700 transition-all whitespace-nowrap shadow-sm"
              >
                Remind check inbox
              </button>
              <button 
                onClick={() => handleSend("What's due today?")}
                className="px-4 py-1.5 rounded-full bg-white border border-slate-200/60 hover:bg-slate-50 active:scale-95 text-slate-700 transition-all whitespace-nowrap shadow-sm"
              >
                What's due today?
              </button>
              <button 
                onClick={() => handleSend("Note that the wifi password is x")}
                className="px-4 py-1.5 rounded-full bg-white border border-slate-200/60 hover:bg-slate-50 active:scale-95 text-slate-700 transition-all whitespace-nowrap shadow-sm"
              >
                Note wifi password
              </button>
            </div>

            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tell me what to do..."
                className="w-full bg-white border border-slate-300 focus:border-teal-500 rounded-full pl-5 pr-14 py-3 sm:py-3.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 shadow-sm transition-all"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="absolute right-2 p-2 bg-teal-600 hover:bg-teal-700 active:scale-90 disabled:opacity-30 disabled:hover:bg-teal-600 text-white font-bold rounded-full transition-all shadow-md"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

      </main>
    </div>
  );
}
