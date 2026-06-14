import React, { useState, useEffect } from 'react';
import { db, getSetting, setSetting } from '../db/database';
import { Key, ShieldAlert, Database, Download, Upload, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [userName, setUserName] = useState('User');
  const [currency, setCurrency] = useState('INR');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const savedKey = await getSetting('geminiApiKey', '');
      const savedName = await getSetting('userName', 'User');
      const savedCurrency = await getSetting('currency', 'INR');
      setApiKey(savedKey);
      setUserName(savedName);
      setCurrency(savedCurrency);
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setSetting('geminiApiKey', apiKey.trim());
      await setSetting('userName', userName.trim());
      await setSetting('currency', currency);
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
  };

  const handleExport = async () => {
    try {
      const transactions = await db.transactions.toArray();
      const salarySlips = await db.salarySlips.toArray();
      const investments = await db.investments.toArray();
      const settings = await db.settings.toArray();

      const backupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          transactions,
          salarySlips,
          investments,
          settings: settings.filter(s => s.key !== 'geminiApiKey') // Exclude sensitive API key from backup file for security
        }
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `kosha_finance_backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert('Failed to export database: ' + err);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        if (!backup.data) throw new Error('Invalid backup file format');

        // Restore transactions
        if (backup.data.transactions) {
          await db.transactions.clear();
          await db.transactions.bulkAdd(backup.data.transactions);
        }
        // Restore salary slips
        if (backup.data.salarySlips) {
          await db.salarySlips.clear();
          await db.salarySlips.bulkAdd(backup.data.salarySlips);
        }
        // Restore investments
        if (backup.data.investments) {
          await db.investments.clear();
          await db.investments.bulkAdd(backup.data.investments);
        }
        // Restore settings (except API key)
        if (backup.data.settings) {
          for (const setting of backup.data.settings) {
            if (setting.key !== 'geminiApiKey') {
              await db.settings.put(setting);
            }
          }
        }

        // Trigger settings refresh
        const savedName = await getSetting('userName', 'User');
        const savedCurrency = await getSetting('currency', 'INR');
        setUserName(savedName);
        setCurrency(savedCurrency);

        alert('Database restored successfully!');
      } catch (err) {
        alert('Failed to restore backup: ' + err);
      }
    };
    reader.readAsText(file);
  };

  const handleClearDatabase = async () => {
    try {
      await db.transactions.clear();
      await db.salarySlips.clear();
      await db.investments.clear();
      await db.settings.clear();
      
      setApiKey('');
      setUserName('User');
      setCurrency('INR');
      setResetConfirm(false);
      alert('All local data cleared successfully.');
    } catch (err) {
      alert('Failed to reset database: ' + err);
    }
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header">
        <h1>Settings</h1>
        <p>Manage your API keys, regional preferences, and local backups.</p>
      </header>

      <div className="settings-grid">
        <form onSubmit={handleSave} className="glass-card settings-card">
          <div className="card-header">
            <Key size={20} className="card-icon primary-color" />
            <h3>General & API Credentials</h3>
          </div>

          <div className="card-body">
            <div className="form-group">
              <label className="form-label" htmlFor="username">Profile Name</label>
              <input
                id="username"
                type="text"
                className="form-input"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="currency">Base Currency</label>
              <select
                id="currency"
                className="form-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="INR">INR (₹) - Indian Rupee</option>
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="JPY">JPY (¥) - Japanese Yen</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="apikey">Google Gemini API Key</label>
              <div className="input-group-password">
                <input
                  id="apikey"
                  type={showKey ? 'text' : 'password'}
                  className="form-input password-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="field-hint">
                Required for parsing PDFs. You can get a free developer key from the <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>.
              </p>
            </div>

            {saveStatus === 'success' && (
              <div className="alert alert-success-box">
                <CheckCircle2 size={16} />
                <span>Settings saved successfully!</span>
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="alert alert-error-box">
                <AlertCircle size={16} />
                <span>Failed to save settings.</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-save">
              Save Settings
            </button>
          </div>
        </form>

        <div className="glass-card settings-card">
          <div className="card-header">
            <Database size={20} className="card-icon secondary-color" />
            <h3>Database Management</h3>
          </div>

          <div className="card-body">
            <p className="card-desc">
              All financial data is stored directly on your computer's browser storage. Export regular backups to ensure your data stays safe.
            </p>

            <div className="backup-actions">
              <button onClick={handleExport} className="btn btn-secondary flex-btn">
                <Download size={16} />
                <span>Export Backup (JSON)</span>
              </button>

              <label className="btn btn-secondary flex-btn cursor-pointer">
                <Upload size={16} />
                <span>Restore Backup</span>
                <input
                  type="file"
                  accept=".json"
                  className="display-none"
                  onChange={handleImport}
                />
              </label>
            </div>

            <div className="danger-zone">
              <h4>Danger Zone</h4>
              <p>Permanently delete all financial entries, investment holdings, and settings from this browser.</p>
              
              {!resetConfirm ? (
                <button 
                  onClick={() => setResetConfirm(true)} 
                  className="btn btn-danger flex-btn"
                >
                  <Trash2 size={16} />
                  <span>Purge Database</span>
                </button>
              ) : (
                <div className="reset-confirm-box">
                  <p><ShieldAlert size={16} className="danger-color" /> Are you absolutely sure? This cannot be undone.</p>
                  <div className="confirm-buttons">
                    <button onClick={handleClearDatabase} className="btn btn-danger">
                      Yes, Delete Everything
                    </button>
                    <button onClick={() => setResetConfirm(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .view-container {
          flex: 1;
          padding: 40px;
          height: 100vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .view-header {
          margin-bottom: 8px;
        }

        .view-header h1 {
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .view-header p {
          color: var(--text-secondary);
          font-size: 1rem;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .settings-card {
          display: flex;
          flex-direction: column;
          padding: 24px;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 16px;
          margin-bottom: 20px;
        }

        .card-icon {
          padding: 6px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
        }

        .card-icon.primary-color {
          color: var(--primary);
          background: var(--primary-glow);
        }

        .card-icon.secondary-color {
          color: var(--secondary);
          background: var(--secondary-glow);
        }

        .card-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }

        .card-desc {
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .input-group-password {
          display: flex;
          position: relative;
        }

        .password-input {
          flex: 1;
          padding-right: 60px;
        }

        .btn-toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-body);
        }

        .btn-toggle-password:hover {
          color: var(--text-primary);
        }

        .field-hint {
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .field-hint a {
          color: var(--primary);
          text-decoration: none;
        }

        .field-hint a:hover {
          text-decoration: underline;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: var(--border-radius-md);
          font-size: 0.9rem;
          margin-top: 8px;
        }

        .alert-success-box {
          background: var(--success-glow);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: var(--success);
        }

        .alert-error-box {
          background: var(--danger-glow);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--danger);
        }

        .btn-save {
          align-self: flex-start;
          margin-top: 8px;
        }

        .backup-actions {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }

        .flex-btn {
          flex: 1;
        }

        .cursor-pointer {
          cursor: pointer;
        }

        .display-none {
          display: none;
        }

        .danger-zone {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--border-glass);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .danger-zone h4 {
          font-size: 1rem;
          color: var(--danger);
          font-weight: 600;
        }

        .danger-zone p {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .danger-color {
          color: var(--danger);
        }

        .reset-confirm-box {
          background: var(--danger-glow);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--border-radius-md);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .reset-confirm-box p {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .confirm-buttons {
          display: flex;
          gap: 10px;
        }
      `}</style>
    </div>
  );
};
