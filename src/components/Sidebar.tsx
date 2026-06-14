import React from 'react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  FileUp, 
  TrendingUp, 
  Target,
  Settings as SettingsIcon,
  PiggyBank
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'ledger', name: 'Transactions', icon: ReceiptText },
    { id: 'uploads', name: 'AI PDF Analyzer', icon: FileUp },
    { id: 'investments', name: 'Investments', icon: TrendingUp },
    { id: 'budgets', name: 'Budgets', icon: Target },
    { id: 'settings', name: 'Settings', icon: SettingsIcon },
  ];

  return (
    <aside className="sidebar-container">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <PiggyBank size={28} className="brand-icon" />
        </div>
        <div className="brand-info">
          <h2>Kosha</h2>
          <span>Finance Tracker</span>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              <IconComponent size={20} className="nav-icon" />
              <span>{item.name}</span>
              {isActive && <div className="active-indicator" />}
            </button>
          );
        })}
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
          padding: 24px 16px;
          height: 100vh;
          position: sticky;
          top: 0;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 40px;
          padding: 0 8px;
        }

        .brand-logo {
          width: 42px;
          height: 42px;
          border-radius: var(--border-radius-md);
          background: radial-gradient(circle, var(--primary) 0%, hsl(263, 90%, 55%) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        }

        .brand-icon {
          color: var(--text-primary);
        }

        .brand-info h2 {
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1.1;
          background: linear-gradient(135deg, var(--text-primary) 30%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .brand-info span {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: var(--border-radius-md);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          font-family: var(--font-body);
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
          text-align: left;
          width: 100%;
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

        .nav-icon {
          transition: var(--transition-smooth);
        }

        .nav-item.active .nav-icon {
          color: var(--primary);
        }

        .active-indicator {
          position: absolute;
          right: 0;
          top: 12px;
          bottom: 12px;
          width: 4px;
          background: var(--primary);
          border-radius: 4px 0 0 4px;
          box-shadow: -2px 0 10px var(--primary);
        }

        .sidebar-footer {
          padding-top: 16px;
          border-top: 1px solid var(--border-glass);
        }

        .footer-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.online {
          background-color: var(--success);
          box-shadow: 0 0 8px var(--success);
        }
      `}</style>
    </aside>
  );
};
