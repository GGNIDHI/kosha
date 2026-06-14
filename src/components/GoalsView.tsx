import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../db/database';
import type { Goal } from '../db/database';
import { formatAmount } from '../utils/currency';
import { Plus, X, Target, Pencil, Trash2, CheckCircle2 } from 'lucide-react';

const GOAL_EMOJIS = ['🏖️','🚗','🏠','💻','📱','✈️','💍','🎓','🏋️','🛡️','🎸','👶'];
const GOAL_COLOURS = ['#8b5cf6','#06b6d4','#f97316','#22c55e','#ec4899','#eab308','#3b82f6','#ef4444'];

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

  const handleDelete = async (id: string) => {
    if (confirm('Delete this goal?')) await db.goals.delete(id);
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
                    <button className="icon-btn danger" onClick={() => handleDelete(g.id)}><Trash2 size={15} /></button>
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
      {showForm && (
        <div className="drawer-overlay" onClick={() => setShowForm(false)}>
          <div className="glass-card drawer-content" onClick={e => e.stopPropagation()}>
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
        </div>
      )}

      <style>{`
        .goals-summary {
          display: flex; align-items: center; padding: 20px 28px; flex-wrap: wrap; gap: 0;
        }
        .gs-item { display: flex; flex-direction: column; gap: 3px; padding: 0 20px; flex: 1; min-width: 120px; }
        .gs-item:first-child { padding-left: 0; }
        .gs-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
        .gs-item strong { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
        .gs-divider { width: 1px; height: 36px; background: var(--border-glass); }

        .goals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }

        .goal-card { padding: 20px; display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border-glass); transition: border-color .3s; }

        .goal-card-top { display: flex; justify-content: space-between; align-items: flex-start; }

        .goal-emoji-wrap { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .goal-emoji { font-size: 1.6rem; }

        .goal-actions { display: flex; gap: 6px; align-items: center; }
        .icon-btn { background: transparent; border: 1px solid transparent; border-radius: 8px; padding: 5px; cursor: pointer; color: var(--text-muted); transition: all .2s; display: flex; }
        .icon-btn:hover { background: rgba(255,255,255,.06); color: var(--text-primary); border-color: var(--border-glass); }
        .icon-btn.danger:hover { color: #ef4444; border-color: rgba(239,68,68,.2); }

        .goal-name { font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .goal-notes { font-size: 0.78rem; color: var(--text-muted); margin: 0; }

        .goal-amounts { display: flex; align-items: baseline; gap: 6px; }
        .goal-saved { font-size: 1.5rem; font-weight: 800; }
        .goal-of { font-size: 0.82rem; color: var(--text-muted); }

        .goal-bar-track { height: 8px; background: rgba(255,255,255,.05); border-radius: 99px; overflow: hidden; }
        .goal-bar-fill { height: 100%; border-radius: 99px; transition: width .7s cubic-bezier(.4,0,.2,1); }

        .goal-pct { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); }

        .goal-meta-row { display: flex; justify-content: space-between; align-items: center; }
        .goal-days { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
        .goal-days.urgent { color: #f97316; }
        .goal-days.overdue { color: #ef4444; }
        .goal-rpm { font-size: 0.75rem; color: var(--text-muted); }

        .emoji-picker { display: flex; flex-wrap: wrap; gap: 6px; }
        .emoji-btn { background: rgba(255,255,255,.04); border: 1px solid var(--border-glass); border-radius: 8px; padding: 6px; font-size: 1.2rem; cursor: pointer; transition: all .15s; }
        .emoji-btn.selected { border-color: var(--primary); background: var(--primary-glow); }

        .colour-picker { display: flex; gap: 8px; }
        .colour-btn { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .15s; }
        .colour-btn.selected { border-color: white; transform: scale(1.2); }
        .colour-btn:hover { transform: scale(1.1); }

        .add-savings-row { display: flex; gap: 6px; margin-top: 4px; }
        .add-savings-input { flex: 1; padding: 6px 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-glass); background: rgba(255,255,255,.04); color: var(--text-primary); font-size: 0.88rem; font-family: var(--font-body); }
        .add-savings-input:focus { outline: none; border-color: var(--primary); }
      `}</style>
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
