import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView } from "@codemirror/view";
import {
  generationJdUrl,
  generationPdfUrl,
  getGeneration,
  listVersions,
  getVersionTex,
  createVersion,
  compileVersion,
  fixVersion,
  versionPdfUrl,
} from "../api";
import StatusStamp from "./StatusStamp";
import Spinner from "./Spinner";
import RetryWithNewJD from "./RetryWithNewJD";

// Local models can take minutes; give the "pending" state something honest
// to say rather than a static sentence, without pretending to know real
// server-side progress (we don't get granular events from BackgroundTasks).
const PENDING_STAGES = [
  "Extracting job description text…",
  "Model is drafting tailored content…",
  "Checking output against your resume data…",
  "Rendering LaTeX and compiling PDF…",
];

const texTheme = EditorView.theme(
  {
    "&": { fontSize: "12.5px", fontFamily: "var(--font-mono)" },
    ".cm-content": { caretColor: "#b8925a" },
    ".cm-gutters": {
      backgroundColor: "#161b23",
      color: "#5c6577",
      border: "none",
    },
  },
  { dark: true },
);

export default function GenerationDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("resume");
  const [stageIdx, setStageIdx] = useState(0);
  const elapsed = useRef(0);

  // ---- tex version state ----
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorOriginal, setEditorOriginal] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [versionError, setVersionError] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const d = await getGeneration(id);
        if (cancelled) return;
        setData(d);
        if (d.generation.status === "pending") {
          elapsed.current += 3;
          setStageIdx(
            Math.min(
              Math.floor(elapsed.current / 20),
              PENDING_STAGES.length - 1,
            ),
          );
          timer = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function loadVersion(versionId) {
    setActiveVersionId(versionId);
    try {
      const content = await getVersionTex(id, versionId);
      setEditorContent(content);
      setEditorOriginal(content);
    } catch (e) {
      setVersionError(e.message);
    }
  }

  async function refreshVersions(preferId = null) {
    setVersionsLoading(true);
    setVersionError(null);
    try {
      const list = await listVersions(id);
      setVersions(list);
      const target = preferId
        ? list.find((v) => v.id === preferId)
        : list[list.length - 1];
      if (target) await loadVersion(target.id);
    } catch (e) {
      setVersionError(e.message);
    } finally {
      setVersionsLoading(false);
    }
  }

  // Load versions once we have either a done or a failed generation —
  // failed ones may still have a tex version worth editing (render/compile
  // failures always leave one; jd_or_llm failures never do).
  useEffect(() => {
    if (
      (data?.generation.status === "done" ||
        data?.generation.status === "failed") &&
      versions.length === 0
    ) {
      refreshVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.generation.status]);

  const dirty = editorContent !== editorOriginal;
  const activeVersion = versions.find((v) => v.id === activeVersionId);

  async function handleSaveVersion() {
    setSavingVersion(true);
    setVersionError(null);
    try {
      const v = await createVersion(id, editorContent);
      await refreshVersions(v.id);
    } catch (e) {
      setVersionError(e.message);
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleCompile() {
    setCompiling(true);
    setVersionError(null);
    try {
      await compileVersion(id, activeVersionId);
      await refreshVersions(activeVersionId);
    } catch (e) {
      setVersionError(e.message);
    } finally {
      setCompiling(false);
    }
  }

  async function handleFixWithAI() {
    setFixing(true);
    setVersionError(null);
    try {
      const v = await fixVersion(id, activeVersionId, { useCloud: true });
      await refreshVersions(v.id);
    } catch (e) {
      setVersionError(e.message);
    } finally {
      setFixing(false);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!data)
    return (
      <div style={{ padding: "40px 0" }}>
        <Spinner label="Loading generation…" />
      </div>
    );

  const { generation, company, jd_submission } = data;
  const showTabs =
    generation.status === "done" || generation.status === "failed";

  return (
    <div>
      <button
        className="btn-ghost"
        onClick={onBack}
        style={{ marginBottom: 20 }}
      >
        ← Back to history
      </button>

      <div className="toolbar">
        <div>
          <h1 className="page-title">{company?.name || "Unknown company"}</h1>
          <p className="page-subtitle">
            {jd_submission?.ollama_model_used || "cloud model"} ·{" "}
            {new Date(generation.created_at).toLocaleString()}
          </p>
        </div>
        <StatusStamp status={generation.status} />
      </div>

      {generation.status === "pending" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <Spinner label={PENDING_STAGES[stageIdx]} />
          <p
            className="page-subtitle"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            Local models can take a few minutes on CPU. This page checks
            progress every few seconds — safe to leave open or come back to it
            from History.
          </p>
        </div>
      )}

      {generation.status === "failed" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="error-box">{generation.error_message}</div>

          {generation.failure_stage === "jd_or_llm" && (
            <RetryWithNewJD
              id={id}
              onRetried={() => window.location.reload()}
            />
          )}
          {(generation.failure_stage === "compile" ||
            generation.failure_stage === "render") &&
            versions.length > 0 && (
              <p
                className="page-subtitle"
                style={{ marginTop: 12, marginBottom: 0 }}
              >
                Open the <b>LaTeX editor</b> tab below — you can edit it by
                hand, or click <b>Fix with AI</b> to send the error log back to
                the model.
              </p>
            )}
        </div>
      )}

      {generation.status === "done" && generation.error_message && (
        <div className="error-box" style={{ marginBottom: 20 }}>
          {generation.error_message}
        </div>
      )}

      {showTabs && (
        <>
          <div className="detail-grid">
            <div>
              <div className="detail-label">Category</div>
              <div className="detail-value mono">
                {company?.category || "—"}
              </div>
            </div>
            <div>
              <div className="detail-label">Package</div>
              <div className="detail-value mono">{company?.package || "—"}</div>
            </div>
          </div>

          <div className="filter-row" style={{ marginBottom: 12 }}>
            {[
              ["resume", "Generated resume"],
              ["jd", "Original JD"],
              ["tex", "LaTeX editor"],
            ].map(([key, label]) => (
              <button
                key={key}
                className="btn-ghost"
                style={
                  tab === key
                    ? { borderColor: "var(--accent)", color: "var(--text)" }
                    : {}
                }
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "resume" &&
            (generation.status === "done" ? (
              <iframe
                className="pdf-frame"
                title="pdf-viewer"
                src={generationPdfUrl(id)}
              />
            ) : (
              <div className="empty-state">
                No compiled resume for this generation — see the LaTeX editor
                tab.
              </div>
            ))}

          {tab === "jd" && (
            <iframe
              className="pdf-frame"
              title="pdf-viewer"
              src={generationJdUrl(id)}
            />
          )}

          {tab === "tex" && (
            <div>
              {versionsLoading && versions.length === 0 ? (
                <Spinner label="Loading versions…" />
              ) : versions.length === 0 ? (
                <div className="empty-state">
                  No LaTeX version exists yet for this generation — it failed
                  before rendering.
                  {generation.failure_stage === "jd_or_llm" &&
                    " Retry with a new JD above, once that succeeds a version will appear here."}
                </div>
              ) : (
                <>
                  <div
                    className="filter-row"
                    style={{ marginBottom: 12, alignItems: "center" }}
                  >
                    <select
                      value={activeVersionId || ""}
                      onChange={(e) => loadVersion(Number(e.target.value))}
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} {v.compiled ? "" : "(not compiled)"}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-ghost"
                      disabled={!dirty || savingVersion}
                      onClick={handleSaveVersion}
                    >
                      {savingVersion ? "Saving…" : "Save as new version"}
                    </button>
                    <button
                      className="btn-primary"
                      disabled={compiling || !activeVersionId}
                      onClick={handleCompile}
                    >
                      {compiling ? "Compiling…" : "Compile"}
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={!activeVersionId || fixing}
                      onClick={handleFixWithAI}
                    >
                      {fixing ? "Asking model to fix…" : "Fix with AI"}
                    </button>
                  </div>

                  {versionError && (
                    <div className="error-box">{versionError}</div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      alignItems: "start",
                      width: "calc(100vw - 220px - 88px)",
                      maxWidth: "none",
                      marginLeft: 0,
                    }}
                  >
                    <div className="editor-wrap">
                      <CodeMirror
                        value={editorContent}
                        height="70vh"
                        theme="dark"
                        extensions={[StreamLanguage.define(stex), texTheme]}
                        onChange={setEditorContent}
                      />
                    </div>

                    {activeVersion?.compiled ? (
                      <iframe
                        key={activeVersion.id}
                        className="pdf-frame"
                        title="version-pdf"
                        src={versionPdfUrl(id, activeVersion.id)}
                        style={{ height: "70vh" }}
                      />
                    ) : (
                      <div
                        className="empty-state"
                        style={{
                          height: "70vh",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        Not compiled yet — click Compile to generate a PDF for
                        this version.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
