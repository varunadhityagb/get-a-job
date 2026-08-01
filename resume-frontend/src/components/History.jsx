import { useEffect, useMemo, useState } from "react";
import { exportUrl, listGenerations } from "../api";
import StatusStamp from "./StatusStamp";
import Spinner from "./Spinner";

export default function History({ onSelect, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    listGenerations()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const categories = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => (r.category || "").split(",").forEach((c) => c.trim() && set.add(c.trim())));
    return [...set];
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (categoryFilter && !(r.category || "").includes(categoryFilter)) return false;
    if (search && !(r.company_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    const created = new Date(r.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo && created > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });

  const hasFilters = categoryFilter || search || dateFrom || dateTo;

  if (loading)
    return (
      <div style={{ padding: "40px 0" }}>
        <Spinner label="Loading history…" />
      </div>
    );
  if (error) return <div className="error-box">{error}</div>;

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">Every generation, browsable — not just the latest.</p>
        </div>
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          <a className="btn-ghost" href={exportUrl("json")} target="_blank" rel="noreferrer">
            Export JSON
          </a>
          <a className="btn-ghost" href={exportUrl("csv")} target="_blank" rel="noreferrer">
            Export CSV
          </a>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="page-title">{hasFilters ? "Nothing matches these filters" : "No generations yet"}</div>
          <p>{hasFilters ? "Try widening the search, category, or date range." : "Start a new request and it'll show up here."}</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="history">
            <thead>
              <tr>
                <th>Company</th>
                <th>Category</th>
                <th>Package</th>
                <th>Model</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => onSelect(r.id)}>
                  <td>{r.company_name}</td>
                  <td className="mono">{r.category || "—"}</td>
                  <td className="mono">{r.package || "—"}</td>
                  <td className="mono">{r.model_used || "cloud"}</td>
                  <td className="mono">{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <StatusStamp status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
