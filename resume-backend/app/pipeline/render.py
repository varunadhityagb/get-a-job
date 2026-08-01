"""Ported from render.py — merges tailored dict + data.yaml into the .tex template."""
import re
import sys
from pathlib import Path

import yaml

SPECIAL_CHARS = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}
_SPECIAL_RE = re.compile("|".join(re.escape(k) for k in SPECIAL_CHARS))


def esc(text: str) -> str:
    text = text.replace("\\", r"\textbackslash{}")
    return _SPECIAL_RE.sub(lambda m: SPECIAL_CHARS[m.group(0)], text)


def replace_between(content: str, start_marker: str, end_marker: str, new_body: str) -> str:
    pattern = re.compile(re.escape(start_marker) + r".*?(?=" + re.escape(end_marker) + r")", re.DOTALL)
    if not pattern.search(content):
        raise ValueError(f"Could not find region between {start_marker!r} and {end_marker!r} in template.")
    replacement = start_marker + "\n" + new_body + "\n"
    return pattern.sub(lambda m: replacement, content, count=1)


def build_summary_block(summary: str) -> str:
    return f"\\section{{Profile Summary}}\n{esc(summary)}\n"


def build_projects_block(selected_projects, projects_by_id) -> str:
    parts = ["\\section{Projects}", "\\resumeSubHeadingListStart", ""]
    for proj in selected_projects:
        pdata = projects_by_id[proj["id"]]
        title = esc(pdata["title"])
        tagline = esc(pdata["tagline"])
        dates = esc(pdata["dates"])
        tech_line = esc("Tech: " + ", ".join(pdata["tech"]))

        parts.append(
            f"    \\resumeProject\n      {{{title}}}\n      {{{tagline}}}\n      {{{dates}}}\n      {{}}"
        )
        parts.append("    \\resumeItemListStart")
        for bullet in proj["bullets"]:
            parts.append(f"      \\item {esc(bullet)}")
        parts.append(f"      \\item \\textit{{{tech_line}}}")
        parts.append("    \\resumeItemListEnd")
        parts.append("")
    parts.append("  \\resumeSubHeadingListEnd")
    parts.append("")
    return "\n".join(parts)


def build_skills_block(skills_ordered) -> str:
    lines = [
        "\\section{Skills}",
        " \\begin{itemize}[leftmargin=0.05in, label={}, itemsep=1mm]",
        "    \\small{\\item{",
    ]
    display_names = {
        "Languages": "Languages",
        "Frameworks": "Frameworks",
        "Big_Data": "Big Data",
        "Key_Concepts": "Key Concepts",
        "Tools_and_Technologies": "Tools \\& Technologies",
        "Operating_Systems": "Operating Systems",
        "Monitoring_and_Debugging": "Monitoring \\& Debugging",
        "Networking": "Networking",
        "DBMS": "DBMS",
        "Java_Concepts": "Java Concepts",
    }
    cat_lines = []
    for category, skills in skills_ordered.items():
        label = display_names.get(category, category.replace("_", " "))
        skills_str = ", ".join(esc(s) for s in skills)
        cat_lines.append(f"     \\textbf{{{label}: }} {skills_str} \\\\")
    lines.append("\n".join(cat_lines))
    lines.append("    }}")
    lines.append(" \\end{itemize}")
    lines.append("")
    return "\n".join(lines)


def build_publications_block(pub_ids, pubs_by_id) -> str:
    if not pub_ids:
        return "\\section{Publications}\n \\resumeSubHeadingListStart\n \\resumeSubHeadingListEnd\n"
    lines = ["\\section{Publications}", " \\resumeSubHeadingListStart"]
    for pid in pub_ids:
        pub = pubs_by_id[pid]
        lines.append(f"    \\resumeItem{{{esc(pub['title'])}}}\\\\")
        lines.append(f"      {{{esc(pub['venue'])}}}")
    lines.append(" \\resumeSubHeadingListEnd")
    lines.append("")
    return "\n".join(lines)


def run_render(tailored: dict, data_yaml_path: Path, template_path: Path, out_tex_path: Path) -> Path:
    resume_data = yaml.safe_load(data_yaml_path.read_text())
    template = template_path.read_text()

    projects_by_id = {p["id"]: p for p in resume_data["projects"]}
    pubs_by_id = {p["id"]: p for p in resume_data.get("publications", [])}

    missing = [p["id"] for p in tailored["selected_projects"] if p["id"] not in projects_by_id]
    if missing:
        raise ValueError(f"Unknown project id(s) in tailored data: {missing}. Run validate first.")

    content = template
    content = replace_between(
        content, "%----------SUMMARY-----------------", "%----------EDUCATION-----------------",
        build_summary_block(tailored["summary"]),
    )
    content = replace_between(
        content, "%-----------PROJECTS-----------------", "%-----------SKILLS-----------------",
        build_projects_block(tailored["selected_projects"], projects_by_id),
    )
    content = replace_between(
        content, "%-----------SKILLS-----------------", "%-----------PUBLICATIONS-----------------",
        build_skills_block(tailored["skills_ordered"]),
    )
    content = replace_between(
        content, "%-----------PUBLICATIONS-----------------", "\\end{document}",
        build_publications_block(tailored.get("publications_to_include", []), pubs_by_id),
    )

    out_tex_path.write_text(content)
    return out_tex_path


def compile_pdf(tex_path: Path) -> Path:
    """Runs xelatex twice (for stable refs) in the tex file's directory.

    On failure, raises with the tail of resume.log included — xelatex's own
    exit code/stderr is nearly useless on its own ("returned non-zero exit
    status"), but the .log it writes has the actual error a few lines from
    the end. Surfacing that here means a failed generation is debuggable
    from the generation's error_message in the UI instead of requiring
    `docker exec` into the container to read the log by hand.
    """
    import subprocess

    workdir = tex_path.parent
    log_path = tex_path.with_suffix(".log")

    for _ in range(2):
        result = subprocess.run(
            ["xelatex", "-interaction=nonstopmode", "-halt-on-error", tex_path.name],
            cwd=workdir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            tail = ""
            if log_path.exists():
                lines = log_path.read_text(errors="replace").splitlines()
                tail = "\n".join(lines[-40:])
            raise RuntimeError(
                f"xelatex failed (exit {result.returncode}).\n\n"
                f"--- last 40 lines of resume.log ---\n{tail}"
            )

    pdf_path = tex_path.with_suffix(".pdf")
    if not pdf_path.exists():
        raise RuntimeError("xelatex ran but no PDF was produced.")
    return pdf_path
