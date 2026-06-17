import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { Investment } from '../../db/database';
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
import { parseZerodhaHoldings } from '../../utils/parsers/zerodha_holdings';
import { parseGenericHoldings, parseGenericCsv } from '../../utils/parsers/generic_holdings';
import './InvestmentsView.css';

export const InvestmentsView: React.FC = () => {
  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'all' | 'stocks' | 'mutual_funds'>('all');
  
  // Modal toggle & Mode state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [modalMode, setModalMode] = useState<'both' | 'import_only' | 'manual_only'>('both');
  const [openedFromHeader, setOpenedFromHeader] = useState(false);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  // Deletion Modal state
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [symbolToDelete, setSymbolToDelete] = useState<string | null>(null);

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
      if (openedFromHeader) {
        setModalMode('both');
      } else {
        setShowUpdateModal(false);
      }
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

  const handleDeleteClick = (id: string) => {
    setSymbolToDelete(id);
    setShowDeleteConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (!symbolToDelete) return;
    try {
      await db.investments.delete(symbolToDelete);
      setShowDeleteConfirmModal(false);
      setSymbolToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmptyStateImportClick = () => {
    setSelectedBroker('zerodha'); // Default to Zerodha
    setOpenedFromHeader(false);
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

  const toTitleCase = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Chart Data preparation (Grouped by Sector)
  const sectorGroups: { [key: string]: number } = {};
  filteredInvestments.forEach(inv => {
    let sectorName = '';
    if (inv.type === 'mutual_fund') {
      sectorName = 'MF';
    } else {
      sectorName = inv.sector ? inv.sector.trim() : '';
      if (sectorName === '-' || sectorName === '') {
        sectorName = 'Other Sectors';
      } else {
        sectorName = toTitleCase(sectorName);
      }
    }
    const val = Math.round(inv.quantity * (inv.currentPrice || inv.avgCost));
    sectorGroups[sectorName] = (sectorGroups[sectorName] || 0) + val;
  });

  const chartData = Object.keys(sectorGroups)
    .map(name => ({
      name,
      value: sectorGroups[name]
    }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Display all sectors (no slice or "Others" grouping)
  const topHoldings = chartData;

  const COLORS = [
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#3b82f6', // Blue
    '#14b8a6', // Teal
    '#f43f5e', // Rose
    '#a855f7', // Purple-light
    '#6b7280'  // Gray
  ];

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
            <button className="btn-premium-glow" onClick={() => { setOpenedFromHeader(true); setModalMode('both'); setShowUpdateModal(true); }}>
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
            <div className="glass-card action-card cursor-pointer" onClick={() => { setManualType('equity'); setOpenedFromHeader(false); setModalMode('manual_only'); setShowUpdateModal(true); }}>
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
                <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PieChartIcon size={18} className="secondary-color" />
                    <h3 style={{ margin: 0 }}>Asset Allocation</h3>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, paddingLeft: '26px' }}>Sector-wise Distribution</span>
                </div>
                <div className="pie-chart-container">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={topHoldings}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                        labelLine={{ stroke: 'rgba(255, 255, 255, 0.25)', strokeWidth: 1 }}
                        label={({ percent }) => `${((percent || 0) * 100).toFixed(1)}%`}
                        onMouseEnter={(_, index) => {
                          if (topHoldings[index]) {
                            setHoveredSymbol(topHoldings[index].name);
                          }
                        }}
                        onMouseLeave={() => setHoveredSymbol(null)}
                      >
                        {topHoldings.map((entry, index) => {
                          const isSliceHighlighted = (sliceName: string) => {
                            if (!hoveredSymbol) return true;
                            return hoveredSymbol === sliceName;
                          };

                          const opacity = isSliceHighlighted(entry.name) ? 1.0 : 0.25;

                          return (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={COLORS[index % COLORS.length]} 
                              style={{ 
                                opacity, 
                                transition: 'opacity 0.2s ease', 
                                cursor: 'pointer'
                              }}
                            />
                          );
                        })}
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
                    {topHoldings.map((entry, idx) => {
                      const isLegendHighlighted = !hoveredSymbol || hoveredSymbol === entry.name;
                      const opacity = isLegendHighlighted ? 1.0 : 0.35;
                      return (
                        <div 
                          key={entry.name} 
                          className="legend-item cursor-pointer"
                          style={{ 
                            opacity, 
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseEnter={() => setHoveredSymbol(entry.name)}
                          onMouseLeave={() => setHoveredSymbol(null)}
                        >
                          <span className="legend-dot" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="legend-name" title={entry.name}>{entry.name}</span>
                          <span className="legend-value">{totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : 0}%</span>
                        </div>
                      );
                    })}
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

                        const isRowHighlighted = () => {
                           if (!hoveredSymbol) return true;
                           
                           let invSector = '';
                           if (inv.type === 'mutual_fund') {
                             invSector = 'MF';
                           } else {
                             invSector = inv.sector ? inv.sector.trim() : '';
                             if (invSector === '-' || invSector === '') {
                               invSector = 'Other Sectors';
                             } else {
                               invSector = toTitleCase(invSector);
                             }
                           }

                           return hoveredSymbol === invSector;
                         };

                        const rowClass = `table-row ${isRowHighlighted() ? 'row-active' : 'row-dimmed'}`;

                        let displaySector = '';
                        if (inv.type === 'mutual_fund') {
                          displaySector = 'MF';
                        } else if (inv.sector && inv.sector !== '-') {
                          displaySector = toTitleCase(inv.sector.trim());
                        }

                        return (
                          <tr 
                            key={inv.symbol} 
                            className={rowClass}
                            onMouseEnter={() => {
                               let invSector = '';
                               if (inv.type === 'mutual_fund') {
                                 invSector = 'MF';
                               } else {
                                 invSector = inv.sector ? inv.sector.trim() : '';
                                 if (invSector === '-' || invSector === '') {
                                   invSector = 'Other Sectors';
                                 } else {
                                   invSector = toTitleCase(invSector);
                                 }
                               }
                               setHoveredSymbol(invSector);
                             }}
                            onMouseLeave={() => setHoveredSymbol(null)}
                          >
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span className="stock-ticker">{inv.symbol}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                                  <span>{inv.type === 'mutual_fund' ? 'Mutual Fund' : 'Stock'}</span>
                                  {inv.isin && <span>• {inv.isin}</span>}
                                  {displaySector && <span>• {displaySector}</span>}
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
                              <button className="btn-delete-action" onClick={() => inv.symbol && handleDeleteClick(inv.symbol)}>
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
                      {modalMode === 'import_only' && !openedFromHeader ? 'Cancel' : 'Back to options'}
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
                {openedFromHeader && (
                  <button 
                    className="btn btn-secondary btn-full" 
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => setModalMode('both')}
                  >
                    Back to options
                  </button>
                )}
              </div>
            ) : modalMode === 'import_only' ? (
              // File Upload Only layout
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <FileSpreadsheet size={18} className="secondary-color" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Select Statement File</h4>
                </div>
                {renderUploadCardContent()}
                {openedFromHeader && (
                  <button 
                    className="btn btn-secondary btn-full" 
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => setModalMode('both')}
                  >
                    Back to options
                  </button>
                )}
              </div>
            ) : (
              // Both side-by-side (modalMode === 'both')
              <div className="modal-dual-cards">
                {/* File Upload Option Card */}
                <div className="modal-sub-card action-card cursor-pointer" onClick={() => setModalMode('import_only')}>
                  <div className="sub-card-header">
                    <div className="action-icon-wrap bg-cyan-glow" style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileSpreadsheet size={20} className="secondary-color" />
                    </div>
                    <h4>Import Broker Statement</h4>
                  </div>
                  <p className="sub-card-desc" style={{ flexGrow: 1 }}>
                    Directly upload your holdings `.xlsx` spreadsheet or `.csv` export downloaded from Zerodha Console or generic files.
                  </p>
                  <div className="upload-dropzone-dummy" style={{ marginTop: 'auto' }}>
                    <FileUp size={20} style={{ color: 'var(--secondary)' }} />
                    <span>Open Statement Upload Dialog</span>
                  </div>
                </div>

                {/* Manual Add Option Card */}
                <div className="modal-sub-card action-card cursor-pointer" onClick={() => { setManualType('equity'); setModalMode('manual_only'); }}>
                  <div className="sub-card-header">
                    <div className="action-icon-wrap bg-purple-glow" style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={20} className="primary-color" />
                    </div>
                    <h4>Add Holdings Manually</h4>
                  </div>
                  <p className="sub-card-desc" style={{ flexGrow: 1 }}>
                    Manually enter stock symbols or mutual fund names, quantities, and average purchase costs.
                  </p>
                  <div className="manual-entry-zone-dummy" style={{ marginTop: 'auto' }}>
                    <Plus size={20} style={{ color: 'var(--primary)' }} />
                    <span>Open Manual Asset Form</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {showDeleteConfirmModal && symbolToDelete && createPortal(
        <div className="drawer-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="glass-card modal-content-centered modal-narrow delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} className="danger-color" style={{ color: 'var(--danger)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Confirm Deletion</h3>
              </div>
              <button className="btn-close" onClick={() => setShowDeleteConfirmModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--danger)', textShadow: '0 0 10px rgba(239, 68, 68, 0.2)' }}>{symbolToDelete}</strong> from your portfolio?
              </p>
              
              <div style={{ padding: '12px 14px 12px 18px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.78rem', color: 'var(--danger)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>This action is permanent and will completely remove all quantities and cost history for this asset from your dashboard.</span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button className="btn btn-secondary btn-full" onClick={() => setShowDeleteConfirmModal(false)} style={{ flex: 1, margin: 0 }}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-full" onClick={confirmDelete} style={{ flex: 1, margin: 0, background: 'var(--danger)', color: '#fff', border: 'none' }}>
                  Delete Holding
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
