import React from 'react';
import { X } from 'lucide-react';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { formatAmount } from '../../utils/currency';
import type { Transaction } from '../../db/database';

interface RecurringPopupProps {
  description: string;
  allTransactions: Transaction[];
  currency: string;
  onClose: () => void;
}

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const RecurringPopup: React.FC<RecurringPopupProps> = ({
  description,
  allTransactions,
  currency,
  onClose,
}) => {
  const history = allTransactions
    .filter(tx => tx.description === description)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Monthly totals for chart
  const monthlyMap: Record<string, number> = {};
  history.forEach(tx => {
    const key = tx.date.slice(0, 7);
    monthlyMap[key] = (monthlyMap[key] || 0) + tx.amount;
  });
  const chartData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amt]) => ({
      label: `${MN[parseInt(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
      amount: amt,
    }));

  const total = history.reduce((s, t) => s + t.amount, 0);
  const avg = history.length > 0 ? total / history.length : 0;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-modal" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <div>
            <h3 className="popup-title">{description}</h3>
            <p className="popup-subtitle">Full transaction history across all time</p>
          </div>
          <button className="popup-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="popup-stats-row">
          <div className="popup-stat">
            <span className="popup-stat-label">Total Spent</span>
            <span className="popup-stat-value">{formatAmount(total, currency)}</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-label">Avg per Transaction</span>
            <span className="popup-stat-value">{formatAmount(avg, currency)}</span>
          </div>
          <div className="popup-stat">
            <span className="popup-stat-label">Occurrences</span>
            <span className="popup-stat-value">{history.length}</span>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="popup-chart">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#0c111d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff' }}
                  formatter={(v: any) => [formatAmount(Number(v), currency), 'Spent']}
                />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="popup-table-wrap">
          <table className="popup-table">
            <thead>
              <tr><th>Date</th><th>Category</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {history.map((tx, i) => (
                <tr key={i}>
                  <td>{tx.date}</td>
                  <td><span className="cat-tag">{tx.category}</span></td>
                  <td className="amt-cell debit-color">−{formatAmount(tx.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
