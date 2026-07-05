import express from "express";
import path from "path";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
import { getUsage, addTokens, signUpUser, signInUser, saveSessionToDB, loadSessionsFromDB, deleteSessionFromDB } from "./supabase";

dotenv.config();

const yahooFinance = new YahooFinance();

const app = express();
const PORT = 3000;

app.use(express.json());

// Path rewriting middleware to ensure compatibility with Netlify Functions URLs
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '/api');
  }
  next();
});

// Authentication and Cloud Session API Routes
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ error: "Missing required fields: email, password, username" });
    }
    const result = await signUpUser(email, password, username);
    return res.json(result);
  } catch (error: any) {
    console.warn("[TARS AUTH] Signup error:", error.message || String(error));
    return res.status(400).json({ error: error.message || "An error occurred during signup." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
      return res.status(400).json({ error: "Missing required fields: loginId, password" });
    }
    const result = await signInUser(loginId, password);
    return res.json(result);
  } catch (error: any) {
    console.warn("[TARS AUTH] Login error:", error.message || String(error));
    return res.status(400).json({ error: error.message || "An error occurred during login." });
  }
});

// Retrieve token usage status
app.get("/api/usage", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const usage = await getUsage(userId);
    return res.json(usage);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to retrieve token usage" });
  }
});

app.post("/api/sessions/save", async (req, res) => {
  try {
    const { userId, session } = req.body;
    if (!userId || !session) {
      return res.status(400).json({ error: "Missing userId or session object" });
    }
    const success = await saveSessionToDB(userId, session);
    return res.json({ success });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to save session" });
  }
});

app.get("/api/sessions/list", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "Missing query param: userId" });
    }
    const data = await loadSessionsFromDB(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to list sessions" });
  }
});

app.delete("/api/sessions/delete/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = req.query.userId as string;
    if (!sessionId || !userId) {
      return res.status(400).json({ error: "Missing sessionId or userId" });
    }
    const success = await deleteSessionFromDB(userId, sessionId);
    return res.json({ success });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to delete session" });
  }
});

// Lazy-loaded Gemini Client to prevent crash if key is missing on startup
let aiClient: GoogleGenAI | null = null;

