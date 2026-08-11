'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  ExternalLink,
  AlertTriangle,
  Lock,
  Mail,
  Loader2,
  Menu,
  X,
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
// Apple-style system palette (light mode):
// canvas #F5F5F7 · surface #FFFFFF · ink #1D1D1F · secondary #6E6E73
// accent (systemBlue) #0071E3 · red #FF3B30 · orange #FF9500 · green #34C759 · indigo #5E5CE6
// Typography intentionally uses the OS font stack rather than a webfont —
// on Apple devices this renders as San Francisco with zero network cost.
const FONT_DISPLAY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Arial, sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const CATEGORY_PALETTE = [
  { bg: 'bg-[#EAF3FE]', text: 'text-[#0071E3]', dot: 'bg-[#0071E3]' },
  { bg: 'bg-[#FDEEF1]', text: 'text-[#E0245E]', dot: 'bg-[#E0245E]' },
  { bg: 'bg-[#FFF4E5]', text: 'text-[#C2670A]', dot: 'bg-[#FF9500]' },
  { bg: 'bg-[#E9F9EE]', text: 'text-[#1F8A3B]', dot: 'bg-[#34C759]' },
  { bg: 'bg-[#F1EFFE]', text: 'text-[#5E5CE6]', dot: 'bg-[#5E5CE6]' },
] as const;

