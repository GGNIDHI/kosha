import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSetting, setSetting, type SalarySlipMapping } from '../../db/database';
import { Plus, Trash2, Edit2, Check, X, Sliders } from 'lucide-react';
import './SalaryMappingsView.css';

export const SalaryMappingsView: React.FC = () => {
  const [mappings, setMappings] = useState<SalarySlipMapping[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal display states
  const [showAddModal, setShowAddModal] = useState(false);

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
    
    // Reset fields & close modal
    setNewCompName('');
    setShowAddModal(false);
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
      <header className="view-header-row">
        <div className="view-header-text">
          <h1>Salary Mappings</h1>
          <p>Map specific salary slip component earnings or deductions to custom financial categories. Mapped items are dynamically accounted for in your Dashboard meters.</p>
        </div>
        <button
          onClick={() => {
            setNewCompName('');
            setNewCompType('deduction');
            setNewCompCategory('investment');
            setError(null);
            setShowAddModal(true);
          }}
          className="btn btn-primary btn-premium-glow"
        >
          <Plus size={16} />
          <span>Add Mapping Rule</span>
        </button>
      </header>

      {error && (
        <div className="cat-error" style={{ marginBottom: '16px' }}>
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
            <p>No salary mapping rules defined yet.<br />Click "Add Mapping Rule" at the top to configure your first mapping.</p>
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

      {/* CREATE NEW MAPPING MODAL DIALOG */}
      {showAddModal && createPortal(
        <div className="drawer-overlay" onClick={() => setShowAddModal(false)}>
          <div className="glass-card modal-content-centered" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sliders size={22} className="primary-color-icon" style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Create New Mapping Rule</h3>
              </div>
              <button 
                className="btn-close" 
                onClick={() => setShowAddModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <form onSubmit={handleAddMapping} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)} style={{ flex: 1, height: '42px', margin: 0 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '42px', margin: 0, background: 'var(--primary-glow)', borderColor: 'rgba(139,92,246,0.3)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Plus size={16} />
                    <span>Add Mapping Rule</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT MAPPING MODAL DIALOG */}
      {editingMappingId !== null && createPortal(
        <div className="drawer-overlay" onClick={() => setEditingMappingId(null)}>
          <div className="glass-card modal-content-centered" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Edit2 size={22} className="primary-color-icon" style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Edit Mapping Rule</h3>
              </div>
              <button 
                className="btn-close" 
                onClick={() => setEditingMappingId(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <form onSubmit={handleSaveEditMapping} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingMappingId(null)} style={{ flex: 1, height: '42px', margin: 0 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '42px', margin: 0, background: 'var(--primary-glow)', borderColor: 'var(--primary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Check size={16} />
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
