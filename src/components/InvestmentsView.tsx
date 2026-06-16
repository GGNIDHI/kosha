import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Investment } from '../db/database';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { 
  TrendingUp, 
  FileUp, 
  Plus, 
  Trash2, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PieChart as PieChartIcon, 
  X, 
  FileSpreadsheet, 
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseZerodhaHoldings } from '../utils/parsers/zerodha_holdings';
import { parseGenericHoldings, parseGenericCsv } from '../utils/parsers/generic_holdings';

export const InvestmentsView: React.FC = () => {
  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'all' | 'stocks' | 'mutual_funds'>('all');
  
  // Modal toggle & Mode state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [modalMode, setModalMode] = useState<'both' | 'import_only' | 'manual_only'>('both');

  // Input ref for modal file selector
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add state
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [manualType, setManualType] = useState<'equity' | 'mutual_fund'>('equity');
  const [manualError, setManualError] = useState<string | null>(null);

  // File Import state
  const [selectedBroker, setSelectedBroker] = useState<'zerodha' | 'generic'>('zerodha');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingStatus, setParsingStatus] = useState<'idle' | 'reading' | 'success' | 'error' | 'imported'>('idle');
  const [parsedInvestments, setParsedInvestments] = useState<Investment[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);

  // Fetch investments from database
  const investments = useLiveQuery(() => db.investments.toArray(), []) || [];

  // Parse CSV/XLSX file based on selected broker
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
        let results: Investment[] = [];

        if (selectedBroker === 'zerodha') {
          if (!isExcel) {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            results = parseZerodhaHoldings(workbook);
          } else {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            results = parseZerodhaHoldings(workbook);
          }
        } else {
          // Generic parser
          if (isExcel) {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            results = parseGenericHoldings(workbook);
          } else {
            const text = event.target?.result as string;
            results = parseGenericCsv(text);
          }
        }

        if (results.length === 0) {
          throw new Error('No valid stock or mutual fund positions found in this statement. Please check the columns or choose the correct broker.');
        }

        setParsedInvestments(results);
        setParsingStatus('success');
      } catch (err: any) {
        console.error(err);
        setParsingError(err?.message || 'Failed to parse portfolio file.');
        setParsingStatus('error');
      }
    };

    if (isExcel || selectedBroker === 'zerodha') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedInvestments.length === 0) return;
    try {
      // Clear and rewrite holdings
      await db.investments.clear();
      await db.investments.bulkAdd(parsedInvestments);
      setParsingStatus('imported');
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
    
    // If we came directly from the empty state card, cancel should close the modal
    if (modalMode === 'import_only') {
      setShowUpdateModal(false);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

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
        lastUpdated: new Date().toISOString(),
        type: manualType
      });

      // Reset fields
      setSymbol('');
      setQuantity('');
      setAvgCost('');
      setCurrentPrice('');
      
      // Close modal
      setShowUpdateModal(false);
    } catch (err: any) {
      setManualError('Failed to add investment: ' + err?.message);
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

  const handleEmptyStateImportClick = () => {
    setSelectedBroker('zerodha'); // Default to Zerodha
    setModalMode('import_only');
    setShowUpdateModal(true);
  };

  // Filtered investments list for rendering table and pie chart
  const filteredInvestments = investments.filter(inv => {
    if (activeTab === 'stocks') return inv.type === 'equity';
    if (activeTab === 'mutual_funds') return inv.type === 'mutual_fund';
    return true;
  });

  // Portfolio aggregates (based on filtered list)
  const totalCost = filteredInvestments.reduce((sum, inv) => sum + (inv.quantity * inv.avgCost), 0);
  const totalValue = filteredInvestments.reduce((sum, inv) => sum + (inv.quantity * (inv.currentPrice || inv.avgCost)), 0);
  const totalPnL = totalValue - totalCost;
  const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  // Chart Data preparation (Top 5 holdings + rest combined as 'Others')
  const chartData = [...filteredInvestments]
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

  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6b7280'];

  // REUSABLE SUB-CONTENT RENDERERS
  const renderManualFormContent = () => (
    <form onSubmit={handleManualAdd} className="modal-manual-form">
      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div className="form-group">
          <label className="form-label">Asset Type</label>
          <select 
            className="form-input"
            value={manualType}
            onChange={(e) => setManualType(e.target.value as any)}
          >
            <option value="equity">Stock (Equity)</option>
            <option value="mutual_fund">Mutual Fund</option>
          </select>
        </div>
        
        <div className="form-group">
          <label className="form-label">{manualType === 'equity' ? 'Symbol' : 'Fund Name'}</label>
          <input 
            type="text" 
            className="form-input" 
            placeholder={manualType === 'equity' ? 'e.g. ONGC' : 'e.g. MIRAE ELSS'}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required 
          />
        </div>
      </div>

      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
        <div className="form-group">
          <label className="form-label">Quantity</label>
          <input 
            type="number" 
            step="0.0001"
            className="form-input" 
            placeholder="0.0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required 
          />
        </div>

        <div className="form-group">
          <label className="form-label">Average Buy Cost</label>
          <input 
            type="number" 
            step="0.0001"
            className="form-input" 
            placeholder="0.00"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            required 
          />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '8px' }}>
        <label className="form-label">Current Price (LTP / NAV)</label>
        <input 
          type="number" 
          step="0.0001"
          className="form-input" 
          placeholder="Leave blank to use Buy Cost"
          value={currentPrice}
          onChange={(e) => setCurrentPrice(e.target.value)}
        />
      </div>

      {manualError && (
        <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '6px' }}>
          {manualError}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: '16px', margin: '16px 0 0 0' }}>
        Add Asset Holding
      </button>
    </form>
  );

  const renderUploadCardContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <div className="form-group">
        <label className="form-label">Select Statement Broker</label>
        <select 
          className="form-input" 
          value={selectedBroker}
          onChange={(e) => setSelectedBroker(e.target.value as any)}
        >
          <option value="zerodha">Zerodha Console (Excel/CSV)</option>
          <option value="generic">Generic/Other Broker (CSV/Excel)</option>
        </select>
      </div>

      <label className="upload-dropzone cursor-pointer" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
        <FileUp size={24} style={{ color: 'var(--secondary)', marginBottom: '8px' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Browse Excel or CSV File
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Supports .xlsx, .xls, .csv
        </span>
        <input 
          type="file" 
          accept=".csv,.xlsx,.xls" 
          className="display-none"
          ref={modalFileInputRef}
          onChange={handleFileChange}
        />
      </label>
    </div>
  );

  // Determine modal styling size
  const isNarrowModal = selectedFile !== null || modalMode === 'import_only' || modalMode === 'manual_only';

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Investments</h1>
          <p>Track your stock holdings, mutual funds, asset allocation, and average purchase costs.</p>
        </div>
        <div className="header-actions">
          {/* Renders ONLY when there are active holdings in the DB */}
          {investments.length > 0 && (
            <button className="btn-premium-glow" onClick={() => { setModalMode('both'); setShowUpdateModal(true); }}>
              <FileUp size={16} />
              <span>Update Latest Investments</span>
            </button>
          )}
        </div>
      </header>

      {/* Dynamic Tabs Navigation */}
      {investments.length > 0 && (
        <div className="investments-tabs-row">
          <div className="investments-tabs">
            <button 
              className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} 
              onClick={() => setActiveTab('all')}
            >
              All Assets ({investments.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'stocks' ? 'active' : ''}`} 
              onClick={() => setActiveTab('stocks')}
            >
              Stocks ({investments.filter(i => i.type === 'equity').length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'mutual_funds' ? 'active' : ''}`} 
              onClick={() => setActiveTab('mutual_funds')}
            >
              Mutual Funds ({investments.filter(i => i.type === 'mutual_fund').length})
            </button>
          </div>
        </div>
      )}

      {investments.length === 0 ? (
        // Initial Empty State
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, justifyContent: 'center', minHeight: '50vh', marginTop: '16px' }}>
          <div style={{ textAlign: 'center', maxWidth: '580px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>Set Up Your Investment Portfolio</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.6' }}>
              Choose how you want to load your holdings. You can upload your Zerodha Console spreadsheet for auto-syncing, or log individual stock holdings manually.
            </p>
          </div>

          <div className="investments-actions-grid" style={{ maxWidth: '860px', width: '100%', margin: '0 auto' }}>
            {/* Import Action Card (Empty State) - Opens import-only modal directly */}
            <div className="glass-card action-card cursor-pointer" onClick={handleEmptyStateImportClick}>
              <div className="action-icon-wrap bg-cyan-glow">
                <FileSpreadsheet size={24} />
              </div>
              <h4>Import Broker Statement</h4>
              <p>
                Directly upload your holdings `.xlsx` spreadsheet or `.csv` export downloaded from Zerodha Console or generic files.
              </p>
              <div className="upload-dropzone-dummy">
                <FileUp size={20} style={{ color: 'var(--secondary)' }} />
                <span>Open Statement Upload Dialog</span>
              </div>
            </div>

            {/* Manual Action Card (Empty State) - Opens manual-only modal directly */}
            <div className="glass-card action-card cursor-pointer" onClick={() => { setManualType('equity'); setModalMode('manual_only'); setShowUpdateModal(true); }}>
              <div className="action-icon-wrap bg-purple-glow">
                <Plus size={24} />
              </div>
              <h4>Add Holdings Manually</h4>
              <p>
                Manually enter stock symbols or mutual fund names, quantities, and average purchase costs.
              </p>
              <div className="manual-entry-zone-dummy">
                <Plus size={20} style={{ color: 'var(--primary)' }} />
                <span>Open Manual Asset Form</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Dashboard Stats and Charts
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

          {filteredInvestments.length === 0 ? (
            <div className="glass-card empty-tab-card" style={{ padding: '48px', textAlign: 'center', marginTop: '24px' }}>
              <HelpCircle size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <h3>No items in this category</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
                You haven't added any {activeTab === 'stocks' ? 'stocks' : 'mutual funds'} to your portfolio yet. Click "Update Latest Investments" to log some.
              </p>
            </div>
          ) : (
            /* Visual Grid */
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
                        <span className="legend-name" title={entry.name}>{entry.name}</span>
                        <span className="legend-value">{totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Holdings Table */}
              <div className="glass-card table-card">
                <div className="card-header">
                  <TrendingUp size={18} className="primary-color" />
                  <h3>{activeTab === 'all' ? 'All Portfolio Assets' : activeTab === 'stocks' ? 'Stock Positions' : 'Mutual Funds NAVs'}</h3>
                </div>
                <div className="table-responsive">
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Asset Details</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Avg. Price</th>
                        <th className="text-right">Current Price</th>
                        <th className="text-right">Total P&L</th>
                        <th className="text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvestments.map((inv) => {
                        const cost = inv.quantity * inv.avgCost;
                        const value = inv.quantity * (inv.currentPrice || inv.avgCost);
                        const pnl = value - cost;
                        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
                        return (
                          <tr key={inv.symbol} className="table-row">
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span className="stock-ticker">{inv.symbol}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                                  <span>{inv.type === 'mutual_fund' ? 'Mutual Fund' : 'Stock'}</span>
                                  {inv.isin && <span>• {inv.isin}</span>}
                                  {inv.sector && inv.sector !== '-' && <span>• {inv.sector}</span>}
                                </span>
                              </div>
                            </td>
                            <td className="text-right font-bold">{inv.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                            <td className="text-right">₹ {inv.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                            <td className="text-right">₹ {(inv.currentPrice || inv.avgCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                            <td className={`text-right font-bold ${pnl >= 0 ? 'success-color' : 'danger-color'}`}>
                              <div className="pnl-row-value">
                                {pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                                <span>₹ {pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                              </div>
                              <span className="pnl-pct-label">({pnl >= 0 ? '+' : ''}{pct.toFixed(2)}%)</span>
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
          )}
        </>
      )}

      {/* PORTAL MOUNTED UNIFIED POPUP MODAL */}
      {showUpdateModal && createPortal(
        <div className="drawer-overlay" onClick={() => { if (parsingStatus !== 'reading') setShowUpdateModal(false); }}>
          <div className={`glass-card modal-content-centered ${isNarrowModal ? 'modal-narrow' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Briefcase size={22} className="primary-color" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  {modalMode === 'manual_only' ? 'Log Asset Holding' : modalMode === 'import_only' ? 'Upload Portfolio File' : 'Update Portfolio Investments'}
                </h3>
              </div>
              <button 
                className="btn-close" 
                onClick={() => { if (parsingStatus !== 'reading') setShowUpdateModal(false); }}
                disabled={parsingStatus === 'reading'}
              >
                <X size={20} />
              </button>
            </div>

            {selectedFile ? (
              // Active file import/parsing screen inside modal
              <div className="modal-import-flow">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {parsingStatus !== 'imported' && (
                    <div className="import-file-meta">
                      <FileSpreadsheet size={28} className="secondary-color" />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span className="import-file-name" title={selectedFile.name}>
                          {selectedFile.name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB • Broker: {selectedBroker === 'zerodha' ? 'Zerodha Console' : 'Generic'}
                        </span>
                      </div>
                    </div>
                  )}

                  {parsingStatus === 'reading' && (
                    <div className="import-status-box loading">
                      <div className="spinner glow-active" />
                      <span>Reading statement & parsing sheets...</span>
                    </div>
                  )}

                  {parsingStatus === 'success' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="import-status-box success">
                        <CheckCircle2 size={20} className="success-color" />
                        <div>
                          <span style={{ fontWeight: 600, display: 'block' }}>Parsed Successfully</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Detected <strong>{parsedInvestments.filter(i => i.type === 'equity').length}</strong> stock positions and <strong>{parsedInvestments.filter(i => i.type === 'mutual_fund').length}</strong> mutual funds.
                          </span>
                        </div>
                      </div>

                      <div className="import-warning-box">
                        <AlertTriangle size={18} className="warning-color" style={{ flexShrink: 0 }} />
                        <span>
                          <strong>Warning:</strong> Confirming this import will overwrite your existing stocks and mutual funds portfolio in Kosha database.
                        </span>
                      </div>
                    </div>
                  )}

                  {parsingStatus === 'imported' && (
                    <div className="import-status-box complete">
                      <div className="complete-check-icon">✓</div>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Import Successful</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Successfully imported <strong>{parsedInvestments.length}</strong> holdings.
                        </p>
                      </div>
                    </div>
                  )}

                  {parsingStatus === 'error' && (
                    <div className="import-status-box error">
                      <AlertTriangle size={20} className="danger-color" />
                      <div>
                        <span style={{ fontWeight: 600, display: 'block' }}>Import Failed</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                          {parsingError || 'Check that column headers match the requirements.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="import-modal-footer">
                  {parsingStatus === 'success' && (
                    <button className="btn btn-primary btn-full" onClick={handleConfirmImport}>
                      Confirm
                    </button>
                  )}
                  {parsingStatus === 'imported' && (
                    <button className="btn btn-primary btn-full" onClick={() => { handleCancelImport(); setShowUpdateModal(false); }}>
                      Done
                    </button>
                  )}
                  {parsingStatus === 'error' && (
                    <label className="btn btn-primary btn-full cursor-pointer">
                      <span>Try Another File</span>
                      <input 
                        type="file" 
                        accept=".csv,.xlsx,.xls" 
                        className="display-none"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                  {parsingStatus !== 'imported' && (
                    <button className="btn btn-secondary btn-full" onClick={handleCancelImport}>
                      {modalMode === 'import_only' ? 'Cancel' : 'Back to options'}
                    </button>
                  )}
                </div>
              </div>
            ) : modalMode === 'manual_only' ? (
              // Manual Form Only layout
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Plus size={18} className="primary-color" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Enter Asset Details</h4>
                </div>
                {renderManualFormContent()}
              </div>
            ) : modalMode === 'import_only' ? (
              // File Upload Only layout
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <FileSpreadsheet size={18} className="secondary-color" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Select Statement File</h4>
                </div>
                {renderUploadCardContent()}
              </div>
            ) : (
              // Both side-by-side (modalMode === 'both')
              <div className="modal-dual-cards">
                {/* File Upload Card */}
                <div className="modal-sub-card">
                  <div className="sub-card-header">
                    <FileSpreadsheet size={20} className="secondary-color" />
                    <h4>Import Statement File</h4>
                  </div>
                  <p className="sub-card-desc">
                    Upload your holdings report to bulk update. Supports custom sheet logic for Zerodha statements.
                  </p>
                  {renderUploadCardContent()}
                </div>

                {/* Manual Add Card */}
                <div className="modal-sub-card">
                  <div className="sub-card-header">
                    <Plus size={20} className="primary-color" />
                    <h4>Log Holding Manually</h4>
                  </div>
                  <p className="sub-card-desc">
                    Manually add a single stock or mutual fund holding to your tracking list.
                  </p>
                  {renderManualFormContent()}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .display-none {
          display: none !important;
        }

        .btn-delete-action {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn-delete-action:hover {
          color: var(--danger);
          background: var(--danger-glow);
        }

        /* Core View Layout and Scroll alignment */
        .view-container {
          flex: 1; 
          padding: 32px 40px; 
          height: 100vh;
          overflow-y: auto; 
          overflow-x: hidden;
          display: flex; 
          flex-direction: column; 
          gap: 24px;
        }

        .view-header-row {
          display: flex; 
          align-items: flex-start;
          justify-content: space-between; 
          flex-wrap: wrap; 
          gap: 12px;
        }

        /* Premium Glowing Header Button */
        .btn-premium-glow {
          position: relative;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
          padding: 10px 20px;
          border-radius: var(--border-radius-md);
          font-family: var(--font-body);
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          overflow: hidden;
          outline: none;
        }

        .btn-premium-glow::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          opacity: 0;
          z-index: 1;
          transition: opacity 0.3s ease;
        }

        .btn-premium-glow:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.25);
          color: #fff;
          box-shadow: 
            0 0 20px rgba(139, 92, 246, 0.25), 
            0 0 40px rgba(6, 182, 212, 0.15);
        }

        .btn-premium-glow:hover::before {
          opacity: 0.15;
        }

        .btn-premium-glow > * {
          position: relative;
          z-index: 2;
        }

        /* Investments Tabs Layout */
        .investments-tabs-row {
          margin-bottom: 24px;
        }
        .investments-tabs {
          display: flex;
          gap: 6px;
          background: rgba(255, 255, 255, 0.02);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid var(--border-glass);
          width: fit-content;
        }
        .tab-btn {
          background: transparent;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          color: var(--text-secondary);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          outline: none;
        }
        .tab-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
        }
        .tab-btn.active {
          background: var(--primary);
          color: #fff;
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        /* Stats Row */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }
        .stat-card {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .stat-label {
          font-size: 0.82rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .stat-value {
          font-family: var(--font-heading);
          font-size: 1.7rem;
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
        .warning-color {
          color: var(--warning) !important;
        }

        /* Visuals Grid */
        .visuals-grid {
          display: grid;
          grid-template-columns: 360px 1fr;
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
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 16px;
          border-top: 1px solid var(--border-glass);
          padding-top: 16px;
          max-height: 180px;
          overflow-y: auto;
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
          flex-shrink: 0;
        }
        .legend-name {
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 180px;
        }
        .legend-value {
          color: var(--text-primary);
          font-weight: 600;
          margin-left: auto;
        }

        /* Holdings Table */
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
          font-size: 0.78rem;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-glass);
          text-transform: uppercase;
          font-weight: 600;
        }
        .holdings-table td {
          padding: 14px 12px;
          font-size: 0.85rem;
          border-bottom: 1px solid var(--border-glass);
          vertical-align: middle;
        }
        .stock-ticker {
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-heading);
          font-size: 0.95rem;
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
          font-size: 0.72rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        
        /* Unified Modal Style */
        .modal-content-centered {
          width: 780px;
          max-width: 95vw;
          max-height: 90vh;
          overflow-y: auto;
          background: rgba(13, 17, 27, 0.94);
          backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          transition: width 0.3s ease, max-width 0.3s ease;
        }
        @media (max-width: 768px) {
          .modal-content-centered {
            width: 480px;
          }
        }
        
        .modal-content-centered.modal-narrow {
          width: 480px;
        }
        
        .modal-dual-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          padding: 24px;
          background: rgba(0, 0, 0, 0.2);
        }
        @media (max-width: 768px) {
          .modal-dual-cards {
            grid-template-columns: 1fr;
            gap: 16px;
            max-height: 70vh;
            overflow-y: auto;
          }
        }
        
        .modal-sub-card {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          min-height: 340px;
          transition: all 0.3s ease;
        }
        .modal-sub-card:hover {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
        }
        
        .sub-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .sub-card-header h4 {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .sub-card-desc {
          font-size: 0.78rem;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-bottom: 8px;
        }
        .upload-dropzone {
          border: 1px dashed rgba(6, 182, 212, 0.25);
          border-radius: 8px;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(6, 182, 212, 0.01);
          transition: all 0.2s ease;
          text-align: center;
        }
        .upload-dropzone:hover {
          background: rgba(6, 182, 212, 0.03);
          border-color: var(--secondary);
          box-shadow: 0 0 15px var(--secondary-glow);
        }
        
        .upload-dropzone-dummy, .manual-entry-zone-dummy {
          width: 100%;
          border: 1px dashed var(--border-glass);
          border-radius: 8px;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.01);
          color: var(--text-muted);
          font-size: 0.8rem;
          margin-top: 16px;
          text-align: center;
          transition: all 0.2s ease;
        }
        .action-card:hover .upload-dropzone-dummy {
          border-color: var(--secondary);
          background: rgba(6, 182, 212, 0.03);
          color: var(--secondary);
        }
        .action-card:hover .manual-entry-zone-dummy {
          border-color: var(--primary);
          background: rgba(139, 92, 246, 0.03);
          color: var(--primary);
        }
        
        /* Modal Import Flow Screen */
        .modal-import-flow {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .import-file-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-glass);
        }
        .import-file-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          max-width: 480px;
        }
        
        .import-status-box {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-radius: 8px;
          font-size: 0.88rem;
        }
        .import-status-box.loading {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-glass);
          color: var(--text-secondary);
        }
        .import-status-box.success {
          background: rgba(16, 185, 129, 0.06);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--success);
        }
        .import-status-box.complete {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid var(--success);
          color: var(--text-primary);
          flex-direction: column;
          text-align: center;
          padding: 24px;
          gap: 16px;
        }
        .import-status-box.error {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--danger);
        }
        
        .complete-check-icon {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.1);
          border: 2px solid var(--success);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--success);
          font-size: 1.8rem;
          font-weight: bold;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.25);
          animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .import-warning-box {
          padding: 12px 14px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.06);
          border: 1px solid rgba(245, 158, 11, 0.18);
          font-size: 0.78rem;
          color: var(--warning);
          line-height: 1.4;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        
        .import-modal-footer {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .import-modal-footer btn, .import-modal-footer label {
          flex: 1;
        }
        
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-glass);
          border-top-color: var(--secondary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
