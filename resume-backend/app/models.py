from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Company(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    category: Optional[str] = None  # free-text/tags, comma separated
    package: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class JDSubmission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id")
    jd_file_path: str
    jd_text_extracted: Optional[str] = None
    ollama_model_used: Optional[str] = None
    use_cloud: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ResumeGeneration(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    jd_submission_id: int = Field(foreign_key="jdsubmission.id")
    tailored_json: Optional[str] = None  # stored as text
    resume_tex_path: Optional[str] = None
    resume_pdf_path: Optional[str] = None
    status: str = "pending"  # pending | done | failed
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TexVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    generation_id: int = Field(foreign_key="resumegeneration.id")
    label: str  # "generated", "edit1", "edit2", ...
    tex_path: str
    pdf_path: Optional[str] = None
    compiled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
