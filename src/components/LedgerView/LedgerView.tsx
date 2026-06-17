import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../../db/database';
import type { Transaction } from '../../db/database';
import { formatAmount } from '../../utils/currency';
import { detectRecurring } from '../../utils/recurringDetector';
import type { RecurringTransaction } from '../../utils/recurringDetector';
import { Plus, Search, Trash2, Filter, X, ArrowUpRight, ArrowDownLeft, FileSpreadsheet, ReceiptText, RefreshCw } from 'lucide-react';
import './LedgerView.css';


export const LedgerView: React.FC = () => {
  const [currency, setCurrency] = useState('INR');
  const [showForm, setShowForm] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringTransaction | null>(null);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterType, setFilterType] = useState('All');

  useEffect(() => {
    getSetting('currency', 'INR').then(setCurrency);
  }, []);
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [category, setCategory] = useState('Food');
  const [notes, setNotes] = useState('');

  // Fetch transactions from database (ordered by date descending)
  const transactions = useLiveQuery(
    async () => {
      const allTx = await db.transactions.toArray();
      return allTx.sort((a, b) => b.date.localeCompare(a.date));
    },
    []
  ) || [];

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.description.toLowerCase().includes(search.toLowerCase()) || 
                          tx.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'All' || tx.category === filterCategory;
    const matchesType = filterType === 'All' || tx.type === filterType;
    return matchesSearch && matchesCategory && matchesType;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    const newTx: Transaction = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      date,
      description: description.trim(),
      amount: parseFloat(amount),
      type,
      category,
      source: 'manual',
      notes: notes.trim() || undefined
    };

    try {
      await db.transactions.add(newTx);
      if (newTx.type === 'credit' && newTx.category === 'Salary') {
        localStorage.setItem('kosha_show_smart_review_banner', 'true');
      }
      // Reset form
      setDescription('');
      setAmount('');
      setNotes('');
      setShowForm(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save transaction');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this transaction?')) {
      try {
        await db.transactions.delete(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const categories = ['Food', 'Shopping', 'Utilities', 'Travel', 'Salary', 'Investment', 'Health', 'Entertainment', 'Others'];

  // Detect recurring transactions
  const recurringTxs = detectRecurring(transactions);
  const totalMonthlyRecurring = recurringTxs
    .filter(r => r.frequency === 'monthly')
    .reduce((s, r) => s + r.averageAmount, 0);

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Transactions</h1>
          <p>Review and manage all manual and parsed transaction entries.</p>
        </div>
        <div style={{display:'flex', gap:10}}>
          {recurringTxs.length > 0 && (
            <button
              className={`btn ${showRecurring ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowRecurring(v => !v)}
            >
              <RefreshCw size={16} />
              <span>Recurring ({recurringTxs.length})</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} />
            <span>Add Transaction</span>
          </button>
        </div>
      </header>

      {/* Recurring Transactions Panel */}
      {showRecurring && recurringTxs.length > 0 && (
        <div className="glass-card recurring-panel">
          <div className="recurring-panel-header">
            <div>
              <h3><RefreshCw size={15} style={{display:'inline',marginRight:6,verticalAlign:'middle'}}/>Recurring Transactions Detected</h3>
              <p className="recurring-panel-sub">
                {recurringTxs.length} recurring patterns found &mdash; estimated {formatAmount(totalMonthlyRecurring, currency)}/month in subscriptions
              </p>
            </div>
          </div>
          <div className="recurring-grid">
            {recurringTxs.map((r, i) => (
              <div key={i} className="recurring-item" onClick={() => setSelectedRecurring(r)}>
                <div className="recurring-item-top">
                  <span className="recurring-desc">{r.description}</span>
                  <span className={`recurring-badge freq-${r.frequency}`}>{r.frequency}</span>
                </div>
                <div className="recurring-item-bottom">
                  <span className="recurring-cat">{r.category}</span>
                  <span className="recurring-amount">{formatAmount(r.averageAmount, currency)}</span>
                </div>
                <div className="recurring-meta">
                  {r.occurrences}x detected &bull; last on {r.lastDate}
                </div>
              </div>
            ))}

          </div>
        </div>
      )}

      {/* Manual Input Drawer / Overlay */}
      {showForm && createPortal(
        <div className="drawer-overlay" onClick={() => setShowForm(false)}>
          <div className="glass-card modal-content-centered" onClick={(e) => e.stopPropagation()}>
            <div className="ledger-drawer-header">
              <h3>New Transaction</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="ledger-drawer-form">

              <div className="form-group">
                <label className="form-label">Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Grocery Store"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required 
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select 
                    className="form-select" 
                    value={type} 
                    onChange={(e) => setType(e.target.value as 'debit' | 'credit')}
                  >
                    <option value="debit">Expense (Debit)</option>
                    <option value="credit">Income (Credit)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select 
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (Optional)</label>
                <textarea 
                  className="form-textarea" 
                  placeholder="Additional remarks"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                Save Entry
              </button>
            </form>
        </div>
      </div>,
      document.body
    )}

    {selectedRecurring && createPortal(
      <div className="drawer-overlay" onClick={() => setSelectedRecurring(null)}>
        <div className="glass-card modal-content-centered" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
          <div className="ledger-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshCw size={20} className="primary-color" style={{ color: 'var(--primary)' }} />
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Recurring History</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  {selectedRecurring.description}
                </p>
              </div>
            </div>
            <button className="btn-close" onClick={() => setSelectedRecurring(null)}><X size={20} /></button>
          </div>

          <div style={{ padding: '20px 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="recurring-history-meta" style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Frequency</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>{selectedRecurring.frequency}</span>
              </div>
              <div style={{ width: '1px', background: 'var(--border-glass)' }} />
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Avg. Amount</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger)' }}>{formatAmount(selectedRecurring.averageAmount, currency)}</span>
              </div>
              <div style={{ width: '1px', background: 'var(--border-glass)' }} />
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Occurrences</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{selectedRecurring.occurrences} times</span>
              </div>
            </div>

            <div className="table-responsive" style={{ maxHeight: '350px' }}>
              <table className="ledger-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 12px', fontSize: '0.78rem' }}>Date</th>
                    <th style={{ padding: '10px 12px', fontSize: '0.78rem' }}>Description</th>
                    <th style={{ padding: '10px 12px', fontSize: '0.78rem' }}>Source</th>
                    <th style={{ padding: '10px 12px', fontSize: '0.78rem' }} className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedRecurring.transactions || []).map((tx) => (
                    <tr key={tx.id} className="table-row">
                      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }} className="tx-date">{tx.date}</td>
                      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }} className="tx-desc">
                        <span className="desc-text">{tx.description}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }} className="tx-source">
                        {tx.source === 'bank_statement' ? (
                          <span className="flex-source-icon" title={tx.pdfName}>
                            <FileSpreadsheet size={14} className="source-icon-pdf" />
                            <span>Parsed</span>
                          </span>
                        ) : (
                          <span>Manual</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '0.85rem' }} className="tx-amount text-right debit">
                        - {formatAmount(tx.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}



      {/* Filter Toolbar */}
      <div className="glass-card toolbar-card">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            className="search-input-field" 
            placeholder="Search description, category..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <div className="filter-item">
            <Filter size={14} className="filter-icon" />
            <select 
              className="filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <Filter size={14} className="filter-icon" />
            <select 
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="All">All Types</option>
              <option value="debit">Expenses Only</option>
              <option value="credit">Income Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="glass-card ledger-card">
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <ReceiptText size={48} className="empty-icon" />
            <h3>No Transactions Found</h3>
            <p>Add transactions manually or upload bank statements in the PDF Analyzer page.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th className="text-right">Amount</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="table-row">
                    <td className="tx-date">{tx.date}</td>
                    <td className="tx-desc">
                      <div>
                        <span className="desc-text">{tx.description}</span>
                        {tx.notes && <span className="notes-text">{tx.notes}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-category cat-${tx.category.toLowerCase()}`}>
                        {tx.category}
                      </span>
                    </td>
                    <td>
                      <span className="tx-source">
                        {tx.source === 'bank_statement' ? (
                          <span className="flex-source-icon" title={tx.pdfName}>
                            <FileSpreadsheet size={14} className="source-icon-pdf" />
                            <span>Parsed</span>
                          </span>
                        ) : (
                          <span>Manual</span>
                        )}
                      </span>
                    </td>
                    <td className={`tx-amount text-right ${tx.type}`}>
                      <span className="tx-flow-icon">
                        {tx.type === 'credit' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </span>
                      <span>
                        {tx.type === 'credit' ? '+' : '-'} {formatAmount(tx.amount, currency)}
                      </span>
                    </td>
                    <td className="text-center">
                      <button 
                        className="btn-delete-action" 
                        onClick={() => tx.id && handleDelete(tx.id)}
                        title="Delete transaction"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
