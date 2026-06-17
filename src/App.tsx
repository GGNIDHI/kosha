import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { LedgerView } from './components/LedgerView/LedgerView';
import { PdfParserView } from './components/PdfParserView/PdfParserView';
import { InvestmentsView } from './components/InvestmentsView/InvestmentsView';
import { BudgetsView } from './components/BudgetsView/BudgetsView';
import { GoalsView } from './components/GoalsView/GoalsView';
import { DebtView } from './components/DebtView/DebtView';
import { InsightsView } from './components/InsightsView';
import { TaxView } from './components/TaxView/TaxView';
import { CsvImportView } from './components/CsvImportView/CsvImportView';
import { CategoriesView } from './components/CategoriesView/CategoriesView';
import { SettingsView } from './components/SettingsView/SettingsView';
import { OnboardingView } from './components/OnboardingView';
import { SmartReviewView } from './components/SmartReviewView';
import { SalaryMappingsView } from './components/SalaryMappingsView/SalaryMappingsView';
import { getSetting } from './db/database';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkInit() {
      const initialized = await getSetting('hasBeenInitialized', false);
      setIsInitialized(initialized);
    }
    checkInit();
  }, []);

  if (isInitialized === null) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--bg-app)',
        color: 'var(--text-secondary)'
      }}>
        Loading Kosha...
      </div>
    );
  }

  if (!isInitialized) {
    return <OnboardingView onComplete={() => setIsInitialized(true)} />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':   return <DashboardView onNavigate={setCurrentView} />;
      case 'ledger':      return <LedgerView />;
      case 'goals':       return <GoalsView />;
      case 'budgets':     return <BudgetsView />;
      case 'investments': return <InvestmentsView />;
      case 'debts':       return <DebtView />;
      case 'insights':    return <InsightsView />;
      case 'tax':         return <TaxView />;
      case 'uploads':     return <PdfParserView />;
      case 'csv':         return <CsvImportView />;
      case 'categories':  return <CategoriesView />;
      case 'salary_mappings': return <SalaryMappingsView />;
      case 'settings':    return <SettingsView />;
      case 'smart_review': return <SmartReviewView />;
      default:            return <DashboardView onNavigate={setCurrentView} />;
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