function getGemini(customKey?: string): GoogleGenAI {
  if (customKey) {
    return new GoogleGenAI({
      apiKey: customKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please add it to your environment.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Date helper for Yahoo Finance historical data
function getDatesForPeriod(period: string) {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1mo':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3mo':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6mo':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case '5y':
      startDate.setFullYear(startDate.getFullYear() - 5);
      break;
    default:
      startDate.setMonth(startDate.getMonth() - 3); // Default to 3mo
  }
  
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  };
}

// Simple in-memory cache to prevent rate limits and speed up responses
interface CachedEntry {
  data: any;
  timestamp: number;
}
const cache = new Map<string, CachedEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

function getCachedData(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Queries Screener.in API to search companies and parse ticker symbols from their URLs
async function searchStockTicker(query: string): Promise<any[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  const url = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(query.trim())}`;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const results = (await response.json()) as any[];
      const matches = [];
      for (const item of results.slice(0, 5)) {
        const companyUrl = item.url || "";
        const urlParts = companyUrl.split("/").filter(Boolean);
        const ticker = urlParts[1] ? urlParts[1].toUpperCase() : null;
        if (ticker) {
          matches.push({
            name: item.name,
            ticker: ticker
          });
        }
      }
      return matches;
    }
  } catch (e) {
    console.warn("[TARS] Screener.in API search failed:", e);
  }
  return [];
}

// Resolves a ticker using the exact input, .NS/.BO Indian suffixes, or Screener searches
async function resolveTickerAndFetch(ticker: string): Promise<{ ticker: string; quote: any }> {
  const cleanTicker = ticker.trim().toUpperCase();

  // 1. If it already has an explicit extension, try it directly
  if (cleanTicker.includes('.')) {
    try {
      const quote = (await yahooFinance.quote(cleanTicker)) as any;
      if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
        return { ticker: cleanTicker, quote };
      }
    } catch (e) {
      // Fallback .NS to .BO
      if (cleanTicker.endsWith('.NS')) {
        const boTicker = cleanTicker.replace('.NS', '.BO');
        try {
          const quote = (await yahooFinance.quote(boTicker)) as any;
          if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
            return { ticker: boTicker, quote };
          }
        } catch (err) {}
      }
    }
    throw new Error(`Ticker ${cleanTicker} returned no valid market price on Yahoo Finance.`);
  }

  // 2. No extension: try as-is (e.g. US stock like AAPL, TSLA, MSFT)
  try {
    const quote = (await yahooFinance.quote(cleanTicker)) as any;
    if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
      return { ticker: cleanTicker, quote };
    }
  } catch (e) {
    console.warn(`[TARS] Direct fetch failed for ${cleanTicker}, trying Indian suffix fallbacks...`);
  }

  // 3. Indian market fallback: try f"{cleanTicker}.NS"
  const nsTicker = `${cleanTicker}.NS`;
  try {
    const quote = (await yahooFinance.quote(nsTicker)) as any;
    if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
      return { ticker: nsTicker, quote };
    }
  } catch (e) {
    // 4. Try f"{cleanTicker}.BO"
    const boTicker = `${cleanTicker}.BO`;
    try {
      const quote = (await yahooFinance.quote(boTicker)) as any;
      if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
        return { ticker: boTicker, quote };
      }
    } catch (err) {}
  }

  // 5. Screener.in search resolution fallback (e.g., if query is "Reliance" or "Tata Power")
  try {
    console.warn(`[TARS] Trying Screener.in resolution for query: ${cleanTicker}...`);
    const matches = await searchStockTicker(cleanTicker);
    if (matches && matches.length > 0) {
      const bestMatch = matches[0].ticker;
      const matchNsTicker = bestMatch.includes('.') ? bestMatch : `${bestMatch}.NS`;
      try {
        const quote = (await yahooFinance.quote(matchNsTicker)) as any;
        if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
          return { ticker: matchNsTicker, quote };
        }
      } catch (errS1) {
        if (matchNsTicker.endsWith('.NS')) {
          const matchBoTicker = matchNsTicker.replace('.NS', '.BO');
          try {
            const quote = (await yahooFinance.quote(matchBoTicker)) as any;
            if (quote && (quote.regularMarketPrice != null || quote.regularMarketPreviousClose != null)) {
              return { ticker: matchBoTicker, quote };
            }
          } catch (errS2) {}
        }
      }
    }
  } catch (errS) {}

  throw new Error(`Could not resolve or retrieve stock data for ticker symbol: "${cleanTicker}".`);
}

// Fetch real-time stock details from Yahoo Finance
async function fetchStockData(ticker: string) {
  const cleanTicker = ticker.trim().toUpperCase();
  const cacheKey = `quote_${cleanTicker}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log(`[TARS] Cache hit for stockData: ${cleanTicker}`);
    return cached;
  }

  try {
    const { ticker: resolvedTicker, quote } = await resolveTickerAndFetch(cleanTicker);
    let summary: any = null;
    try {
      summary = await yahooFinance.quoteSummary(resolvedTicker, {
        modules: ['financialData', 'summaryDetail', 'defaultKeyStatistics']
      });
    } catch (e) {
      console.warn(`quoteSummary failed for ${resolvedTicker}, continuing with quote:`, e);
    }

    const finData = summary?.financialData || {};
    const sumDetail = summary?.summaryDetail || {};
    const keyStats = summary?.defaultKeyStatistics || {};

    const isIndian = resolvedTicker.endsWith('.NS') || resolvedTicker.endsWith('.BO') || quote.currency === 'INR';

    const result = {
      symbol: resolvedTicker,
      longName: quote.longName || quote.shortName || resolvedTicker,
      price: quote.regularMarketPrice || sumDetail.regularMarketPrice || null,
      change: quote.regularMarketChange || null,
      changePercent: quote.regularMarketChangePercent || null,
      currency: quote.currency || (isIndian ? 'INR' : 'USD'),
      
      // Moving averages
      fiftyDayAverage: quote.fiftyDayAverage || sumDetail.fiftyDayAverage || null,
      twoHundredDayAverage: quote.twoHundredDayAverage || sumDetail.twoHundredDayAverage || null,
      
      // Volatility
      beta: quote.beta || sumDetail.beta || null,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow || sumDetail.fiftyTwoWeekLow || null,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || sumDetail.fiftyTwoWeekHigh || null,
      
      // Valuations
      peRatio: quote.trailingPE || sumDetail.trailingPE || null,
      marketCap: quote.marketCap || sumDetail.marketCap || null,
      eps: quote.trailingEps || keyStats.trailingEps || null,
      
      // Financials (debts, cashflow, reserves, cash)
      totalCash: finData.totalCash || null,
      totalDebt: finData.totalDebt || null,
      operatingCashflow: finData.operatingCashflow || null,
      freeCashflow: finData.freeCashflow || null,
      debtToEquity: finData.debtToEquity || null,
      currentRatio: finData.currentRatio || null,
      quickRatio: finData.quickRatio || null,
      grossMargins: finData.grossMargins || null,
      ebitda: finData.ebitda || null,
      revenuePerShare: finData.revenuePerShare || null,
    };

    setCachedData(cacheKey, result);
    return result;
  } catch (err: any) {
    throw new Error(`Yahoo Finance retrieval failed: ${err.message || err}`);
  }
}

// Fetch historical price chart data from Yahoo Finance
async function fetchHistoricalData(ticker: string, period: string) {
  const cleanTicker = ticker.trim().toUpperCase();
  const cacheKey = `historical_${cleanTicker}_${period}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    console.log(`[TARS] Cache hit for historicalData: ${cleanTicker} (${period})`);
    return cached;
  }

  try {
    const { ticker: resolvedTicker } = await resolveTickerAndFetch(cleanTicker);
    const dates = getDatesForPeriod(period);

    const result: any = await yahooFinance.historical(resolvedTicker, {
      period1: dates.start,
      period2: dates.end,
      interval: '1d'
    });
    
    const formatted = result
      .map((item: any) => ({
        date: item.date instanceof Date ? item.date.toISOString().split('T')[0] : String(item.date).split('T')[0],
        close: item.close,
        volume: item.volume
      }))
      .filter((item: any) => item.close != null)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));

    setCachedData(cacheKey, formatted);
    return formatted;
  } catch (err: any) {
    throw new Error(`Failed to fetch historical data for ${cleanTicker}: ${err.message || err}`);
  }
}

// Gemini Tool Definitions
const getStockDataTool: FunctionDeclaration = {
  name: "getStockData",
  description: "Get real-time stock price and fundamental financial details like debt, reserves, cashflow, gross margin, EBITDA, P/E ratio, and moving averages for a given stock ticker symbol (e.g., AAPL).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
        description: "The stock symbol, e.g. AAPL, TSLA, MSFT, GOOG"
      }
    },
    required: ["ticker"]
  }
};

const getHistoricalDataTool: FunctionDeclaration = {
  name: "getHistoricalData",
  description: "Get historical stock closing prices and volumes over a given period (e.g., '1mo', '3mo', '1y') for plotting trends.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
        description: "The stock ticker symbol, e.g. AAPL"
      },
      period: {
        type: Type.STRING,
        description: "The period of historical data, allowed values: '1mo', '3mo', '6mo', '1y', '5y'. Default is '3mo'."
      }
    },
    required: ["ticker", "period"]
  }
};

const getStockNewsTool: FunctionDeclaration = {
  name: "getStockNews",
  description: "Get the top 5 highly accurate recent stock news articles and headlines for a given stock ticker symbol (e.g., TSLA). Always use this when the user asks for news, events, or updates about a company or stock.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      ticker: {
        type: Type.STRING,
        description: "The stock ticker symbol, e.g. TSLA, AAPL"
      }
    },
    required: ["ticker"]
  }
};

// Robust helper to query Gemini API with retries and exponential backoff, falling back to other aliases on transient errors
async function generateContentWithRetry(ai: any, params: any, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Attempt fallback model to circumvent localized high-demand/capacity issues
    const currentModel = attempt === 0 ? params.model : (attempt === 1 ? "gemini-3.1-flash-lite" : "gemini-3.5-flash");
    try {
      return await ai.models.generateContent({
        ...params,
        model: currentModel
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      const errStatus = err.status || 0;
      
      const isTransient = errStatus === 503 || 
                          errStatus === 429 ||
                          errMsg.includes("503") || 
                          errMsg.includes("429") || 
                          errMsg.includes("UNAVAILABLE") || 
                          errMsg.includes("high demand") ||
                          errMsg.includes("exhausted") ||
                          errMsg.includes("temporary");
      
      if (isTransient && attempt < maxRetries - 1) {
        console.warn(`[TARS] Gemini API retryable failure (attempt ${attempt + 1}/${maxRetries}): ${errMsg}. Retrying in ${delay}ms with model ${currentModel}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded for Gemini API call");
}

// API endpoint to fetch token usage status
app.get("/api/usage", async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const customKey = req.headers["x-gemini-key"] as string;
    const usage = await getUsage(userId);
    if (customKey) {
      const customLimit = 1000000; // 1,000,000 tokens limit for custom developer API keys
      return res.json({
        ...usage,
        limit: customLimit,
        percentage: Math.min(100, Math.round((usage.total / customLimit) * 1000) / 10),
        isCustomKey: true
      });
    }
    return res.json(usage);
  } catch (error: any) {
    console.warn("[TARS] Fetch usage error:", error.message || String(error));
    return res.status(500).json({ error: error.message || "Failed to fetch usage stats" });
  }
});

