import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { LedgerView } from './components/LedgerView';
import { PdfParserView } from './components/PdfParserView';
import { InvestmentsView } from './components/InvestmentsView';
import { SettingsView } from './components/SettingsView';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={setCurrentView} />;
      case 'ledger':
        return <LedgerView />;
      case 'uploads':
        return <PdfParserView />;
      case 'investments':
        return <InvestmentsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="app-view-wrapper">
        {renderCurrentView()}
      </main>

      <style>{`
        .app-view-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

export default App;
