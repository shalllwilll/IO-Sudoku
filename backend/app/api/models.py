"""Request and response bodies. They are the contract the frontend codes against."""

from pydantic import BaseModel, Field

from app.core.ai.features import RulePreview, Suggestion, TqWording
from app.core.ai.intent import IntentPreview
from app.core.ingest.mapper import ColumnMatch
from app.core.model.allocation import Placement, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Group, Layout
from app.core.reports import CompletionReport
from app.core.revision.impact import DiffRow, Impact
from app.core.rules.dryrun import DryRun
from app.core.rules.lint import Finding
from app.core.tq.answers import Answer
from app.core.tq.model import TQ


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area: str | None = Field(default=None, max_length=40)
    unit: str | None = Field(default=None, max_length=40)
    preset: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    area: str | None = Field(default=None, max_length=40)
    unit: str | None = Field(default=None, max_length=40)
    preset: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    created_at: str
    area: str | None = None
    unit: str | None = None
    preset: str | None = None
    uploads: int = 0
    runs: int = 0


class SheetInfo(BaseModel):
    sheet: str | None = None
    rows: int = 0
    header_row: int | None = None
    columns: list[str] = Field(default_factory=list)
    deleted: int = 0
    out_of_scope: int = 0


class UploadOut(BaseModel):
    id: str
    name: str
    size: int
    sha256: str
    created_at: str
    sheets: list[SheetInfo] = Field(default_factory=list)


class MappingSheet(BaseModel):
    file: str
    sheet: str | None = None
    columns: list[str]
    matches: dict[str, ColumnMatch]
    grouping_mode: str
    issues: list[Issue]
    ai_hints: dict[str, Suggestion] = Field(default_factory=dict)  # field -> suggestion


class MappingOut(BaseModel):
    sheets: list[MappingSheet]
    fields: list[str]  # canonical field names a column can be mapped to
    required: list[str]
    confirmed: dict[str, dict[str, str]]


class MappingIn(BaseModel):
    confirmed: dict[str, dict[str, str]]  # file name -> field -> column


class UnknownValueOut(BaseModel):
    field: str
    value: str
    count: int
    suggestion: str | None = None
    ai: Suggestion | None = None  # a suggestion awaiting confirmation, never applied


class ValueMaps(BaseModel):
    io_types: dict[str, str] = Field(default_factory=dict)
    duty_classes: dict[str, str] = Field(default_factory=dict)
    segregation: dict[str, str] = Field(default_factory=dict)  # code -> family


class ValuesOut(BaseModel):
    unknown: list[UnknownValueOut]
    overrides: ValueMaps
    allowed: dict[str, list[str]]  # canonical values per field


class RulesOut(BaseModel):
    preset: str
    presets: list[str]
    custom: bool
    rules: list[dict]


class RulesIn(BaseModel):
    preset: str | None = None
    rules: list[dict] | None = None  # a custom list replaces the preset


class LintIn(BaseModel):
    rules: list[dict] | None = None  # default: the project's current rules


class LintOut(BaseModel):
    findings: list[Finding]
    dry_run: list[DryRun] | None = None


class RunCreate(BaseModel):
    cpsat: bool | None = None  # default: the server setting
    qiga: bool | None = None  # default: the server setting
    seed: int | None = None


class RevisionCreate(BaseModel):
    label: str | None = None  # default: the next number after the chain's latest label
    cpsat: bool | None = None  # default: the server setting
    qiga: bool | None = None  # default: the server setting
    seed: int | None = None


class BaselineFromRun(BaseModel):
    run_id: str
    label: str = "00"


class BaselineOut(BaseModel):
    label: str
    chain_run_id: str  # the stored run that heads the chain
    signals: int
    placed: int


class RunOut(BaseModel):
    id: str
    project_id: str
    status: str  # running | finished | failed
    created_at: str
    finished_at: str | None = None
    error: str | None = None
    summary: dict = Field(default_factory=dict)
    download_ready: bool = False


class AllocationOut(BaseModel):
    run_id: str
    solver: str
    utilisation: dict
    placements: list[Placement]
    unplaced: list[Unplaced]
    issues: list[Issue]
    rows: list[dict]  # one per CHARM position, keyed like the allocation template


class LayoutOut(BaseModel):
    run_id: str
    layout: Layout
    cioc_labels: dict[int, str]


class GroupsOut(BaseModel):
    run_id: str
    groups: list[Group]


class ReportOut(BaseModel):
    run_id: str
    report: CompletionReport


class ImpactOut(BaseModel):
    run_id: str
    available: bool
    reason: str | None = None
    impact: Impact | None = None
    diff: list[DiffRow] = Field(default_factory=list)


class AnswerIn(BaseModel):
    option: str
    value: str | None = None
    fields: dict[str, object] = Field(default_factory=dict)
    scope: str = "everywhere"  # row | cable | everywhere
    target: str | None = None
    author: str = Field(default="engineer", max_length=80)


class BulkAnswerIn(BaseModel):
    tq_ids: list[str] = Field(min_length=1, max_length=500)
    option: str
    value: str | None = None
    fields: dict[str, object] = Field(default_factory=dict)
    scope: str = "everywhere"
    author: str = Field(default="engineer", max_length=80)


class BulkFailure(BaseModel):
    tq_id: str
    error: str


class BulkAnswerOut(BaseModel):
    answered: list[str]
    failed: list[BulkFailure]


class AnswerOut(BaseModel):
    answer: Answer
    tq: TQ
    history: list[Answer]


class CompileIn(BaseModel):
    request: str = Field(min_length=3, max_length=600)


class IntentIn(BaseModel):
    request: str = Field(min_length=3, max_length=600)


class ConfirmRuleIn(BaseModel):
    rule: dict


__all__ = ["IntentPreview", "RulePreview", "TqWording"]