// Robust helper to fetch exactly 5 top stock-specific news items
async function fetchStockNewsHelper(ticker: string) {
  // Resolve the real company name from the cache or fetch it dynamically
  const cacheKey = `quote_${ticker}`;
  const cached = getCachedData(cacheKey);
  let companyName = ticker;
  if (cached && (cached.longName || cached.shortName)) {
    companyName = cached.longName || cached.shortName;
  } else {
    try {
      const quote = await yahooFinance.quote(ticker) as any;
      if (quote && (quote.longName || quote.shortName)) {
        companyName = quote.longName || quote.shortName;
      }
    } catch (e) {
      console.warn(`[TARS] Failed to resolve company name for ${ticker}:`, e);
    }
  }

  let news: any[] = [];
  try {
    const results = await yahooFinance.search(ticker);
    if (results && results.news && Array.isArray(results.news)) {
      // filter news to find ones containing the ticker or company name or other stock indicators
      const filtered = results.news.filter((item: any) => {
        const t = (item.title || "").toLowerCase();
        const p = (item.publisher || "").toLowerCase();
        return t.includes(ticker.toLowerCase()) || t.includes(companyName.toLowerCase()) || p.includes("yahoo") || p.includes("finance") || t.length > 10;
      });
      const finalNews = filtered.length > 0 ? filtered : results.news;
      
      news = finalNews.slice(0, 5).map((item: any) => ({
        title: item.title,
        publisher: item.publisher || "Yahoo Finance",
        link: item.link || `https://finance.yahoo.com/quote/${ticker}`,
        time: item.providerPublishTime ? new Date(item.providerPublishTime).toLocaleDateString() : "Recent News"
      }));
    }
  } catch (searchErr) {
    console.warn(`[TARS] yahooFinance.search failed for ${ticker}, using web search fallback:`, searchErr);
  }

  // Ensure we have exactly 5 items. Fill gaps with 100% specific stock search portals rather than random news.
  if (news.length < 5) {
    const remaining = 5 - news.length;
    const genericNewsSources = [
      { 
        source: "Yahoo Finance", 
        query: `${ticker}`, 
        template: `Yahoo Finance Live Feed: Charts, statements, and community reviews for ${companyName} (${ticker})`, 
        customUrl: `https://finance.yahoo.com/quote/${ticker}/news` 
      },
      { 
        source: "Google News", 
        query: `${companyName} stock news`, 
        template: `Google News coverage: Live pricing updates, headlines, and articles for ${companyName} (${ticker})`,
        customUrl: `https://news.google.com/search?q=${encodeURIComponent(companyName + ' stock')}`
      },
      { 
        source: "Bloomberg", 
        query: `${companyName}`, 
        template: `Bloomberg Markets profile and business metrics for ${companyName}`,
        customUrl: `https://www.bloomberg.com/search?query=${encodeURIComponent(companyName)}`
      },
      { 
        source: "CNBC", 
        query: `${ticker}`, 
        template: `CNBC Markets coverage: Real-time price actions and analyst estimates for ${companyName}`,
        customUrl: `https://www.cnbc.com/search/?query=${encodeURIComponent(companyName)}`
      },
      { 
        source: "Reuters", 
        query: `${companyName}`, 
        template: `Reuters Business report: strategic press releases and core operations of ${companyName}`,
        customUrl: `https://www.reuters.com/search/news?blob=${encodeURIComponent(companyName)}`
      }
    ];
    for (let i = 0; i < remaining; i++) {
      const src = genericNewsSources[i % genericNewsSources.length];
      news.push({
        title: src.template,
        publisher: src.source,
        link: src.customUrl,
        time: "Real-time Coverage"
      });
    }
  }

  return news;
}

