import csv
import io
import json
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlmodel import Session, select

from .db import get_session, init_db
from .models import Company, JDSubmission, ResumeGeneration, TexVersion
from .pipeline import JD_DIR, RESUME_DATA_YAML, RESUME_DIR, TEX_TEMPLATE
from .pipeline.render import compile_pdf, run_render
from .pipeline.select import list_ollama_models, run_select
from .pipeline.validate import run_validate

app = FastAPI(title="Resume Tailoring API")

# LAN/Tailscale-only deployment — CORS left open for the frontend origin(s)
# on the local network. Tighten if this ever goes internet-facing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# ---------- Ollama models ----------

@app.get("/api/ollama/models")
def get_ollama_models():
    try:
        return {"models": list_ollama_models()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Ollama: {e}")


# ---------- resume_data.yaml editing ----------

@app.get("/api/resume-data/status")
def resume_data_status():
    return {"exists": RESUME_DATA_YAML.exists()}


@app.get("/api/resume-data")
def get_resume_data():
    if not RESUME_DATA_YAML.exists():
        raise HTTPException(status_code=404, detail="data.yaml not found on server yet.")
    return {"content": RESUME_DATA_YAML.read_text()}


@app.put("/api/resume-data")
def put_resume_data(payload: dict):
    content = payload.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="Missing 'content'.")
    _validate_yaml_text(content)
    RESUME_DATA_YAML.write_text(content)
    return {"status": "saved"}


@app.post("/api/resume-data/upload")
async def upload_resume_data(file: UploadFile = File(...), overwrite: bool = False):
    if RESUME_DATA_YAML.exists() and not overwrite:
        raise HTTPException(
            status_code=409,
            detail="data.yaml already exists — pass overwrite=true to replace it.",
        )
    content = (await file.read()).decode("utf-8")
    _validate_yaml_text(content)
    RESUME_DATA_YAML.write_text(content)
    return {"status": "saved"}


def _validate_yaml_text(content: str) -> None:
    import yaml as _yaml

    try:
        parsed = _yaml.safe_load(content)
    except _yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="YAML must parse to a top-level mapping.")
    # Soft check, not a hard requirement — the pipeline scripts will fail
    # loudly and specifically later if a key is actually missing, but this
    # catches an obviously-wrong file (e.g. someone uploads a JD by mistake)
    # right at upload time instead of on the next generation attempt.
    missing = [k for k in ("personal", "projects", "skills") if k not in parsed]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"YAML is missing expected top-level key(s): {missing}. "
            "Is this the right file?",
        )


# ---------- resume_template.tex ----------

REQUIRED_TEX_MARKERS = [
    "%----------SUMMARY-----------------",
    "%----------EDUCATION-----------------",
    "%-----------PROJECTS-----------------",
    "%-----------SKILLS-----------------",
    "%-----------PUBLICATIONS-----------------",
    "\\end{document}",
]


@app.get("/api/template/status")
def template_status():
    return {"exists": TEX_TEMPLATE.exists()}


@app.get("/api/template")
def get_template():
    if not TEX_TEMPLATE.exists():
        raise HTTPException(status_code=404, detail="resume_template.tex not found on server yet.")
    return {"content": TEX_TEMPLATE.read_text()}


@app.post("/api/template/upload")
async def upload_template(file: UploadFile = File(...), overwrite: bool = False):
    if TEX_TEMPLATE.exists() and not overwrite:
        raise HTTPException(
            status_code=409,
            detail="resume_template.tex already exists — pass overwrite=true to replace it.",
        )
    content = (await file.read()).decode("utf-8")
    missing = [m for m in REQUIRED_TEX_MARKERS if m not in content]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Template is missing required marker comment(s): "
                f"{missing}. render.py replaces content strictly between these "
                "markers, so any .tex file can be used as long as it contains "
                "them in order — add them to your template, or ask me to make "
                "the markers configurable."
            ),
        )
    TEX_TEMPLATE.write_text(content)
    return {"status": "saved"}


# ---------- generation pipeline ----------

