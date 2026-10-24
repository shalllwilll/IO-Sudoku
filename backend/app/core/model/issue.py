from pydantic import BaseModel


class Issue(BaseModel):
    """A recorded doubt (later promoted to a full TQ record in the TQ subsystem)."""

    code: str
    severity: str = "info"
    message: str
    source_file: str | None = None
    source_row: int | None = None
