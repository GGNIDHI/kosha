import React, { useState, useEffect } from 'react';
import { db, type Category } from '../../db/database';
import { Plus, Trash2, Tag, Lock, Sparkles, Edit2, Check, X } from 'lucide-react';
import './CategoriesView.css';

const EMOJI_PICKER = ['🍔','🛍️','💡','✈️','💰','📈','🏥','🎬','📦','🏠','🐾','🎓','💇','🚿','🎁','🏋️','🧘','🍕','☕','🎮','🚗','📱','💻','🎵','🌿','🏖️','🧹','🔧','📚','🎨'];

export const CategoriesView: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('📦');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [newType, setNewType] = useState<'income' | 'expense' | 'investment' | 'neutral'>('expense');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for editing categories
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('📦');
  const [editColor, setEditColor] = useState('#8b5cf6');
  const [editType, setEditType] = useState<'income' | 'expense' | 'investment' | 'neutral'>('expense');
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);

  const loadCategories = async () => {
    const all = await db.categories.toArray();
    setCategories(all);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) { setError('Category name cannot be empty.'); return; }
    const exists = categories.some(c => c.label.toLowerCase() === label.toLowerCase());
    if (exists) { setError('A category with that name already exists.'); return; }

    setAdding(true);
    setError(null);
    try {
      await db.categories.add({ label, emoji: newEmoji, isDefault: false, color: newColor, type: newType });
      setNewLabel('');
      setNewEmoji('📦');
      setNewColor('#8b5cf6');
      setNewType('expense');
      await loadCategories();
    } catch (e: any) {
      setError(e.message || 'Failed to add category.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete the category "${cat.label}"? All transactions in this category will be reclassified to "Others" and associated budgets will be deleted.`);
    if (!confirmDelete) return;

    try {
      setError(null);
      await db.categories.delete(cat.id!);

      const fallback = cat.label.toLowerCase() === 'others' ? 'Salary' : 'Others';
      
      // Update transactions in background
      await db.transactions.where('category').equals(cat.label).modify({ category: fallback });
      
      // Update budgets
      await db.budgets.where('category').equals(cat.label).delete();
      
      await loadCategories();
    } catch (e: any) {
      setError(e.message || 'Failed to delete category.');
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingCategoryId(cat.id || null);
    setEditLabel(cat.label);
    setEditEmoji(cat.emoji);
    setEditColor(cat.color || '#8b5cf6');
    setEditType(cat.type || 'expense');
    setShowEditEmojiPicker(false);
  };

  const handleSaveEdit = async () => {
    const label = editLabel.trim();
    if (!label) { setError('Category name cannot be empty.'); return; }
    
    const oldCat = categories.find(c => c.id === editingCategoryId);
    if (!oldCat) return;

    if (oldCat.label.toLowerCase() !== label.toLowerCase()) {
      const exists = categories.some(c => c.id !== editingCategoryId && c.label.toLowerCase() === label.toLowerCase());
      if (exists) { setError('A category with that name already exists.'); return; }
    }

    try {
      setError(null);
      await db.categories.update(editingCategoryId!, {
        label,
        emoji: editEmoji,
        color: editColor,
        type: editType,
      });

      if (oldCat.label !== label) {
        await db.transactions.where('category').equals(oldCat.label).modify({ category: label });
        await db.budgets.where('category').equals(oldCat.label).modify({ category: label });
      }

      setEditingCategoryId(null);
      await loadCategories();
    } catch (e: any) {
      setError(e.message || 'Failed to update category.');
    }
  };

  const defaultCats = categories.filter(c => c.isDefault);
  const customCats  = categories.filter(c => !c.isDefault);

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header">
        <h1>Categories</h1>
        <p>Manage your spending categories. Default ones are built-in; add your own to personalise your tracking.</p>
      </header>

      {/* Info Card - Positioned at the top right below the header */}
      <div className="glass-card cat-info-card">
        <div className="cat-info-icon">💡</div>
        <div>
          <strong>How categories work</strong>
          <p>When you parse a PDF statement, you can manually assign any transaction to any category — including your custom ones. The AI will also use your category list when auto-assigning.</p>
        </div>
      </div>

      {/* Default Categories */}
      <section className="glass-card cat-section">
        <div className="cat-section-header">
          <div className="cat-section-title">
            <Lock size={16} className="muted-icon" />
            <h3>Default Categories</h3>
          </div>
          <span className="badge-pill">{defaultCats.length} built-in</span>
        </div>
        <div className="cat-chips-grid">
          {defaultCats.map(cat => (
            <div key={cat.id} className="cat-chip custom-chip" style={{ '--cat-color': cat.color || '#6b7280' } as React.CSSProperties}>
              <span className="cat-emoji">{cat.emoji}</span>
              <span className="cat-label">{cat.label}</span>
              <span className="cat-default-badge" style={{ marginRight: '6px' }}>Default</span>
              <span className={`cat-type-badge type-${cat.type}`} style={{ marginRight: '6px' }}>{cat.type}</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button className="cat-action-btn edit" onClick={() => handleStartEdit(cat)} title="Edit category" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                  <Edit2 size={12} />
                </button>
                <button className="cat-action-btn delete" onClick={() => handleDelete(cat)} title="Delete category" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Custom Categories */}
      <section className="glass-card cat-section">
        <div className="cat-section-header">
          <div className="cat-section-title">
            <Sparkles size={16} className="primary-color-icon" />
            <h3>Custom Categories</h3>
          </div>
          {customCats.length > 0 && <span className="badge-pill custom">{customCats.length} custom</span>}
        </div>

        {customCats.length === 0 ? (
          <div className="cat-empty-state">
            <Tag size={28} className="muted-icon" />
            <p>No custom categories yet.<br />Add one below to personalise your tracking!</p>
          </div>
        ) : (
          <div className="cat-chips-grid">
            {customCats.map(cat => (
              <div key={cat.id} className="cat-chip custom-chip" style={{ '--cat-color': cat.color || '#8b5cf6' } as React.CSSProperties}>
                <span className="cat-emoji">{cat.emoji}</span>
                <span className="cat-label">{cat.label}</span>
                <span className={`cat-type-badge type-${cat.type}`} style={{ marginRight: '6px', marginLeft: '6px' }}>{cat.type}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '6px' }}>
                  <button className="cat-action-btn edit" onClick={() => handleStartEdit(cat)} title="Edit category" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                    <Edit2 size={12} />
                  </button>
                  <button className="cat-action-btn delete" onClick={() => handleDelete(cat)} title="Delete category" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Category Edit or Add Form */}
        {editingCategoryId !== null ? (
          <div className="cat-add-form" style={{ border: '1px solid var(--primary)' }}>
            <h4 style={{ color: 'var(--primary)' }}>Edit Category: {categories.find(c => c.id === editingCategoryId)?.label}</h4>

            {error && (
              <div className="cat-error">
                <span>{error}</span>
                <button onClick={() => setError(null)}>✕</button>
              </div>
            )}

            <div className="cat-form-row">
              {/* Edit Emoji Picker */}
              <div className="emoji-picker-wrapper">
                <button
                  className="emoji-trigger-btn"
                  onClick={() => setShowEditEmojiPicker(p => !p)}
                  title="Pick an emoji"
                >
                  <span className="emoji-display">{editEmoji}</span>
                </button>
                {showEditEmojiPicker && (
                  <div className="emoji-dropdown">
                    {EMOJI_PICKER.map(e => (
                      <button
                        key={e}
                        className={`emoji-option ${editEmoji === e ? 'selected' : ''}`}
                        onClick={() => { setEditEmoji(e); setShowEditEmojiPicker(false); }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                className="form-input cat-name-input"
                placeholder="Category name"
                value={editLabel}
                onChange={e => { setEditLabel(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                maxLength={30}
              />

              <div className="type-picker-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="form-label color-label" style={{ alignSelf: 'flex-start' }}>Type</label>
                <select
                  className="form-input"
                  style={{ height: '46px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-glass)', borderRadius: 'var(--border-radius-md)', color: 'var(--text-primary)', padding: '0 12px', cursor: 'pointer', outline: 'none' }}
                  value={editType}
                  onChange={e => setEditType(e.target.value as any)}
                >
                  <option value="expense" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Expense</option>
                  <option value="income" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Income</option>
                  <option value="investment" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Investment</option>
                  <option value="neutral" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Neutral</option>
                </select>
              </div>

              <div className="color-picker-wrapper">
                <label className="form-label color-label">Color</label>
                <input
                  type="color"
                  className="color-input"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  title="Accent color"
                />
              </div>

              <button
                className="btn btn-primary cat-add-btn"
                onClick={handleSaveEdit}
                disabled={!editLabel.trim()}
                style={{ background: 'var(--primary-glow)', borderColor: 'var(--primary)' }}
              >
                <Check size={16} />
                <span>Save</span>
              </button>

              <button
                className="btn btn-secondary cat-add-btn"
                onClick={() => setEditingCategoryId(null)}
              >
                <X size={16} />
                <span>Cancel</span>
              </button>
            </div>

            {/* Preview */}
            {editLabel.trim() && (
              <div className="cat-preview">
                <span className="cat-preview-label">Preview:</span>
                <div className="cat-chip preview-chip" style={{ '--cat-color': editColor } as React.CSSProperties}>
                  <span className="cat-emoji">{editEmoji}</span>
                  <span className="cat-label">{editLabel.trim()}</span>
                  <span className={`cat-type-badge type-${editType}`} style={{ marginLeft: '6px' }}>{editType}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="cat-add-form">
            <h4>Add New Category</h4>

            {error && (
              <div className="cat-error">
                <span>{error}</span>
                <button onClick={() => setError(null)}>✕</button>
              </div>
            )}

            <div className="cat-form-row">
              {/* Emoji Picker Button */}
              <div className="emoji-picker-wrapper">
                <button
                  className="emoji-trigger-btn"
                  onClick={() => setShowEmojiPicker(p => !p)}
                  title="Pick an emoji"
                >
                  <span className="emoji-display">{newEmoji}</span>
                </button>
                {showEmojiPicker && (
                  <div className="emoji-dropdown">
                    {EMOJI_PICKER.map(e => (
                      <button
                        key={e}
                        className={`emoji-option ${newEmoji === e ? 'selected' : ''}`}
                        onClick={() => { setNewEmoji(e); setShowEmojiPicker(false); }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                className="form-input cat-name-input"
                placeholder="Category name (e.g. Petrol, Rent, Pets)"
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                maxLength={30}
              />

              <div className="type-picker-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="form-label color-label" style={{ alignSelf: 'flex-start' }}>Type</label>
                <select
                  className="form-input"
                  style={{ height: '46px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-glass)', borderRadius: 'var(--border-radius-md)', color: 'var(--text-primary)', padding: '0 12px', cursor: 'pointer', outline: 'none' }}
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                >
                  <option value="expense" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Expense</option>
                  <option value="income" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Income</option>
                  <option value="investment" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Investment</option>
                  <option value="neutral" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Neutral</option>
                </select>
              </div>

              <div className="color-picker-wrapper">
                <label className="form-label color-label">Color</label>
                <input
                  type="color"
                  className="color-input"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  title="Accent color"
                />
              </div>

              <button
                className="btn btn-primary cat-add-btn"
                onClick={handleAdd}
                disabled={adding || !newLabel.trim()}
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>

            {/* Preview */}
            {newLabel.trim() && (
              <div className="cat-preview">
                <span className="cat-preview-label">Preview:</span>
                <div className="cat-chip preview-chip" style={{ '--cat-color': newColor } as React.CSSProperties}>
                  <span className="cat-emoji">{newEmoji}</span>
                  <span className="cat-label">{newLabel.trim()}</span>
                  <span className={`cat-type-badge type-${newType}`} style={{ marginLeft: '6px' }}>{newType}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
