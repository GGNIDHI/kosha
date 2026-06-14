import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell,
  Legend
} from 'recharts';
import { 
  PiggyBank, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  CircleDollarSign, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  // Fetch transactions, investments, and salary slips
  const data = useLiveQuery(async () => {
    const transactions = await db.transactions.toArray();
    const investments = await db.investments.toArray();
    const salarySlips = await db.salarySlips.toArray();
    return { transactions, investments, salarySlips };
  }, []) || { transactions: [], investments: [], salarySlips: [] };

  const { transactions, investments, salarySlips } = data;

  // 1. Calculate Aggregates
  const cashBalance = transactions.reduce((sum, tx) => {
    if (tx.type === 'credit') return sum + tx.amount;
    return sum - tx.amount;
  }, 0);

  const portfolioValue = investments.reduce((sum, inv) => {
    return sum + (inv.quantity * (inv.currentPrice || inv.avgCost));
  }, 0);

  const netWorth = cashBalance + portfolioValue;

  // Monthly stats (for current month)
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const currentMonthTxs = transactions.filter(tx => tx.date.startsWith(currentMonthStr));
  
  const monthlyIncome = currentMonthTxs
    .filter(tx => tx.type === 'credit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const monthlyExpenses = currentMonthTxs
    .filter(tx => tx.type === 'debit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const monthlySavings = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;

  // 2. Prepare Chart Data: Income vs Expenses over the last 6 months
  const getLast6MonthsData = () => {
    const monthsData: { [key: string]: { monthName: string; income: number; expenses: number } } = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsData[key] = {
        monthName: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        income: 0,
        expenses: 0
      };
    }

    transactions.forEach(tx => {
      const txMonthKey = tx.date.slice(0, 7); // YYYY-MM
      if (monthsData[txMonthKey]) {
        if (tx.type === 'credit') {
          monthsData[txMonthKey].income += tx.amount;
        } else {
          monthsData[txMonthKey].expenses += tx.amount;
        }
      }
    });

    return Object.values(monthsData);
  };

  const trendChartData = getLast6MonthsData();

  // 3. Prepare Chart Data: Expenses by Category (Current Month)
  const getCategoryData = () => {
    const categoryTotals: { [key: string]: number } = {};
    
    currentMonthTxs
      .filter(tx => tx.type === 'debit')
      .forEach(tx => {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      });

    return Object.keys(categoryTotals).map(cat => ({
      name: cat,
      value: Math.round(categoryTotals[cat])
    })).sort((a, b) => b.value - a.value);
  };

  const categoryChartData = getCategoryData();

  // Colors for Category Bar Chart
  const COLORS = {
    'Food': '#f97316',
    'Shopping': '#a855f7',
    'Utilities': '#06b6d4',
    'Travel': '#eab308',
    'Salary': '#22c55e',
    'Investment': '#3b82f6',
    'Health': '#ef4444',
    'Entertainment': '#ec4899',
    'Others': '#6b7280'
  };

  // Recent 5 Transactions
  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // Recent Salary Slips
  const recentSalarySlips = [...salarySlips]
    .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
    .slice(0, 3);

  const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back! Here is a summary of your financial health.</p>
        </div>
        <div className="dashboard-badges">
          <div className="badge-ai-status glow-active">
            <Sparkles size={14} className="primary-color" />
            <span>AI Parsing Engine Active</span>
          </div>
        </div>
      </header>

      {/* Main Net Worth Banner */}
      <div className="glass-card net-worth-banner">
        <div className="banner-details">
          <div className="details-header">
            <PiggyBank size={24} className="banner-icon-piggy" />
            <span>Total Consolidated Net Worth</span>
          </div>
          <h2>₹ {netWorth.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h2>
          <p>Combined liquid cash balances and stock market investments</p>
        </div>

        <div className="banner-sub-stats">
          <div className="sub-stat-item border-right-glass">
            <div className="sub-label">
              <Wallet size={16} className="secondary-color" />
              <span>Liquid Cash</span>
            </div>
            <h4>₹ {cashBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h4>
          </div>

          <div className="sub-stat-item">
            <div className="sub-label">
              <CircleDollarSign size={16} className="primary-color" />
              <span>Investment Portfolio</span>
            </div>
            <h4>₹ {portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h4>
          </div>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      <div className="stats-row">
        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">This Month's Cash Inflow</span>
            <div className="stat-icon-wrapper success-bg">
              <ArrowDownLeft size={16} className="success-color" />
            </div>
          </div>
          <span className="stat-value">₹ {monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">This Month's Expenses</span>
            <div className="stat-icon-wrapper danger-bg">
              <ArrowUpRight size={16} className="danger-color" />
            </div>
          </div>
          <span className="stat-value">₹ {monthlyExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card-header">
            <span className="stat-label">Monthly Savings Rate</span>
            <div className="stat-icon-wrapper primary-bg">
              <PiggyBank size={16} className="primary-color" />
            </div>
          </div>
          <div className="stat-value-group">
            <span className="stat-value">{savingsRate.toFixed(1)}%</span>
            <span className="pnl-percent badge badge-category">
              ₹ {monthlySavings.toLocaleString(undefined, { maximumFractionDigits: 0 })} saved
            </span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-dashboard-grid">
        {/* Income vs Expenses Cashflow Area Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Cash Flow Trend (Last 6 Months)</h3>
          </div>
          <div className="chart-wrapper-body">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="monthName" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{
                    background: '#0c111d',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any) => [`₹ ${Number(value).toLocaleString()}`]}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" name="Income" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" name="Expenses" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Category Distribution Bar Chart */}
        <div className="glass-card dashboard-chart-card">
          <div className="card-header">
            <h3>Expenses by Category (Current Month)</h3>
          </div>
          <div className="chart-wrapper-body">
            {categoryChartData.length === 0 ? (
              <div className="empty-chart-state">
                <p>No expenses logged in {monthNamesFull[today.getMonth()]} yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChartData}>
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{
                      background: '#0c111d',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                    formatter={(value: any) => [`₹ ${Number(value).toLocaleString()}`, 'Amount Spent']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(COLORS as any)[entry.name] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Lists Row */}
      <div className="dashboard-lists-row">
        {/* Recent Transactions Widget */}
        <div className="glass-card dashboard-list-card">
          <div className="list-card-header">
            <h3>Recent Ledger Entries</h3>
            <button className="btn-link" onClick={() => onNavigate('ledger')}>
              <span>View All</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="list-card-body">
            {recentTransactions.length === 0 ? (
              <div className="empty-list-state">
                <p>No transactions recorded yet.</p>
              </div>
            ) : (
              <div className="mini-ledger-list">
                {recentTransactions.map(tx => (
                  <div key={tx.id} className="mini-ledger-item">
                    <div className="item-details">
                      <span className="item-desc">{tx.description}</span>
                      <span className="item-meta">{tx.date} • {tx.category}</span>
                    </div>
                    <span className={`item-value ${tx.type}`}>
                      {tx.type === 'credit' ? '+' : '-'} ₹{tx.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Parsed Salary Slips History Widget */}
        <div className="glass-card dashboard-list-card">
          <div className="list-card-header">
            <h3>AI Parsed Salary History</h3>
            <button className="btn-link" onClick={() => onNavigate('uploads')}>
              <span>Analyze New</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="list-card-body">
            {recentSalarySlips.length === 0 ? (
              <div className="empty-list-state">
                <p>Upload your salary slip PDFs in the AI PDF Analyzer to compile your income profile.</p>
              </div>
            ) : (
              <div className="salary-history-list">
                {recentSalarySlips.map(slip => (
                  <div key={slip.id} className="salary-history-item">
                    <div className="item-details">
                      <span className="item-desc">{monthNamesFull[slip.month - 1]} {slip.year}</span>
                      <span className="item-meta">
                        Basic: ₹{slip.basicPay.toLocaleString()} • Deductions: ₹{(slip.providentFund + slip.taxDeducted + slip.otherDeductions).toLocaleString()}
                      </span>
                    </div>
                    <div className="salary-takehome">
                      <span className="salary-takehome-val">₹{slip.netPay.toLocaleString()}</span>
                      <span className="salary-takehome-lbl">Net Credit</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .badge-ai-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          background: var(--primary-glow);
          border: 1px solid rgba(139, 92, 246, 0.2);
          padding: 6px 12px;
          border-radius: 20px;
          color: var(--text-primary);
        }

        /* Net Worth Banner */
        .net-worth-banner {
          background: linear-gradient(135deg, hsla(263, 60%, 8%, 0.7) 0%, hsla(190, 60%, 8%, 0.7) 100%), var(--bg-card);
          padding: 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 24px;
        }

        .banner-details {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .details-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .banner-icon-piggy {
          color: var(--primary);
        }

        .banner-details h2 {
          font-family: var(--font-heading);
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .banner-details p {
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .banner-sub-stats {
          display: flex;
          gap: 24px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-lg);
          padding: 16px 24px;
        }

        .sub-stat-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .border-right-glass {
          border-right: 1px solid var(--border-glass);
          padding-right: 24px;
        }

        .sub-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .sub-stat-item h4 {
          font-size: 1.25rem;
          font-family: var(--font-heading);
          font-weight: 700;
        }

        /* Stat Card Extensions */
        .stat-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .stat-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .success-bg { background: var(--success-glow); border: 1px solid rgba(34, 197, 94, 0.1); }
        .danger-bg { background: var(--danger-glow); border: 1px solid rgba(239, 68, 68, 0.1); }
        .primary-bg { background: var(--primary-glow); border: 1px solid rgba(139, 92, 246, 0.1); }

        /* Charts Grid */
        .charts-dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
          gap: 24px;
        }

        @media (max-width: 600px) {
          .charts-dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        .dashboard-chart-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .chart-wrapper-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 20px;
        }

        .empty-chart-state {
          font-size: 0.9rem;
          color: var(--text-muted);
        }

        /* Lists widgets */
        .dashboard-lists-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .dashboard-list-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .list-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 12px;
          margin-bottom: 16px;
        }

        .btn-link {
          background: transparent;
          border: none;
          color: var(--primary);
          font-family: var(--font-body);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: var(--transition-smooth);
        }

        .btn-link:hover {
          color: hsl(263, 90%, 75%);
          transform: translateX(1px);
        }

        .list-card-body {
          flex: 1;
        }

        .empty-list-state {
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          height: 100px;
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .mini-ledger-list, .salary-history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mini-ledger-item, .salary-history-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
        }

        .item-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .item-desc {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .item-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .item-value {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.95rem;
        }

        .item-value.debit { color: var(--danger); }
        .item-value.credit { color: var(--success); }

        .salary-takehome {
          text-align: right;
        }

        .salary-takehome-val {
          display: block;
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--secondary);
        }

        .salary-takehome-lbl {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};
