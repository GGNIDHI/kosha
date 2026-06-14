import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../db/database';
import { formatAmount } from '../utils/currency';
import { calculateTax } from '../utils/taxCalculator';
import type { TaxResult } from '../utils/taxCalculator';
import { Calculator, CheckCircle2, Info } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export const TaxView: React.FC = () => {
  const [currency, setCurrency] = useState('INR');

  // Pre-fill from latest salary slip
  const salarySlips = useLiveQuery(() => db.salarySlips.toArray(), []) ?? [];
  const latestSlip = [...salarySlips].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)[0];

  const [annualGross, setAnnualGross] = useState('');
  const [c80, setC80] = useState('');
  const [d80, setD80] = useState('');
  const [hra, setHra] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calculateTax> | null>(null);

  useEffect(() => { getSetting('currency', 'INR').then(setCurrency); }, []);

  useEffect(() => {
    if (latestSlip) {
      setAnnualGross(String(Math.round(latestSlip.grossPay * 12)));
      setC80(String(Math.round(latestSlip.providentFund * 12)));
    }
  }, [latestSlip]);

  const compute = () => {
    const res = calculateTax({
      annualGrossIncome: parseFloat(annualGross) || 0,
      section80C: parseFloat(c80) || 0,
      section80D: parseFloat(d80) || 0,
      hraExemption: parseFloat(hra) || 0,
    });
    setResult(res);
  };

  const RegimeCard = ({ r, recommended }: { r: TaxResult; recommended: boolean }) => (
    <div className={`glass-card tax-regime-card ${recommended ? 'recommended' : ''}`}>
      <div className="trc-header">
        <div>
          <h3>{r.regime === 'new' ? '🆕 New Regime' : '📋 Old Regime'}</h3>
          <p className="trc-sub">{r.regime === 'new' ? 'FY 2024-25 default' : 'With deductions'}</p>
        </div>
        {recommended && (
          <div className="trc-recommended-badge">
            <CheckCircle2 size={14} /> Recommended
          </div>
        )}
      </div>

      <div className="trc-main">
        <div className="trc-tax">
          <span className="trc-tax-label">Total Tax</span>
          <span className="trc-tax-amount">₹ {fmt(r.totalTax)}</span>
        </div>
        <div className="trc-takehome">
          <span className="trc-th-label">Take-Home</span>
          <span className="trc-th-amount" style={{ color: '#22c55e' }}>₹ {fmt(r.takeHome)}</span>
        </div>
      </div>

      <div className="trc-eff-rate">
        <span>Effective Rate: <strong>{r.effectiveRate.toFixed(2)}%</strong></span>
        <span>Standard Deduction: ₹{fmt(r.standardDeduction)}</span>
      </div>

      {r.regime === 'old' && (
        <div className="trc-deductions">
          <span>80C: ₹{fmt(r.section80C)}</span>
          {r.section80D > 0 && <span>80D: ₹{fmt(r.section80D)}</span>}
          {r.hraExemption > 0 && <span>HRA: ₹{fmt(r.hraExemption)}</span>}
        </div>
      )}

      {/* Slab breakdown */}
      <div className="trc-slabs">
        <p className="slabs-title">Tax Slabs</p>
        {r.slabs.filter(s => s.tax > 0).map((s, i) => (
          <div key={i} className="slab-row">
            <span className="slab-range">
              {s.rate === 0 ? 'Nil' : `${s.rate}%`} on ₹{fmt(s.from)}–{s.to === Infinity ? '∞' : `₹${fmt(s.to)}`}
            </span>
            <span className="slab-tax">₹{fmt(s.tax)}</span>
          </div>
        ))}
        {r.surcharge > 0 && (
          <div className="slab-row">
            <span className="slab-range">Surcharge</span>
            <span className="slab-tax">₹{fmt(r.surcharge)}</span>
          </div>
        )}
        <div className="slab-row">
          <span className="slab-range">4% Cess</span>
          <span className="slab-tax">₹{fmt(r.cess)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="view-container animate-fade-in">
      <header className="view-header-row">
        <div>
          <h1>Tax Estimator 🇮🇳</h1>
          <p>Compare Old vs New regime for FY 2024-25 and find out which saves you more.</p>
        </div>
      </header>

      {/* Input card */}
      <div className="glass-card tax-input-card">
        <div className="tax-input-header">
          <Calculator size={20} className="primary-color" />
          <h3>Your Income Details</h3>
          {latestSlip && (
            <span className="tax-autofilled">
              <Info size={12} /> Auto-filled from your latest salary slip
            </span>
          )}
        </div>
        <div className="tax-inputs-grid">
          <div className="form-group">
            <label className="form-label">Annual Gross Income (CTC)</label>
            <input type="number" className="form-input" placeholder="1200000"
              value={annualGross} onChange={e => setAnnualGross(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Section 80C Investments <span className="tax-cap">(max ₹1.5L)</span></label>
            <input type="number" className="form-input" placeholder="150000"
              value={c80} onChange={e => setC80(e.target.value)} />
            <span className="form-hint">EPF, PPF, ELSS, LIC premium, etc.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Section 80D — Health Insurance <span className="tax-cap">(max ₹25K)</span></label>
            <input type="number" className="form-input" placeholder="25000"
              value={d80} onChange={e => setD80(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">HRA Exemption (if applicable)</label>
            <input type="number" className="form-input" placeholder="60000"
              value={hra} onChange={e => setHra(e.target.value)} />
            <span className="form-hint">Only for Old Regime. Leave 0 if not applicable.</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={compute} style={{ alignSelf: 'flex-start' }}>
          <Calculator size={16} /> Calculate Tax
        </button>
      </div>

      {result && (
        <>
          {/* Savings banner */}
          <div className="glass-card tax-savings-banner">
            <div>
              <p className="tsb-label">You save</p>
              <h2 className="tsb-amount" style={{ color: '#22c55e' }}>
                {formatAmount(result.savings, currency)} per year
              </h2>
              <p className="tsb-sub">by choosing the <strong>{result.recommended === 'new' ? 'New' : 'Old'} Regime</strong></p>
            </div>
            <div className="tsb-monthly">
              <p>≈ {formatAmount(result.savings / 12, currency)}/month extra in hand</p>
            </div>
          </div>

          {/* Side-by-side regime cards */}
          <div className="tax-regime-grid">
            <RegimeCard r={result.newRegime} recommended={result.recommended === 'new'} />
            <RegimeCard r={result.oldRegime} recommended={result.recommended === 'old'} />
          </div>
        </>
      )}

      <style>{`
        .tax-input-card { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .tax-input-header { display: flex; align-items: center; gap: 10px; }
        .tax-input-header h3 { font-size: 1.05rem; font-weight: 700; }
        .tax-autofilled { margin-left: auto; font-size: 0.78rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
        .tax-inputs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .tax-cap { font-size: 0.75rem; color: var(--text-muted); font-weight: 400; }
        .form-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 3px; }

        .tax-savings-banner {
          padding: 24px 32px; display: flex; justify-content: space-between; align-items: center;
          background: linear-gradient(135deg, rgba(34,197,94,.08) 0%, rgba(16,185,129,.05) 100%);
          border: 1px solid rgba(34,197,94,.2);
        }
        .tsb-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: .05em; }
        .tsb-amount { font-size: 2rem; font-weight: 800; margin: 4px 0; }
        .tsb-sub { font-size: 0.9rem; color: var(--text-secondary); }
        .tsb-monthly { font-size: 0.9rem; color: var(--text-muted); }

        .tax-regime-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 700px) { .tax-regime-grid, .tax-inputs-grid { grid-template-columns: 1fr; } }

        .tax-regime-card { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
        .tax-regime-card.recommended { border: 1px solid rgba(34,197,94,.35); background: rgba(34,197,94,.04); }

        .trc-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .trc-header h3 { font-size: 1.05rem; font-weight: 700; margin: 0; }
        .trc-sub { font-size: 0.78rem; color: var(--text-muted); margin: 3px 0 0; }
        .trc-recommended-badge { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 700; color: #22c55e; background: rgba(34,197,94,.12); padding: 4px 10px; border-radius: 99px; }

        .trc-main { display: flex; justify-content: space-between; background: rgba(255,255,255,.03); border-radius: 10px; padding: 14px 16px; }
        .trc-tax, .trc-takehome { display: flex; flex-direction: column; gap: 3px; }
        .trc-tax-label, .trc-th-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: .04em; }
        .trc-tax-amount { font-size: 1.3rem; font-weight: 800; color: #ef4444; }
        .trc-th-amount { font-size: 1.3rem; font-weight: 800; }

        .trc-eff-rate { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); }

        .trc-deductions { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.78rem; color: var(--text-secondary); }
        .trc-deductions span { background: rgba(255,255,255,.04); border: 1px solid var(--border-glass); padding: 3px 8px; border-radius: 6px; }

        .trc-slabs { display: flex; flex-direction: column; gap: 4px; }
        .slabs-title { font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
        .slab-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
        .slab-range { color: var(--text-muted); }
        .slab-tax { font-weight: 600; color: var(--text-primary); }
      `}</style>
    </div>
  );
};
