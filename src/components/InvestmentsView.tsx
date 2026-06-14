import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Investment } from '../db/database';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TrendingUp, FileUp, Plus, Trash2, ArrowUpRight, ArrowDownLeft, PieChart as PieChartIcon, X } from 'lucide-react';

export const InvestmentsView: React.FC = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch investments from database
  const investments = useLiveQuery(() => db.investments.toArray(), []) || [];

  // Parse CSV file exported from Zerodha Console/Holdings
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        
        if (lines.length < 2) {
          throw new Error('CSV file is empty or has invalid headers.');
        }

        const newInvestments: Investment[] = [];
        // Detect headers
        const headers = lines[0].toLowerCase().split(',');
        const symbolIdx = headers.findIndex(h => h.includes('symbol') || h.includes('instrument') || h.includes('ticker'));
        const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares'));
        const avgIdx = headers.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price'));
        const ltpIdx = headers.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price'));

        if (symbolIdx === -1 || qtyIdx === -1 || avgIdx === -1) {
          throw new Error('Required CSV columns (Symbol/Instrument, Qty, Avg Cost) not found.');
        }

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV line splitter that handles quotes correctly if they exist
          const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          
          const sym = cols[symbolIdx]?.replace(/"/g, '').trim().toUpperCase();
          const qty = parseFloat(cols[qtyIdx]?.replace(/"/g, '').trim());
          const avg = parseFloat(cols[avgIdx]?.replace(/"/g, '').trim());
          const ltp = ltpIdx !== -1 ? parseFloat(cols[ltpIdx]?.replace(/"/g, '').trim()) : undefined;

          if (sym && !isNaN(qty) && !isNaN(avg)) {
            newInvestments.push({
              id: sym,
              symbol: sym,
              quantity: qty,
              avgCost: avg,
              currentPrice: !isNaN(ltp as number) ? ltp : avg, // Default to avg cost if current price is missing
              lastUpdated: new Date().toISOString()
            });
          }
        }

        if (newInvestments.length === 0) {
          throw new Error('No valid stock records found in the CSV.');
        }

        // Overwrite or append? Let's overwrite holdings to keep it fresh
        await db.investments.clear();
        await db.investments.bulkAdd(newInvestments);
        
        // Also add investment event log in transaction ledger (Optional: but keeping database synced is nice)
        alert(`Successfully imported ${newInvestments.length} holdings from Zerodha CSV!`);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!symbol || !quantity || !avgCost) return;

    const sym = symbol.trim().toUpperCase();
    const qty = parseFloat(quantity);
    const avg = parseFloat(avgCost);
    const cur = currentPrice ? parseFloat(currentPrice) : avg;

    try {
      await db.investments.put({
        id: sym,
        symbol: sym,
        quantity: qty,
        avgCost: avg,
        currentPrice: cur,
        lastUpdated: new Date().toISOString()
      });

      // Reset
      setSymbol('');
      setQuantity('');
      setAvgCost('');
      setCurrentPrice('');
      setShowAddForm(false);
    } catch (err: any) {
      setError('Failed to add investment: ' + err?.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this holding from portfolio?')) {
      try {
        await db.investments.delete(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Portfolio aggregates
  const totalCost = investments.reduce((sum, inv) => sum + (inv.quantity * inv.avgCost), 0);
  const totalValue = investments.reduce((sum, inv) => sum + (inv.quantity * (inv.currentPrice || inv.avgCost)), 0);
  const totalPnL = totalValue - totalCost;
  const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Chart Data preparation (Top 5 holdings + rest combined as 'Others')
  const chartData = [...investments]
    .map(inv => ({
      name: inv.symbol,
      value: Math.round(inv.quantity * (inv.currentPrice || inv.avgCost))
    }))
    .sort((a, b) => b.value - a.value);

  const topHoldings = chartData.slice(0, 5);
  const otherHoldingsSum = chartData.slice(5).reduce((sum, item) => sum + item.value, 0);
  
  if (otherHoldingsSum > 0) {
    topHoldings.push({ name: 'Others', value: otherHoldingsSum });
  }

  // Colors for pie slices
  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6b7280'];

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Investments</h1>
          <p>Track your stock holdings, average costs, and portfolio asset allocation.</p>
        </div>
        <div className="header-actions">
          <label className="btn btn-secondary cursor-pointer">
            <FileUp size={18} />
            <span>Import Zerodha CSV</span>
            <input 
              type="file" 
              accept=".csv" 
              className="display-none"
              onChange={handleCsvUpload}
            />
          </label>
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
            <Plus size={18} />
            <span>Add Asset</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error-box">
          <span>{error}</span>
        </div>
      )}

      {/* Manual Add Form Overlay */}
      {showAddForm && (
        <div className="drawer-overlay" onClick={() => setShowAddForm(false)}>
          <div className="glass-card drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Add Asset Holding</h3>
              <button className="btn-close" onClick={() => setShowAddForm(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleManualAdd} className="drawer-form">
              <div className="form-group">
                <label className="form-label">Stock Symbol</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. RELIANCE"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input 
                  type="number" 
                  step="0.0001"
                  className="form-input" 
                  placeholder="e.g. 10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Avg Purchase Cost</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  placeholder="0.00"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Current Price (LTP)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  placeholder="Leave blank to use Avg Cost"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                Add Asset
              </button>
            </form>
          </div>
        </div>
      )}

      {investments.length === 0 ? (
        <div className="glass-card empty-state-card">
          <TrendingUp size={48} className="empty-icon" />
          <h3>No Holdings Tracked Yet</h3>
          <p>
            Upload a CSV exported from your Zerodha Console or add your stock positions manually to view your asset breakdown.
          </p>
          <div className="empty-actions">
            <label className="btn btn-primary cursor-pointer">
              <FileUp size={18} />
              <span>Upload Zerodha CSV</span>
              <input 
                type="file" 
                accept=".csv" 
                className="display-none"
                onChange={handleCsvUpload}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Row */}
          <div className="stats-row">
            <div className="glass-card stat-card">
              <span className="stat-label">Total Invested (Cost)</span>
              <span className="stat-value">₹ {totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="glass-card stat-card">
              <span className="stat-label">Current Value</span>
              <span className="stat-value text-glow-cyan">₹ {totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>

            <div className="glass-card stat-card">
              <span className="stat-label">Unrealized P&L</span>
              <div className="stat-value-group">
                <span className={`stat-value ${totalPnL >= 0 ? 'success-color' : 'danger-color'}`}>
                  ₹ {totalPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className={`pnl-percent badge ${totalPnL >= 0 ? 'badge-success' : 'badge-danger'}`}>
                  {totalPnL >= 0 ? '+' : ''} {pnlPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Visual Grid */}
          <div className="visuals-grid">
            {/* Pie Chart Card */}
            <div className="glass-card chart-card-wrapper">
              <div className="card-header">
                <PieChartIcon size={18} className="secondary-color" />
                <h3>Asset Allocation</h3>
              </div>
              <div className="pie-chart-container">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={topHoldings}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {topHoldings.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [`₹ ${Number(value).toLocaleString()}`, 'Value']}
                      contentStyle={{
                        background: '#0c111d',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pie-legend">
                  {topHoldings.map((entry, idx) => (
                    <div key={entry.name} className="legend-item">
                      <span className="legend-dot" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="legend-name">{entry.name}</span>
                      <span className="legend-value">{((entry.value / totalValue) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="glass-card table-card">
              <div className="card-header">
                <TrendingUp size={18} className="primary-color" />
                <h3>Stock Positions</h3>
              </div>
              <div className="table-responsive">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Avg. Price</th>
                      <th className="text-right">Current Price</th>
                      <th className="text-right">Total P&L</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map((inv) => {
                      const cost = inv.quantity * inv.avgCost;
                      const value = inv.quantity * (inv.currentPrice || inv.avgCost);
                      const pnl = value - cost;
                      const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                      return (
                        <tr key={inv.symbol} className="table-row">
                          <td className="stock-ticker">{inv.symbol}</td>
                          <td className="text-right">{inv.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                          <td className="text-right">₹ {inv.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">₹ {(inv.currentPrice || inv.avgCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className={`text-right font-bold ${pnl >= 0 ? 'success-color' : 'danger-color'}`}>
                            <div className="pnl-row-value">
                              {pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                              <span>₹ {pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                            <span className="pnl-pct-label">({pnl >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                          </td>
                          <td className="text-center">
                            <button className="btn-delete-action" onClick={() => inv.symbol && handleDelete(inv.symbol)}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .header-actions {
          display: flex;
          gap: 12px;
        }

        .empty-state-card {
          padding: 80px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          margin-top: 16px;
        }

        .empty-actions {
          margin-top: 24px;
        }

        /* Stats Row */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .stat-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .stat-value {
          font-family: var(--font-heading);
          font-size: 1.8rem;
          font-weight: 700;
        }

        .text-glow-cyan {
          color: var(--secondary);
          text-shadow: 0 0 15px var(--secondary-glow);
        }

        .stat-value-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pnl-percent {
          font-size: 0.8rem;
        }

        .badge-success {
          background: var(--success-glow);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.1);
        }

        .badge-danger {
          background: var(--danger-glow);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.1);
        }

        .success-color {
          color: var(--success) !important;
        }

        .danger-color {
          color: var(--danger) !important;
        }

        /* Visuals Grid */
        .visuals-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
          align-items: start;
        }

        @media (max-width: 1024px) {
          .visuals-grid {
            grid-template-columns: 1fr;
          }
        }

        .chart-card-wrapper {
          padding: 24px;
        }

        .pie-chart-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 16px;
        }

        .pie-legend {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 16px;
          border-top: 1px solid var(--border-glass);
          padding-top: 16px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          font-size: 0.8rem;
          gap: 6px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-name {
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 70px;
        }

        .legend-value {
          color: var(--text-primary);
          font-weight: 600;
          margin-left: auto;
        }

        .table-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .holdings-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .holdings-table th {
          padding: 12px;
          font-size: 0.8rem;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-glass);
          text-transform: uppercase;
        }

        .holdings-table td {
          padding: 14px 12px;
          font-size: 0.9rem;
          border-bottom: 1px solid var(--border-glass);
        }

        .stock-ticker {
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-heading);
        }

        .font-bold {
          font-weight: 600;
        }

        .pnl-row-value {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .pnl-pct-label {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};
