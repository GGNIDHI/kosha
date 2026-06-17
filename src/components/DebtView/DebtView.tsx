import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../../db/database';
import type { Debt } from '../../db/database';
import { formatAmount } from '../../utils/currency';
import { Plus, X, Trash2, Pencil, CreditCard, Home, Car, Banknote, HelpCircle } from 'lucide-react';
import './DebtView.css';


type DebtType = Debt['type'];

const DEBT_META: Record<DebtType, { label: string; icon: React.ReactNode; colour: string }> = {
  home_loan:     { label: 'Home Loan',     icon: <Home size={16} />,      colour: '#3b82f6' },
  personal_loan: { label: 'Personal Loan', icon: <Banknote size={16} />,  colour: '#f97316' },
  car_loan:      { label: 'Car Loan',      icon: <Car size={16} />,       colour: '#06b6d4' },
  credit_card:   { label: 'Credit Card',   icon: <CreditCard size={16} />,colour: '#ef4444' },
  other:         { label: 'Other',          icon: <HelpCircle size={16} />, colour: '#6b7280' },
};

const blankDebt = () => ({
  name: '', type: 'personal_loan' as DebtType,
  principalAmount: '', outstandingAmount: '',
  interestRate: '', emiAmount: '',
  startDate: '', endDate: '', nextDueDate: '', notes: '',
});

