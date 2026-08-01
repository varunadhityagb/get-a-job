import { useState } from "react";
import Sidebar from "./components/Sidebar";
import NewRequest from "./components/NewRequest";
import History from "./components/History";
import GenerationDetail from "./components/GenerationDetail";
import DataEditor from "./components/DataEditor";

export default function App() {
  const [page, setPage] = useState("new");
  const [selectedId, setSelectedId] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  function handleCreated(generationId) {
    setHistoryRefreshKey((k) => k + 1);
    setSelectedId(generationId);
    setPage("history");
  }

  function goToPage(p) {
    setSelectedId(null);
    setPage(p);
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={goToPage} />
      <main className="main">
        {page === "new" && <NewRequest onCreated={handleCreated} />}
        {page === "history" &&
          (selectedId ? (
            <GenerationDetail id={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <History onSelect={setSelectedId} refreshKey={historyRefreshKey} />
          ))}
        {page === "data" && <DataEditor />}
      </main>
    </div>
  );
}
