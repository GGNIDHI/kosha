import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Transaction } from '../db/database';
import { Plus, Search, Trash2, Filter, X, ArrowUpRight, ArrowDownLeft, FileSpreadsheet, ReceiptText } from 'lucide-react';

export const LedgerView: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterType, setFilterType] = useState('All');
  
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

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Transactions</h1>
          <p>Review and manage all manual and parsed transaction entries.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} />
          <span>Add Transaction</span>
        </button>
      </header>

      {/* Manual Input Drawer / Overlay */}
      {showForm && (
        <div className="drawer-overlay" onClick={() => setShowForm(false)}>
          <div className="glass-card drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>New Transaction</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="drawer-form">
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
        </div>
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
                        {tx.type === 'credit' ? '+' : '-'} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

      <style>{`
        .view-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .toolbar-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .search-box {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 8px 12px;
          width: 350px;
          max-width: 100%;
        }

        .search-icon {
          color: var(--text-muted);
          margin-right: 8px;
        }

        .search-input-field {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.9rem;
          width: 100%;
        }

        .filters-group {
          display: flex;
          gap: 12px;
        }

        .filter-item {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 8px 12px;
          gap: 8px;
        }

        .filter-icon {
          color: var(--text-muted);
        }

        .filter-select {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.85rem;
          cursor: pointer;
        }

        .filter-select option {
          background: var(--bg-app);
          color: var(--text-primary);
        }

        /* Ledger Table styles */
        .ledger-card {
          padding: 8px;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
          overflow-y: auto;
          max-height: calc(100vh - 280px);
        }

        .ledger-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .ledger-table th {
          padding: 16px;
          font-family: var(--font-heading);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-glass);
        }

        .ledger-table td {
          padding: 16px;
          font-size: 0.9rem;
          border-bottom: 1px solid var(--border-glass);
          vertical-align: middle;
        }

        .table-row {
          transition: var(--transition-smooth);
        }

        .table-row:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .tx-date {
          color: var(--text-secondary);
          font-weight: 500;
          white-space: nowrap;
        }

        .tx-desc {
          max-width: 300px;
        }

        .desc-text {
          display: block;
          font-weight: 600;
          color: var(--text-primary);
        }

        .notes-text {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tx-source {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .flex-source-icon {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .source-icon-pdf {
          color: var(--secondary);
        }

        .tx-amount {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 1rem;
          white-space: nowrap;
        }

        .tx-amount.debit {
          color: var(--danger);
        }

        .tx-amount.credit {
          color: var(--success);
        }

        .tx-flow-icon {
          margin-right: 4px;
          vertical-align: middle;
          display: inline-flex;
        }

        .text-right {
          text-align: right;
        }

        .text-center {
          text-align: center;
        }

        .btn-delete-action {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: var(--transition-smooth);
        }

        .btn-delete-action:hover {
          color: var(--danger);
          background: var(--danger-glow);
        }

        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        /* Badges for Categories */
        .badge-category {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
        }

        .badge-category.cat-food { background: hsla(15, 80%, 50%, 0.12); color: hsl(15, 85%, 55%); }
        .badge-category.cat-shopping { background: hsla(280, 80%, 50%, 0.12); color: hsl(280, 85%, 60%); }
        .badge-category.cat-utilities { background: hsla(200, 80%, 50%, 0.12); color: hsl(200, 85%, 55%); }
        .badge-category.cat-travel { background: hsla(45, 80%, 50%, 0.12); color: hsl(45, 85%, 55%); }
        .badge-category.cat-salary { background: hsla(142, 80%, 50%, 0.12); color: hsl(142, 85%, 55%); }
        .badge-category.cat-investment { background: hsla(190, 80%, 50%, 0.12); color: hsl(190, 85%, 50%); }
        .badge-category.cat-health { background: hsla(350, 80%, 50%, 0.12); color: hsl(350, 85%, 58%); }
        .badge-category.cat-entertainment { background: hsla(320, 80%, 50%, 0.12); color: hsl(320, 85%, 55%); }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 40px;
          text-align: center;
          flex: 1;
        }

        .empty-icon {
          color: var(--text-muted);
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 1.2rem;
          margin-bottom: 8px;
        }

        .empty-state p {
          color: var(--text-muted);
          max-width: 400px;
          font-size: 0.9rem;
          line-height: 1.5;
        }

        /* Drawer Overlay */
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.2s ease-out;
        }

        .drawer-content {
          width: 420px;
          height: 100%;
          border-radius: 0;
          border-left: 1px solid var(--border-glass);
          border-top: none;
          border-bottom: none;
          padding: 32px;
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 20px;
          margin-bottom: 24px;
        }

        .drawer-header h3 {
          font-size: 1.3rem;
        }

        .btn-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }

        .btn-close:hover {
          color: var(--text-primary);
        }

        .drawer-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
          overflow-y: auto;
        }

        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .btn-full {
          width: 100%;
          padding: 12px;
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
};
