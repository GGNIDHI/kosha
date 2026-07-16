import React, { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
  LabelList,
} from 'recharts';
import { formatAmount } from '../../utils/currency';
import type { Transaction } from '../../db/database';

export interface CategoryChartItem {
  name: string;
  value: number;
  percentage: number;
  count: number;
  emoji: string;
  color: string;
  maxTxDesc: string;
  maxTxValue: number;
}

interface DashboardChartsProps {
  periodLabel: string;
  currency: string;
  categoryChartData: CategoryChartItem[] | null | undefined;
  trendChartData: any[];
  forecastData: any[];
  forecastMin: number;
  netWorthChartData: any[];
  transactions: Transaction[];
  reconciledTxIds: Set<string>;
}

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CustomTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as CategoryChartItem;
    return (
      <div
        className="glass-card tooltip-container"
        style={{
          background: 'rgba(12, 17, 29, 0.95)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '14px',
          color: '#fff',
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          fontSize: '0.85rem',
          minWidth: '250px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: '1' }}>{data.emoji}</span>
            <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{data.name}</span>
          </div>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '2px 6px', borderRadius: '6px', fontWeight: '600', letterSpacing: '0.04em' }}>
            Expense
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>💰 Total Spent:</span>
            <span style={{ fontWeight: '600', color: '#fff' }}>{formatAmount(data.value, currency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>📊 Share:</span>
            <span style={{ fontWeight: '600', color: '#38bdf8' }}>{data.percentage.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>🔢 Transactions:</span>
            <span style={{ fontWeight: '600', color: '#a78bfa' }}>{data.count} times</span>
          </div>
        </div>

        {data.maxTxValue > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '2px' }}>
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
              Largest Expense
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ color: '#e5e7eb', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1 }}>
                {data.maxTxDesc}
              </span>
              <span style={{ fontWeight: '600', fontSize: '0.8rem', color: '#f87171', whiteSpace: 'nowrap' }}>
                {formatAmount(data.maxTxValue, currency)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({
  periodLabel,
  currency,
  categoryChartData,
  trendChartData,
  forecastData,
  forecastMin,
  netWorthChartData,
  transactions,
  reconciledTxIds,
}) => {
  // Compute Cash Flow for last 6 months
  const cashFlowData = useMemo(() => {
    const monthsData: Record<string, { monthName: string; income: number; expenses: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsData[key] = {
        monthName: `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        income: 0,
        expenses: 0,
      };
    }

    transactions.forEach(tx => {
      const k = tx.date.slice(0, 7);
      if (monthsData[k]) {
        if (tx.type === 'credit') {
          if (!reconciledTxIds.has(tx.id!)) {
            monthsData[k].income += tx.amount;
          }
        } else {
          monthsData[k].expenses += tx.amount;
        }
      }
    });

    return Object.values(monthsData);
  }, [transactions, reconciledTxIds]);

  const safeCategoryChartData = categoryChartData || [];

  const renderYAxisTick = ({ x, y, payload }: any) => {
    const entry = safeCategoryChartData.find(d => d.name === payload.value);
    if (!entry) return null;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={-8}
          y={4}
          textAnchor="end"
          fill="var(--text-secondary)"
          fontSize={12}
          fontWeight={500}
        >
          {entry.emoji} {entry.name}
        </text>
      </g>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Charts Grid ── */}
      <div className="charts-dashboard-grid">
        {/* Category Bar Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Expenses by Category <span className="chart-subtitle">· {periodLabel}</span></h3>
          </div>
          <div className="chart-wrapper-body">
            {safeCategoryChartData.length === 0 ? (
              <div className="empty-chart-state"><p>No expenses for this period yet.</p></div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.min(320, Math.max(240, safeCategoryChartData.length * 38))}>
                <BarChart
                  data={safeCategoryChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 60, left: 85, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={renderYAxisTick}
                  />
                  <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                    {safeCategoryChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: any) => formatAmount(Number(v), currency)}
                      style={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
                      offset={8}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Income vs Expenses Area Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Cash Flow <span className="chart-subtitle">· Last 6 months</span></h3>
          </div>
          <div className="chart-wrapper-body">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="monthName" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  formatter={(v: any) => [formatAmount(Number(v), currency)]}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" name="Income" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" name="Expenses" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Financial Trend Chart (period-aware, 4 lines) ── */}
      <div className="glass-card dashboard-chart-card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={18} className="primary-color" />
            <h3>Financial Trend <span className="chart-subtitle">· {periodLabel}</span></h3>
          </div>
        </div>
        <div className="chart-wrapper-body">
          {trendChartData.length === 0 ? (
            <div className="empty-chart-state"><p>No data for selected period.</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                <Tooltip
                  contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  formatter={(v: any, name: any) => [formatAmount(Number(v), currency), name.charAt(0).toUpperCase() + name.slice(1)]}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Line type="monotone" dataKey="income" name="income" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expenses" name="expenses" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="savings" name="savings" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="6 2" />
                <Line type="monotone" dataKey="investments" name="investments" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 30-day Forecast ── */}
      <div className="glass-card dashboard-chart-card">
        <div className="card-header">
          <h3>30-Day Cash Flow Forecast</h3>
          <span className="chart-subtitle">Projected balance based on salary &amp; recurring debits</span>
        </div>
        <div className="chart-wrapper-body">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={forecastData} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} interval={4} />
              <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                formatter={(v: any) => [formatAmount(Number(v), currency), 'Projected Balance']}
                labelFormatter={(l) => `Date: ${l}`}
              />
              {forecastMin < 0 && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />}
              <Area type="monotone" dataKey="projected" stroke="#06b6d4" strokeWidth={2} fill="url(#forecastGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Net Worth History ── */}
      {netWorthChartData.length > 1 && (
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Net Worth History</h3>
            <span className="chart-subtitle">Monthly snapshot — cash + portfolio</span>
          </div>
          <div className="chart-wrapper-body">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={netWorthChartData} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  formatter={(v: any, name: any) => [formatAmount(Number(v), currency), name === 'netWorth' ? 'Net Worth' : name === 'cash' ? 'Cash' : 'Portfolio']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
                <Line type="monotone" dataKey="netWorth" name="netWorth" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="cash" name="cash" stroke="#22c55e" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="portfolio" name="portfolio" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
