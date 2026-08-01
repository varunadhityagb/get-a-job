import { useState } from "react";

export default function UploadCard({ title, hint, accept, onUpload, overwriteLabel }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(overwrite) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file, overwrite);
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const isConflict = error?.includes("already exists");

  return (
    <div className="card">
      <div className="page-title" style={{ fontSize: 17, marginBottom: 4 }}>
        {title}
      </div>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        {hint}
      </p>
      <label
        className={`dropzone ${dragActive ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          setFile(e.dataTransfer.files?.[0] || null);
          setError(null);
        }}
      >
        {file ? (
          <>
            Selected
            <div className="fname">{file.name}</div>
          </>
        ) : (
          "Drop a file here, or click to browse"
        )}
        <input
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setError(null);
          }}
        />
      </label>

      {error && <div className="error-box">{error}</div>}

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button className="btn-primary" disabled={!file || busy} onClick={() => submit(false)}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        {isConflict && (
          <button className="btn-ghost" disabled={busy} onClick={() => submit(true)}>
            {overwriteLabel || "Overwrite existing"}
          </button>
        )}
      </div>
    </div>
  );
}
