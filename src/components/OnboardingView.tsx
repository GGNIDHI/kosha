import React, { useState } from 'react';
import { setSetting } from '../db/database';
import { Wallet, ArrowRight, Coins, User, Key, MapPin } from 'lucide-react';

interface OnboardingViewProps {
  onComplete: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [userName, setUserName] = useState('User');
  const [currency, setCurrency] = useState('INR');
  const [userCity, setUserCity] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await setSetting('userName', userName.trim() || 'User');
      await setSetting('currency', currency);
      await setSetting('userCity', userCity.trim());
      await setSetting('geminiApiKey', geminiKey.trim());
      await setSetting('groqApiKey', groqKey.trim());
      await setSetting('hasBeenInitialized', true);
      onComplete();
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="glass-card onboarding-card">
        <div className="logo-container">
          <div className="logo-glow">
            <Wallet size={36} color="white" />
          </div>
        </div>

        {step === 1 && (
          <div className="step-content">
            <h1>Welcome to Kosha</h1>
            <p className="subtitle">
              Kosha is your private, AI-powered financial dashboard. Let's configure your profile settings to get started. All data is kept 100% private and stored locally on your device.
            </p>
            <button className="btn btn-primary next-btn" onClick={() => setStep(2)}>
              Get Started <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <h1>Profile Settings</h1>
            <p className="subtitle">Choose a name and currency for your local ledger.</p>
            
            <div className="form-group">
              <label className="form-label">
                <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Profile Name
              </label>
              <input 
                type="text" 
                className="form-input" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                placeholder="Enter your name..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Coins size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Base Currency
              </label>
              <select 
                className="form-input" 
                value={currency} 
                onChange={(e) => setCurrency(e.target.value)}
                style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
              >
                <option value="INR">INR (₹) - Indian Rupee</option>
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="JPY">JPY (¥) - Japanese Yen</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <MapPin size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                City of Residence
              </label>
              <input 
                type="text" 
                className="form-input" 
                value={userCity} 
                onChange={(e) => setUserCity(e.target.value)} 
                placeholder="e.g. Bangalore, Mumbai, Kochi..."
              />
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-content">
            <h1>AI Keys (Optional)</h1>
            <p className="subtitle">Provide your API keys to enable automated statement parsing and financial insights. You can skip this and add them later in settings.</p>

            <div className="form-group">
              <label className="form-label">
                <Key size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Google Gemini API Key
              </label>
              <input 
                type="password" 
                className="form-input" 
                value={geminiKey} 
                onChange={(e) => setGeminiKey(e.target.value)} 
                placeholder="Enter Gemini API key (optional)..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Key size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Groq API Key
              </label>
              <input 
                type="password" 
                className="form-input" 
                value={groqKey} 
                onChange={(e) => setGroqKey(e.target.value)} 
                placeholder="Enter Groq API key (optional)..."
              />
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={isSubmitting}>Back</button>
              <button className="btn btn-success" onClick={handleFinish} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Finish Setup'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .onboarding-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: radial-gradient(circle at top right, rgba(139, 92, 246, 0.12), transparent 45%),
                      radial-gradient(circle at bottom left, rgba(6, 182, 212, 0.08), transparent 45%),
                      var(--bg-app);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          padding: 20px;
        }
        .onboarding-card {
          width: 100%;
          max-width: 520px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .logo-container {
          margin-bottom: 24px;
        }
        .logo-glow {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          border-radius: var(--border-radius-lg);
          box-shadow: 0 0 24px var(--primary-glow);
        }
        .step-content {
          width: 100%;
          animation: onboardingFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        h1 {
          font-family: var(--font-heading);
          font-size: 1.8rem;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(to right, var(--text-primary), var(--text-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .subtitle {
          font-size: 0.95rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 32px;
        }
        .form-group {
          text-align: left;
          margin-bottom: 20px;
        }
        .form-label {
          display: flex;
          align-items: center;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .next-btn {
          width: 100%;
          padding: 12px;
        }
        .btn-row {
          display: flex;
          gap: 12px;
          margin-top: 32px;
          width: 100%;
        }
        .btn-row .btn {
          flex: 1;
        }
        @keyframes onboardingFadeIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