// API endpoint to fetch stock news from Yahoo Finance with robust search fallback
app.get("/api/news/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.trim().toUpperCase();
    const news = await fetchStockNewsHelper(ticker);
    return res.json({ success: true, ticker, news });
  } catch (error: any) {
    console.warn("[TARS] News fetch general error:", error.message || String(error));
    return res.status(500).json({ error: error.message || "Failed to fetch news" });
  }
});

// API endpoint to validate a custom Gemini API Key
app.post("/api/validate-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: "API Key is required" });
    }

    const ai = getGemini(apiKey);
    
    // Validate by counting tokens for a lightweight non-generative API check
    const testResult = await ai.models.countTokens({
      model: "gemini-3.5-flash",
      contents: [{ parts: [{ text: "Key validation query" }] }]
    });

    return res.json({
      success: true,
      message: "API key is valid and connected successfully!",
      totalTokens: testResult.totalTokens
    });
  } catch (error: any) {
    console.warn("[TARS] API Key validation failed for the supplied custom key:", error.message || String(error));
    return res.status(400).json({
      success: false,
      error: error.message || "Invalid API key or authentication failed."
    });
  }
});

// API endpoint for stock analyzer chat
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, userId = "anonymous", apiKey } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid 'messages' format. Must be an array." });
    }

    const customKey = (req.headers["x-gemini-key"] as string) || apiKey;
    const hasCustomKey = !!customKey;

    // Check if API key is set before proceeding
    let ai;
    try {
      ai = getGemini(customKey);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }

    // 1. Pre-Check (The Gatekeeper): Fetch current usage and reject early if already over limit (bypassed if custom key is active)
    const currentUsage = await getUsage(userId);
    if (!hasCustomKey && currentUsage.total >= currentUsage.limit) {
      return res.status(429).json({
        error: `Token usage limit exceeded (${currentUsage.total.toLocaleString()} / ${currentUsage.limit.toLocaleString()} tokens). Please wait for the 30-day reset.`,
        usage: currentUsage
      });
    }

    // Convert messages to Gemini format
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // 2. Count Input Tokens to make sure this request doesn't push us over (bypassed if custom key is active)
    let inputTokens = 0;
    try {
      const tokenCountResult = await ai.models.countTokens({
        model: "gemini-3.5-flash",
        contents
      });
      inputTokens = tokenCountResult.totalTokens || 0;
    } catch (tokenErr) {
      console.warn("[TARS] Model countTokens failed, using approximate fallback:", tokenErr);
      const charCount = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      inputTokens = Math.max(10, Math.ceil(charCount / 4));
    }

    if (!hasCustomKey && currentUsage.total + inputTokens > currentUsage.limit) {
      return res.status(429).json({
        error: `Request blocked: This query requires approx. ${inputTokens.toLocaleString()} tokens, which would exceed your remaining limit (${(currentUsage.limit - currentUsage.total).toLocaleString()} left).`,
        usage: currentUsage
      });
    }

    // Initial tool definitions
    const systemInstruction = `You are TARS, an intelligent, sleek, and friendly stock analyst chatbot.
CRITICAL GUIDELINES:

1. PERSONALITY: Act like a versatile, helpful AI chatbot. Respond warmly to simple greetings, non-stock inquiries, and general questions. Keep your tone aligned with TARS (clever, neat, helpful).

2. ADAPTIVE RESPONDING (STRICT USER INTENT FOCUS):
- If the user ONLY asks for the financials of a stock (e.g. "financials of AAPL", "metrics for TSLA", "financial ratios for Nvidia"), ONLY output the requested financial data or numbers in a neat table or list. Do NOT write a lengthy review or a full stock analysis.
- If the user explicitly asks to ANALYZE a stock or asks for advice/outlook (e.g. "analyze AAPL", "should I buy Tesla?", "is MSFT a good investment?"), do a full analysis with this structure:
  * Present a clear "KEY METRICS" visual structure grouped into PRICE & TRENDS, FINANCIAL HEALTH & VALUATION, and DEBT & LIQUIDITY.
  * Provide a "BRIEF STOCK REVIEW" covering "What they do", "Connections & Suppliers", and "Investment Outlook" (outlining direct pros & cons based on metrics).
- If the user asks for NEWS (e.g. "news on AAPL"), only present the latest stock news headlines and summaries.
- If the user asks any other specific question (e.g. "What is the P/E ratio of MSFT?", "Who is the CEO of Apple?"), directly and concisely answer the question using the retrieved data. Do NOT include unrequested templates, analyses, or tables.

3. "THINKING" PROCESS TONE:
- When you are retrieving and interpreting data under the hood, describe your process as active analytical thinking, system simulation, or native core processing rather than explicitly mentioning Yahoo Finance. For example, use phrases like "Analyzing company structure...", "Synthesizing market trend...", or "TARS cognitive processing...".

4. TOOL USAGE:
- If the user asks about a company or stock (e.g., 'Apple' or 'AAPL', 'Tesla' or 'TSLA'), ALWAYS use 'getStockData' to retrieve current price, valuation, debt, reserves, cashflows, and moving averages.
- If they ask about price history, trends, or charts, use 'getHistoricalData' to get price history over a period (e.g., '3mo' or '1y').
- If they ask about stock news, headlines, recent news or press releases, use 'getStockNews' to get the top 5 highly accurate news articles.
- You can call multiple tools or the same tool for multiple tickers if the query asks for comparisons.`;

    const config = {
      systemInstruction,
      tools: [
        { functionDeclarations: [getStockDataTool, getHistoricalDataTool, getStockNewsTool] }
      ]
    };

    // 1. Initial call to Gemini with retry & fallback
    let response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents,
      config
    });

    let currentResponse = response;
    let iterations = 0;
    const toolResults: any[] = [];
    const interactionContents = [...contents];

    // 2. Resolve function calls if Gemini requests them
    while (currentResponse.functionCalls && currentResponse.functionCalls.length > 0 && iterations < 5) {
      iterations++;
      
      const modelTurn = currentResponse.candidates?.[0]?.content;
      if (!modelTurn) break;
      interactionContents.push(modelTurn);

      const toolResponseParts: any[] = [];
      
      for (const call of currentResponse.functionCalls) {
        const { name, args } = call;
        let result: any;
        const ticker = (args as any).ticker ? (args as any).ticker.toUpperCase() : null;
        
        try {
          if (name === "getStockData" && ticker) {
            result = await fetchStockData(ticker);
            toolResults.push({ type: 'stockData', ticker, data: result });
          } else if (name === "getHistoricalData" && ticker) {
            const period = (args as any).period || '3mo';
            result = await fetchHistoricalData(ticker, period);
            toolResults.push({ type: 'historicalData', ticker, period, data: result });
          } else if (name === "getStockNews" && ticker) {
            result = await fetchStockNewsHelper(ticker);
            toolResults.push({ type: 'newsData', ticker, data: result });
          } else {
            result = { error: `Function ${name} not found or missing ticker` };
          }
        } catch (err: any) {
          console.warn(`[TARS] Error executing tool ${name}:`, err.message || String(err));
          result = { error: err.message || String(err) };
        }
        
        toolResponseParts.push({
          functionResponse: {
            name,
            response: { result }
          }
        });
      }

      interactionContents.push({
        role: "tool",
        parts: toolResponseParts
      });

      // Query Gemini again with tool outputs with retry & fallback
      currentResponse = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: interactionContents,
        config
      });
    }

    const text = currentResponse.text || "I was unable to analyze that request. Please try a different stock symbol.";
    
    // 3. Tracking (The Ledger): Update usage stats using real usageMetadata if available
    let totalTokensUsed = inputTokens;
    if (currentResponse.usageMetadata && currentResponse.usageMetadata.totalTokenCount) {
      totalTokensUsed = currentResponse.usageMetadata.totalTokenCount;
    } else {
      // Fallback estimate for output tokens if metadata is not returned
      const outputEstimate = Math.ceil((text.length) / 4);
      totalTokensUsed += outputEstimate;
    }

    const updatedUsage = await addTokens(userId, totalTokensUsed);

    if (hasCustomKey) {
      const customLimit = 1000000;
      return res.json({
        text,
        toolResults,
        usage: {
          ...updatedUsage,
          limit: customLimit,
          percentage: Math.min(100, Math.round((updatedUsage.total / customLimit) * 1000) / 10),
          isCustomKey: true
        }
      });
    }

    return res.json({
      text,
      toolResults,
      usage: updatedUsage
    });

  } catch (error: any) {
    console.warn("[TARS] Chat API error:", error.message || String(error));
    return res.status(500).json({ error: error.message || "An error occurred during stock analysis." });
  }
});

export { app };

// Setup Vite / Static Asset Serving (skipped in Netlify serverless function context)
if (!process.env.NETLIFY) {
  async function startServer() {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }

  startServer();
}
