import { useState } from "react";
import { retryGeneration } from "../api";
import Spinner from "./Spinner";

export default function RetryWithNewJD({ id, onRetried }) {
    const [jdFile, setJdFile] = useState(null);
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
            await retryGeneration(id, jdFile ? { jdFile } : {});
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
                This failed extracting text from the JD — usually a
                scanned/image PDF. Upload a different file (or leave blank to
                just retry the same one), then retry.
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
                    handleFile(e.dataTransfer.files?.[0]);
                }}
            >
                {jdFile ? (
                    <>
                        Selected<div className="fname">{jdFile.name}</div>
                    </>
                ) : (
                    "Drop a new JD PDF here, or click to browse (optional)"
                )}
                <input
                    type="file"
                    accept=".pdf,.txt"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files?.[0])}
                />
            </label>

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
