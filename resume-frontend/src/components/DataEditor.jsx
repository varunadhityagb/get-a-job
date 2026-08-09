import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import {
  getResumeData,
  getResumeDataStatus,
  getTemplateStatus,
  putResumeData,
  uploadResumeData,
  uploadTemplate,
} from "../api";
import Spinner from "./Spinner";
import UploadCard from "./UploadCard";

const theme = EditorView.theme(
  {
    "&": { fontSize: "13px", fontFamily: "var(--font-mono)" },
    ".cm-content": { caretColor: "#b8925a" },
    ".cm-gutters": {
      backgroundColor: "#161b23",
      color: "#5c6577",
      border: "none",
    },
  },
  { dark: true },
);

const REQUIRED_MARKERS = [
  "%----------SUMMARY-----------------",
  "%----------EDUCATION-----------------",
  "%-----------PROJECTS-----------------",
  "%-----------SKILLS-----------------",
  "%-----------CERTIFICATIONS-----------------",
  "%-----------PUBLICATIONS-----------------",
  "\\end{document}",
];

export default function DataEditor() {
  const [checking, setChecking] = useState(true);
  const [dataExists, setDataExists] = useState(false);
  const [templateExists, setTemplateExists] = useState(false);
  const [showTemplateSection, setShowTemplateSection] = useState(false);

  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState("idle");

  async function refreshStatus() {
    setChecking(true);
    try {
      const [de, te] = await Promise.all([
        getResumeDataStatus(),
        getTemplateStatus(),
      ]);
      setDataExists(de);
      setTemplateExists(te);
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (!dataExists) return;
    setContentLoading(true);
    getResumeData()
      .then((c) => {
        setContent(c);
        setOriginal(c);
      })
      .catch((e) => setError(e.message))
      .finally(() => setContentLoading(false));
  }, [dataExists]);

  async function handleSave() {
    setSaveState("saving");
    try {
      await putResumeData(content);
      setOriginal(content);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setError(e.message);
      setSaveState("error");
    }
  }

  const dirty = content !== original;

  if (checking)
    return (
      <div style={{ padding: "40px 0" }}>
        <Spinner label="Checking for existing data.yaml and template…" />
      </div>
    );

  // First-run: nothing uploaded yet. No docker cp needed — upload straight
  // from the browser, and get the same grounding/marker validation the
  // backend already does on every save.
  if (!dataExists || !templateExists) {
    return (
      <div>
        <h1 className="page-title">Resume data</h1>
        <p className="page-subtitle">
          First run — upload your resume data and LaTeX template to get started.
          Both are stored on the server and can be edited or replaced later from
          this page.
        </p>

        <div style={{ display: "grid", gap: 20 }}>
          {!dataExists && (
            <UploadCard
              title="data.yaml"
              hint="Your ground-truth resume data — projects, skills, publications, summary variants."
              accept=".yaml,.yml"
              onUpload={async (file, overwrite) => {
                await uploadResumeData(file, overwrite);
                await refreshStatus();
              }}
            />
          )}
          {!templateExists && (
            <UploadCard
              title="LaTeX template"
              hint={
                <>
                  Any <code className="mono">.tex</code> file works, as long as
                  it contains the marker comments{" "}
                  <code className="mono">render.py</code> uses to know where to
                  write:
                  <ul className="marker-list">
                    {REQUIRED_MARKERS.map((m) => (
                      <li key={m}>
                        <code className="mono">{m}</code>
                      </li>
                    ))}
                  </ul>
                  A template missing any of these is rejected and you're told
                  which.
                </>
              }
              accept=".tex"
              onUpload={async (file, overwrite) => {
                await uploadTemplate(file, overwrite);
                await refreshStatus();
              }}
            />
          )}
        </div>

        {error && (
          <div className="error-box" style={{ marginTop: 20 }}>
            Couldn't check setup status — the backend may not be running, or may
            need a rebuild (detail: {error}).
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Resume data</h1>
      <p className="page-subtitle">
        The ground truth — every project, skill, and metric the model is allowed
        to draw from. Edited directly, no round-trip through a file manager.
      </p>

      <div className="editor-toolbar">
        <button
          className="btn-ghost"
          onClick={() => setShowTemplateSection((s) => !s)}
        >
          {showTemplateSection
            ? "Hide template upload"
            : "Replace LaTeX template…"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="save-status">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save failed"}
            {saveState === "idle" && dirty && "Unsaved changes"}
            {saveState === "idle" && !dirty && "Up to date"}
          </span>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!dirty || saveState === "saving"}
          >
            Save changes
          </button>
        </div>
      </div>

      {showTemplateSection && (
        <div style={{ marginBottom: 20 }}>
          <UploadCard
            title="Replace LaTeX template"
            hint="Uploading a new template requires the same marker comments as before, and overwrites the current one."
            accept=".tex"
            overwriteLabel="Replace existing template"
            onUpload={async (file, overwrite) => {
              await uploadTemplate(file, overwrite);
            }}
          />
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {contentLoading ? (
        <Spinner label="Loading data.yaml…" />
      ) : (
        <div className="editor-wrap">
          <CodeMirror
            value={content}
            height="70vh"
            theme="dark"
            extensions={[yaml(), theme]}
            onChange={(val) => setContent(val)}
          />
        </div>
      )}
    </div>
  );
}
