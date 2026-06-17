import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../../db/database';
import type { Goal } from '../../db/database';
import { formatAmount } from '../../utils/currency';
import { Plus, X, Target, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import './GoalsView.css';

const GOAL_EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','💍','🎓','🏋️','🛡️','🎸','👶'];
const GOAL_COLOURS = ['#8b5cf6','#06b6d4','#f97316','#22c55e','#ec4899','#eab308','#3b82f6','#ef4444'];

const DELETION_HUMOUR = [
  "Wait! Are you sure? That dream vacation/gadget/future-rich-self is crying in a corner right now! 🥺",
  "Hold your horses! Deleting this goal? Your piggy bank is sweating profusely. 🐷💦",
  "Whoa! Are you sure you want to banish this dream to the financial void? Your future self is watching... 👀",
  "Stop right there! Deleting this goal? Even your wallet is giving you the side-eye. 🤨💸",
  "Wait, don't give up on this yet! We believe in you, even if your bank account is currently laughing. 📈"
];

interface GoalFormState {
  name: string;
  emoji: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
  colour: string;
  notes: string;
}

const blank = (): GoalFormState => ({
  name: '', emoji: '🏖️', targetAmount: '', savedAmount: '0',
  targetDate: '', colour: '#8b5cf6', notes: '',
});

export const GoalsView: React.FC = () => {
  const [currency, setCurrency] = useState('INR');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormState>(blank());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [deleteHumourMsg, setDeleteHumourMsg] = useState('');

  useEffect(() => { getSetting('currency', 'INR').then(setCurrency); }, []);

  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];


  const daysLeft = (targetDate: string) => {
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const monthsLeft = (targetDate: string) => Math.max(0, daysLeft(targetDate) / 30);

  const requiredPerMonth = (g: Goal) => {
    const months = monthsLeft(g.targetDate);
    if (months <= 0) return 0;
    return (g.targetAmount - g.savedAmount) / months;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const goal: Goal = {
      id: editId ?? Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: form.name.trim(),
      emoji: form.emoji,
      targetAmount: parseFloat(form.targetAmount),
      savedAmount: parseFloat(form.savedAmount) || 0,
      targetDate: form.targetDate,
      colour: form.colour,
      notes: form.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await db.goals.put(goal);
    setShowForm(false);
    setEditId(null);
    setForm(blank());
  };

  const handleEdit = (g: Goal) => {
    setForm({
      name: g.name, emoji: g.emoji, targetAmount: String(g.targetAmount),
      savedAmount: String(g.savedAmount), targetDate: g.targetDate,
      colour: g.colour, notes: g.notes ?? '',
    });
    setEditId(g.id);
    setShowForm(true);
  };

  const handleDeleteClick = (g: Goal) => {
    setGoalToDelete(g);
    const msg = DELETION_HUMOUR[Math.floor(Math.random() * DELETION_HUMOUR.length)];
    setDeleteHumourMsg(msg);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (goalToDelete) {
      await db.goals.delete(goalToDelete.id);
      setShowDeleteConfirm(false);
      setGoalToDelete(null);
    }
  };


  const addSavings = async (g: Goal, amount: number) => {
    const newSaved = Math.min(g.targetAmount, g.savedAmount + amount);
    await db.goals.update(g.id, { savedAmount: newSaved });
  };

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved  = goals.reduce((s, g) => s + g.savedAmount, 0);

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Savings Goals</h1>
          <p>Set targets, track progress, and reach your financial milestones.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blank()); setEditId(null); setShowForm(true); }}>
          <Plus size={18} /> <span>New Goal</span>
        </button>
      </header>

      {/* Info Card Banner explaining tracking */}
      <div className="glass-card goal-info-card">
        <div className="goal-info-icon">💡</div>
        <div className="goal-info-content">
          <strong>How Savings Goals Work</strong>
          <p>
            Kosha tracks your savings goals dynamically. Each card displays your current progress (how much is already saved vs. your target amount), calculates the percentage achieved, and estimates the monthly savings needed to reach your target by the deadline.
          </p>
          <div className="goal-info-guide">
            <div className="guide-item">
              <span className="guide-indicator achieved"></span>
              <span><strong>Achieved (Green/Theme)</strong>: Represents the funds you have already saved. The progress bar visualizes this percentage.</span>
            </div>
            <div className="guide-item" style={{ marginTop: '4px' }}>
              <span className="guide-indicator pending"></span>
              <span><strong>Pending (Muted Track)</strong>: Represents the remaining amount needed to reach your target before the date expires.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {goals.length > 0 && (
        <div className="glass-card goals-summary">
          <div className="gs-item">
            <span className="gs-label">Goals Active</span>
            <strong>{goals.length}</strong>
          </div>
          <div className="gs-divider" />
          <div className="gs-item">
            <span className="gs-label">Total Target</span>
            <strong>{formatAmount(totalTarget, currency)}</strong>
          </div>
          <div className="gs-divider" />
          <div className="gs-item">
            <span className="gs-label">Total Saved</span>
            <strong style={{ color: '#22c55e' }}>{formatAmount(totalSaved, currency)}</strong>
          </div>
          <div className="gs-divider" />
          <div className="gs-item">
            <span className="gs-label">Still Needed</span>
            <strong style={{ color: '#f97316' }}>{formatAmount(totalTarget - totalSaved, currency)}</strong>
          </div>
        </div>
      )}

      {/* Goals grid */}
      {goals.length === 0 ? (
        <div className="glass-card empty-state">
          <Target size={48} className="empty-icon" />
          <h3>No Goals Yet</h3>
          <p>Create your first savings goal — vacation, emergency fund, new gadget — and start tracking your progress.</p>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map(g => {
            const pct = Math.min(100, (g.savedAmount / g.targetAmount) * 100);
            const done = pct >= 100;
            const dl = daysLeft(g.targetDate);
            const rpm = requiredPerMonth(g);
            return (
              <div key={g.id} className="glass-card goal-card" style={{ borderColor: g.colour + '44' }}>
                <div className="goal-card-top">
                  <div className="goal-emoji-wrap" style={{ background: g.colour + '22', border: `1px solid ${g.colour}44` }}>
                    <span className="goal-emoji">{g.emoji}</span>
                  </div>
                  <div className="goal-actions">
                    {done && <CheckCircle2 size={18} color="#22c55e" />}
                    <button className="icon-btn" onClick={() => handleEdit(g)}><Pencil size={15} /></button>
                    <button className="icon-btn danger" onClick={() => handleDeleteClick(g)}><Trash2 size={15} /></button>
                  </div>
                </div>

                <h3 className="goal-name">{g.name}</h3>
                {g.notes && <p className="goal-notes">{g.notes}</p>}

                <div className="goal-amounts">
                  <span className="goal-saved" style={{ color: g.colour }}>{formatAmount(g.savedAmount, currency)}</span>
                  <span className="goal-of">of {formatAmount(g.targetAmount, currency)}</span>
                </div>

                {/* Progress bar */}
                <div className="goal-bar-track">
                  <div className="goal-bar-fill" style={{ width: `${pct}%`, background: done ? '#22c55e' : g.colour }} />
                </div>
                <span className="goal-pct">{Math.round(pct)}%</span>

                <div className="goal-meta-row">
                  <span className={`goal-days ${dl < 0 ? 'overdue' : dl < 30 ? 'urgent' : ''}`}>
                    {dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d left`}
                  </span>
                  {rpm > 0 && !done && (
                    <span className="goal-rpm">{formatAmount(Math.ceil(rpm), currency)}/mo needed</span>
                  )}
                </div>

                {!done && (
                  <AddSavingsRow onAdd={(amt) => addSavings(g, amt)} colour={g.colour} />
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
              <h3>{editId ? 'Edit Goal' : 'New Savings Goal'}</h3>
              <button className="btn-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="drawer-form">
              {/* Emoji picker */}
              <div className="form-group">
                <label className="form-label">Icon</label>
                <div className="emoji-picker">
                  {GOAL_EMOJIS.map(e => (
                    <button type="button" key={e}
                      className={`emoji-btn ${form.emoji === e ? 'selected' : ''}`}
                      onClick={() => setForm(f => ({ ...f, emoji: e }))}
                    >{e}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Goal Name</label>
                <input className="form-input" required placeholder="e.g. Goa Vacation"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Target Amount</label>
                  <input type="number" className="form-input" required placeholder="50000"
                    value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Already Saved</label>
                  <input type="number" className="form-input" placeholder="0"
                    value={form.savedAmount} onChange={e => setForm(f => ({ ...f, savedAmount: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Target Date</label>
                <input type="date" className="form-input" required
                  value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
              </div>

              {/* Colour picker */}
              <div className="form-group">
                <label className="form-label">Colour</label>
                <div className="colour-picker">
                  {GOAL_COLOURS.map(c => (
                    <button type="button" key={c}
                      className={`colour-btn ${form.colour === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setForm(f => ({ ...f, colour: c }))}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-textarea" rows={2} placeholder="What's this goal for?"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                {editId ? 'Save Changes' : 'Create Goal'}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && goalToDelete && createPortal(
        <div className="drawer-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="glass-card modal-content-centered modal-narrow delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} className="danger-color" style={{ color: 'var(--danger)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Keep the Dream Alive?</h3>
              </div>
              <button className="btn-close" onClick={() => setShowDeleteConfirm(false)}><X size={20} /></button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                {deleteHumourMsg}
              </p>

              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.78rem', color: 'var(--danger)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Confirming will delete your goal for <strong>{goalToDelete.name}</strong> and erase all track of your saved <strong>{formatAmount(goalToDelete.savedAmount, currency)}</strong>.</span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button className="btn btn-secondary btn-full" onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, margin: 0 }}>
                  No, Keep It!
                </button>
                <button className="btn btn-danger btn-full" onClick={confirmDelete} style={{ flex: 1, margin: 0, background: 'var(--danger)', color: '#fff', border: 'none' }}>
                  Yes, Banish It
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

// Mini inline "add savings" component
const AddSavingsRow: React.FC<{ onAdd: (n: number) => void; colour: string }> = ({ onAdd, colour }) => {
  const [val, setVal] = useState('');
  return (
    <div className="add-savings-row">
      <input
        type="number" className="add-savings-input" placeholder="Add savings..."
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val) { onAdd(parseFloat(val)); setVal(''); } }}
      />
      <button
        type="button" className="btn btn-primary btn-xs"
        style={{ background: colour, borderColor: colour }}
        onClick={() => { if (val) { onAdd(parseFloat(val)); setVal(''); } }}
      >+ Add</button>
    </div>
  );
};
