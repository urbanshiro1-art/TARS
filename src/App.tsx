import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import {
  Send,
  Trash2,
  Plus,
  Menu as MenuIcon,
  X,
  TrendingUp,
  Sliders,
  ChevronRight,
  HelpCircle,
  Clock,
  ArrowRight,
  LogOut
} from 'lucide-react';
import { ChatSession, Message, ToolResult, StockData, HistoricalDataPoint } from './types';
import StockChart from './components/StockChart';
import FinancialHUD from './components/FinancialHUD';
import LoginSignupPage from './components/LoginSignupPage';

export default function App() {
  // Static pilot profile for zero-friction access
  const [currentUser] = useState<{ id: string; email: string; username: string }>(() => {
    return { id: 'tars-pilot', email: 'pilot@tars.ai', username: 'PILOT' };
  });

  // Cool system boot screen on first load
  const [isStartingUp, setIsStartingUp] = useState(true);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeChartPeriod, setActiveChartPeriod] = useState<string>('3mo');
  const [activeTab, setActiveTab] = useState<'chart' | 'financials'>('chart');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const [showHeader, setShowHeader] = useState(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollHeight = e.currentTarget.scrollHeight;
    const clientHeight = e.currentTarget.clientHeight;

    // Prevent trigger on mobile overscroll / bounce elastic scroll boundaries
    if (scrollTop < 0 || scrollTop + clientHeight > scrollHeight) {
      return;
    }

    // Tiny threshold to prevent jumpiness on trackpads/overscroll
    if (Math.abs(scrollTop - lastScrollTop.current) > 8) {
      if (scrollTop > lastScrollTop.current && scrollTop > 50) {
        // Scrolling down -> hide header
        setShowHeader(false);
      } else {
        // Scrolling up -> show header
        showHeader || setShowHeader(true);
      }
    }
    lastScrollTop.current = scrollTop;
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // Load sessions dynamically when currentUser changes
  useEffect(() => {
    if (!currentUser) {
      setSessions([]);
      setActiveSessionId('');
      return;
    }
    
    const loadUserSessions = async () => {
      try {
        const res = await fetch(`/api/sessions/list?userId=${encodeURIComponent(currentUser.id)}`);
        if (res.ok) {
          const payload = await res.json();
          if (payload.success && payload.data && payload.data.length > 0) {
            const mapped = payload.data.map((dbSession: any) => ({
              id: dbSession.id,
              title: dbSession.title,
              messages: typeof dbSession.messages === 'string' ? JSON.parse(dbSession.messages) : dbSession.messages,
              timestamp: dbSession.timestamp
            }));
            setSessions(mapped);
            setActiveSessionId(mapped[0].id);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to load sessions from DB, falling back to local storage:", err);
      }

      // Local storage fallback
      const saved = localStorage.getItem(`tars_stock_sessions_${currentUser.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) {
            setSessions(parsed);
            setActiveSessionId(parsed[0].id);
            return;
          }
        } catch (e) {
          console.error("Error parsing user sessions", e);
        }
      }

      // Default initial session for user
      const defaultSession: ChatSession = {
        id: `session-${currentUser.id}`,
        title: 'AAPL & TSLA Analysis',
        messages: [
          {
            id: 'welcome',
            role: 'model',
            content: `•_• TARS STOCK ANALYST ONLINE. Welcome, ${currentUser.username}!

Ask me about any stock ticker (e.g., AAPL, TSLA, NVDA, MSFT) to analyze its price trends, valuations, and financials.

I automatically query real-time metrics from Yahoo Finance to deliver exact figures, moving averages, and historical chart price lines directly in this HUD.`,
            timestamp: new Date().toISOString()
          }
        ],
        timestamp: new Date().toISOString()
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
    };

    loadUserSessions();
  }, [currentUser]);

  // Save sessions to local storage and DB when they change
  useEffect(() => {
    if (!currentUser || sessions.length === 0) return;

    localStorage.setItem(`tars_stock_sessions_${currentUser.id}`, JSON.stringify(sessions));

    const activeSess = sessions.find(s => s.id === activeSessionId) || sessions[0];
    if (activeSess) {
      fetch('/api/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          session: {
            id: activeSess.id,
            title: activeSess.title,
            messages: activeSess.messages,
            timestamp: activeSess.timestamp
          }
        })
      }).catch(err => console.log("Silent error syncing session:", err));
    }
  }, [sessions, activeSessionId, currentUser]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading]);

  // Sync active ticker period change
  const handlePeriodChange = async (period: string) => {
    setActiveChartPeriod(period);
    if (!activeSession || !activeSession.activeTicker) return;

    // Trigger a quiet, direct update to fetch the historical data for the new period
    // by sending a prompt under the hood or calling a light chart updater API if needed.
    // For a smooth experience, the user can also simply type: "Chart TSLA over 1y"
    // But to make the period buttons in the chart interactive, we send a user request automatically!
    const ticker = activeSession.activeTicker;
    await submitMessage(`Get the chart for ${ticker} over a ${period} period`);
  };

  // Extract the latest stock data or historical data from the active session's message history
  const getActiveStockData = (): StockData | null => {
    if (!activeSession) return null;
    // Walk backwards through messages to find the latest stock data
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const msg = activeSession.messages[i];
      if (msg.toolResults) {
        const found = msg.toolResults.find(r => r.type === 'stockData');
        if (found) return found.data as StockData;
      }
    }
    return null;
  };

  const getActiveHistoricalData = (): HistoricalDataPoint[] | null => {
    if (!activeSession) return null;
    // Walk backwards through messages to find the latest historical chart data
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const msg = activeSession.messages[i];
      if (msg.toolResults) {
        const found = msg.toolResults.find(r => r.type === 'historicalData');
        if (found) return found.data as HistoricalDataPoint[];
      }
    }
    return null;
  };

  const activeStockData = getActiveStockData();
  const activeHistoricalData = getActiveHistoricalData();

  // Create a new chat session
  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: Math.random().toString(36).substring(2, 15),
      title: 'New Stock Analysis',
      messages: [
        {
          id: Math.random().toString(),
          role: 'model',
          content: `•_• READY. Enter a stock symbol or company name to begin deep market analysis.`,
          timestamp: new Date().toISOString()
        }
      ],
      timestamp: new Date().toISOString()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setSidebarOpen(false);
  };

  // Delete a chat session
  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = sessions.filter(s => s.id !== id);
    if (remaining.length === 0) {
      // Re-create a default one so it's never empty
      const defaultSession: ChatSession = {
        id: 'default-session-id',
        title: 'New Analysis Session',
        messages: [
          {
            id: 'welcome',
            role: 'model',
            content: `•_• TARS STOCK ANALYST ONLINE.`,
            timestamp: new Date().toISOString()
          }
        ],
        timestamp: new Date().toISOString()
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
    } else {
      setSessions(remaining);
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  // Core submit function
  const submitMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    // Update active session with user message
    let updatedMessages = [...activeSession.messages, userMsg];
    let updatedSessions = sessions.map(s => {
      if (s.id === activeSession.id) {
        // Dynamically rename chat from user's first query if it's the default title
        const isDefaultTitle = s.title === 'New Stock Analysis' || s.title === 'New Analysis Session';
        const newTitle = isDefaultTitle 
          ? textToSend.substring(0, 24).toUpperCase() + (textToSend.length > 24 ? '...' : '')
          : s.title;

        return {
          ...s,
          title: newTitle,
          messages: updatedMessages,
          timestamp: new Date().toISOString()
        };
      }
      return s;
    });

    setSessions(updatedSessions);
    setInputText('');
    setIsLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: currentUser?.id,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch response");
      }

      const data = await response.json();

      // Find if any ticker was selected/updated in toolResults
      let detectedTicker = activeSession.activeTicker;
      if (data.toolResults && data.toolResults.length > 0) {
        const lastResult = data.toolResults[data.toolResults.length - 1];
        if (lastResult && lastResult.ticker) {
          detectedTicker = lastResult.ticker.toUpperCase();
        }
      }

      const modelMsg: Message = {
        id: Math.random().toString(),
        role: 'model',
        content: data.text,
        toolResults: data.toolResults,
        ticker: detectedTicker,
        timestamp: new Date().toISOString()
      };

      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            activeTicker: detectedTicker,
            messages: [...s.messages, modelMsg],
            timestamp: new Date().toISOString()
          };
        }
        return s;
      }));

    } catch (error: any) {
      console.error(error);
      const errorMsg: Message = {
        id: Math.random().toString(),
        role: 'model',
        content: `Error: ${error.message || "An issue occurred while trying to communicate with the market data engine."}`,
        timestamp: new Date().toISOString()
      };
      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: [...s.messages, errorMsg]
          };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(inputText);
  };

  // Custom markdown renderers for Lucida Console mono alignment
  const renderers = {
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4 max-w-full rounded-lg border border-white/10 scrollbar-thin">
        <table className="border-collapse w-full min-w-[480px] sm:min-w-0 text-left text-[11px] font-mono leading-relaxed">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-white/5 border-b border-white/10">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-white/5">{children}</tbody>,
    tr: ({ children }: any) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
    th: ({ children }: any) => <th className="p-2.5 font-bold text-neutral-300 border border-white/10 uppercase tracking-wider">{children}</th>,
    td: ({ children }: any) => <td className="p-2.5 text-white border border-white/10">{children}</td>,
    p: ({ children }: any) => <p className="mb-4 leading-relaxed text-neutral-300 text-xs">{children}</p>,
    h1: ({ children }: any) => <h1 className="text-sm font-bold text-white uppercase tracking-wider mt-6 mb-3 border-b border-white/10 pb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-xs font-bold text-neutral-200 uppercase tracking-wider mt-5 mb-2">{children}</h2>,
    ul: ({ children }: any) => <ul className="list-disc list-inside mb-4 pl-1 text-neutral-300 gap-2 flex flex-col text-xs">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside mb-4 pl-1 text-neutral-300 gap-2 flex flex-col text-xs">{children}</ol>,
    li: ({ children }: any) => <li className="text-neutral-300 leading-relaxed">{children}</li>,
    a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-white hover:text-neutral-400 underline transition-colors">{children}</a>,
    code: ({ children }: any) => <code className="bg-white/5 px-1.5 py-0.5 rounded text-[11px] text-neutral-200">{children}</code>,
  };

  return (
    <div className="relative min-h-screen w-full flex bg-[#000000] text-white selection:bg-white selection:text-black overflow-hidden font-mono antialiased">
      
      {/* 100% Static Ambient Halos Background (Does NOT scroll) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 halo-glow" />
        {/* Ambient Central White Halo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] max-w-[95vw] max-h-[95vh] bg-white/[0.07] rounded-full blur-[140px] animate-pulse [animation-duration:14s]" />
        {/* Layered Inner Subtle White Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-white/[0.035] rounded-full blur-[90px]" />
      </div>

      <AnimatePresence mode="wait">
        {isStartingUp ? (
          <motion.div
            key="startup"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full min-h-screen flex items-center justify-center"
          >
            <LoginSignupPage onStartupComplete={() => setIsStartingUp(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.4 }}
            className="relative z-10 w-full flex h-screen max-h-screen overflow-hidden"
          >
            {/* Slide-out Sidebar for Past Chatboxes */}
            <AnimatePresence>
              {sidebarOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />

            {/* Actual sidebar panel */}
            <motion.div
              initial={{ x: '-100%', opacity: 0, filter: 'blur(10px)' }}
              animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ x: '-100%', opacity: 0, filter: 'blur(10px)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="fixed lg:static top-0 bottom-0 left-0 w-64 sm:w-72 lg:w-80 h-full max-h-screen border-r border-white/5 z-50 flex flex-col justify-between overflow-hidden bg-neutral-950/[0.04] lg:bg-neutral-950/[0.06] backdrop-blur-[2px] lg:backdrop-blur-[3px]"
            >
              {/* TOP PORTION (Header and New Chat Button) - Fixed, non-scrolling */}
              <div className="flex-none">
                {/* Header inside sidebar */}
                <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/10">
                  <span className="text-[10px] font-bold tracking-widest text-neutral-400">HISTORIC ANALYSES</span>
                  <button 
                    onClick={() => setSidebarOpen(false)} 
                    className="p-1 hover:bg-white/10 rounded transition-colors text-neutral-400 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* New chatbox button */}
                <div className="p-3">
                  <button
                    onClick={handleNewChat}
                    className="w-full py-2 border border-dashed border-white/20 rounded hover:border-white/45 text-[10px] hover:bg-white/5 transition-all duration-150 flex items-center justify-center gap-1.5 text-neutral-300 hover:text-white font-bold tracking-wider cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>NEW ANALYSIS CHAT</span>
                  </button>
                </div>
              </div>

              {/* CENTER PORTION (Scrollable Past Chats List) - Scrollable area */}
              <div className="flex-1 overflow-y-auto px-2.5 space-y-1 py-1">
                {sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setSidebarOpen(false);
                      }}
                      className={`group w-full p-2 rounded text-left transition-all duration-150 cursor-pointer flex justify-between items-center ${
                        isActive
                          ? 'bg-white/10 border border-white/15 text-white'
                          : 'border border-transparent hover:bg-white/5 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-1.5">
                        <span className="text-[10px] font-bold truncate tracking-tight uppercase">
                          {session.title || 'Untitled Session'}
                        </span>
                        <span className="text-[8px] text-neutral-500 flex items-center gap-1 font-sans">
                          <Clock size={8} />
                          {new Date(session.timestamp).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      
                      <button
                        onClick={(e) => handleDeleteChat(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded text-neutral-500 hover:text-red-400 transition-all duration-150"
                        title="Delete Session"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* BOTTOM PORTION (Static Footer with Logout) - Fixed, non-scrolling */}
              <div className="flex-none p-3 border-t border-white/10 flex flex-col gap-2 bg-black/15">
                <button
                  onClick={() => {
                    setIsStartingUp(true);
                    setSidebarOpen(false);
                  }}
                  className="w-full py-1.5 px-2 bg-neutral-900 hover:bg-white/5 border border-white/10 hover:border-white/20 rounded text-[9px] font-bold text-neutral-300 hover:text-white tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <LogOut size={11} />
                  <span>SYSTEM COLD REBOOT</span>
                </button>
                <div className="text-[9px] text-neutral-600 font-mono tracking-widest uppercase text-center">
                  <span>TARS CORE SYS v1.1.0</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Container Layout */}
      <div className="flex-1 flex flex-col relative z-10 w-full h-full max-h-screen overflow-hidden">

        {/* Chat Console (Centered Full Page Layout) */}
        <div className="flex-1 flex flex-col justify-between w-full max-w-5xl mx-auto relative z-10 px-0 sm:px-4 md:px-6 overflow-hidden h-full">
          
          {/* Top Bar Navigation */}
          <header className={`absolute top-0 left-0 right-0 z-40 p-4 border-b border-white/5 flex items-center justify-between bg-[#000000]/95 backdrop-blur-md transition-all duration-300 transform ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 sm:p-1.5 hover:bg-white/5 rounded text-neutral-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Open History"
              >
                <MenuIcon size={16} />
              </button>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold tracking-widest text-white">TARS</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Clean header layout without token usage tracking or api key configuration panels */}
            </div>
          </header>

          {/* Chat message list */}
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3 sm:px-6 pt-20 pb-4 sm:pb-8 space-y-4 sm:space-y-8 select-text"
          >
            {activeSession?.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  key={msg.id || index}
                  initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-3xl w-full flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                    
                    {/* Role header label */}
                    <div className="text-[9px] text-white/40 tracking-widest uppercase px-1">
                      {isUser ? 'USER_REQUEST' : 'TARS'} — {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>

                    {/* Styled bubble card - High contrast solid white for user, glassmorphic card for AI */}
                    <div className={`w-full ${
                      isUser 
                        ? 'bg-white text-black rounded-sm max-w-[90%] sm:max-w-[85%] text-[11px] font-mono leading-relaxed p-3 sm:p-4 shadow-[0_4px_20px_rgba(255,255,255,0.05)]' 
                        : 'glass-card bg-white/[0.02] border border-white/10 rounded-xl text-neutral-100 text-[11px] leading-relaxed p-4 sm:p-5'
                    }`}>
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="markdown-body">
                          <Markdown components={renderers}>{msg.content}</Markdown>
                        </div>
                      )}
                    </div>

                    {/* Inline HUD items for this message if any toolResults exist */}
                    {!isUser && msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="w-full mt-4 space-y-4">
                        {msg.toolResults.map((result, idx) => {
                          if (result.type === 'historicalData') {
                            const chartData = result.data as HistoricalDataPoint[];
                            const siblingStockData = msg.toolResults?.find(r => r.type === 'stockData')?.data as StockData | undefined;
                            const chartCurrency = siblingStockData?.currency || activeStockData?.currency;
                            return (
                              <div key={idx} className="glass-panel border border-white/10 p-4 sm:p-5 rounded-lg w-full">
                                <div className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-3 font-mono">
                                  📊 {result.ticker || msg.ticker || 'STOCK'} — HISTORICAL CHART ({activeChartPeriod})
                                </div>
                                <StockChart
                                  data={chartData}
                                  ticker={result.ticker || msg.ticker || 'STOCK'}
                                  selectedPeriod={activeChartPeriod}
                                  onPeriodChange={handlePeriodChange}
                                  currency={chartCurrency}
                                />
                              </div>
                            );
                          }
                          if (result.type === 'stockData') {
                            const stockData = result.data as StockData;
                            return (
                              <div key={idx} className="glass-panel border border-white/10 p-4 sm:p-5 rounded-lg w-full">
                                <div className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-3 font-mono">
                                  ⚡ {result.ticker || msg.ticker || 'STOCK'} — FUNDAMENTAL METRICS
                                </div>
                                <FinancialHUD data={stockData} />
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Interactive Loading State */}
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex justify-start"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="text-[9px] text-neutral-500 tracking-widest uppercase px-1">
                    TARS — THINKING
                  </div>
                  <div className="glass-card border border-white/5 p-4 rounded-lg flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                    <span className="text-[10px] text-neutral-400 tracking-wider font-mono">THINKING...</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Area */}
          <footer className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-md">
            <form onSubmit={handleFormSubmit} className="relative flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about details (AAPL, TSLA moving averages, P/E ratios, debts)..."
                disabled={isLoading}
                className="w-full py-3.5 pl-4 pr-12 text-xs bg-black/60 glass-input text-white rounded focus:border-white focus:ring-0 placeholder:text-neutral-600 transition-all font-mono"
              />
              <button
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className="absolute right-2 p-2 rounded text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Send Request"
              >
                <Send size={14} />
              </button>
            </form>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-3 px-1 gap-2 sm:gap-0">
              <div className="flex flex-wrap items-center gap-2.5 text-[9px] text-neutral-500">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                  Try: "Apple suppliers"
                </span>
                <span className="hidden sm:flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                  Try: "Is TSLA a good investment?"
                </span>
              </div>
              
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-[9px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors uppercase tracking-wider min-h-[24px] flex items-center self-end sm:self-auto"
              >
                <span>Browse past chats</span>
                <ChevronRight size={10} />
              </button>
            </div>
          </footer>
        </div>

      </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