def _run_pipeline_job(generation_id: int, jd_path: Path, model: str, use_cloud: bool):
    from .db import engine

    with Session(engine) as session:
        gen = session.get(ResumeGeneration, generation_id)
        try:
            tailored, jd_text = run_select(jd_path, RESUME_DATA_YAML, model=model, use_cloud=use_cloud)
            tailored, problems = run_validate(tailored, RESUME_DATA_YAML, strict=False)

            gen_dir = RESUME_DIR / str(generation_id)
            gen_dir.mkdir(parents=True, exist_ok=True)
            tex_path = gen_dir / "resume.tex"
            run_render(tailored, RESUME_DATA_YAML, TEX_TEMPLATE, tex_path)
            pdf_path = compile_pdf(tex_path)

            initial_version = TexVersion(
                            generation_id=generation_id,
                            label="generated",
                            tex_path=str(tex_path),
                            pdf_path=str(pdf_path),
                            compiled=True,
                        )
            session.add(initial_version)

            jd_sub = session.get(JDSubmission, gen.jd_submission_id)
            jd_sub.jd_text_extracted = jd_text
            session.add(jd_sub)

            gen.tailored_json = json.dumps(tailored, indent=2)
            gen.resume_tex_path = str(tex_path)
            gen.resume_pdf_path = str(pdf_path)
            gen.status = "done"
            if problems:
                gen.error_message = "Auto-stripped ungrounded content:\n" + "\n".join(problems)
        except Exception as e:
            gen.status = "failed"
            gen.error_message = str(e)
        session.add(gen)
        session.commit()


