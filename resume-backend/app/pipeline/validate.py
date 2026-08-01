"""Ported from validate.py — same grounding checks, callable in-process."""
from pathlib import Path

import yaml


def run_validate(tailored: dict, data_yaml_path: Path, strict: bool = False) -> tuple[dict, list[str]]:
    resume_data = yaml.safe_load(data_yaml_path.read_text())

    all_project_ids = {p["id"] for p in resume_data["projects"]}
    projects_by_id = {p["id"]: p for p in resume_data["projects"]}
    all_pub_ids = {p["id"] for p in resume_data.get("publications", [])}

    problems: list[str] = []

    valid_selected = []
    for proj in tailored.get("selected_projects", []):
        pid = proj.get("id")
        if pid not in all_project_ids:
            problems.append(f"Unknown project id '{pid}' in selected_projects — dropped.")
            continue
        valid_selected.append(proj)
    tailored["selected_projects"] = valid_selected

    grounded_skills = set()
    for cat_skills in resume_data.get("skills", {}).values():
        grounded_skills.update(s.lower() for s in cat_skills)
    for proj in valid_selected:
        pid = proj["id"]
        grounded_skills.update(t.lower() for t in projects_by_id[pid].get("tech", []))

    cleaned_skills = {}
    for category, skills in tailored.get("skills_ordered", {}).items():
        kept = []
        for s in skills:
            if s.lower() in grounded_skills:
                kept.append(s)
            else:
                problems.append(f"Ungrounded skill '{s}' in category '{category}' — dropped.")
        if kept:
            cleaned_skills[category] = kept
    tailored["skills_ordered"] = cleaned_skills

    valid_pubs = []
    for pid in tailored.get("publications_to_include", []):
        if pid not in all_pub_ids:
            problems.append(f"Unknown publication id '{pid}' — dropped.")
            continue
        valid_pubs.append(pid)
    tailored["publications_to_include"] = valid_pubs

    ASPIRATION_PATTERNS = [
        "eager to", "passionate about", "excited to", "looking forward to",
        "thrilled to", "committed to contributing", "aspire to",
    ]

    summary = tailored.get("summary", "")
    summary_lower = summary.lower()
    for phrase in ASPIRATION_PATTERNS:
        if phrase in summary_lower:
            problems.append(f"Summary contains aspirational filler phrase ('{phrase}') — flagged for review.")


    if problems and strict:
        raise ValueError("Strict validation failed:\n" + "\n".join(problems))

    return tailored, problems
