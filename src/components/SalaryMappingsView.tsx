import React, { useState, useEffect } from 'react';
import { getSetting, setSetting, type SalarySlipMapping } from '../db/database';
import { Plus, Trash2, Edit2, Check, X, Sliders } from 'lucide-react';

export const SalaryMappingsView: React.FC = () => {
  const [mappings, setMappings] = useState<SalarySlipMapping[]>([]);
  const [error, setError] = useState<string | null>(null);

  // States for adding salary slip mappings
  const [newCompName, setNewCompName] = useState('');
  const [newCompType, setNewCompType] = useState<'earning' | 'deduction'>('deduction');
  const [newCompCategory, setNewCompCategory] = useState<'investment' | 'savings' | 'tax' | 'expense' | 'ignore'>('investment');

  // States for editing salary slip mappings
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editCompName, setEditCompName] = useState('');
  const [editCompType, setEditCompType] = useState<'earning' | 'deduction'>('deduction');
  const [editCompCategory, setEditCompCategory] = useState<'investment' | 'savings' | 'tax' | 'expense' | 'ignore'>('investment');

  useEffect(() => {
    getSetting<SalarySlipMapping[]>('salarySlipMappings', []).then(async (loaded) => {
      let changed = false;
      const migrated = (loaded || []).map((m) => {
        const id = m.id || `map-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const componentName = m.componentName || (m as any).name || 'Unknown';
        const componentType = m.componentType || (m as any).type || 'deduction';
        const targetCategory = m.targetCategory || (m as any).category || 'investment';
        
        if (id !== m.id || componentName !== m.componentName || componentType !== m.componentType || targetCategory !== m.targetCategory) {
          changed = true;
        }

        return { id, componentName, componentType, targetCategory };
      });

      setMappings(migrated);
      if (changed) {
        await setSetting('salarySlipMappings', migrated);
      }
    });
  }, []);

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) return;

    // Check duplicate name
    const exists = mappings.some(m => m.componentName.toLowerCase() === newCompName.trim().toLowerCase() && m.componentType === newCompType);
    if (exists) {
      setError('A mapping rule for this component name and type already exists.');
      return;
    }

    const newRule: SalarySlipMapping = {
      id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      componentName: newCompName.trim(),
      componentType: newCompType,
      targetCategory: newCompCategory
    };
    const updated = [...mappings, newRule];
    setMappings(updated);
    await setSetting('salarySlipMappings', updated);
    setNewCompName('');
    setError(null);
  };

  const handleStartEditMapping = (rule: SalarySlipMapping) => {
    setEditingMappingId(rule.id);
    setEditCompName(rule.componentName);
    setEditCompType(rule.componentType);
    setEditCompCategory(rule.targetCategory);
    setError(null);
  };

  const handleSaveEditMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompName.trim()) return;

    // Check duplicate name
    const exists = mappings.some(m => m.id !== editingMappingId && m.componentName.toLowerCase() === editCompName.trim().toLowerCase() && m.componentType === editCompType);
    if (exists) {
      setError('A mapping rule for this component name and type already exists.');
      return;
    }

    const updated = mappings.map(m => {
      if (m.id === editingMappingId) {
        return {
          ...m,
          componentName: editCompName.trim(),
          componentType: editCompType,
          targetCategory: editCompCategory
        };
      }
      return m;
    });

    setMappings(updated);
    await setSetting('salarySlipMappings', updated);
    setEditingMappingId(null);
    setError(null);
  };

  const handleDeleteMapping = async (id: string) => {
    const updated = mappings.filter(m => m.id !== id);
    setMappings(updated);
    await setSetting('salarySlipMappings', updated);
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header">
        <h1>Salary Mappings</h1>
        <p>Map specific salary slip component earnings or deductions to custom financial categories. Mapped items are dynamically accounted for in your Dashboard meters.</p>
      </header>

      {error && (
        <div className="cat-error" style={{ marginBottom: '10px' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Mappings Listing (Presented First for High Visibility) */}
      <section className="glass-card cat-section">
        <div className="cat-section-header">
          <div className="cat-section-title">
            <Sliders size={16} className="primary-color-icon" style={{ color: 'var(--primary)' }} />
            <h3>Active Mapping Rules</h3>
          </div>
          <span className="badge-pill" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', borderColor: 'var(--primary)' }}>
            {mappings.length} {mappings.length === 1 ? 'rule' : 'rules'}
          </span>
        </div>

        {mappings.length === 0 ? (
          <div className="cat-empty-state" style={{ padding: '40px' }}>
            <Sliders size={28} className="muted-icon" />
            <p>No salary mapping rules defined yet.<br />Use the form below to add your first rule (e.g., ESPP ➔ Investment).</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {mappings.map(rule => (
              <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', transition: 'var(--transition-smooth)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{rule.componentName}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Type: <strong style={{ color: 'var(--text-secondary)' }}>{rule.componentType === 'earning' ? 'Earning (Inflow)' : 'Deduction (Outflow)'}</strong> &middot; Category: <strong style={{ color: 'var(--primary)' }}>{rule.targetCategory.toUpperCase()}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => handleStartEditMapping(rule)}
                    className="cat-action-btn"
                    title="Edit rule"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteMapping(rule.id)}
                    className="cat-action-btn delete"
                    title="Delete rule"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add or Edit Mapping Form */}
      <section className="glass-card cat-section">
        {editingMappingId !== null ? (
          /* Edit Form */
          <form onSubmit={handleSaveEditMapping} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="cat-section-header" style={{ paddingBottom: '8px', marginBottom: '4px' }}>
              <div className="cat-section-title">
                <Edit2 size={16} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Edit Mapping Rule: {mappings.find(m => m.id === editingMappingId)?.componentName}</h3>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Component Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ESPP, LTA, VPF"
                  value={editCompName}
                  onChange={e => setEditCompName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Component Type</label>
                <select
                  className="form-select"
                  value={editCompType}
                  onChange={e => setEditCompType(e.target.value as 'earning' | 'deduction')}
                >
                  <option value="deduction">Deduction (Outflow)</option>
                  <option value="earning">Earning/Allowance (Inflow)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Target Financial Category</label>
              <select
                className="form-select"
                value={editCompCategory}
                onChange={e => setEditCompCategory(e.target.value as any)}
              >
                <option value="investment">Investment (Adds to Investment Rate)</option>
                <option value="savings">Savings (Adds to Savings Rate)</option>
                <option value="tax">Tax (Classify as Tax outflow)</option>
                <option value="expense">Expense (Classify as general Expense)</option>
                <option value="ignore">Ignore (Exclude from counts)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '42px', background: 'var(--primary-glow)', borderColor: 'var(--primary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Check size={16} />
                <span>Save Changes</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingMappingId(null)} style={{ flex: 1, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <X size={16} />
                <span>Cancel</span>
              </button>
            </div>
          </form>
        ) : (
          /* Add Form */
          <form onSubmit={handleAddMapping} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="cat-section-header" style={{ paddingBottom: '8px', marginBottom: '4px' }}>
              <div className="cat-section-title">
                <Plus size={16} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Create New Mapping Rule</h3>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Component Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ESPP, LTA, VPF"
                  value={newCompName}
                  onChange={e => setNewCompName(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Component Type</label>
                <select
                  className="form-select"
                  value={newCompType}
                  onChange={e => setNewCompType(e.target.value as 'earning' | 'deduction')}
                >
                  <option value="deduction">Deduction (Outflow)</option>
                  <option value="earning">Earning/Allowance (Inflow)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Target Financial Category</label>
              <select
                className="form-select"
                value={newCompCategory}
                onChange={e => setNewCompCategory(e.target.value as any)}
              >
                <option value="investment">Investment (Adds to Investment Rate)</option>
                <option value="savings">Savings (Adds to Savings Rate)</option>
                <option value="tax">Tax (Classify as Tax outflow)</option>
                <option value="expense">Expense (Classify as general Expense)</option>
                <option value="ignore">Ignore (Exclude from counts)</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '4px', height: '42px', background: 'var(--primary-glow)', borderColor: 'rgba(139,92,246,0.3)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Plus size={16} />
              <span>Add Mapping Rule</span>
            </button>
          </form>
        )}
      </section>

      <style>{`
        .cat-section {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .cat-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 14px;
        }

        .cat-section-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cat-section-title h3 {
          font-size: 1.05rem;
          font-weight: 600;
        }

        .muted-icon { color: var(--text-muted); }
        .primary-color-icon { color: var(--primary); }

        .badge-pill {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(255,255,255,0.06);
          color: var(--text-muted);
          border: 1px solid var(--border-glass);
        }

        .cat-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 6px;
          border-radius: 6px;
          transition: var(--transition-smooth);
        }

        .cat-action-btn:hover {
          color: var(--primary) !important;
          background: var(--primary-glow);
        }

        .cat-action-btn.delete:hover {
          color: var(--danger) !important;
          background: var(--danger-glow);
        }

        .cat-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 28px;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.9rem;
          background: rgba(255,255,255,0.015);
          border-radius: var(--border-radius-md);
          border: 1px dashed var(--border-glass);
        }

        .cat-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--danger-glow);
          border: 1px solid var(--danger);
          border-radius: var(--border-radius-md);
          color: var(--danger);
          font-size: 0.875rem;
        }

        .cat-error button {
          background: transparent;
          border: none;
          color: var(--danger);
          cursor: pointer;
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
};
