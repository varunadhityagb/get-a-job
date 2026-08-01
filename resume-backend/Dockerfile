# syntax=docker/dockerfile:1
FROM python:3.12-slim

# xelatex needs a real TeX Live, not just texlive-latex-base — this pulls in
# the fonts and xetex engine your resume_template.tex actually needs.
# poppler-utils gives us pdftotext for JD extraction.
#
# cfr-lm.sty (required by your template) only ships inside Debian's
# texlive-fonts-extra collection — Debian doesn't split it out into a
# smaller package the way Fedora does, so that collection's size is
# largely unavoidable here without switching to a tlmgr-based minimal
# install (see the deploy README for that option if you want to go further).
#
# The two things we CAN control:
#  1. Rebuild speed — the --mount=type=cache lines below give apt a
#     persistent package cache across builds. Without this, editing the
#     Dockerfile at all (e.g. adding a package) invalidates Docker's layer
#     cache and forces a full re-download of everything in this RUN line,
#     which is what made recent iterations take ~12 minutes each. With the
#     cache mount, only genuinely new packages get downloaded going forward,
#     and cached .deb files never end up in the final image (mount caches
#     are BuildKit-side storage, not image layers).
#  2. Final image size — the doc-stripping RUN below removes TeX Live's
#     bundled documentation, which is sizeable and never used at runtime.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    texlive-xetex \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-extra \
    lmodern \
    poppler-utils \
    && mktexlsr \
    && rm -rf /usr/share/texmf-dist/doc /usr/share/doc/* /usr/share/man/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# data/ is NOT copied in — it's a volume mount (see docker-compose.yml) so
# data.yaml, generated PDFs, and the SQLite DB survive image rebuilds.
RUN mkdir -p /srv/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
