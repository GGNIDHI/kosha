import React, { useState, useEffect } from 'react';
import { db, getSetting, setSetting } from '../../db/database';
import { Key, ShieldAlert, Database, Download, Upload, Trash2, CheckCircle2, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import './SettingsView.css';

export const SettingsView: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [userName, setUserName] = useState('User');
  const [currency, setCurrency] = useState('INR');
  const [userCity, setUserCity] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const savedKey = await getSetting('geminiApiKey', '');
      const savedGroqKey = await getSetting('groqApiKey', '');
      const savedName = await getSetting('userName', 'User');
      const savedCurrency = await getSetting('currency', 'INR');
      const savedCity = await getSetting('userCity', '');
      setApiKey(savedKey);
      setGroqApiKey(savedGroqKey);
      setUserName(savedName);
      setCurrency(savedCurrency);
      setUserCity(savedCity);
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setSetting('geminiApiKey', apiKey.trim());
      await setSetting('groqApiKey', groqApiKey.trim());
      await setSetting('userName', userName.trim());
      await setSetting('currency', currency);
      await setSetting('userCity', userCity.trim());
      
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
        const savedCity = await getSetting('userCity', '');
        setUserName(savedName);
        setCurrency(savedCurrency);
        setUserCity(savedCity);

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
      await db.budgets.clear();
      await db.goals.clear();
      await db.debts.clear();
      await db.netWorthSnapshots.clear();
      await db.parsedPdfs.clear();
      // Keep default categories, only clear custom ones
      await db.categories.where('isDefault').equals(0).delete();
      await db.settings.clear();

      setApiKey('');
      setGroqApiKey('');
      setUserName('User');
      setCurrency('INR');
      setUserCity('');
      setResetConfirm(false);
      setPurgeSuccess(true);
      setTimeout(() => setPurgeSuccess(false), 4000);
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
              <label className="form-label" htmlFor="usercity">City of Residence</label>
              <input
                id="usercity"
                type="text"
                className="form-input"
                value={userCity}
                onChange={(e) => setUserCity(e.target.value)}
                placeholder="e.g. Bangalore, Mumbai, Kochi"
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

            {/* AI Provider Status Banner */}
            <div className="provider-status-banner">
              <div className="provider-badge primary-provider">
                <Zap size={14} />
                <span><strong>Primary:</strong> Gemini 2.5 / 2.0</span>
              </div>
              <div className="provider-arrow"><RefreshCw size={12} /></div>
              <div className="provider-badge fallback-provider">
                <span><strong>Fallback:</strong> Groq · Llama 3.3 / 3.1</span>
              </div>
            </div>
            <p className="field-hint banner-hint">
              If Gemini hits a quota or billing limit, Kosha automatically retries with Gemini 2.0 Flash, then falls back to Groq.
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="apikey">🔑 Google Gemini API Key <span className="badge-primary">Primary</span></label>
              <div className="input-group-password">
                <input
                  id="apikey"
                  type={showKey ? 'text' : 'password'}
                  className="form-input password-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AQ.Ab8R..."
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
                Get a free key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">Google AI Studio</a>. Uses <strong>gemini-2.5-flash</strong> (with automatic fallback to <strong>gemini-2.0-flash</strong>).
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="groqapikey">🔑 Groq API Key <span className="badge-fallback">Fallback</span></label>
              <div className="input-group-password">
                <input
                  id="groqapikey"
                  type={showGroqKey ? 'text' : 'password'}
                  className="form-input password-input"
                  value={groqApiKey}
                  onChange={(e) => setGroqApiKey(e.target.value)}
                  placeholder="gsk_..."
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                >
                  {showGroqKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="field-hint">
                Optional but recommended. Get a <strong>free</strong> key from <a href="https://console.groq.com/" target="_blank" rel="noreferrer">console.groq.com</a>. Uses <strong>llama-3.1-8b-instant</strong> for bank statements and <strong>llama-3.3-70b-versatile</strong> for slips.
              </p>
            </div>

            {saveStatus === 'success' && (
              <div className="alert alert-success-box">
                <CheckCircle2 size={16} />
                <span>Settings saved successfully!</span>
              </div>
            )}

            {purgeSuccess && (
              <div className="alert alert-success-box">
                <CheckCircle2 size={16} />
                <span>All data purged. Kosha has been reset to a clean slate.</span>
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
              <h4>🗑️ Danger Zone — Purge All Data</h4>
              <p>Permanently deletes <strong>everything</strong>: all transactions, salary slips, investments, budgets, goals, debts, parsed PDF history, API keys, and settings. Custom categories will also be removed. Default categories are preserved.</p>

              {!resetConfirm ? (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="btn btn-danger flex-btn"
                >
                  <Trash2 size={16} />
                  <span>Purge All Data</span>
                </button>
              ) : (
                <div className="reset-confirm-box">
                  <p><ShieldAlert size={16} className="danger-color" /> This will wipe your entire Kosha database. This <strong>cannot be undone</strong>.</p>
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
    </div>
  );
};