function categoryStyle(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

const FILTER_STYLES: Record<string, { active: string; icon: string }> = {
  open: { active: 'bg-[#0071E3] text-white', icon: 'text-[#0071E3]' },
  today: { active: 'bg-[#FF9500] text-white', icon: 'text-[#FF9500]' },
  overdue: { active: 'bg-[#FF3B30] text-white', icon: 'text-[#FF3B30]' },
  upcoming: { active: 'bg-[#5E5CE6] text-white', icon: 'text-[#5E5CE6]' },
  done: { active: 'bg-[#34C759] text-white', icon: 'text-[#34C759]' },
  all: { active: 'bg-[#1D1D1F] text-white', icon: 'text-[#6E6E73]' },
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

// Global styles shared by both the auth screen and the dashboard: font
// smoothing, a slim macOS-style scrollbar, and respect for reduced motion.
const GlobalStyle = () => (
  <style jsx global>{`
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .apple-scrollbar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .apple-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .apple-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 999px;
    }
    .apple-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.28);
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `}</style>
);

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

  // --- Auth screen -----------------------------------------------------
  if (!sessionUser) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-[#F5F5F7] px-4 py-10 text-[#1D1D1F]"
        style={{ fontFamily: FONT_DISPLAY }}
      >
        <GlobalStyle />
        <div className="w-full max-w-[380px]">
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 items-center justify-center rounded-[20px] bg-gradient-to-b from-[#0071E3] to-[#0058B0] text-white shadow-[0_8px_24px_rgba(0,113,227,0.35)] mb-4">
              <span className="text-2xl font-semibold tracking-tight">A</span>
            </div>
            <h1 className="text-[26px] font-semibold tracking-tight">Aspri</h1>
            <p className="text-[13px] text-[#6E6E73] mt-1.5">Your to-do list, managed entirely by chatting.</p>
          </div>

          <div className="rounded-2xl bg-white border border-[#D2D2D7]/60 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_rgba(0,0,0,0.07)] p-6 sm:p-7">
            <div className="flex rounded-[10px] bg-[#F5F5F7] p-1 mb-6">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
                className={`flex-1 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 ${
                  authMode === 'login' ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-[#6E6E73]'
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); setAuthError(null); }}
                className={`flex-1 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 ${
                  authMode === 'signup' ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-[#6E6E73]'
                }`}
              >
                Sign up
              </button>
            </div>

            {authError && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-[#FDEEF1] text-[#E0245E] text-[13px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authMessage && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-[#E9F9EE] text-[#1F8A3B] text-[13px] flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authMessage}</span>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-3.5">
              <div>
                <label className="text-[12px] font-medium text-[#6E6E73] block mb-1.5">Email address</label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-[#86868B] absolute left-3.5 pointer-events-none" />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#0071E3] focus:bg-white rounded-xl pl-10 pr-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-4 focus:ring-[#0071E3]/10 transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-[#6E6E73] block mb-1.5">Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[#86868B] absolute left-3.5 pointer-events-none" />
                  <input
                    type="password"
                    name="password"
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#0071E3] focus:bg-white rounded-xl pl-10 pr-3.5 py-2.5 text-[14px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-4 focus:ring-[#0071E3]/10 transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 mt-1 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#0068D1] disabled:opacity-50 text-white font-medium rounded-xl text-[14px] transition-all duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 focus-visible:ring-offset-2"
              >
                {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{authMode === 'login' ? 'Log in' : 'Create account'}</span>
              </button>
            </form>
          </div>
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
    <div
      className="flex h-[100dvh] w-full bg-[#F5F5F7] text-[#1D1D1F] overflow-hidden relative"
      style={{ fontFamily: FONT_DISPLAY }}
    >
      <GlobalStyle />

      {/* Mobile-only backdrop behind the sidebar drawer */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-30 md:hidden transition-opacity duration-300"
        />
      )}

      {/*
        Sidebar behaves differently per breakpoint without ever using
        `display: none`, so the same element can animate smoothly both ways:
          - mobile (<768px): fixed overlay drawer, slides via translate-x
          - desktop (>=768px): in-flow panel, collapses via negative margin
      */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 w-[85vw] max-w-[320px] md:w-[300px] md:max-w-none shrink-0 bg-white/90 md:bg-white/70 backdrop-blur-2xl border-r border-[#D2D2D7]/70 flex flex-col transition-transform md:transition-[margin-left] duration-300 ease-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 ${isSidebarOpen ? 'md:ml-0' : 'md:-ml-[300px]'}`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#0071E3] to-[#0058B0] flex items-center justify-center text-white text-[13px] font-semibold shrink-0">
                {sessionUser.email.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#1D1D1F] truncate">{sessionUser.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
                  <span className="text-[11px] text-[#6E6E73]">Active</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                title="Hide sidebar"
                className="text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.05] p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="text-[#6E6E73] hover:text-[#FF3B30] hover:bg-[#FF3B30]/[0.08] p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30]/40"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 pb-3">
            <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide mb-2 px-0.5">Filters</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filterOptions.map(({ key, label, icon: Icon }) => {
                const active = activeFilter === key;
                const style = FILTER_STYLES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveFilter(key);
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 ${
                      active ? `${style.active} shadow-[0_1px_2px_rgba(0,0,0,0.1)]` : 'text-[#4B4B4F] bg-black/[0.03] hover:bg-black/[0.06]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? '' : style.icon}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6 apple-scrollbar">
            <div>
              <div className="flex items-center justify-between px-0.5 mb-2">
                <span className="text-[11px] font-medium text-[#86868B] uppercase tracking-wide">Tasks</span>
                <span style={{ fontFamily: FONT_MONO }} className="text-[11px] text-[#0071E3] font-medium">{todos.length} active</span>
              </div>
              <div className="space-y-1">
                {todos.length === 0 ? (
                  <div className="py-6 text-center rounded-xl border border-dashed border-[#D2D2D7] text-[12.5px] text-[#86868B]">
                    Nothing here — ask me to add something.
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
                        className="group flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-black/[0.035] transition-colors duration-150"
                      >
                        <button
                          onClick={() => toggleTodo(todo)}
                          className="mt-0.5 text-[#C7C7CC] hover:text-[#34C759] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 rounded-full"
                        >
                          {todo.is_done ? (
                            <CheckCircle2 className="w-[18px] h-[18px] text-[#34C759]" />
                          ) : (
                            <Circle className="w-[18px] h-[18px]" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] leading-snug ${todo.is_done ? 'line-through text-[#AEAEB2]' : 'text-[#1D1D1F]'}`}>
                            {todo.task}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full font-medium ${cs.bg} ${cs.text}`}>
                              <span>{catEmoji}</span>
                              <span>{category}</span>
                            </span>
                            <span className="inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded-full bg-black/[0.04] text-[#6E6E73]">
                              {priorityEmoji}
                            </span>
                            {todo.due_at && (
                              <span style={{ fontFamily: FONT_MONO }} className="inline-flex items-center gap-1 text-[10.5px] text-[#86868B] ml-auto">
                                <Clock className="w-2.5 h-2.5" />
                                {humanizeDue(todo.due_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between px-0.5 mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#86868B] uppercase tracking-wide">
                  <FileText className="w-3 h-3" />
                  <span>Notes</span>
                </div>
                <span style={{ fontFamily: FONT_MONO }} className="text-[11px] text-[#0071E3] font-medium">{notes.length} saved</span>
              </div>
              <div className="space-y-1.5">
                {notes.length === 0 ? (
                  <div className="py-6 text-center rounded-xl border border-dashed border-[#D2D2D7] text-[12.5px] text-[#86868B]">
                    No notes yet — try "note that…"
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} className="p-3 rounded-xl bg-[#FFF9E8] text-[12.5px] text-[#1D1D1F] leading-relaxed">
                      <p style={{ fontFamily: FONT_MONO }} className="line-clamp-4 text-[12px]">{note.content}</p>
                      <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-between text-[10.5px] text-[#86868B]">
                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(note.content)}
                          className="flex items-center gap-1 text-[#0071E3] hover:text-[#0058B0] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 rounded"
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

      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14 shrink-0 bg-[#F5F5F7]/80 backdrop-blur-xl border-b border-[#D2D2D7]/70 z-20">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 -ml-2 rounded-lg hover:bg-black/[0.05] transition-colors text-[#1D1D1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <h1 className="text-[15px] font-semibold tracking-tight">Aspri</h1>
          <span className="text-[12px] text-[#86868B] hidden sm:inline">· chat with your to-do list</span>
        </div>

        {(overdueTodos.length > 0 || todayTodos.length > 0) && (
          <div className="px-4 sm:px-6 pt-3 space-y-2 z-10">
            {overdueTodos.length > 0 && (
              <div className="px-3.5 py-2.5 rounded-xl bg-[#FF3B30] text-white text-[12.5px] font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{overdueTodos.length} overdue — {overdueTodos.slice(0, 3).map(t => t.task).join(', ')}{overdueTodos.length > 3 ? '…' : ''}</span>
              </div>
            )}
            {todayTodos.length > 0 && (
              <div className="px-3.5 py-2.5 rounded-xl bg-[#FFF4E5] text-[#C2670A] text-[12.5px] font-medium flex items-start gap-2">
                <Clock className="w-4 h-4 shrink-0 mt-px" />
                <span>Due today — {todayTodos.slice(0, 3).map(t => t.task).join(', ')}{todayTodos.length > 3 ? '…' : ''}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 z-10 apple-scrollbar">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-white border border-[#D2D2D7]/70 flex items-center justify-center shrink-0 text-[#0071E3]">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 text-[13.5px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#0071E3] text-white rounded-2xl rounded-br-md'
                      : 'bg-white text-[#1D1D1F] rounded-2xl rounded-bl-md shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="[&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mb-1.5 [&>ol]:mb-1.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-white border border-[#D2D2D7]/70 flex items-center justify-center shrink-0 text-[#0071E3]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-[#86868B] text-[13.5px] flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3]" />
                  <span>Thinking…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="shrink-0 bg-white/80 backdrop-blur-xl border-t border-[#D2D2D7]/70 px-4 sm:px-6 pt-3 z-10"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="max-w-2xl mx-auto relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what to do…"
              className="w-full bg-[#F5F5F7] border border-transparent focus:border-[#0071E3]/40 focus:bg-white rounded-full pl-4 pr-12 py-3 text-[14px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-4 focus:ring-[#0071E3]/10 transition-all duration-200"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="absolute right-1.5 w-8 h-8 flex items-center justify-center bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-30 disabled:hover:bg-[#0071E3] text-white rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 focus-visible:ring-offset-2"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
