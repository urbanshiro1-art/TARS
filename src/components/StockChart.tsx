import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { HistoricalDataPoint } from '../types';

interface StockChartProps {
  data: HistoricalDataPoint[];
  ticker: string;
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  currency?: string;
}

export default function StockChart({
  data,
  ticker,
  selectedPeriod = '3mo',
  onPeriodChange,
  currency
}: StockChartProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

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

  const currencySymbol = getCurrencySymbol(currency);

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-neutral-500 border border-white/5 rounded-lg bg-neutral-950/20">
        [ No historical data available ]
      </div>
    );
  }

  // Format tick values for XAxis
  const formatDateTick = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (selectedPeriod === '1mo') {
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      }
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const prices = data.map(d => d.close);
  const minPrice = Math.min(...prices) * 0.98;
  const maxPrice = Math.max(...prices) * 1.02;

  const currentPrice = data[data.length - 1]?.close;
  const startPrice = data[0]?.close;
  const percentageChange = startPrice ? ((currentPrice - startPrice) / startPrice) * 100 : 0;

  return (
    <div className="w-full h-full flex flex-col justify-between">
      {/* Mini Chart Header */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <span className="text-xs text-neutral-400 block tracking-widest">{ticker} HISTORICAL TREND</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-medium tracking-tight text-white">
              {hoveredValue !== null ? `${currencySymbol}${hoveredValue.toFixed(2)}` : `${currencySymbol}${currentPrice?.toFixed(2)}`}
            </span>
            <span className={`text-xs ${percentageChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {percentageChange >= 0 ? '+' : ''}{percentageChange.toFixed(2)}%
            </span>
          </div>
          <span className="text-[10px] text-neutral-500 font-mono block">
            {hoveredDate !== null ? hoveredDate : `Last ${selectedPeriod}`}
          </span>
        </div>

        {/* Timeline filters */}
        {onPeriodChange && (
          <div className="flex gap-1 border border-white/10 rounded p-1 sm:p-0.5 text-xs sm:text-[10px] bg-black/40">
            {['1mo', '3mo', '6mo', '1y', '5y'].map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-1 sm:px-2 sm:py-0.5 rounded transition-all duration-150 font-mono tracking-wider ${
                  selectedPeriod === p
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recharts Area Chart */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            onMouseMove={(state: any) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                setHoveredValue(state.activePayload[0].payload.close);
                setHoveredDate(state.activePayload[0].payload.date);
              }
            }}
            onMouseLeave={() => {
              setHoveredValue(null);
              setHoveredDate(null);
            }}
          >
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ffffff" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tick={{ fill: '#666666', fontSize: 9, fontFamily: 'Lucida Console, monospace' }}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
              tickLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: '#666666', fontSize: 9, fontFamily: 'Lucida Console, monospace' }}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
              tickLine={{ stroke: 'rgba(255, 255, 255, 0.05)' }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return null; // Using custom state display above chart instead of tooltip hover box
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#ffffff"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorClose)"
              activeDot={{ r: 4, stroke: '#000000', strokeWidth: 1.5, fill: '#ffffff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
