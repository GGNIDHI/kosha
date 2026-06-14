import React from 'react';
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
  return (
    <aside className="sidebar-container">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <img src="/logo.png" alt="Kosha" className="brand-logo-img" />
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
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onViewChange(item.id)}
                >
                  <IconComponent size={18} className="nav-icon" />
                  <span>{item.name}</span>
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
          padding: 20px 14px;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow-y: auto;
        }

        .sidebar-container::-webkit-scrollbar { width: 0; }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
          padding: 0 6px;
          flex-shrink: 0;
        }

        .brand-logo {
          width: 40px; height: 40px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }

        .brand-logo-img {
          width: 100%; height: 100%;
          object-fit: cover;
          border-radius: var(--border-radius-md);
        }

        .brand-info h2 {
          font-size: 1.2rem; font-weight: 700; line-height: 1.1;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        .brand-info span { font-size: 0.72rem; color: var(--text-muted); font-weight: 500; }

        .sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }

        .nav-section { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }

        .nav-section-label {
          font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
          padding: 4px 10px; margin-bottom: 2px;
        }

        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: var(--border-radius-md);
          border: 1px solid transparent; background: transparent;
          color: var(--text-secondary); font-family: var(--font-body);
          font-size: 0.88rem; font-weight: 500; cursor: pointer;
          position: relative; transition: var(--transition-smooth);
          text-align: left; width: 100%;
        }

        .nav-item:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.02);
        }

        .nav-item.active {
          color: var(--text-primary);
          background: hsla(263, 90%, 65%, 0.08);
          border-color: hsla(263, 90%, 65%, 0.15);
        }

        .nav-icon { transition: var(--transition-smooth); flex-shrink: 0; }
        .nav-item.active .nav-icon { color: var(--primary); }

        .active-indicator {
          position: absolute; right: 0; top: 10px; bottom: 10px;
          width: 3px; background: var(--primary); border-radius: 4px 0 0 4px;
          box-shadow: -2px 0 8px var(--primary);
        }

        .sidebar-footer {
          padding-top: 14px; border-top: 1px solid var(--border-glass); flex-shrink: 0;
        }

        .footer-status {
          display: flex; align-items: center; gap: 8px;
          padding: 6px; font-size: 0.75rem; color: var(--text-muted); font-weight: 500;
        }

        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .status-dot.online { background-color: var(--success); box-shadow: 0 0 6px var(--success); }
      `}</style>
    </aside>
  );
};
