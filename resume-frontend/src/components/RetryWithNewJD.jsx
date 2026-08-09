import { useState } from "react";
import { retryGeneration } from "../api";
import Spinner from "./Spinner";

export default function RetryWithNewJD({ id, onRetried }) {
    const [mode, setMode] = useState("file"); // "file" | "paste"
    const [jdFile, setJdFile] = useState(null);
    const [jdText, setJdText] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    function handleFile(f) {
        if (f) setJdFile(f);
    }

    async function handleRetry() {
        setSubmitting(true);
        setError(null);
        try {
            const payload =
                mode === "paste" && jdText.trim()
                    ? { jdText: jdText.trim() }
                    : jdFile
                      ? { jdFile }
                      : {};
            await retryGeneration(id, payload);
            onRetried?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div style={{ marginTop: 12 }}>
            <p className="page-subtitle" style={{ marginBottom: 10 }}>
                Upload a different JD (PDF or .txt), paste the text directly, or
                leave everything blank to just retry with the original file.
            </p>

            <div className="filter-row" style={{ marginBottom: 10 }}>
                <button
                    className="btn-ghost"
                    style={
                        mode === "file"
                            ? {
                                  borderColor: "var(--accent)",
                                  color: "var(--text)",
                              }
                            : {}
                    }
                    onClick={() => setMode("file")}
                >
                    Upload file
                </button>
                <button
                    className="btn-ghost"
                    style={
                        mode === "paste"
                            ? {
                                  borderColor: "var(--accent)",
                                  color: "var(--text)",
                              }
                            : {}
                    }
                    onClick={() => setMode("paste")}
                >
                    Paste text
                </button>
            </div>

            {mode === "file" ? (
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
                        handleFile(e.dataTransfer.files?.[0]);
                    }}
                >
                    {jdFile ? (
                        <>
                            Selected<div className="fname">{jdFile.name}</div>
                        </>
                    ) : (
                        "Drop a JD PDF or .txt here, or click to browse (optional)"
                    )}
                    <input
                        type="file"
                        accept=".pdf,.txt"
                        style={{ display: "none" }}
                        onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                </label>
            ) : (
                <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the job description text here…"
                    rows={10}
                    style={{
                        width: "100%",
                        background: "var(--bg)",
                        border: "1px solid var(--border-loud)",
                        color: "var(--text)",
                        borderRadius: "var(--radius)",
                        padding: "10px 12px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12.5,
                        resize: "vertical",
                    }}
                />
            )}

            {error && <div className="error-box">{error}</div>}

            <button
                className="btn-primary"
                style={{ marginTop: 12 }}
                disabled={submitting}
                onClick={handleRetry}
            >
                {submitting ? (
                    <Spinner label="Retrying…" />
                ) : (
                    "Retry generation"
                )}
            </button>
        </div>
    );
}