export const DebtView: React.FC = () => {
  const [currency, setCurrency] = useState('INR');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blankDebt());

  useEffect(() => { getSetting('currency', 'INR').then(setCurrency); }, []);

  const debts = useLiveQuery(() => db.debts.toArray(), []) ?? [];

  const totalOutstanding = debts.reduce((s, d) => s + d.outstandingAmount, 0);
  const totalEmi         = debts.reduce((s, d) => s + d.emiAmount, 0);

  // Estimate months remaining and total interest
  const debtStats = (d: Debt) => {
    if (d.emiAmount <= 0) return { monthsLeft: 0, totalInterest: 0, paidPct: 0 };
    const monthlyRate = d.interestRate / 12 / 100;
    let bal = d.outstandingAmount;
    let months = 0;
    let interest = 0;
    while (bal > 0 && months < 600) {
      const int = bal * monthlyRate;
      interest += int;
      const principal = d.emiAmount - int;
      bal = Math.max(0, bal - principal);
      months++;
    }
    const paidPct = Math.round(((d.principalAmount - d.outstandingAmount) / d.principalAmount) * 100);
    return { monthsLeft: months, totalInterest: Math.round(interest), paidPct: Math.max(0, paidPct) };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const debt: Debt = {
      id: editId ?? Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: form.name.trim(),
      type: form.type,
      principalAmount: parseFloat(form.principalAmount),
      outstandingAmount: parseFloat(form.outstandingAmount),
      interestRate: parseFloat(form.interestRate),
      emiAmount: parseFloat(form.emiAmount),
      startDate: form.startDate,
      endDate: form.endDate,
      nextDueDate: form.nextDueDate,
      notes: form.notes.trim() || undefined,
    };
    await db.debts.put(debt);
    setShowForm(false); setEditId(null); setForm(blankDebt());
  };

  const handleEdit = (d: Debt) => {
    setForm({ name: d.name, type: d.type, principalAmount: String(d.principalAmount),
      outstandingAmount: String(d.outstandingAmount), interestRate: String(d.interestRate),
      emiAmount: String(d.emiAmount), startDate: d.startDate, endDate: d.endDate,
      nextDueDate: d.nextDueDate, notes: d.notes ?? '' });
    setEditId(d.id); setShowForm(true);
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Debts & EMIs</h1>
          <p>Track all your loans, credit cards, and EMIs in one place.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blankDebt()); setEditId(null); setShowForm(true); }}>
          <Plus size={18} /> <span>Add Debt</span>
        </button>
      </header>

      {/* Info Card Banner */}
      <div className="glass-card debt-info-card">
        <div className="debt-info-icon">💡</div>
        <div className="debt-info-content">
          <strong>How Debt Payoff Tracking Works</strong>
          <p style={{ margin: 0 }}>
            Kosha simulates your loan payoff timeline using a standard amortization formula: each month, your EMI first covers the interest due (Outstanding Balance × Monthly Interest Rate), and the remainder reduces your principal.
          </p>
        </div>
      </div>

      {/* Summary */}
      {debts.length > 0 && (
        <div className="glass-card goals-summary" style={{ marginBottom: '24px' }}>
          <div className="gs-item">
            <span className="gs-label">Active Debts</span>
            <strong>{debts.length}</strong>
          </div>
          <div className="gs-divider" />
          <div className="gs-item">
            <span className="gs-label">Total Outstanding</span>
            <strong style={{ color: '#ef4444' }}>{formatAmount(totalOutstanding, currency)}</strong>
          </div>
          <div className="gs-divider" />
          <div className="gs-item">
            <span className="gs-label">Total Monthly EMI</span>
            <strong style={{ color: '#f97316' }}>{formatAmount(totalEmi, currency)}</strong>
          </div>
        </div>
      )}

      {debts.length === 0 ? (
        <div className="glass-card empty-state">
          <CreditCard size={48} className="empty-icon" />
          <h3>No Debts Tracked</h3>
          <p>Add your home loan, car loan, credit card, or any other debt to track payoff timelines and total interest.</p>
        </div>
      ) : (
        <div className="goals-grid">
          {debts.map(d => {
            const meta = DEBT_META[d.type];
            const { monthsLeft, totalInterest, paidPct } = debtStats(d);
            const yearsLeft = Math.floor(monthsLeft / 12);
            const moLeft    = monthsLeft % 12;
            return (
              <div key={d.id} className="glass-card goal-card" style={{ borderColor: meta.colour + '44' }}>
                <div className="goal-card-top">
                  <div className="goal-emoji-wrap" style={{ background: meta.colour + '18', border: `1px solid ${meta.colour}33` }}>
                    <span style={{ color: meta.colour }}>{meta.icon}</span>
                  </div>
                  <div className="goal-actions">
                    <button className="icon-btn" onClick={() => handleEdit(d)}><Pencil size={15} /></button>
                    <button className="icon-btn danger" onClick={() => db.debts.delete(d.id)}><Trash2 size={15} /></button>
                  </div>
                </div>

                <h3 className="goal-name">{d.name}</h3>
                <span className="debt-type-chip" style={{ background: meta.colour + '18', color: meta.colour }}>{meta.label}</span>

                <div className="goal-amounts">
                  <span className="goal-saved" style={{ color: '#ef4444' }}>{formatAmount(d.outstandingAmount, currency)}</span>
                  <span className="goal-of">outstanding</span>
                </div>

                {/* Payoff progress */}
                <div className="goal-bar-track">
                  <div className="goal-bar-fill" style={{ width: `${paidPct}%`, background: meta.colour }} />
                </div>
                <span className="goal-pct">{paidPct}% paid off</span>

                <div className="debt-stats-grid">
                  <div className="debt-stat">
                    <span className="ds-label">EMI</span>
                    <span className="ds-value">{formatAmount(d.emiAmount, currency)}/mo</span>
                  </div>
                  <div className="debt-stat">
                    <span className="ds-label">Rate</span>
                    <span className="ds-value">{d.interestRate}% p.a.</span>
                  </div>
                  <div className="debt-stat">
                    <span className="ds-label">Time Left</span>
                    <span className="ds-value">{yearsLeft > 0 ? `${yearsLeft}y ` : ''}{moLeft}m</span>
                  </div>
                  <div className="debt-stat">
                    <span className="ds-label">Total Interest</span>
                    <span className="ds-value" style={{ color: '#ef4444' }}>{formatAmount(totalInterest, currency)}</span>
                  </div>
                </div>

                {d.nextDueDate && (
                  <div className="goal-meta-row">
                    <span className="goal-days">Next due: {d.nextDueDate}</span>
                    <span className="goal-rpm">{formatAmount(d.principalAmount, currency)} principal</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Overlay */}
      {showForm && createPortal(
        <div className="drawer-overlay" onClick={() => setShowForm(false)}>
          <div className="glass-card modal-content-centered" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>{editId ? 'Edit Debt' : 'Add Debt / EMI'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="drawer-form">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" required placeholder="e.g. HDFC Home Loan"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as DebtType }))}>
                  {(Object.keys(DEBT_META) as DebtType[]).map(k => (
                    <option key={k} value={k}>{DEBT_META[k].label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Original Principal</label>
                  <input type="number" className="form-input" required placeholder="5000000"
                    value={form.principalAmount} onChange={e => setForm(f => ({ ...f, principalAmount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Outstanding Balance</label>
                  <input type="number" className="form-input" required placeholder="3200000"
                    value={form.outstandingAmount} onChange={e => setForm(f => ({ ...f, outstandingAmount: e.target.value }))} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Interest Rate (% p.a.)</label>
                  <input type="number" step="0.1" className="form-input" required placeholder="8.5"
                    value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">EMI Amount</label>
                  <input type="number" className="form-input" required placeholder="45000"
                    value={form.emiAmount} onChange={e => setForm(f => ({ ...f, emiAmount: e.target.value }))} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input"
                    value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Next Due Date</label>
                  <input type="date" className="form-input"
                    value={form.nextDueDate} onChange={e => setForm(f => ({ ...f, nextDueDate: e.target.value }))} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full">
                {editId ? 'Save Changes' : 'Add Debt'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
