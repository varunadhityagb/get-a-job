export default function Spinner({ label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="var(--border-loud)"
          strokeWidth="3"
        />
        <path
          d="M12 3 a9 9 0 0 1 9 9"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="page-subtitle" style={{ margin: 0 }}>{label}</span>}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          svg { animation: none !important; }
        }
      `}</style>
    </span>
  );
}
