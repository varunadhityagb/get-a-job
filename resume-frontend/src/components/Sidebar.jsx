const ITEMS = [
  { key: "new", num: "01", label: "New request" },
  { key: "history", num: "02", label: "History" },
  { key: "data", num: "03", label: "Resume data" },
];

export default function Sidebar({ page, setPage }) {
  return (
    <nav className="sidebar">
      <div>
        <div className="brand">Tailor</div>
        <div className="brand-sub">resume generation</div>
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.key}
          className={`nav-item ${page === item.key ? "active" : ""}`}
          onClick={() => setPage(item.key)}
        >
          <span className="nav-num">{item.num}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
