import { useState } from 'react';
import { Newspaper, ExternalLink, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { StockData } from '../types';

interface FinancialHUDProps {
  data: StockData;
}

export default function FinancialHUD({ data }: FinancialHUDProps) {
  const [showNews, setShowNews] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState('');

  const fetchNews = async () => {
    if (news.length > 0) {
      setShowNews(!showNews);
      return;
    }
    setLoadingNews(true);
    setNewsError('');
    setShowNews(true);
    try {
      const res = await fetch(`/api/news/${encodeURIComponent(data.symbol)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch news');
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.news)) {
        setNews(json.news);
      } else {
        throw new Error('Invalid news format');
      }
    } catch (err: any) {
      setNewsError(err.message || 'Unable to retrieve news articles.');
    } finally {
      setLoadingNews(false);
    }
  };

  const getCurrencySymbol = (currencyCode?: string) => {
    if (!currencyCode) return '₹'; // default fallback
    const code = currencyCode.toUpperCase();
    const mapping: { [key: string]: string } = {
      USD: '$',
      INR: '₹',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      CAD: 'CA$',
      AUD: 'A$',
      CNY: '¥',
      CHF: 'CHF ',
      HKD: 'HK$',
      NZD: 'NZ$',
      KRW: '₩',
      SGD: 'S$',
    };
    return mapping[code] || `${code} `;
  };

  const currencySymbol = getCurrencySymbol(data.currency);

  const formatAmount = (num: number | null | undefined) => {
    if (num == null) return '[ N/A ]';
    const absNum = Math.abs(num);
    const prefix = currencySymbol;
    
    if (absNum >= 1.0e12) {
      return `${prefix}${(num / 1.0e12).toFixed(2)}T`;
    }
    if (absNum >= 1.0e9) {
      return `${prefix}${(num / 1.0e9).toFixed(2)}B`;
    }
    if (absNum >= 1.0e6) {
      return `${prefix}${(num / 1.0e6).toFixed(2)}M`;
    }
    return `${prefix}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (num: number | null | undefined) => {
    if (num == null) return '[ N/A ]';
    // If it's already a percentage fraction (e.g., 0.45 for gross margin), convert to percentage
    const isFraction = Math.abs(num) <= 1.0;
    const value = isFraction ? num * 100 : num;
    return `${value.toFixed(2)}%`;
  };

  const formatRaw = (num: number | null | undefined, digits: number = 2) => {
    if (num == null) return '[ N/A ]';
    return num.toLocaleString(undefined, { maximumFractionDigits: digits });
  };

  const priceDiff = data.change ?? 0;
  const isPositive = priceDiff >= 0;

  return (
    <div className="w-full flex flex-col gap-6 text-xs font-mono select-none">
      
      {/* Stock Header Block */}
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-white mb-1 uppercase">
          {data.longName} ({data.symbol})
        </h2>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-white tracking-tighter">
            {data.price ? `${currencySymbol}${data.price.toFixed(2)}` : '[ N/A ]'}
          </span>
          <span className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {formatRaw(data.change, 2)} ({formatPercentage(data.changePercent)})
          </span>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Section 1: Valuation */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] text-neutral-400 font-semibold uppercase tracking-widest border-b border-white/5 pb-1">
            Valuation Metrics
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Market Cap:</span>
            <span className="text-white font-medium">{formatAmount(data.marketCap)}</span>
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">P/E Ratio:</span>
            <span className="text-white font-medium">{formatRaw(data.peRatio)}</span>
          </div>

          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">E.P.S:</span>
            <span className="text-white font-medium">{formatAmount(data.eps)}</span>
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">EBITDA:</span>
            <span className="text-white font-medium">{formatAmount(data.ebitda)}</span>
          </div>
        </div>

        {/* Section 2: Technicals & Volatility */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] text-neutral-400 font-semibold uppercase tracking-widest border-b border-white/5 pb-1">
            Technicals & Volatility
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">50-Day MA:</span>
            <span className="text-white font-medium">{formatAmount(data.fiftyDayAverage)}</span>
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">200-Day MA:</span>
            <span className="text-white font-medium">{formatAmount(data.twoHundredDayAverage)}</span>
          </div>

          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Beta (Volatility):</span>
            <span className="text-white font-medium">{formatRaw(data.beta, 3)}</span>
          </div>

          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">52-W Range:</span>
            <span className="text-white font-medium text-right max-w-[120px] truncate">
              {data.fiftyTwoWeekLow != null && data.fiftyTwoWeekHigh != null ? 
                `${currencySymbol}${data.fiftyTwoWeekLow.toFixed(1)} - ${currencySymbol}${data.fiftyTwoWeekHigh.toFixed(1)}` : 
                '[ N/A ]'}
            </span>
          </div>
        </div>

        {/* Section 3: Balance Sheet & Cashflow */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] text-neutral-400 font-semibold uppercase tracking-widest border-b border-white/5 pb-1">
            Financial Health
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Total Cash:</span>
            <span className="text-white font-medium">{formatAmount(data.totalCash)}</span>
          </div>
          
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Total Debt:</span>
            <span className="text-white font-medium">{formatAmount(data.totalDebt)}</span>
          </div>

          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Operating CF:</span>
            <span className="text-white font-medium">{formatAmount(data.operatingCashflow)}</span>
          </div>

          <div className="flex justify-between py-0.5">
            <span className="text-neutral-500">Free Cashflow:</span>
            <span className="text-white font-medium">{formatAmount(data.freeCashflow)}</span>
          </div>
        </div>

      </div>

      {/* Ratios row with sleek progress indicator bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-xl p-4">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400 uppercase">DEBT / EQUITY</span>
            <span className="text-white font-semibold">{formatRaw(data.debtToEquity, 2)}%</span>
          </div>
          <div className="w-full h-[2px] bg-white/10">
            <div 
              className="h-full bg-white transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(0, data.debtToEquity || 0))}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400 uppercase">GROSS MARGIN</span>
            <span className="text-white font-semibold">{formatPercentage(data.grossMargins)}</span>
          </div>
          <div className="w-full h-[2px] bg-white/10">
            <div 
              className="h-full bg-white transition-all duration-500" 
              style={{ 
                width: `${Math.min(100, Math.max(0, (data.grossMargins != null ? (Math.abs(data.grossMargins) <= 1 ? data.grossMargins * 100 : data.grossMargins) : 0)))}%` 
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400 uppercase">CURRENT RATIO</span>
            <span className="text-white font-semibold">{formatRaw(data.currentRatio, 2)}</span>
          </div>
          <div className="w-full h-[2px] bg-white/10">
            <div 
              className="h-full bg-white transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(0, (data.currentRatio || 0) * 20))}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400 uppercase">QUICK RATIO</span>
            <span className="text-white font-semibold">{formatRaw(data.quickRatio, 2)}</span>
          </div>
          <div className="w-full h-[2px] bg-white/10">
            <div 
              className="h-full bg-white transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(0, (data.quickRatio || 0) * 20))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent Stock News Option Section */}
      <div className="border-t border-white/10 pt-4 mt-2">
        <button
          onClick={fetchNews}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer text-left group"
        >
          <div className="flex items-center gap-2.5">
            <Newspaper size={15} className="text-emerald-400 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-sans text-[11px] font-bold tracking-wider text-neutral-200 uppercase">
              Recent News on {data.symbol}
            </span>
          </div>
          {loadingNews ? (
            <Loader2 size={14} className="text-emerald-400 animate-spin" />
          ) : showNews ? (
            <ChevronUp size={14} className="text-neutral-400" />
          ) : (
            <ChevronDown size={14} className="text-neutral-400" />
          )}
        </button>

        {showNews && (
          <div className="mt-3 space-y-2.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {loadingNews ? (
              <div className="flex flex-col gap-2 py-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex flex-col gap-2 p-3 bg-white/[0.01] border border-white/5 rounded-lg">
                    <div className="h-3 bg-white/10 rounded w-3/4"></div>
                    <div className="h-2 bg-white/5 rounded w-1/4"></div>
                  </div>
                ))}
              </div>
            ) : newsError ? (
              <div className="text-[10px] text-red-400 py-2 text-center">
                {newsError}
              </div>
            ) : news.length === 0 ? (
              <div className="text-[10px] text-neutral-500 py-2 text-center">
                No recent news articles available.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {news.map((item, index) => (
                  <a
                    key={index}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 transition-all duration-150 cursor-pointer group/item"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-sans font-medium text-neutral-200 group-hover/item:text-white text-[11px] leading-snug transition-colors duration-150">
                        {item.title}
                      </span>
                      <ExternalLink size={11} className="text-neutral-500 group-hover/item:text-emerald-400 shrink-0 mt-0.5 transition-colors duration-150" />
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-neutral-500">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-medium tracking-wide uppercase">
                        {item.publisher}
                      </span>
                      {item.time && (
                        <>
                          <span className="text-neutral-700">•</span>
                          <span>{item.time}</span>
                        </>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
