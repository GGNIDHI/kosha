import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Investment } from '../db/database';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TrendingUp, FileUp, Plus, Trash2, ArrowUpRight, ArrowDownLeft, PieChart as PieChartIcon, X, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export const InvestmentsView: React.FC = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  // File Upload & Parser Review states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingStatus, setParsingStatus] = useState<'idle' | 'reading' | 'success' | 'error' | 'imported'>('idle');
  const [parsedInvestments, setParsedInvestments] = useState<Investment[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);

  // Fetch investments from database
  const investments = useLiveQuery(() => db.investments.toArray(), []) || [];

  // Parse CSV/XLSX file exported from Zerodha Console/Holdings
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParsingStatus('reading');
    setParsingError(null);
    setParsedInvestments([]);

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let newInvestments: Investment[] = [];

        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          let worksheet = null;
          let sheetRows: any[][] = [];
          let symbolIdx = -1;
          let qtyIdx = -1;
          let avgIdx = -1;
          let ltpIdx = -1;
          let headerRowIdx = -1;

          // Scan all sheets in the workbook to locate the holdings table
          for (const sheetName of workbook.SheetNames) {
            const tempWorksheet = workbook.Sheets[sheetName];
            const tempRows = XLSX.utils.sheet_to_json<any[]>(tempWorksheet, { header: 1 });
            if (tempRows.length < 2) continue;

            // Search the first 40 rows for header indicators dynamically
            for (let r = 0; r < Math.min(tempRows.length, 40); r++) {
              const row = tempRows[r];
              if (!row || !Array.isArray(row)) continue;

              const candidateHeaders = row.map(h => String(h || '').toLowerCase().trim());
              const sym = candidateHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument') || h.includes('ticker') || h.includes('stock') || h === 'isin');
              const qty = candidateHeaders.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('holding') || h.includes('volume'));
              const avg = candidateHeaders.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy price') || h.includes('rate'));
              const ltp = candidateHeaders.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price'));

              if (sym !== -1 && qty !== -1 && avg !== -1) {
                symbolIdx = sym;
                qtyIdx = qty;
                avgIdx = avg;
                ltpIdx = ltp;
                headerRowIdx = r;
                worksheet = tempWorksheet;
                sheetRows = tempRows;
                break;
              }
            }
            if (worksheet) break; // Found the correct sheet
          }

          if (!worksheet || headerRowIdx === -1) {
            throw new Error('Required columns (Symbol/Instrument, Qty, Avg Cost) not found in Excel sheet. Please ensure it is a valid Zerodha holdings export.');
          }

          for (let i = headerRowIdx + 1; i < sheetRows.length; i++) {
            const row = sheetRows[i];
            if (!row || row.length === 0) continue;

            const sym = String(row[symbolIdx] || '').replace(/"/g, '').trim().toUpperCase();
            if (!sym) continue;

            const qty = parseFloat(String(row[qtyIdx] || '').replace(/"/g, '').trim());
            const avg = parseFloat(String(row[avgIdx] || '').replace(/"/g, '').trim());
            const ltpVal = ltpIdx !== -1 ? String(row[ltpIdx] || '').replace(/"/g, '').trim() : '';
            const ltp = ltpVal ? parseFloat(ltpVal) : undefined;

            if (sym && !isNaN(qty) && !isNaN(avg)) {
              newInvestments.push({
                id: sym,
                symbol: sym,
                quantity: qty,
                avgCost: avg,
                currentPrice: !isNaN(ltp as number) ? ltp : avg,
                lastUpdated: new Date().toISOString()
              });
            }
          }
        } else {
          const text = event.target?.result as string;
          const lines = text.split('\n');
          
          if (lines.length < 2) {
            throw new Error('CSV file is empty.');
          }

          let symbolIdx = -1;
          let qtyIdx = -1;
          let avgIdx = -1;
          let ltpIdx = -1;
          let headerRowIdx = -1;

          // Scan the first 40 rows of CSV dynamically
          for (let r = 0; r < Math.min(lines.length, 40); r++) {
            const line = lines[r].trim();
            if (!line) continue;

            const candidateHeaders = line.toLowerCase().split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.replace(/"/g, '').trim());
            const sym = candidateHeaders.findIndex(h => h.includes('symbol') || h.includes('instrument') || h.includes('ticker') || h.includes('stock') || h === 'isin');
            const qty = candidateHeaders.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('shares') || h.includes('holding') || h.includes('volume'));
            const avg = candidateHeaders.findIndex(h => h.includes('avg') || h.includes('average') || h.includes('cost') || h.includes('price') || h.includes('buy price') || h.includes('rate'));
            const ltp = candidateHeaders.findIndex(h => h.includes('ltp') || h.includes('last price') || h.includes('current price'));

            if (sym !== -1 && qty !== -1 && avg !== -1) {
              symbolIdx = sym;
              qtyIdx = qty;
              avgIdx = avg;
              ltpIdx = ltp;
              headerRowIdx = r;
              break;
            }
          }

          if (headerRowIdx === -1) {
            throw new Error('Required CSV columns (Symbol/Instrument, Qty, Avg Cost) not found.');
          }

          for (let i = headerRowIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            
            const sym = cols[symbolIdx]?.replace(/"/g, '').trim().toUpperCase();
            const qty = parseFloat(cols[qtyIdx]?.replace(/"/g, '').trim());
            const avg = parseFloat(cols[avgIdx]?.replace(/"/g, '').trim());
            const ltp = ltpIdx !== -1 ? parseFloat(cols[ltpIdx]?.replace(/"/g, '').trim()) : undefined;

            if (sym && !isNaN(qty) && !isNaN(avg)) {
              newInvestments.push({
                id: sym,
                symbol: sym,
                quantity: qty,
                avgCost: avg,
                currentPrice: !isNaN(ltp as number) ? ltp : avg,
                lastUpdated: new Date().toISOString()
              });
            }
          }
        }

        if (newInvestments.length === 0) {
          throw new Error('No valid stock positions found in this statement.');
        }

        setParsedInvestments(newInvestments);
        setParsingStatus('success');
      } catch (err: any) {
        console.error(err);
        setParsingError(err?.message || 'Failed to parse portfolio file.');
        setParsingStatus('error');
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedInvestments.length === 0) return;
    try {
      await db.investments.clear();
      await db.investments.bulkAdd(parsedInvestments);
      setParsingStatus('imported'); // SUCCESS STATE INDICATION
    } catch (err: any) {
      setParsingError(err?.message || 'Failed to write holdings to database.');
      setParsingStatus('error');
    }
  };

  const handleCancelImport = () => {
    setSelectedFile(null);
    setParsingStatus('idle');
    setParsedInvestments([]);
    setParsingError(null);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!symbol || !quantity || !avgCost) return;

    const sym = symbol.trim().toUpperCase();
    const qty = parseFloat(quantity);
    const avg = parseFloat(avgCost);
    const cur = currentPrice ? parseFloat(currentPrice) : avg;

    try {
      await db.investments.put({
        id: sym,
        symbol: sym,
        quantity: qty,
        avgCost: avg,
        currentPrice: cur,
        lastUpdated: new Date().toISOString()
      });

      // Reset
      setSymbol('');
      setQuantity('');
      setAvgCost('');
      setCurrentPrice('');
      setShowAddForm(false);
    } catch (err: any) {
      setError('Failed to add investment: ' + err?.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this holding from portfolio?')) {
      try {
        await db.investments.delete(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Portfolio aggregates
  const totalCost = investments.reduce((sum, inv) => sum + (inv.quantity * inv.avgCost), 0);
  const totalValue = investments.reduce((sum, inv) => sum + (inv.quantity * (inv.currentPrice || inv.avgCost)), 0);
  const totalPnL = totalValue - totalCost;
  const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Chart Data preparation (Top 5 holdings + rest combined as 'Others')
  const chartData = [...investments]
    .map(inv => ({
      name: inv.symbol,
      value: Math.round(inv.quantity * (inv.currentPrice || inv.avgCost))
    }))
    .sort((a, b) => b.value - a.value);

  const topHoldings = chartData.slice(0, 5);
  const otherHoldingsSum = chartData.slice(5).reduce((sum, item) => sum + item.value, 0);
  
  if (otherHoldingsSum > 0) {
    topHoldings.push({ name: 'Others', value: otherHoldingsSum });
  }

  // Colors for pie slices
  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6b7280'];

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Investments</h1>
          <p>Track your stock holdings, average costs, and portfolio asset allocation.</p>
        </div>
        {investments.length > 0 && (
          <div className="header-actions">
            <label className="btn btn-secondary cursor-pointer">
              <FileUp size={18} />
              <span>Import Zerodha CSV/Excel</span>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls" 
                className="display-none"
                onChange={handleFileChange}
              />
            </label>
            <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
              <Plus size={18} />
              <span>Add Asset</span>
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="alert alert-error-box">
          <span>{error}</span>
        </div>
      )}

      {/* Manual Add Form Overlay */}
      {showAddForm && (
        <div className="drawer-overlay" onClick={() => setShowAddForm(false)}>
          <div className="glass-card drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Add Asset Holding</h3>
              <button className="btn-close" onClick={() => setShowAddForm(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleManualAdd} className="drawer-form">
              <div className="form-group">
                <label className="form-label">Stock Symbol</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. RELIANCE"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input 
                  type="number" 
                  step="0.0001"
                  className="form-input" 
                  placeholder="e.g. 10"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Avg Purchase Cost</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  placeholder="0.00"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Current Price (LTP)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="form-input" 
                  placeholder="Leave blank to use Avg Cost"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                Add Asset
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Import Review Modal Overlay */}
      {selectedFile && (
        <div className="drawer-overlay" onClick={handleCancelImport}>
          <div className="glass-card drawer-content" onClick={(e) => e.stopPropagation()} style={{ width: '460px' }}>
            <div className="drawer-header">
              <h3>Import Portfolio</h3>
              <button className="btn-close" onClick={handleCancelImport}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {parsingStatus !== 'imported' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
                    <FileSpreadsheet size={24} style={{ color: parsingStatus === 'success' ? 'var(--secondary)' : parsingStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {selectedFile.name}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                )}

                {parsingStatus === 'reading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
                    <div className="glow-active" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid var(--border-glass)', borderTopColor: 'var(--secondary)', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Reading statement & detecting columns...</span>
                  </div>
                )}

                {parsingStatus === 'success' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✓</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--success)' }}>Data Parsed Successfully</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Detected <strong>{parsedInvestments.length}</strong> holdings ready to load.
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.8rem', color: 'var(--warning)', lineHeight: '1.4' }}>
                      <strong>⚠️ Attention:</strong> Confirming this import will clear your current stock holdings portfolio list and replace it with the records in this statement.
                    </div>
                  </div>
                )}

                {parsingStatus === 'imported' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px 0', textAlign: 'center' }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '2px solid var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--success)',
                      boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
                      animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                    }}>
                      <span style={{ fontSize: '2rem', lineHeight: 1 }}>✓</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Import Complete</h4>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        Successfully loaded <strong>{parsedInvestments.length}</strong> stock positions into your holdings portfolio.
                      </p>
                    </div>
                  </div>
                )}

                {parsingStatus === 'error' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>❌</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--danger)' }}>Import Failed</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                          {parsingError || 'Could not parse the file structure.'}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      Please ensure you are uploading a standard holdings statement downloaded directly from <strong>Zerodha Console</strong>.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                {parsingStatus === 'success' && (
                  <button className="btn btn-primary btn-full" onClick={handleConfirmImport} style={{ margin: 0 }}>
                    Confirm
                  </button>
                )}
                {parsingStatus === 'imported' && (
                  <button className="btn btn-primary btn-full" onClick={handleCancelImport} style={{ margin: 0 }}>
                    Close
                  </button>
                )}
                {parsingStatus === 'error' && (
                  <label className="btn btn-primary btn-full cursor-pointer" style={{ margin: 0 }}>
                    Choose Another File
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls" 
                      className="display-none"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
                {parsingStatus !== 'imported' && (
                  <button className="btn btn-secondary btn-full" onClick={handleCancelImport} style={{ margin: 0 }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {investments.length === 0 ? (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, justifyContent: 'center', minHeight: '50vh', marginTop: '16px' }}>
          <div style={{ textAlign: 'center', maxWidth: '580px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>Set Up Your Investment Portfolio</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.6' }}>
              Choose how you want to load your holdings. You can upload your Zerodha Console spreadsheet for auto-syncing, or log individual stock holdings manually.
            </p>
          </div>

          <div className="investments-actions-grid" style={{ maxWidth: '860px', width: '100%', margin: '0 auto' }}>
            {/* Import Action Card */}
            <label className="glass-card action-card cursor-pointer">
              <div className="action-icon-wrap bg-cyan-glow">
                <FileSpreadsheet size={24} />
              </div>
              <h4>Import Zerodha Statement</h4>
              <p>
                Directly upload your holdings `.xlsx` spreadsheet or `.csv` export downloaded from Zerodha Console. Perfect for bulk setup.
              </p>
              
              {/* Dashed dropzone / select area */}
              <div className="upload-dropzone" style={{
                width: '100%',
                border: '1px dashed rgba(6, 182, 212, 0.3)',
                borderRadius: '8px',
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'rgba(6, 182, 212, 0.02)',
                transition: 'var(--transition-smooth)',
                marginTop: '8px',
                flexGrow: 1
              }}>
                <FileUp size={20} style={{ color: 'var(--secondary)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Click to browse Excel or CSV</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Supports .xlsx, .xls, .csv</span>
              </div>
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls" 
                className="display-none"
                onChange={handleFileChange}
              />
            </label>

            {/* Manual Action Card */}
            <div className="glass-card action-card cursor-pointer" onClick={() => setShowAddForm(true)}>
              <div className="action-icon-wrap bg-purple-glow">
                <Plus size={24} />
              </div>
              <h4>Add Holdings Manually</h4>
              <p>
                Manually enter stock symbols, quantities, and average purchase costs. Best for tracking customized assets.
              </p>
              
              {/* Dashed clickzone area */}
              <div className="manual-entry-zone" style={{
                width: '100%',
                border: '1px dashed rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'rgba(139, 92, 246, 0.02)',
                transition: 'var(--transition-smooth)',
                marginTop: '8px',
                flexGrow: 1
              }}>
                <Plus size={20} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Click to open entry form</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Enter symbol, quantity, average price</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Row */}
          <div className="stats-row">
            <div className="glass-card stat-card">
              <span className="stat-label">Total Invested (Cost)</span>
              <span className="stat-value">₹ {totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="glass-card stat-card">
              <span className="stat-label">Current Value</span>
              <span className="stat-value text-glow-cyan">₹ {totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>

            <div className="glass-card stat-card">
              <span className="stat-label">Unrealized P&L</span>
              <div className="stat-value-group">
                <span className={`stat-value ${totalPnL >= 0 ? 'success-color' : 'danger-color'}`}>
                  ₹ {totalPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className={`pnl-percent badge ${totalPnL >= 0 ? 'badge-success' : 'badge-danger'}`}>
                  {totalPnL >= 0 ? '+' : ''} {pnlPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Visual Grid */}
          <div className="visuals-grid">
            {/* Pie Chart Card */}
            <div className="glass-card chart-card-wrapper">
              <div className="card-header">
                <PieChartIcon size={18} className="secondary-color" />
                <h3>Asset Allocation</h3>
              </div>
              <div className="pie-chart-container">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={topHoldings}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {topHoldings.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [`₹ ${Number(value).toLocaleString()}`, 'Value']}
                      contentStyle={{
                        background: '#0c111d',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pie-legend">
                  {topHoldings.map((entry, idx) => (
                    <div key={entry.name} className="legend-item">
                      <span className="legend-dot" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="legend-name">{entry.name}</span>
                      <span className="legend-value">{((entry.value / totalValue) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="glass-card table-card">
              <div className="card-header">
                <TrendingUp size={18} className="primary-color" />
                <h3>Stock Positions</h3>
              </div>
              <div className="table-responsive">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Avg. Price</th>
                      <th className="text-right">Current Price</th>
                      <th className="text-right">Total P&L</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map((inv) => {
                      const cost = inv.quantity * inv.avgCost;
                      const value = inv.quantity * (inv.currentPrice || inv.avgCost);
                      const pnl = value - cost;
                      const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                      return (
                        <tr key={inv.symbol} className="table-row">
                          <td className="stock-ticker">{inv.symbol}</td>
                          <td className="text-right">{inv.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                          <td className="text-right">₹ {inv.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="text-right">₹ {(inv.currentPrice || inv.avgCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className={`text-right font-bold ${pnl >= 0 ? 'success-color' : 'danger-color'}`}>
                            <div className="pnl-row-value">
                              {pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                              <span>₹ {pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                            <span className="pnl-pct-label">({pnl >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                          </td>
                          <td className="text-center">
                            <button className="btn-delete-action" onClick={() => inv.symbol && handleDelete(inv.symbol)}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        .header-actions {
          display: flex;
          gap: 12px;
        }

        .empty-state-card {
          padding: 80px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          margin-top: 16px;
        }

        .empty-actions {
          margin-top: 24px;
        }

        /* Stats Row */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .stat-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .stat-value {
          font-family: var(--font-heading);
          font-size: 1.8rem;
          font-weight: 700;
        }

        .text-glow-cyan {
          color: var(--secondary);
          text-shadow: 0 0 15px var(--secondary-glow);
        }

        .stat-value-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pnl-percent {
          font-size: 0.8rem;
        }

        .badge-success {
          background: var(--success-glow);
          color: var(--success);
          border: 1px solid rgba(34, 197, 94, 0.1);
        }

        .badge-danger {
          background: var(--danger-glow);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.1);
        }

        .success-color {
          color: var(--success) !important;
        }

        .danger-color {
          color: var(--danger) !important;
        }

        /* Visuals Grid */
        .visuals-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
          align-items: start;
        }

        @media (max-width: 1024px) {
          .visuals-grid {
            grid-template-columns: 1fr;
          }
        }

        .chart-card-wrapper {
          padding: 24px;
        }

        .pie-chart-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 16px;
        }

        .pie-legend {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 16px;
          border-top: 1px solid var(--border-glass);
          padding-top: 16px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          font-size: 0.8rem;
          gap: 6px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-name {
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 70px;
        }

        .legend-value {
          color: var(--text-primary);
          font-weight: 600;
          margin-left: auto;
        }

        .table-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .holdings-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .holdings-table th {
          padding: 12px;
          font-size: 0.8rem;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-glass);
          text-transform: uppercase;
        }

        .holdings-table td {
          padding: 14px 12px;
          font-size: 0.9rem;
          border-bottom: 1px solid var(--border-glass);
        }

        .stock-ticker {
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-heading);
        }

        .font-bold {
          font-weight: 600;
        }

        .pnl-row-value {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .pnl-pct-label {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};
