import React from 'react';

interface MeterGaugeProps {
  label: string;
  subtitle: string;
  value: number;
  displayValue: string;
  thresholds: { ok: number; warn: number };
  lowIsGood: boolean;
  helpText: string;
  onClick?: () => void;
}

export const MeterGauge: React.FC<MeterGaugeProps> = ({
  label,
  subtitle,
  value,
  displayValue,
  thresholds,
  lowIsGood,
  helpText,
  onClick,
}) => {
  const safeValue = isNaN(value) ? 0 : value;
  const getColour = () => {
    if (lowIsGood) {
      if (safeValue <= thresholds.ok) return '#22c55e';
      if (safeValue <= thresholds.warn) return '#f97316';
      return '#ef4444';
    } else {
      if (safeValue >= thresholds.ok) return '#22c55e';
      if (safeValue >= thresholds.warn) return '#f97316';
      return '#ef4444';
    }
  };
  const colour = getColour();
  const r = 46;
  const arcLen = Math.PI * r;
  const filled = (safeValue / 100) * arcLen;
  const gap = arcLen - filled;

  return (
    <div
      className="glass-card meter-card"
      style={{
        borderColor: colour + '33',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition-smooth)',
      }}
      onClick={onClick}
    >
      <svg width="120" height="68" viewBox="0 0 120 68" className="meter-svg">
        <path d="M7,63 A53,53 0 0,1 113,63" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
        <path d="M7,63 A53,53 0 0,1 113,63" fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          style={{ filter: `drop-shadow(0 0 5px ${colour}88)`, transition: 'stroke-dasharray .7s cubic-bezier(.4,0,.2,1)' }} />
        <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="800" fill={colour}>{displayValue}</text>
      </svg>
      <span className="meter-label">{label}</span>
      <span className="meter-subtitle">{subtitle}</span>
      <span className="meter-helptext">{helpText}</span>
    </div>
  );
};
