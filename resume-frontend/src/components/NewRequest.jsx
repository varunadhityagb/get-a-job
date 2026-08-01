import { useEffect, useState } from "react";
import { createGeneration, getOllamaModels } from "../api";
import Spinner from "./Spinner";

export default function NewRequest({ onCreated }) {
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("");
  const [pkg, setPkg] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelError, setModelError] = useState(null);
  const [model, setModel] = useState("");
  const [useCloud, setUseCloud] = useState(false);
  const [jdFile, setJdFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    getOllamaModels()
      .then((list) => {
        setModels(list);
        if (list.length) setModel(list[0]);
      })
      .catch((e) => setModelError(e.message))
      .finally(() => setModelsLoading(false));
  }, []);

  function handleFile(f) {
    if (f) setJdFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName || !jdFile || (!useCloud && !model)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createGeneration({
        companyName,
        category,
        package: pkg,
        model: useCloud ? "claude-sonnet-4-6" : model,
        useCloud,
        jdFile,
      });
      setCompanyName("");
      setCategory("");
      setPkg("");
      setJdFile(null);
      onCreated?.(result.generation_id);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">New request</h1>
      <p className="page-subtitle">Tie a job description to a company, pick a model, and generate a tailored resume.</p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="row-2">
          <div className="field">
            <label htmlFor="company">Company</label>
            <input
              id="company"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="package">Package offered</label>
            <input
              id="package"
              type="text"
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
              placeholder="12 LPA, or leave blank"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="category">Category / tags</label>
          <input
            id="category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="product, startup — comma-separated, your own vocabulary"
          />
        </div>

        <div className="field">
          <label>Job description</label>
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
                Selected
                <div className="fname">{jdFile.name}</div>
              </>
            ) : (
              "Drop a JD PDF here, or click to browse"
            )}
            <input
              type="file"
              accept=".pdf,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="row-2">
          <div className="field">
            <label htmlFor="model">Model</label>
            {modelsLoading ? (
              <Spinner label="Checking Ollama for installed models…" />
            ) : (
              <select
                id="model"
                value={useCloud ? "__cloud__" : model}
                onChange={(e) => {
                  if (e.target.value === "__cloud__") {
                    setUseCloud(true);
                  } else {
                    setUseCloud(false);
                    setModel(e.target.value);
                  }
                }}
              >
                {modelError && <option value="">Ollama unreachable</option>}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="__cloud__">Claude (cloud, --cloud)</option>
              </select>
            )}
            {modelError && (
              <span style={{ color: "var(--thread-rust)", fontSize: 12 }}>
                {modelError} — check Ollama is running, or use the cloud model.
              </span>
            )}
          </div>
        </div>

        {submitError && <div className="error-box">{submitError}</div>}

        <hr className="stitch" />

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? <Spinner label="Submitting…" /> : "Generate resume"}
        </button>
      </form>
    </div>
  );
}
