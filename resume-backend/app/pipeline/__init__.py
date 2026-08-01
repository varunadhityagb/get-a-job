from pathlib import Path

APP_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
JD_DIR = APP_DATA_DIR / "jds"
RESUME_DIR = APP_DATA_DIR / "resumes"
RESUME_DATA_YAML = APP_DATA_DIR / "data.yaml"
TEX_TEMPLATE = APP_DATA_DIR / "resume_template.tex"

for d in (APP_DATA_DIR, JD_DIR, RESUME_DIR):
    d.mkdir(parents=True, exist_ok=True)
