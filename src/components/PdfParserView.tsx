import React, { useState, useRef, useEffect } from 'react';
import { db, getSetting } from '../db/database';
import type { Transaction, SalarySlip, ParsedPdf, Category } from '../db/database';
import { renderPdfPageToCanvas, extractPagesFromPdf } from '../services/pdfParser';
import { parseSalarySlipWithGemini, isGeminiFallbackError, parseChunkWithGemini } from '../services/gemini';
import { parseBankStatementWithGroq, parseSalarySlipWithGroq } from '../services/groq';
import {
  FileUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  ArrowRight,
  Check,
  X,
  RefreshCw,
  Settings,
  History,
  Trash2,
  ChevronDown,
  FileText,
  Cpu,
  CalendarDays,
  Hash,
  Sparkles,
} from 'lucide-react';

type LlmProvider = 'gemini' | 'groq';

export const PdfParserView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'bank' | 'salary' | 'history'>('bank');
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [groqApiKey, setGroqApiKey] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>('gemini');

  // Password states
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');

  // Status states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Parsing results
  const [parsedTransactions, setParsedTransactions] = useState<Transaction[]>([]);
  const [parsedSalarySlip, setParsedSalarySlip] = useState<SalarySlip | null>(null);
  const [lastUsedProvider, setLastUsedProvider] = useState<LlmProvider>('gemini');

  // Session states for progress caching & resuming
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [sessionTransactions, setSessionTransactions] = useState<Transaction[]>([]);
  const [sessionSalarySlip, setSessionSalarySlip] = useState<SalarySlip | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState<boolean>(false);

  // PDF preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Categories from DB
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  // History
  const [parsedPdfs, setParsedPdfs] = useState<ParsedPdf[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const key = await getSetting('geminiApiKey', '');
      const groqKey = await getSetting('groqApiKey', '');
      setApiKey(key || null);
      setGroqApiKey(groqKey || null);

      // Load categories
      const cats = await db.categories.toArray();
      setAllCategories(cats);
    }
    init();
  }, []);

  // Load history whenever the history tab is opened
  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    const all = await db.parsedPdfs.orderBy('parsedAt').reverse().toArray();
    setParsedPdfs(all);
  };

  const bothKeysPresent = !!(apiKey && groqApiKey);

  // ─── File handlers ───────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]?.type === 'application/pdf') {
      setFile(e.dataTransfer.files[0]);
      setError(null);
      resetResults();
    } else {
      setError('Only PDF documents are supported.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError(null);
      resetResults();
    }
  };

  const resetResults = () => {
    setParsedTransactions([]);
    setParsedSalarySlip(null);
    setShowPdfPreview(false);
    setSuccess(null);
    setPasswordRequired(false);
    setPdfPassword('');
    setExtractedPages([]);
    setCurrentPageIndex(0);
    setSessionTransactions([]);
    setSessionSalarySlip(null);
    setResumeAvailable(false);
  };

  // ─── Analysis ────────────────────────────────────────────────────────────────

  const parsePagesLoop = async (
    pages: string[],
    startIndex: number,
    initialTxs: Transaction[],
    initialSlip: SalarySlip | null,
    provider: LlmProvider,
    activePassword?: string
  ) => {
    let currentProvider = provider;
    let accumulatedTxs = [...initialTxs];
    let accumulatedSlip = initialSlip;
    const totalPages = pages.length;

    setResumeAvailable(false);

    for (let i = startIndex; i < totalPages; i++) {
      setCurrentPageIndex(i);
      const providerLabel = currentProvider === 'groq' ? 'Groq' : 'Gemini';
      setLoadingStep(`Analyzing Page ${i + 1} of ${totalPages} with ${providerLabel}...`);

      let pageTxs: Transaction[] = [];
      let pageSlip: SalarySlip | null = null;
      let success = false;
      let attempt = 1;
      const maxAttempts = 3;
      let retryDelay = 2000;

      while (!success && attempt <= maxAttempts) {
        try {
          if (activeTab === 'bank') {
            if (currentProvider === 'gemini') {
              const rawTxs = await parseChunkWithGemini(pages[i], i, totalPages, apiKey!);
              pageTxs = rawTxs.map((tx: any) => ({
                ...tx,
                id: tx.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                source: 'bank_statement' as const,
                category: tx.category || 'Others',
                pdfName: file!.name,
              }));
            } else {
              if (!groqApiKey) throw new Error('Groq API key not configured.');
              const rawTxs = await parseBankStatementWithGroq(pages[i], groqApiKey);
              pageTxs = rawTxs.map((tx: any) => ({
                ...tx,
                pdfName: file!.name,
              }));
            }
          } else {
            if (currentProvider === 'gemini') {
              pageSlip = await parseSalarySlipWithGemini(pages[i], apiKey!);
            } else {
              if (!groqApiKey) throw new Error('Groq API key not configured.');
              pageSlip = await parseSalarySlipWithGroq(pages[i], groqApiKey);
            }
            if (pageSlip) {
              pageSlip.pdfName = file!.name;
            }
          }
          success = true;
        } catch (err: any) {
          const isRateLimit = isGeminiFallbackError(err) || err.message?.includes('429') || err.message?.includes('limit');
          
          if (isRateLimit && attempt < maxAttempts) {
            setLoadingStep(`Rate limit hit on ${providerLabel}. Retrying Page ${i + 1} in ${retryDelay / 1000}s (Attempt ${attempt} of ${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
            attempt++;
          } else {
            const fallbackAvailable = currentProvider === 'gemini' ? !!groqApiKey : !!apiKey;
            if (fallbackAvailable && isRateLimit) {
              const nextProvider = currentProvider === 'gemini' ? 'groq' : 'gemini';
              const nextLabel = nextProvider === 'groq' ? 'Groq' : 'Gemini';
              setLoadingStep(`Quota/Limit hit on ${providerLabel} — switching to ${nextLabel}...`);
              console.warn(`${currentProvider} failed, falling back to ${nextProvider} on Page ${i + 1}:`, err.message);
              currentProvider = nextProvider;
              attempt = 1;
              retryDelay = 2000;
              continue;
            } else {
              setResumeAvailable(true);
              throw err;
            }
          }
        }
      }

      if (activeTab === 'bank') {
        accumulatedTxs.push(...pageTxs);
        const seen = new Set<string>();
        accumulatedTxs = accumulatedTxs.filter(tx => {
          const key = `${tx.date}|${tx.description}|${tx.amount}|${tx.type}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSessionTransactions(accumulatedTxs);
      } else if (pageSlip) {
        accumulatedSlip = pageSlip;
        setSessionSalarySlip(accumulatedSlip);
      }

      setLastUsedProvider(currentProvider);

      if (i < totalPages - 1) {
        setLoadingStep(`Page ${i + 1} parsed. Waiting 1.5s to space out requests...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (activeTab === 'bank') {
      setParsedTransactions(accumulatedTxs);
    } else if (accumulatedSlip) {
      setParsedSalarySlip(accumulatedSlip);
    }

    const finalLabel = currentProvider === 'groq' ? 'Groq · Llama 3.3 70B' : 'Gemini 2.5 Flash';
    setSuccess(`✅ PDF parsed via ${finalLabel}! Review and confirm the data below.`);
    setPasswordRequired(false);
    setPdfPassword('');
    setIsLoading(false);
    setResumeAvailable(false);

    setTimeout(() => {
      if (canvasRef.current) {
        renderPdfPageToCanvas(file!, 1, canvasRef.current, activePassword)
          .then(() => setShowPdfPreview(true))
          .catch(() => setShowPdfPreview(false));
      }
    }, 500);
  };

  const triggerAnalysis = async (customPassword?: string) => {
    if (!file || !apiKey) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setResumeAvailable(false);

    const activePassword = customPassword || pdfPassword;

    try {
      setLoadingStep('Extracting pages from PDF...');
      const pages = await extractPagesFromPdf(file, activePassword);
      setExtractedPages(pages);
      setCurrentPageIndex(0);
      setSessionTransactions([]);
      setSessionSalarySlip(null);

      await parsePagesLoop(pages, 0, [], null, selectedProvider, activePassword);
    } catch (err: any) {
      console.error(err);
      if (err?.message === 'PasswordRequired') {
        setPasswordRequired(true);
        setError('This PDF is password-protected. Please enter the password.');
      } else if (err?.message === 'PasswordIncorrect') {
        setPasswordRequired(true);
        setError('Incorrect password. Please try again.');
      } else {
        setError(err?.message || 'Failed to process document. You can resume once the issue is resolved.');
      }
      setIsLoading(false);
    }
  };

  const resumeAnalysis = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setResumeAvailable(false);

    const activePassword = pdfPassword;

    try {
      await parsePagesLoop(
        extractedPages,
        currentPageIndex,
        sessionTransactions,
        sessionSalarySlip,
        lastUsedProvider,
        activePassword
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to resume parsing.');
      setIsLoading(false);
    }
  };

  // ─── Transaction / Salary edit handlers ───────────────────────────────────

  const handleTxChange = (index: number, field: keyof Transaction, value: any) => {
    const updated = [...parsedTransactions];
    updated[index] = { ...updated[index], [field]: value };
    setParsedTransactions(updated);
  };

  const handleRemoveTx = (index: number) => {
    setParsedTransactions(parsedTransactions.filter((_, i) => i !== index));
  };

  const handleSalaryChange = (field: keyof SalarySlip, value: any) => {
    if (!parsedSalarySlip) return;
    setParsedSalarySlip({ ...parsedSalarySlip, [field]: value });
  };

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    try {
      if (activeTab === 'bank') {
        if (parsedTransactions.length === 0) return;

        // Save a ParsedPdf record first
        const pdfRecord: ParsedPdf = {
          filename: file?.name || 'Unknown PDF',
          parsedAt: new Date().toISOString(),
          transactionCount: parsedTransactions.length,
          llmUsed: lastUsedProvider,
          type: 'bank',
        };
        const pdfId = await db.parsedPdfs.add(pdfRecord);
        const pdfSourceId = String(pdfId);

        const hasSwapped = parsedTransactions.some(tx => {
          const parts = tx.date.split('-');
          return parts.length === 3 && parseInt(parts[1]) > 12;
        });

        const normalizeDate = (dateStr: string) => {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const y = parts[0];
            const d = parts[1];
            const m = parts[2];
            if (hasSwapped) {
              const pad = (s: string) => s.padStart(2, '0');
              return `${y}-${pad(m)}-${pad(d)}`;
            }
          }
          return dateStr;
        };

        const toInsert = parsedTransactions.map(tx => ({
          ...tx,
          date: normalizeDate(tx.date),
          id: tx.id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          pdfSourceId,
        }));

        await db.transactions.bulkAdd(toInsert);
        localStorage.setItem('kosha_show_smart_review_banner', 'true');
        setSuccess(`Successfully imported ${toInsert.length} transactions to your ledger!`);
        setParsedTransactions([]);
        setFile(null);
        setShowPdfPreview(false);

      } else if (activeTab === 'salary') {
        if (!parsedSalarySlip) return;

        // Clear existing slips for the same month & year to prevent duplicates and orphaned transactions
        const existingSlips = await db.salarySlips
          .where('[year+month]')
          .equals([parsedSalarySlip.year, parsedSalarySlip.month])
          .toArray();

        for (const oldSlip of existingSlips) {
          if (oldSlip.pdfSourceId) {
            const oldTxs = await db.transactions.where('pdfSourceId').equals(oldSlip.pdfSourceId).toArray();
            for (const tx of oldTxs) {
              if (tx.id) {
                await db.reconDecisions.where('transactionId').equals(tx.id).delete();
                await db.transactions.delete(tx.id);
              }
            }
            await db.parsedPdfs.delete(oldSlip.pdfSourceId);
          }
          if (oldSlip.id) {
            await db.reconDecisions.where('salarySlipId').equals(oldSlip.id).delete();
            await db.salarySlips.delete(oldSlip.id);
          }
        }

        // Save ParsedPdf record
        const pdfRecord: ParsedPdf = {
          filename: file?.name || 'Unknown PDF',
          parsedAt: new Date().toISOString(),
          transactionCount: 1,
          llmUsed: lastUsedProvider,
          type: 'salary',
        };
        const pdfId = await db.parsedPdfs.add(pdfRecord);
        const pdfSourceId = String(pdfId);

        const slipToSave = { ...parsedSalarySlip, pdfSourceId };
        await db.salarySlips.add(slipToSave);

        // Also add salary as a transaction
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const slipMonth = monthNames[parsedSalarySlip.month - 1] || 'Salary';

        const salaryTx: Transaction = {
          id: 'sal-' + Date.now().toString(),
          date: `${parsedSalarySlip.year}-${String(parsedSalarySlip.month).padStart(2, '0')}-01`,
          description: `Salary Credited (${slipMonth} ${parsedSalarySlip.year})`,
          amount: parsedSalarySlip.netPay,
          type: 'credit',
          category: 'Salary',
          source: 'bank_statement',
          pdfName: file?.name,
          pdfSourceId,
        };
        await db.transactions.add(salaryTx);
        localStorage.setItem('kosha_show_smart_review_banner', 'true');

        setSuccess(`Salary slip imported! Net Pay ₹${parsedSalarySlip.netPay.toLocaleString()} added.`);
        setParsedSalarySlip(null);
        setFile(null);
        setShowPdfPreview(false);
      }
    } catch (err: any) {
      setError('Import failed: ' + err?.message);
    }
  };

  // ─── Delete PDF + transactions ────────────────────────────────────────────

  const handleDeletePdf = async (pdf: ParsedPdf) => {
    if (!pdf.id) return;
    setDeletingId(String(pdf.id));
    try {
      await db.transaction('rw', db.parsedPdfs, db.transactions, db.salarySlips, async () => {
        const pdfSourceId = String(pdf.id);
        await db.transactions.where('pdfSourceId').equals(pdfSourceId).delete();
        await db.salarySlips.where('pdfSourceId').equals(pdfSourceId).delete();
        await db.parsedPdfs.delete(pdf.id!);
      });
      await loadHistory();
    } catch (e: any) {
      console.error('Delete failed:', e);
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const categoryOptions = allCategories.length > 0
    ? allCategories.map(c => c.label)
    : ['Food','Shopping','Utilities','Travel','Salary','Investment','Health','Entertainment','Others'];

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header">
        <h1>AI PDF Analyzer</h1>
        <p>Drop your bank statements or salary slips to extract all data instantly.</p>
      </header>

      {/* Tabs */}
      <div className="tabs-container">
        <button className={`tab-btn ${activeTab === 'bank' ? 'active' : ''}`}
          onClick={() => { setActiveTab('bank'); resetResults(); setFile(null); }}>
          Bank Statement Parser
        </button>
        <button className={`tab-btn ${activeTab === 'salary' ? 'active' : ''}`}
          onClick={() => { setActiveTab('salary'); resetResults(); setFile(null); }}>
          Salary Slip Analyzer
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}>
          <History size={14} style={{ display: 'inline', marginRight: 6 }} />
          Parse History
        </button>
      </div>

      {/* ── History Tab ── */}
      {activeTab === 'history' && (
        <div className="glass-card history-card">
          <div className="history-header">
            <h3>Parsed PDF Documents</h3>
            <span className="badge-count">{parsedPdfs.length}</span>
          </div>
          {parsedPdfs.length === 0 ? (
            <div className="history-empty">
              <FileText size={32} className="muted-icon" />
              <p>No PDFs parsed yet. Parse a bank statement or salary slip to see your history here.</p>
            </div>
          ) : (
            <div className="history-list">
              {parsedPdfs.map(pdf => (
                <div key={pdf.id} className="history-row">
                  <div className="history-icon-wrap">
                    <FileText size={18} />
                  </div>
                  <div className="history-details">
                    <span className="history-filename">{pdf.filename}</span>
                    <div className="history-meta">
                      <span className={`history-type-badge ${pdf.type}`}>{pdf.type === 'bank' ? 'Bank Statement' : 'Salary Slip'}</span>
                      <span className="history-meta-item">
                        <CalendarDays size={12} />
                        {new Date(pdf.parsedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                      </span>
                      <span className="history-meta-item">
                        <Hash size={12} />
                        {pdf.transactionCount} {pdf.type === 'salary' ? 'slip' : 'transactions'}
                      </span>
                      <span className="history-meta-item">
                        <Cpu size={12} />
                        {pdf.llmUsed === 'gemini' ? 'Gemini 2.5 Flash' : 'Groq · Llama 3.3'}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn-delete-pdf"
                    onClick={() => handleDeletePdf(pdf)}
                    disabled={deletingId === String(pdf.id)}
                    title="Delete PDF and all linked transactions"
                  >
                    {deletingId === String(pdf.id)
                      ? <Loader2 size={15} className="spinning" />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Parse Tabs (Bank / Salary) ── */}
      {activeTab !== 'history' && (
        <>
          {!apiKey ? (
            <div className="glass-card api-warning-card">
              <AlertCircle size={32} className="warning-icon" />
              <div>
                <h3>Gemini API Key Required</h3>
                <p>To analyze PDFs, you must first configure a Google Gemini API Key in Settings.</p>
              </div>
              <button className="btn btn-secondary flex-btn-align" onClick={() => window.location.reload()}>
                <Settings size={16} />
                <span>Go to Settings</span>
              </button>
            </div>
          ) : (
            <>
              {/* LLM Picker — only shown when BOTH keys present and no result yet */}
              {bothKeysPresent && parsedTransactions.length === 0 && !parsedSalarySlip && !isLoading && (
                <div className="glass-card llm-picker-card">
                  <div className="llm-picker-label">
                    <Cpu size={16} className="primary-color-icon" />
                    <span>AI Engine</span>
                  </div>
                  <div className="llm-selector-wrapper">
                    <select
                      className="form-select llm-select"
                      value={selectedProvider}
                      onChange={e => setSelectedProvider(e.target.value as LlmProvider)}
                    >
                      <option value="gemini">✨ Gemini 2.5 Flash (Recommended)</option>
                      <option value="groq">⚡ Groq · Llama 3.3 70B (Fast)</option>
                    </select>
                    <ChevronDown size={14} className="select-chevron" />
                  </div>
                </div>
              )}

              {/* File Upload Zone */}
              {!file && (
                <div
                  className={`glass-card upload-zone ${dragActive ? 'active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input type="file" id="pdf-upload-input" className="display-none" accept=".pdf" onChange={handleFileChange} />
                  <label htmlFor="pdf-upload-input" className="upload-label-box">
                    <div className="upload-icon-wrapper">
                      <FileUp size={36} className="upload-icon" />
                    </div>
                    <h3>Drag & drop your PDF file here</h3>
                    <p>or click to browse files from your computer</p>
                    <span className="file-limit-badge">Supports PDF up to 15MB</span>
                  </label>
                </div>
              )}

              {/* Selected File Card */}
              {file && !isLoading && parsedTransactions.length === 0 && !parsedSalarySlip && (
                <div className="glass-card selected-file-card flex-column-gap">
                  <div className="file-info-row w-100">
                    <FileUp size={24} className="primary-color" />
                    <div className="file-details">
                      <h4>{file.name}</h4>
                      <span>{(file.size / 1024 / 1024).toFixed(2)} MB • PDF Document
                        {bothKeysPresent && (
                          <span className="provider-badge">
                            {selectedProvider === 'gemini' ? '✨ Gemini' : '⚡ Groq'}
                          </span>
                        )}
                      </span>
                    </div>
                    <button className="btn-close-action" onClick={() => { setFile(null); setPasswordRequired(false); setPdfPassword(''); }}>
                      <X size={18} />
                    </button>
                  </div>

                  {passwordRequired ? (
                    <div className="password-prompt-box w-100 animate-fade-in">
                      <div className="form-group-row">
                        <input
                          type="password"
                          className="form-input password-prompt-input"
                          placeholder="Enter PDF password to decrypt"
                          value={pdfPassword}
                          onChange={e => setPdfPassword(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') triggerAnalysis(pdfPassword); }}
                          autoFocus
                        />
                        <button className="btn btn-primary" onClick={() => triggerAnalysis(pdfPassword)}>
                          <span>Unlock & Process</span>
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-primary align-self-end" onClick={() => triggerAnalysis()}>
                      <span>Process Document</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="glass-card loading-card">
                  <Loader2 size={48} className="spinner-icon primary-color" />
                  <h3>Analyzing Document</h3>
                  {extractedPages.length > 0 && (
                    <div style={{
                      width: '100%',
                      maxWidth: '300px',
                      background: 'rgba(255,255,255,0.05)',
                      height: '6px',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      margin: '12px 0 6px 0'
                    }}>
                      <div style={{
                        width: `${((currentPageIndex) / extractedPages.length) * 100}%`,
                        background: 'var(--primary)',
                        height: '100%',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease-out',
                        boxShadow: '0 0 8px var(--primary)'
                      }} />
                    </div>
                  )}
                  <p className="glow-text">{loadingStep}</p>
                </div>
              )}

              {/* Alerts */}
              {error && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <div className="alert alert-error-box">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                  </div>
                  {resumeAvailable && (
                    <button
                      onClick={resumeAnalysis}
                      className="btn btn-primary-glow"
                      style={{
                        padding: '12px 20px',
                        borderRadius: 'var(--border-radius-md)',
                        border: '1px solid hsla(263, 90%, 65%, 0.3)',
                        background: 'var(--primary-glow)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      <RefreshCw size={16} /> Resume Parsing from Page {currentPageIndex + 1}
                    </button>
                  )}
                </div>
              )}

              {success && (
                <div className="alert alert-success-box">
                  <CheckCircle2 size={18} />
                  <span>{success}</span>
                </div>
              )}

              {/* Verification Workspace */}
              {(parsedTransactions.length > 0 || parsedSalarySlip) && (
                <div className={`workspace-split ${showPdfPreview ? 'with-preview' : ''}`}>

                  {/* PDF Preview Sidebar */}
                  <div className="glass-card pdf-preview-card" style={{ display: showPdfPreview ? 'block' : 'none' }}>
                    <div className="preview-header">
                      <Eye size={16} className="secondary-color" />
                      <h4>Statement Page 1 Preview</h4>
                    </div>
                    <div className="canvas-wrapper">
                      <canvas ref={canvasRef} className="pdf-canvas" />
                    </div>
                  </div>

                  {/* Data Verification Table */}
                  <div className="glass-card data-review-card">
                    <div className="review-header-row">
                      <div>
                        <h3>Verify Extracted Data</h3>
                        {activeTab === 'bank' && (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                            {parsedTransactions.length} transactions • Change category using the dropdown per row
                          </p>
                        )}
                      </div>
                      <button className="btn btn-success" onClick={handleImport}>
                        <Check size={16} />
                        <span>Confirm & Import Data</span>
                      </button>
                    </div>

                    {activeTab === 'bank' && (
                      <div className="pdf-summary-bar animate-fade-in" style={{
                        display: 'flex',
                        gap: '24px',
                        padding: '12px 24px',
                        background: 'rgba(255,255,255,0.015)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Credits (Income)</span>
                          <span style={{ fontSize: '1.1rem', color: 'var(--success)', fontWeight: 700 }}>
                            ₹{parsedTransactions.filter(tx => tx.type === 'credit').reduce((s, tx) => s + tx.amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.08)' }} className="hide-on-mobile" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Debits (Expenses)</span>
                          <span style={{ fontSize: '1.1rem', color: 'var(--danger)', fontWeight: 700 }}>
                            ₹{parsedTransactions.filter(tx => tx.type === 'debit').reduce((s, tx) => s + tx.amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.08)' }} className="hide-on-mobile" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Cash Flow</span>
                          {(() => {
                            const credits = parsedTransactions.filter(tx => tx.type === 'credit').reduce((s, tx) => s + tx.amount, 0);
                            const debits = parsedTransactions.filter(tx => tx.type === 'debit').reduce((s, tx) => s + tx.amount, 0);
                            const net = credits - debits;
                            return (
                              <span style={{ fontSize: '1.1rem', color: net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                {net >= 0 ? '+' : ''}₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="review-scroll-container">
                      {activeTab === 'bank' ? (
                        <table className="review-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Description / Vendor</th>
                              <th>Category</th>
                              <th>Type</th>
                              <th>Amount</th>
                              <th className="text-center">Del</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedTransactions.map((tx, idx) => (
                              <tr key={idx} className={tx.category === 'Others' ? 'row-others' : ''}>
                                <td>
                                  <input
                                    type="date"
                                    className="form-input table-input"
                                    value={tx.date}
                                    onChange={e => handleTxChange(idx, 'date', e.target.value)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="form-input table-input"
                                    value={tx.description}
                                    onChange={e => handleTxChange(idx, 'description', e.target.value)}
                                    title={tx.description}
                                  />
                                </td>
                                <td>
                                  <select
                                    className={`form-select table-select ${tx.category === 'Others' ? 'select-others' : ''}`}
                                    value={tx.category}
                                    onChange={e => handleTxChange(idx, 'category', e.target.value)}
                                  >
                                    {categoryOptions.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <select
                                    className="form-select table-select"
                                    value={tx.type}
                                    onChange={e => handleTxChange(idx, 'type', e.target.value as 'debit' | 'credit')}
                                  >
                                    <option value="debit">Debit (Expense)</option>
                                    <option value="credit">Credit (Income)</option>
                                  </select>
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-input table-input width-100"
                                    value={tx.amount}
                                    onChange={e => handleTxChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                                  />
                                </td>
                                <td className="text-center">
                                  <button className="btn-delete-row" onClick={() => handleRemoveTx(idx)}>
                                    <X size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        parsedSalarySlip && (
                          <div className="salary-fields-grid">
                            <div className="grid-section">
                              <h4>Period & Pay</h4>
                              <div className="form-row-2">
                                <div className="form-group">
                                  <label className="form-label">Month (1-12)</label>
                                  <input type="number" className="form-input" value={parsedSalarySlip.month}
                                    onChange={e => handleSalaryChange('month', parseInt(e.target.value) || 1)} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Year</label>
                                  <input type="number" className="form-input" value={parsedSalarySlip.year}
                                    onChange={e => handleSalaryChange('year', parseInt(e.target.value) || 2026)} />
                                </div>
                              </div>
                              <div className="form-row-2">
                                <div className="form-group">
                                  <label className="form-label">Gross Earnings</label>
                                  <input type="number" className="form-input border-success-focus" value={parsedSalarySlip.grossPay}
                                    onChange={e => handleSalaryChange('grossPay', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Net Credited (Take Home)</label>
                                  <input type="number" className="form-input border-success-focus glow-border-success" value={parsedSalarySlip.netPay}
                                    onChange={e => handleSalaryChange('netPay', parseFloat(e.target.value) || 0)} />
                                </div>
                              </div>
                            </div>
                            <div className="grid-section">
                              <h4>Earnings Breakdown</h4>
                              <div className="form-group">
                                <label className="form-label">Basic Salary</label>
                                <input type="number" className="form-input" value={parsedSalarySlip.basicPay}
                                  onChange={e => handleSalaryChange('basicPay', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">House Rent Allowance (HRA)</label>
                                <input type="number" className="form-input" value={parsedSalarySlip.hra}
                                  onChange={e => handleSalaryChange('hra', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Other Allowances</label>
                                <input type="number" className="form-input" value={parsedSalarySlip.allowances}
                                  onChange={e => handleSalaryChange('allowances', parseFloat(e.target.value) || 0)} />
                              </div>
                            </div>
                            <div className="grid-section">
                              <h4>Deductions</h4>
                              <div className="form-group">
                                <label className="form-label">Provident Fund (PF)</label>
                                <input type="number" className="form-input" value={parsedSalarySlip.providentFund}
                                  onChange={e => handleSalaryChange('providentFund', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Income Tax (TDS)</label>
                                <input type="number" className="form-input border-danger-focus" value={parsedSalarySlip.taxDeducted}
                                  onChange={e => handleSalaryChange('taxDeducted', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Other Deductions</label>
                                <input type="number" className="form-input" value={parsedSalarySlip.otherDeductions}
                                  onChange={e => handleSalaryChange('otherDeductions', parseFloat(e.target.value) || 0)} />
                              </div>
                            </div>

                            {((parsedSalarySlip.earningsBreakdown && parsedSalarySlip.earningsBreakdown.length > 0) ||
                              (parsedSalarySlip.deductionsBreakdown && parsedSalarySlip.deductionsBreakdown.length > 0)) && (
                              <div className="grid-section" style={{ gridColumn: '1 / -1', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Sparkles size={16} className="primary-color" style={{ color: 'var(--primary)' }} />
                                  <span>AI Extracted Itemized Components</span>
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '12px' }}>
                                  <div>
                                    <h5 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Earnings / Allowances</h5>
                                    {parsedSalarySlip.earningsBreakdown && parsedSalarySlip.earningsBreakdown.length > 0 ? (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {parsedSalarySlip.earningsBreakdown.map((item, idx) => (
                                          <div key={idx} style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', display: 'flex', gap: '8px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{item.name}</span>
                                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>₹{item.amount.toLocaleString('en-IN')}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None found.</span>
                                    )}
                                  </div>
                                  <div>
                                    <h5 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Deductions</h5>
                                    {parsedSalarySlip.deductionsBreakdown && parsedSalarySlip.deductionsBreakdown.length > 0 ? (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {parsedSalarySlip.deductionsBreakdown.map((item, idx) => (
                                          <div key={idx} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', display: 'flex', gap: '8px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{item.name}</span>
                                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>₹{item.amount.toLocaleString('en-IN')}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None found.</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <style>{`
        /* ── Tabs ── */
        .tabs-container {
          display: flex;
          gap: 12px;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 2px;
        }

        .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-heading);
          font-size: 1rem;
          font-weight: 600;
          padding: 8px 16px;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
          display: flex;
          align-items: center;
        }

        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--primary); }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 0; right: 0;
          height: 2px;
          background: var(--primary);
          box-shadow: 0 0 10px var(--primary);
        }

        /* ── LLM Picker ── */
        .llm-picker-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 20px;
          border: 1px solid var(--border-glass);
        }

        .llm-picker-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .primary-color-icon { color: var(--primary); }

        .llm-selector-wrapper {
          position: relative;
          flex: 1;
          max-width: 340px;
        }

        .llm-select {
          width: 100%;
          padding-right: 36px;
          appearance: none;
          font-weight: 600;
        }

        .select-chevron {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        /* ── Upload Zone ── */
        .upload-zone {
          padding: 60px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          border: 2px dashed var(--border-glass);
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .upload-zone.active {
          border-color: var(--primary);
          background: hsla(263, 90%, 65%, 0.04);
        }

        .upload-label-box {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .upload-icon-wrapper {
          width: 70px; height: 70px;
          border-radius: 50%;
          background: rgba(255,255,255,0.03);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px;
          border: 1px solid var(--border-glass);
          transition: var(--transition-smooth);
        }

        .upload-zone:hover .upload-icon-wrapper {
          background: var(--primary-glow);
          border-color: var(--primary);
        }

        .upload-icon { color: var(--text-secondary); transition: var(--transition-smooth); }
        .upload-zone:hover .upload-icon { color: var(--primary); }

        .upload-label-box h3 { font-size: 1.25rem; margin-bottom: 6px; }
        .upload-label-box p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px; }

        .file-limit-badge {
          font-size: 0.75rem;
          background: rgba(255,255,255,0.06);
          padding: 4px 8px;
          border-radius: 12px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* ── Selected File Card ── */
        .selected-file-card {
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .file-info-row {
          display: flex; align-items: center;
          gap: 16px; flex: 1;
        }

        .file-details h4 { font-size: 1rem; margin-bottom: 2px; }
        .file-details span { font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }

        .provider-badge {
          font-size: 0.72rem;
          padding: 2px 8px;
          border-radius: 10px;
          background: var(--primary-glow);
          color: var(--primary);
          border: 1px solid var(--primary);
          font-weight: 600;
        }

        .btn-close-action {
          background: transparent; border: none;
          color: var(--text-muted); cursor: pointer;
          padding: 4px; border-radius: 50%;
          display: flex; margin-left: 12px;
          transition: var(--transition-smooth);
        }

        .btn-close-action:hover { color: var(--danger); background: var(--danger-glow); }

        /* ── Loading ── */
        .loading-card {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 60px 40px; text-align: center;
        }

        .spinner-icon { animation: spin 1.5s linear infinite; margin-bottom: 20px; }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spinning { animation: spin 1s linear infinite; }

        .loading-card h3 { margin-bottom: 6px; }
        .glow-text { color: var(--text-secondary); font-size: 0.95rem; }

        /* ── API Warning ── */
        .api-warning-card {
          display: flex; align-items: center;
          padding: 24px; gap: 20px;
        }

        .warning-icon { color: var(--warning); }
        .flex-btn-align { margin-left: auto; }

        /* ── Workspace Split ── */
        .workspace-split {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          align-items: start;
        }

        .workspace-split.with-preview {
          grid-template-columns: 350px 1fr;
        }

        .pdf-preview-card {
          padding: 16px; height: calc(100vh - 290px);
          display: flex; flex-direction: column;
        }

        .preview-header {
          display: flex; align-items: center; gap: 8px;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 12px; margin-bottom: 12px;
        }

        .canvas-wrapper {
          flex: 1; overflow: auto;
          background: #111827;
          border-radius: var(--border-radius-md);
          display: flex; align-items: flex-start; justify-content: center;
        }

        .pdf-canvas { max-width: 100%; display: block; }

        .data-review-card {
          padding: 24px; display: flex;
          flex-direction: column;
          height: calc(100vh - 290px);
        }

        .review-header-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 16px; margin-bottom: 16px;
        }

        .review-scroll-container { flex: 1; overflow-y: auto; }

        /* ── Review Table ── */
        .review-table {
          width: 100%; border-collapse: collapse; text-align: left;
        }

        .review-table th {
          padding: 10px 8px; font-size: 0.8rem; font-weight: 600;
          color: var(--text-muted); border-bottom: 1px solid var(--border-glass);
          text-transform: uppercase;
        }

        .review-table td {
          padding: 6px 8px; border-bottom: 1px solid var(--border-glass);
          vertical-align: middle;
        }

        .row-others td {
          background: rgba(251, 191, 36, 0.03);
        }

        .table-input { padding: 6px 10px; width: 100%; font-size: 0.85rem; }
        .table-select { padding: 6px 10px; font-size: 0.85rem; width: 100%; }
        .width-100 { width: 100px !important; }

        .select-others {
          border-color: rgba(251, 191, 36, 0.5) !important;
          color: #f59e0b;
        }

        .btn-delete-row {
          background: transparent; border: none;
          color: var(--text-muted); cursor: pointer;
          padding: 4px; border-radius: 4px;
          transition: var(--transition-smooth);
        }

        .btn-delete-row:hover { color: var(--danger); background: var(--danger-glow); }

        /* ── Salary Grid ── */
        .salary-fields-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
        }

        .grid-section {
          background: rgba(255,255,255,0.015);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          padding: 16px;
          display: flex; flex-direction: column; gap: 12px;
        }

        .grid-section h4 {
          font-size: 0.95rem; color: var(--text-secondary);
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 8px; margin-bottom: 4px;
        }

        /* ── History ── */
        .history-card { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

        .history-header {
          display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid var(--border-glass);
          padding-bottom: 14px;
        }

        .history-header h3 { font-size: 1.05rem; font-weight: 600; }

        .badge-count {
          font-size: 0.75rem; font-weight: 700;
          padding: 2px 10px; border-radius: 20px;
          background: var(--primary-glow);
          color: var(--primary);
          border: 1px solid var(--primary);
        }

        .history-empty {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px;
          padding: 40px; text-align: center;
          color: var(--text-muted); font-size: 0.9rem;
          background: rgba(255,255,255,0.015);
          border: 1px dashed var(--border-glass);
          border-radius: var(--border-radius-md);
        }

        .history-list { display: flex; flex-direction: column; gap: 10px; }

        .history-row {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px;
          background: rgba(255,255,255,0.015);
          border: 1px solid var(--border-glass);
          border-radius: var(--border-radius-md);
          transition: var(--transition-smooth);
        }

        .history-row:hover {
          background: rgba(255,255,255,0.025);
          border-color: rgba(255,255,255,0.06);
        }

        .history-icon-wrap {
          width: 38px; height: 38px; border-radius: var(--border-radius-md);
          background: var(--primary-glow); border: 1px solid var(--primary);
          display: flex; align-items: center; justify-content: center;
          color: var(--primary); flex-shrink: 0;
        }

        .history-details {
          flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0;
        }

        .history-filename {
          font-size: 0.9rem; font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .history-meta {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }

        .history-type-badge {
          font-size: 0.68rem; font-weight: 700;
          padding: 2px 8px; border-radius: 10px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }

        .history-type-badge.bank { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
        .history-type-badge.salary { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }

        .history-meta-item {
          display: flex; align-items: center; gap: 4px;
          font-size: 0.75rem; color: var(--text-muted);
        }

        .btn-delete-pdf {
          background: transparent; border: none;
          color: var(--text-muted); cursor: pointer;
          padding: 8px; border-radius: var(--border-radius-md);
          display: flex; align-items: center; justify-content: center;
          transition: var(--transition-smooth);
          flex-shrink: 0;
        }

        .btn-delete-pdf:hover:not(:disabled) {
          color: var(--danger); background: var(--danger-glow);
        }

        .btn-delete-pdf:disabled { opacity: 0.5; cursor: not-allowed; }

        .muted-icon { color: var(--text-muted); }

        /* ── Misc ── */
        .border-success-focus:focus { border-color: var(--success); box-shadow: 0 0 0 3px var(--success-glow); }
        .border-danger-focus:focus  { border-color: var(--danger);  box-shadow: 0 0 0 3px var(--danger-glow); }
        .glow-border-success { border-color: var(--success); }

        .flex-column-gap {
          display: flex; flex-direction: column;
          gap: 16px; align-items: stretch !important;
        }

        .w-100 { width: 100%; }

        .form-group-row { display: flex; gap: 12px; width: 100%; }
        .password-prompt-box { }
        .password-prompt-input { flex: 1; }
        .align-self-end { align-self: flex-end; }
        .text-center { text-align: center; }
        .secondary-color { color: var(--text-secondary); }
        .primary-color { color: var(--primary); }

        @media (max-width: 576px) {
          .hide-on-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
};
