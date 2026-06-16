import React, { useState, useRef } from 'react';
import { db } from '../db/database';
import { parseCsv, csvRowsToTransactions } from '../utils/csvImporter';
import type { CsvRow } from '../utils/csvImporter';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export const CsvImportView: React.FC = () => {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [format, setFormat] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const CATS = ['Food','Shopping','Utilities','Travel','Salary','Investment','Health','Entertainment','Others'];

  const handleFile = async (file: File) => {
    setImported(null); setImported(null);
    const text = await file.text();
    const result = parseCsv(text);
    setRows(result.rows);
    setErrors(result.errors);
    setFormat(result.detectedFormat);
    setFileName(file.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const txs = csvRowsToTransactions(rows, fileName);
      await db.transactions.bulkAdd(txs);
      localStorage.setItem('kosha_show_smart_review_banner', 'true');
      setImported(txs.length);
      setRows([]); setErrors([]); setFileName('');
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  const updateRow = (i: number, field: keyof CsvRow, value: string) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : r));
  };

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>CSV Bank Import</h1>
          <p>Import your bank statement CSV directly. Supports HDFC, ICICI, SBI, Axis Bank formats.</p>
        </div>
        {rows.length > 0 && (
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            <CheckCircle2 size={16} />
            <span>{importing ? 'Importing…' : `Import ${rows.length} Transactions`}</span>
          </button>
        )}
      </header>

      {imported !== null && (
        <div className="glass-card import-success">
          <CheckCircle2 size={20} color="#22c55e" />
          <span>{imported} transactions imported successfully!</span>
        </div>
      )}

      {/* Drop zone */}
      {rows.length === 0 && (
        <div
          className="glass-card csv-dropzone"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Upload size={40} className="primary-color" style={{ opacity: 0.7 }} />
          <h3>Drop your CSV file here</h3>
          <p>or click to browse. Supports most Indian bank statement exports.</p>
          <div className="csv-bank-chips">
            {['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Yes Bank'].map(b => (
              <span key={b} className="bank-chip">{b}</span>
            ))}
          </div>
          <div className="csv-help">
            <p>💡 In your net banking, look for <strong>Download Statement → CSV/Excel</strong></p>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="glass-card csv-errors-card">
          <div className="csv-error-header">
            <AlertTriangle size={16} color="#f97316" />
            <span>{errors.length} warning{errors.length > 1 ? 's' : ''} — rows with issues were skipped</span>
          </div>
          {errors.slice(0, 5).map((e, i) => <p key={i} className="csv-error-item">• {e}</p>)}
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="glass-card csv-preview-card">
          <div className="csv-preview-header">
            <div>
              <h3><FileSpreadsheet size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />{fileName}</h3>
              <p className="csv-format-tag">{format} &bull; {rows.length} rows detected</p>
            </div>
            <button className="btn-close" onClick={() => { setRows([]); setErrors([]); setFileName(''); }}>
              <X size={18} />
            </button>
          </div>

          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="table-row">
                    <td className="tx-date">{r.date}</td>
                    <td className="tx-desc"><span className="desc-text">{r.description}</span></td>
                    <td>
                      <select
                        className="filter-select" style={{ fontSize: '0.8rem', padding: '3px 6px' }}
                        value={r.category}
                        onChange={e => updateRow(i, 'category', e.target.value)}
                      >
                        {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="filter-select" style={{ fontSize: '0.8rem', padding: '3px 6px' }}
                        value={r.type}
                        onChange={e => updateRow(i, 'type', e.target.value)}
                      >
                        <option value="debit">Debit</option>
                        <option value="credit">Credit</option>
                      </select>
                    </td>
                    <td className={`tx-amount text-right ${r.type}`}>
                      {r.type === 'credit' ? '+' : '-'} ₹{r.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && <p className="csv-truncated">Showing first 100 of {rows.length} rows. All will be imported.</p>}
          </div>
        </div>
      )}

      <style>{`
        .csv-dropzone {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 60px 40px; cursor: pointer;
          border: 2px dashed var(--border-glass); text-align: center;
          transition: border-color .2s, background .2s;
        }
        .csv-dropzone:hover { border-color: var(--primary); background: rgba(139,92,246,.04); }
        .csv-dropzone h3 { font-size: 1.15rem; font-weight: 700; margin: 0; }
        .csv-dropzone p { font-size: 0.88rem; color: var(--text-muted); margin: 0; }
        .csv-bank-chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }
        .bank-chip { padding: 4px 12px; border-radius: 99px; font-size: 0.78rem; font-weight: 600; background: rgba(255,255,255,.05); border: 1px solid var(--border-glass); color: var(--text-secondary); }
        .csv-help { margin-top: 8px; font-size: 0.82rem; color: var(--text-muted); }

        .import-success { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border: 1px solid rgba(34,197,94,.2); color: #22c55e; font-size: 0.95rem; font-weight: 600; }

        .csv-errors-card { padding: 16px 20px; border: 1px solid rgba(249,115,22,.2); }
        .csv-error-header { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 600; color: #f97316; margin-bottom: 8px; }
        .csv-error-item { font-size: 0.8rem; color: var(--text-muted); margin: 3px 0; }

        .csv-preview-card { padding: 0; overflow: hidden; }
        .csv-preview-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px; border-bottom: 1px solid var(--border-glass); }
        .csv-preview-header h3 { font-size: 0.95rem; font-weight: 700; margin: 0 0 3px; }
        .csv-format-tag { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
        .csv-truncated { font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px; }
      `}</style>
    </div>
  );
};
