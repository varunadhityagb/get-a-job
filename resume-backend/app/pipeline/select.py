"""
Ported from the original llm_select.py CLI script.
Same logic, exposed as functions the FastAPI backend can call directly
instead of shelling out.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import requests
import yaml

# Configurable so this works both bare-metal (localhost) and inside Docker,
# where "localhost" resolves to the container, not the host running Ollama.
# docker-compose.yml sets this to http://host.docker.internal:11434.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

SYSTEM_PROMPT = """You are a resume-tailoring assistant. You will be given:
1. RESUME_DATA (YAML) — the candidate's full factual project/skill history.
2. JD — a job description (raw extracted text, may have odd line breaks from PDF extraction).

Your job: produce a tailored resume content JSON for this JD.

HARD RULES (do not break these):
- Every metric, number, dataset size, accuracy %, tool, or technology you
  write MUST come from RESUME_DATA. Never invent or exaggerate a fact that
  isn't present there. You MAY rephrase, reorder, re-emphasize, and choose
  which true facts to foreground for this JD.
- Do not claim skills, tools or experience not present anywhere in
  RESUME_DATA, even if the JD asks for them.
- Select 3 to 5 projects from RESUME_DATA["projects"] most relevant to the
  JD (use `tags`, `tech`, and `tagline` fields as guidance, but judge
  relevance on the full JD, not just tag overlap).
- For each selected project, write 2-4 bullets FRESH — do not just copy
  `bullet_variants` verbatim; use them as factual raw material and rewrite
  for clarity, impact, and JD keyword alignment where truthful. Each bullet
  should be one line, resume-style (no "I", start with a strong verb).
- Write a fresh 3-4 sentence profile summary. Use `summary_variants` only
  as tonal/style reference, not a template to copy.
  SUMMARY RULES — these are as important as the factual grounding rules:
  * NEVER name the hiring company. No "Viasat's global satellite network",
    no "excited to join [Company]", no company name anywhere in the summary.
    The reader already knows what company this is; naming it reads as
    flattery, not qualification.
  * NEVER write a closing "eager to apply / passionate about contributing to
    X's mission" sentence. This is the single most common failure mode —
    it invents an aspiration the candidate never stated and reads as
    generic, try-hard filler. Do not write ANY sentence whose sole content
    is enthusiasm or aspiration rather than a fact about the candidate.
  * Every sentence must contain a concrete, checkable claim: a skill, a
    project category, a technology, a role. If you can delete a sentence
    and lose zero information about the candidate, delete it — don't
    replace it with an aspirational one.
  * Do not mirror the JD's own buzzwords back as if describing the
    candidate's motivation (e.g. JD says "global satellite network" ->
    summary should NOT parrot "satellite network"). Mirror the JD's
    *skill/domain keywords* only insofar as the candidate's actual
    projects support them (e.g. "distributed systems", "real-time
    monitoring") — never the company's product description.
  * The summary should answer one question:
    "Who is [Me] as a [Role] in [Company]?", not "What did one of his/her projects achieve?"
  * Tone: plain, factual, resume-register. Not a cover letter. If a
    sentence would sound at home in a cover letter's closing paragraph,
    it does not belong here.
- Reorder each skills category so JD-relevant skills come first. Every skill
  you output MUST already appear either in RESUME_DATA["skills"] OR in the
  `tech` list of one of the projects you selected in `selected_projects`.
  Do not add any skill/tool/framework that isn't grounded in one of those
  two places, even if it's true you've heard of it or the JD wants it. You
  may omit low-relevance categories entirely if the JD clearly doesn't call
  for them, but keep at least Languages and one or two others always.
- If a selected project has a `publication_id`, include it in
  `publications_to_include`.

OUTPUT FORMAT:
Return ONLY valid JSON, no markdown fences, no commentary, matching this
exact shape:

{
  "summary": "string",
  "selected_projects": [
    {"id": "project_id_from_yaml", "bullets": ["bullet 1", "bullet 2"]}
  ],
  "skills_ordered": {"CategoryName": ["skill1", "skill2"]},
  "publications_to_include": ["publication_id", ...]
}
"""


def extract_jd_text(jd_path: Path) -> str:
    if jd_path.suffix.lower() == ".pdf":
        result = subprocess.run(
            ["pdftotext", "-layout", str(jd_path), "-"],
            capture_output=True,
            text=True,
            check=True,
        )
        text = result.stdout.strip()
        if not text:
            raise RuntimeError(
                f"No extractable text in {jd_path} — it may be a scanned/image PDF."
            )
        return text
    return jd_path.read_text().strip()


def list_ollama_models() -> list[str]:
    """Hits Ollama's own /api/tags endpoint to list locally installed models."""
    resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
    resp.raise_for_status()
    return [m["name"] for m in resp.json().get("models", [])]


def call_llm_ollama(system_prompt: str, user_content: str, model: str) -> str:
    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "stream": False,
            "format": "json",
            "options": {"num_ctx": 8192},
        },
        timeout=600,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def call_llm_ollama_raw(system_prompt: str, user_content: str, model: str) -> str:
    resp = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": model,
            "messages": [{"role": "system", "content": system_prompt},
                         {"role": "user", "content": user_content}],
            "stream": False,
            "options": {"num_ctx": 8192},
        },
        timeout=600,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"]


def call_llm_cloud(
    system_prompt: str, user_content: str, model: str = "claude-sonnet-4-6"
) -> str:
    import anthropic

    client = anthropic.Anthropic()  # expects ANTHROPIC_API_KEY in env
    msg = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    return "".join(block.text for block in msg.content if block.type == "text")


def _clean_json(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    return cleaned


def run_select(
    jd_path: Path,
    data_yaml_path: Path,
    model: str = "llama3.2:latest",
    use_cloud: bool = False,
) -> tuple[dict, str]:
    """Returns (tailored_dict, extracted_jd_text)."""
    jd_text = extract_jd_text(jd_path)
    resume_data = yaml.safe_load(data_yaml_path.read_text())
    resume_yaml_str = yaml.dump(resume_data, sort_keys=False, allow_unicode=True)

    user_content = f"RESUME_DATA (YAML):\n{resume_yaml_str}\n\nJD:\n{jd_text}\n"

    if use_cloud:
        raw = call_llm_cloud(SYSTEM_PROMPT, user_content, model)
    else:
        raw = call_llm_ollama(SYSTEM_PROMPT, user_content, model)

    cleaned = _clean_json(raw)
    try:
        tailored = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"LLM did not return valid JSON. Raw output:\n{raw}") from e

    return tailored, jd_text
