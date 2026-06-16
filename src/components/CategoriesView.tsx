import React, { useState, useEffect } from 'react';
import { db, type Category } from '../db/database';
import { Plus, Trash2, Tag, Lock, Sparkles, Edit2, Check, X } from 'lucide-react';

const EMOJI_PICKER = ['🍔','🛍️','💡','✈️','💰','📈','🏥','🎬','📦','🏠','🐾','🎓','💇','🚿','🎁','🏋️','🧘','🍕','☕','🎮','🚗','📱','💻','🎵','🌿','🏖️','🧹','🔧','📚','🎨'];

export const CategoriesView: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('📦');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for editing categories
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('📦');
  const [editColor, setEditColor] = useState('#8b5cf6');
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
      await db.categories.add({ label, emoji: newEmoji, isDefault: false, color: newColor });
      setNewLabel('');
      setNewEmoji('📦');
      setNewColor('#8b5cf6');
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
        color: editColor
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
                </div>
              </div>
            )}
          </div>
        )}
      </section>



      {/* Info Card */}
      <div className="glass-card cat-info-card">
        <div className="cat-info-icon">💡</div>
        <div>
          <strong>How categories work</strong>
          <p>When you parse a PDF statement, you can manually assign any transaction to any category — including your custom ones. The AI will also use your category list when auto-assigning.</p>
        </div>
      </div>

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

        .badge-pill.custom {
          background: var(--primary-glow);
          color: var(--primary);
          border-color: var(--primary);
        }

        .cat-chips-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .cat-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 24px;
          background: color-mix(in srgb, var(--cat-color, #6b7280) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--cat-color, #6b7280) 30%, transparent);
          font-size: 0.88rem;
          font-weight: 500;
          transition: var(--transition-smooth);
          color: var(--text-primary);
        }

        .cat-chip:hover {
          transform: translateY(-1px);
          background: color-mix(in srgb, var(--cat-color, #6b7280) 20%, transparent);
        }

        .cat-emoji { font-size: 1.1rem; line-height: 1; }

        .cat-label { font-weight: 500; color: var(--text-primary); }

        .cat-default-badge {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 8px;
          background: rgba(255,255,255,0.07);
          color: var(--text-muted);
          border: 1px solid var(--border-glass);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .custom-chip {
          padding-right: 8px;
        }

        .cat-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 4px;
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

        /* Add form */
        .cat-add-form {
          background: rgba(255,255,255,0.018);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .cat-add-form h4 {
          font-size: 0.9rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .cat-form-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .cat-name-input {
          flex: 1;
          min-width: 180px;
        }

        /* Emoji Picker */
        .emoji-picker-wrapper {
          position: relative;
        }

        .emoji-trigger-btn {
          width: 46px;
          height: 46px;
          border-radius: var(--border-radius-md);
          border: 1px solid var(--border-glass);
          background: rgba(255,255,255,0.04);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-smooth);
          flex-shrink: 0;
        }

        .emoji-trigger-btn:hover {
          border-color: var(--primary);
          background: var(--primary-glow);
        }

        .emoji-display { font-size: 1.4rem; line-height: 1; }

        .emoji-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 100;
          background: var(--bg-card);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 10px;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 4px;
          width: 220px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
          backdrop-filter: blur(12px);
        }

        .emoji-option {
          background: transparent;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: var(--transition-smooth);
          line-height: 1;
        }

        .emoji-option:hover, .emoji-option.selected {
          background: var(--primary-glow);
        }

        /* Color picker */
        .color-picker-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }

        .color-label {
          font-size: 0.68rem !important;
          margin: 0 !important;
          color: var(--text-muted);
        }

        .color-input {
          width: 38px;
          height: 30px;
          padding: 2px;
          border: 1px solid var(--border-glass);
          border-radius: 6px;
          background: rgba(255,255,255,0.04);
          cursor: pointer;
        }

        .cat-add-btn {
          flex-shrink: 0;
          height: 46px;
          padding: 0 20px;
        }

        /* Preview */
        .cat-preview {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cat-preview-label {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .preview-chip {
          animation: fade-in-up 0.2s ease;
        }

        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Error */
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

        /* Info card */
        .cat-info-card {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 20px 24px;
        }

        .cat-info-icon {
          font-size: 1.5rem;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .cat-info-card strong {
          display: block;
          font-size: 0.95rem;
          margin-bottom: 4px;
        }

        .cat-info-card p {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 0;
        }
      `}</style>
    </div>
  );
};
