export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  ticker?: string;
  toolResults?: ToolResult[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  activeTicker?: string;
  timestamp: string;
}

export interface StockData {
  symbol: string;
  longName: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  beta: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  peRatio: number | null;
  marketCap: number | null;
  eps: number | null;
  
  // Financials
  totalCash: number | null;
  totalDebt: number | null;
  operatingCashflow: number | null;
  freeCashflow: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  grossMargins: number | null;
  ebitda: number | null;
  revenuePerShare: number | null;
}

export interface HistoricalDataPoint {
  date: string;
  close: number;
  volume: number;
}

export interface ToolResult {
  type: 'stockData' | 'historicalData';
  ticker: string;
  period?: string;
  data: StockData | HistoricalDataPoint[];
}
