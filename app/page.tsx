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
  X,
  Copy,
  Check
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

  // Responsive Hideable Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<'open' | 'today' | 'overdue' | 'upcoming' | 'done' | 'all'>('open');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [overdueTodos, setOverdueTodos] = useState<Todo[]>([]);
  const [todayTodos, setTodayTodos] = useState<Todo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Halo! Ada yang bisa saya bantu untuk merapikan tugas atau catatanmu hari ini?" }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Auto-collapse sidebar on mobile screen size initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
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
    setMessages([{ role: 'assistant', content: "Halo! Ada yang bisa saya bantu untuk merapikan tugas atau catatanmu hari ini?" }]);
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

  const handleCopyNote = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNoteId(id);
    setTimeout(() => setCopiedNoteId(null), 2000);
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

  // Auth Screen (Professional Minimalist UI)
  if (!sessionUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/60 p-4 font-sans text-slate-800 antialiased">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/50">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100/80 mb-3">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">To-Do Assistant</h1>
            <p className="text-xs text-slate-500 mt-1">Kelola tugas & catatan harianmu lewat instruksi percakapan.</p>
          </div>

          <div className="flex rounded-xl bg-slate-100/80 p-1 border border-slate-200/50 mb-5">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign up
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200/60 text-teal-800 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-teal-600" />
              <span>{authMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Email address</label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-slate-50/50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-600 block mb-1">Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50/50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/10 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 mt-2"
            >
              {authLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{authMode === 'login' ? 'Sign in' : 'Create account'}</span>
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
    <div className="flex h-screen bg-slate-50/50 text-slate-800 font-sans antialiased overflow-hidden relative">
      
      {/* Mobile Sidebar Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* SIDEBAR (Drawer Mode on Mobile, Expandable/Collapsible on Desktop) */}
      <aside 
        className={`fixed lg:relative inset-y-0 left-0 z-40 w-80 max-w-[85vw] border-r border-slate-200/80 bg-white flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        <div className="flex flex-col h-full min-h-0">
          
          {/* User Account Bar */}
          <div className="p-3 mx-3 mt-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs">
                {sessionUser.email.slice(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-800 truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  <span className="text-[10px] text-slate-500 font-medium">Pro Workspace</span>
                </div>
              </div>
            </div>
            <button 
              onClick={handleSignOut}
              title="Sign out"
              className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-200/50 rounded-lg transition-colors ml-1 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Filters */}
          <div className="px-3 pt-4 pb-2">
            <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Filters</p>
            <div className="grid grid-cols-2 gap-1">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveFilter(key);
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active 
                        ? 'bg-teal-50 text-teal-800 border border-teal-200/80 font-semibold shadow-2xs' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Container */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 custom-scrollbar">
            
            {/* Task Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tasks</span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{todos.length}</span>
              </div>
              <div className="space-y-1.5">
                {todos.length === 0 ? (
                  <div className="p-4 text-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                    Tidak ada tugas di kategori ini
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
                        className="group relative p-2.5 rounded-xl bg-white border border-slate-200/70 hover:border-teal-200 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-start gap-2.5">
                          <button 
                            onClick={() => toggleTodo(todo)}
                            className="mt-0.5 text-slate-300 hover:text-teal-600 transition-colors"
                          >
                            {todo.is_done ? (
                              <CheckCircle2 className="w-4 h-4 text-teal-600" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-normal leading-relaxed ${todo.is_done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {todo.task}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/60 text-slate-600 font-medium">
                                <span>{catEmoji}</span>
                                <span className="capitalize">{category}</span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                                <span>{priorityEmoji}</span>
                              </span>
                              {todo.due_at && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-mono ml-auto">
                                  <Clock className="w-2.5 h-2.5 text-slate-400" />
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
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>Notes</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">{notes.length}</span>
              </div>
              <div className="space-y-1.5">
                {notes.length === 0 ? (
                  <div className="p-4 text-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                    Belum ada catatan tercatat
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl bg-white border border-slate-200/70 hover:border-slate-300 transition-all text-xs text-slate-700 leading-relaxed group">
                      <p className="line-clamp-4 text-xs font-normal text-slate-700 whitespace-pre-wrap">{note.content}</p>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button 
                          onClick={() => handleCopyNote(note.id, note.content)}
                          className="flex items-center gap-1 text-slate-400 hover:text-teal-600 transition-colors"
                        >
                          {copiedNoteId === note.id ? (
                            <>
                              <Check className="w-3 h-3 text-teal-600" />
                              <span className="text-teal-600 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
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
      <main className="flex-1 flex flex-col h-full bg-slate-50/50 relative overflow-hidden">

        {/* Top Header */}
        <header className="h-14 border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between bg-white/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-slate-600 transition-colors border border-slate-200/60"
              title={isSidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
            >
              {isSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-teal-50 border border-teal-100 text-teal-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-semibold text-slate-900">To-Do Assistant</h1>
                <p className="text-[10px] text-slate-400 hidden sm:block">AI Task & Note Assistant</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-500">
              v1.0 (Next.js)
            </span>
          </div>
        </header>

        {/* Suggestion Quick Commands */}
        <div className="px-4 sm:px-6 py-2 border-b border-slate-200/60 bg-white/50 flex items-center gap-2 text-xs text-slate-600 overflow-x-auto z-10 no-scrollbar">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-0.5 shrink-0">
            <span>Contoh</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </span>
          <button 
            onClick={() => handleSend("ingatkan saya untuk cek inbox review esok jam 10 pagi")}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200/80 hover:bg-slate-100/60 text-slate-700 text-xs transition-all whitespace-nowrap shadow-2xs shrink-0"
          >
            "ingatkan saya untuk cek inbox review esok jam 10 pagi"
          </button>
          <button 
            onClick={() => handleSend("apa saja tugas yang due hari ini?")}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200/80 hover:bg-slate-100/60 text-slate-700 text-xs transition-all whitespace-nowrap shadow-2xs shrink-0"
          >
            "apa saja tugas yang due hari ini?"
          </button>
          <button 
            onClick={() => handleSend("catat bahwa wifi password kantor x")}
            className="px-3 py-1 rounded-lg bg-white border border-slate-200/80 hover:bg-slate-100/60 text-slate-700 text-xs transition-all whitespace-nowrap shadow-2xs shrink-0"
          >
            "catat bahwa wifi password kantor x"
          </button>
        </div>

        {/* Alert Banners */}
        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2 z-10">
            {overdueTodos.length > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200/70 text-rose-800 text-xs flex items-center gap-2 shadow-2xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>⏰ <strong>{overdueTodos.length} overdue:</strong> {overdueTodos.slice(0, 3).map(t => t.task).join(', ')}{overdueTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200/70 text-amber-800 text-xs flex items-center gap-2 shadow-2xs">
                <Clock className="w-4 h-4 shrink-0 text-amber-500" />
                <span>📅 <strong>Due hari ini:</strong> {todayTodos.slice(0, 3).map(t => t.task).join(', ')}{todayTodos.length > 3 ? '...' : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4 z-10 custom-scrollbar">
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2.5 sm:gap-3 max-w-2xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                msg.role === 'user' 
                  ? 'bg-slate-800 text-white' 
                  : 'bg-teal-50 border border-teal-200/70 text-teal-700'
              }`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-tr-none shadow-xs' 
                  : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none shadow-xs'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-start gap-2.5 sm:gap-3 max-w-2xl">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold bg-teal-50 border border-teal-200/70 text-teal-700">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed bg-white border border-slate-200/80 text-slate-500 rounded-tl-none shadow-xs flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                <span>Memproses instruksi...</span>
              </div>
            </div>
          )}
        </div>

        {/* Command Bar */}
        <div className="p-3 sm:p-4 z-10 bg-white/70 backdrop-blur-md border-t border-slate-200/80">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="max-w-2xl mx-auto relative flex items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tulis tugas atau catatan baru..."
              className="w-full bg-white border border-slate-200 focus:border-teal-500 rounded-2xl pl-4 pr-12 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/10 shadow-xs transition-all"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="absolute right-1.5 p-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-30 disabled:hover:bg-teal-600 text-white font-medium rounded-xl transition-all shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}
