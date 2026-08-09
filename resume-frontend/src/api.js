// Default to whatever host the page itself was loaded from, on port 8000.
// "localhost" only means "the backend's machine" when you're ON that
// machine — from a phone on the LAN it means the phone, so localhost
// silently fails there. Falling back to window.location.hostname makes
// http://<laptop-lan-ip>:5173 correctly talk to http://<laptop-lan-ip>:8000.
// Override with VITE_API_BASE in .env if backend/frontend aren't on the
// same host or port pairing ever changes.
const API_BASE = import.meta.env.VITE_API_BASE || `http://100.70.52.122:8010`;

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res;
}

export async function getOllamaModels() {
  const res = await fetch(`${API_BASE}/api/ollama/models`);
  await handle(res);
  return (await res.json()).models;
}

export async function getResumeDataStatus() {
  const res = await fetch(`${API_BASE}/api/resume-data/status`);
  await handle(res);
  return (await res.json()).exists;
}

export async function getResumeData() {
  const res = await fetch(`${API_BASE}/api/resume-data`);
  await handle(res);
  return (await res.json()).content;
}

export async function putResumeData(content) {
  const res = await fetch(`${API_BASE}/api/resume-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  await handle(res);
  return res.json();
}

export async function uploadResumeData(file, overwrite = false) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/resume-data/upload?overwrite=${overwrite}`,
    {
      method: "POST",
      body: fd,
    },
  );
  await handle(res);
  return res.json();
}

export async function getTemplateStatus() {
  const res = await fetch(`${API_BASE}/api/template/status`);
  await handle(res);
  return (await res.json()).exists;
}

export async function uploadTemplate(file, overwrite = false) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `${API_BASE}/api/template/upload?overwrite=${overwrite}`,
    {
      method: "POST",
      body: fd,
    },
  );
  await handle(res);
  return res.json();
}

export async function createGeneration(form) {
  const fd = new FormData();
  fd.append("company_name", form.companyName);
  if (form.category) fd.append("category", form.category);
  if (form.package) fd.append("package", form.package);
  fd.append("model", form.model);
  fd.append("use_cloud", form.useCloud ? "true" : "false");
  fd.append("jd_file", form.jdFile);

  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    body: fd,
  });
  await handle(res);
  return res.json();
}

export async function listGenerations() {
  const res = await fetch(`${API_BASE}/api/generations`);
  await handle(res);
  return res.json();
}

export async function getGeneration(id) {
  const res = await fetch(`${API_BASE}/api/generations/${id}`);
  await handle(res);
  return res.json();
}

export function generationPdfUrl(id) {
  return `${API_BASE}/api/generations/${id}/pdf`;
}

export function generationJdUrl(id) {
  return `${API_BASE}/api/generations/${id}/jd`;
}

export async function getGenerationTex(id) {
  const res = await fetch(`${API_BASE}/api/generations/${id}/tex`);
  await handle(res);
  return (await res.json()).content;
}

export function exportUrl(format) {
  return `${API_BASE}/api/export?format=${format}`;
}

export async function listVersions(genId) {
  const res = await fetch(`${API_BASE}/api/generations/${genId}/versions`);
  await handle(res);
  return res.json();
}

export async function getVersionTex(genId, versionId) {
  const res = await fetch(
    `${API_BASE}/api/generations/${genId}/versions/${versionId}/tex`,
  );
  await handle(res);
  return (await res.json()).content;
}

export async function createVersion(genId, content) {
  const res = await fetch(`${API_BASE}/api/generations/${genId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  await handle(res);
  return res.json();
}

export async function compileVersion(genId, versionId) {
  const res = await fetch(
    `${API_BASE}/api/generations/${genId}/versions/${versionId}/compile`,
    {
      method: "POST",
    },
  );
  await handle(res);
  return res.json();
}

export function versionPdfUrl(genId, versionId) {
  return `${API_BASE}/api/generations/${genId}/versions/${versionId}/pdf`;
}

export async function retryGeneration(id, { jdFile, model, useCloud } = {}) {
  const fd = new FormData();
  if (jdFile) fd.append("jd_file", jdFile);
  if (model) fd.append("model", model);
  if (useCloud !== undefined)
    fd.append("use_cloud", useCloud ? "true" : "false");
  const res = await fetch(`${API_BASE}/api/generations/${id}/retry`, {
    method: "POST",
    body: fd,
  });
  await handle(res);
  return res.json();
}

export async function fixVersion(
  genId,
  versionId,
  { useCloud = true, model } = {},
) {
  const res = await fetch(
    `${API_BASE}/api/generations/${genId}/versions/${versionId}/fix`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_cloud: useCloud, model }),
    },
  );
  await handle(res);
  return res.json();
}
