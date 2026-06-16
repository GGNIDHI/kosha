import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { getReconciledPairs, getReconciledTransfers } from '../utils/reconciliation';
import {
  LayoutDashboard,
  ReceiptText,
  FileUp,
  TrendingUp,
  Target,
  Settings as SettingsIcon,
  Trophy,
  CreditCard,
  Sparkles,
  Calculator,
  FileSpreadsheet,
  Tag,
  RefreshCw,
  Sliders,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const MENU_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', name: 'Dashboard',       icon: LayoutDashboard },
      { id: 'smart_review', name: 'Smart Review', subtitle: '(Duplicate Transactions)', icon: RefreshCw },
      { id: 'insights',  name: 'AI Insights',     icon: Sparkles },
    ],
  },
  {
    label: 'Money',
    items: [
      { id: 'ledger',      name: 'Transactions',   icon: ReceiptText },
      { id: 'csv',         name: 'CSV Import',     icon: FileSpreadsheet },
      { id: 'budgets',     name: 'Budgets',        icon: Target },
      { id: 'goals',       name: 'Savings Goals',  icon: Trophy },
      { id: 'debts',       name: 'Debts & EMIs',   icon: CreditCard },
      { id: 'categories',  name: 'Categories',     icon: Tag },
      { id: 'salary_mappings', name: 'Salary Mappings', icon: Sliders },
    ],
  },
  {
    label: 'Wealth',
    items: [
      { id: 'investments', name: 'Investments',    icon: TrendingUp },
      { id: 'tax',         name: 'Tax Estimator',  icon: Calculator },
    ],
  },
  {
    label: 'Import',
    items: [
      { id: 'uploads',  name: 'AI PDF Analyzer', icon: FileUp },
      { id: 'settings', name: 'Settings',         icon: SettingsIcon },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const pendingCount = useLiveQuery(async () => {
    const transactions = await db.transactions.toArray();
    const salarySlips = await db.salarySlips.toArray();
    const decisions = await db.reconDecisions.toArray();
    const pairs = getReconciledPairs(transactions, salarySlips, decisions);
    const transfers = getReconciledTransfers(transactions, decisions);
    return pairs.filter(p => !p.hasDecision).length + transfers.filter(p => !p.hasDecision).length;
  }, []) || 0;

  return (
    <aside className="sidebar-container">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <img src="./logo.png" alt="Kosha" className="brand-logo-img" />
        </div>
        <div className="brand-info">
          <h2>Kosha</h2>
          <span>Finance Tracker</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {MENU_SECTIONS.map(section => (
          <div key={section.label} className="nav-section">
            <span className="nav-section-label">{section.label}</span>
            {section.items.map(item => {
              const IconComponent = item.icon;
              const isActive = currentView === item.id;
              const hasSub = 'subtitle' in item;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onViewChange(item.id)}
                  style={hasSub ? { padding: '6px 12px' } : undefined}
                >
                  <IconComponent size={18} className="nav-icon" />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <span>{item.name}</span>
                    {hasSub && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '1px' }}>
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                  {item.id === 'smart_review' && pendingCount > 0 && (
                    <span className="badge-count" style={{
                      background: 'var(--primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '8px',
                      boxShadow: '0 0 6px var(--primary)',
                      marginLeft: 'auto',
                      flexShrink: 0
                    }}>
                      {pendingCount}
                    </span>
                  )}
                  {isActive && <div className="active-indicator" />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="footer-status">
          <div className="status-dot online" />
          <span>Local Storage Only</span>
        </div>
      </div>

      <style>{`
        .sidebar-container {
          width: var(--sidebar-width);
          min-width: var(--sidebar-width);
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-glass);
          display: flex;
          flex-direction: column;
          padding: 32px 16px 24px 16px;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow-y: auto;
        }

        .sidebar-container::-webkit-scrollbar { width: 0; }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 32px;
          padding: 4px 8px;
          flex-shrink: 0;
        }

        .brand-logo {
          width: 42px; height: 42px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35), 0 0 0 1px rgba(139, 92, 246, 0.15);
          transition: var(--transition-smooth);
        }

        .brand-logo:hover {
          transform: rotate(5deg) scale(1.05);
          box-shadow: 0 6px 18px rgba(139, 92, 246, 0.45), 0 0 0 2px rgba(139, 92, 246, 0.25);
        }

        .brand-logo-img {
          width: 100%; height: 100%;
          object-fit: cover;
          border-radius: var(--border-radius-md);
        }

        .brand-info h2 {
          font-size: 1.25rem; font-weight: 700; line-height: 1.1;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        .brand-info span { font-size: 0.72rem; color: var(--text-muted); font-weight: 500; }

        .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }

        .nav-section { display: flex; flex-direction: column; gap: 3px; margin-bottom: 12px; }

        .nav-section-label {
          font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--text-muted);
          padding: 6px 12px; margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .nav-section-label::before {
          content: '';
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.5;
        }

        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: var(--border-radius-md);
          border: 1px solid transparent; background: transparent;
          color: var(--text-secondary); font-family: var(--font-body);
          font-size: 0.9rem; font-weight: 500; cursor: pointer;
          position: relative; transition: var(--transition-smooth);
          text-align: left; width: 100%;
        }

        .nav-item:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.04);
          transform: translateX(4px);
        }

        .nav-item.active {
          color: var(--text-primary);
          background: linear-gradient(90deg, hsla(263, 90%, 65%, 0.12) 0%, hsla(190, 95%, 50%, 0.03) 100%);
          border-color: rgba(139, 92, 246, 0.2);
          box-shadow: inset 0 0 12px rgba(139, 92, 246, 0.05);
        }

        .nav-icon { transition: var(--transition-smooth); flex-shrink: 0; }
        .nav-item.active .nav-icon { 
          color: var(--primary); 
          filter: drop-shadow(0 0 6px var(--primary));
        }

        .active-indicator {
          position: absolute; left: 0; top: 10px; bottom: 10px;
          width: 3px; background: var(--primary); border-radius: 0 4px 4px 0;
          box-shadow: 2px 0 8px var(--primary);
        }

        .sidebar-footer {
          margin-top: auto;
          padding-top: 14px; border-top: 1px solid var(--border-glass); flex-shrink: 0;
        }

        .footer-status {
          display: flex; align-items: center; gap: 8px;
          padding: 6px; font-size: 0.78rem; color: var(--text-muted); font-weight: 500;
        }

        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .status-dot.online { background-color: var(--success); box-shadow: 0 0 6px var(--success); }
      `}</style>
    </aside>
  );
};