@app.post("/api/generate")
def generate(
    background_tasks: BackgroundTasks,
    company_name: str = Form(...),
    category: Optional[str] = Form(None),
    package: Optional[str] = Form(None),
    model: str = Form("llama3.2:latest"),
    use_cloud: bool = Form(False),
    jd_file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    if not RESUME_DATA_YAML.exists():
        raise HTTPException(status_code=409, detail="No data.yaml uploaded yet — upload one on the Resume Data page first.")
    if not TEX_TEMPLATE.exists():
        raise HTTPException(status_code=409, detail="No resume template uploaded yet — upload one on the Resume Data page first.")

    company = Company(name=company_name, category=category, package=package)
    session.add(company)
    session.commit()
    session.refresh(company)

    ext = Path(jd_file.filename).suffix or ".pdf"
    jd_filename = f"{uuid.uuid4().hex}{ext}"
    jd_path = JD_DIR / jd_filename
    with jd_path.open("wb") as f:
        shutil.copyfileobj(jd_file.file, f)

    jd_sub = JDSubmission(
        company_id=company.id,
        jd_file_path=str(jd_path),
        ollama_model_used=None if use_cloud else model,
        use_cloud=use_cloud,
    )
    session.add(jd_sub)
    session.commit()
    session.refresh(jd_sub)

    gen = ResumeGeneration(jd_submission_id=jd_sub.id, status="pending")
    session.add(gen)
    session.commit()
    session.refresh(gen)

    background_tasks.add_task(_run_pipeline_job, gen.id, jd_path, model, use_cloud)

    return {"generation_id": gen.id, "status": gen.status}


# ---------- history ----------

@app.get("/api/generations")
def list_generations(session: Session = Depends(get_session)):
    gens = session.exec(select(ResumeGeneration).order_by(ResumeGeneration.created_at.desc())).all()
    out = []
    for gen in gens:
        jd_sub = session.get(JDSubmission, gen.jd_submission_id)
        company = session.get(Company, jd_sub.company_id) if jd_sub else None
        out.append(
            {
                "id": gen.id,
                "status": gen.status,
                "created_at": gen.created_at,
                "company_name": company.name if company else None,
                "category": company.category if company else None,
                "package": company.package if company else None,
                "model_used": jd_sub.ollama_model_used if jd_sub else None,
            }
        )
    return out


@app.get("/api/generations/{generation_id}")
def get_generation(generation_id: int, session: Session = Depends(get_session)):
    gen = session.get(ResumeGeneration, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Not found")
    jd_sub = session.get(JDSubmission, gen.jd_submission_id)
    company = session.get(Company, jd_sub.company_id) if jd_sub else None
    return {
        "generation": gen,
        "jd_submission": jd_sub,
        "company": company,
        "tailored_json": json.loads(gen.tailored_json) if gen.tailored_json else None,
    }


@app.get("/api/generations/{generation_id}/pdf")
def get_generation_pdf(generation_id: int, session: Session = Depends(get_session)):
    gen = session.get(ResumeGeneration, generation_id)
    if not gen or not gen.resume_pdf_path:
        raise HTTPException(status_code=404, detail="PDF not available")
    return FileResponse(gen.resume_pdf_path, media_type="application/pdf")


@app.get("/api/generations/{generation_id}/tex")
def get_generation_tex(generation_id: int, session: Session = Depends(get_session)):
    gen = session.get(ResumeGeneration, generation_id)
    if not gen or not gen.resume_tex_path:
        raise HTTPException(status_code=404, detail="LaTeX source not available")
    tex_path = Path(gen.resume_tex_path)
    if not tex_path.exists():
        raise HTTPException(status_code=404, detail="LaTeX source file missing on disk")
    return {"content": tex_path.read_text()}


@app.get("/api/generations/{generation_id}/jd")
def get_generation_jd(generation_id: int, session: Session = Depends(get_session)):
    gen = session.get(ResumeGeneration, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Not found")
    jd_sub = session.get(JDSubmission, gen.jd_submission_id)
    return FileResponse(jd_sub.jd_file_path)


# ---------- export ----------

@app.get("/api/export")
def export_data(format: str = "json", session: Session = Depends(get_session)):
    companies = session.exec(select(Company)).all()
    jd_subs = session.exec(select(JDSubmission)).all()
    gens = session.exec(select(ResumeGeneration)).all()

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["generation_id", "status", "company", "category", "package",
             "model_used", "created_at", "resume_pdf_path"]
        )
        jd_by_id = {j.id: j for j in jd_subs}
        company_by_id = {c.id: c for c in companies}
        for gen in gens:
            jd_sub = jd_by_id.get(gen.jd_submission_id)
            company = company_by_id.get(jd_sub.company_id) if jd_sub else None
            writer.writerow(
                [gen.id, gen.status, company.name if company else "", company.category if company else "",
                 company.package if company else "", jd_sub.ollama_model_used if jd_sub else "",
                 gen.created_at, gen.resume_pdf_path or ""]
            )
        buf.seek(0)
        return StreamingResponse(
            buf, media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"},
        )

    return {
        "companies": [c.model_dump() for c in companies],
        "jd_submissions": [j.model_dump() for j in jd_subs],
        "generations": [g.model_dump() for g in gens],
    }

# ---------- tex versions ----------

@app.get("/api/generations/{generation_id}/versions")
def list_versions(generation_id: int, session: Session = Depends(get_session)):
    versions = session.exec(
        select(TexVersion).where(TexVersion.generation_id == generation_id).order_by(TexVersion.id)
    ).all()

    if not versions:
        gen = session.get(ResumeGeneration, generation_id)
        if gen and gen.resume_tex_path:
            backfilled = TexVersion(
                generation_id=generation_id,
                label="generated",
                tex_path=gen.resume_tex_path,
                pdf_path=gen.resume_pdf_path,
                compiled=bool(gen.resume_pdf_path and Path(gen.resume_pdf_path).exists()),
            )
            session.add(backfilled)
            session.commit()
            session.refresh(backfilled)
            versions = [backfilled]

    return versions


@app.get("/api/generations/{generation_id}/versions/{version_id}/tex")
def get_version_tex(generation_id: int, version_id: int, session: Session = Depends(get_session)):
    v = session.get(TexVersion, version_id)
    if not v or v.generation_id != generation_id:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"content": Path(v.tex_path).read_text()}


@app.post("/api/generations/{generation_id}/versions")
def create_version(generation_id: int, payload: dict, session: Session = Depends(get_session)):
    """Saves edited LaTeX as a new version (edit1, edit2, ...). Does NOT compile —
    call the compile endpoint separately so editing never silently recompiles."""
    content = payload.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="Missing 'content'.")

    gen = session.get(ResumeGeneration, generation_id)
    if not gen:
        raise HTTPException(status_code=404, detail="Generation not found")

    existing = session.exec(
        select(TexVersion).where(TexVersion.generation_id == generation_id)
    ).all()
    edit_nums = [
        int(v.label[4:]) for v in existing if v.label.startswith("edit") and v.label[4:].isdigit()
    ]
    label = f"edit{max(edit_nums, default=0) + 1}"

    gen_dir = RESUME_DIR / str(generation_id)
    gen_dir.mkdir(parents=True, exist_ok=True)
    tex_path = gen_dir / f"{label}.tex"
    tex_path.write_text(content)

    version = TexVersion(generation_id=generation_id, label=label, tex_path=str(tex_path))
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


@app.post("/api/generations/{generation_id}/versions/{version_id}/compile")
def compile_version(generation_id: int, version_id: int, session: Session = Depends(get_session)):
    """Recompiles this version's .tex in place. Overwrites this version's own PDF —
    never creates a new version or a new PDF file, so re-running is idempotent."""
    v = session.get(TexVersion, version_id)
    if not v or v.generation_id != generation_id:
        raise HTTPException(status_code=404, detail="Version not found")
    try:
        pdf_path = compile_pdf(Path(v.tex_path))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    v.pdf_path = str(pdf_path)
    v.compiled = True
    session.add(v)
    session.commit()
    return {"status": "compiled"}


@app.get("/api/generations/{generation_id}/versions/{version_id}/pdf")
def get_version_pdf(generation_id: int, version_id: int, session: Session = Depends(get_session)):
    v = session.get(TexVersion, version_id)
    if not v or v.generation_id != generation_id:
        raise HTTPException(status_code=404, detail="Version not found")
    if not v.pdf_path or not Path(v.pdf_path).exists():
        raise HTTPException(status_code=404, detail="Not compiled yet — hit Compile first.")
    return FileResponse(v.pdf_path, media_type="application/pdf")
