import re
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel, Field

from app.core.model.issue import Issue

HEADER_SCAN_ROWS = 30
MIN_HEADER_CELLS = 5
OUT_OF_SCOPE_TOKENS = ("IRC", "MCC")


class ReaderError(ValueError):
    pass


class RawRow(BaseModel):
    values: dict[str, object]
    source_file: str
    source_row: int
    deleted: bool = False
    out_of_scope: bool = False


class FileSummary(BaseModel):
    source_file: str
    sheet: str | None = None
    header_row: int | None = None
    columns: list[str] = Field(default_factory=list)
    rows: int = 0
    deleted: int = 0
    out_of_scope: int = 0
    blank_skipped: int = 0


class ReadResult(BaseModel):
    summary: FileSummary
    rows: list[RawRow]
    issues: list[Issue] = Field(default_factory=list)


def _text(v: object) -> str:
    return "" if v is None else str(v).strip()


def _find_header(rows: list[tuple]) -> int | None:
    for i, r in enumerate(rows[:HEADER_SCAN_ROWS]):
        strings = sum(1 for c in r if isinstance(c, str) and c.strip())
        if strings < MIN_HEADER_CELLS:
            continue
        nxt = rows[i + 1] if i + 1 < len(rows) else ()
        if sum(1 for c in nxt if _text(c)) >= MIN_HEADER_CELLS // 2 + 1:
            return i
    return None


def read_workbook(
    path: str | Path,
    out_of_scope_tokens: tuple[str, ...] = OUT_OF_SCOPE_TOKENS,
) -> list[ReadResult]:
    """Read every sheet of a workbook that has a detectable header row."""
    path = Path(path)
    try:
        wb = load_workbook(path, read_only=True, data_only=True)
    except (InvalidFileException, OSError, KeyError, ValueError) as e:
        raise ReaderError(f"{path.name} is not a readable Excel workbook") from e
    except Exception as e:  # zipfile.BadZipFile and other parser failures
        raise ReaderError(f"{path.name} is not a readable Excel workbook") from e

    token_re = re.compile(r"\b(" + "|".join(map(re.escape, out_of_scope_tokens)) + r")\b")
    results: list[ReadResult] = []
    for ws in wb.worksheets:
        all_rows = [tuple(r) for r in ws.iter_rows(values_only=True)]
        summary = FileSummary(source_file=path.name, sheet=ws.title)
        res = ReadResult(summary=summary, rows=[])
        h = _find_header(all_rows)
        if h is None:
            res.issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="info",
                    message=f"sheet '{ws.title}' has no data rows or no recognisable header",
                    source_file=path.name,
                )
            )
            results.append(res)
            continue
        headers = [_text(c) for c in all_rows[h]]
        summary.header_row = h + 1
        summary.columns = [x for x in headers if x]
        status_cols = [
            j for j, x in enumerate(headers) if "status" in x.lower() or "change" in x.lower()
        ]
        for off, r in enumerate(all_rows[h + 1 :], start=h + 2):
            if not any(_text(c) for c in r):
                summary.blank_skipped += 1
                continue
            values = {headers[j]: r[j] for j in range(min(len(headers), len(r))) if headers[j]}
            deleted = any(
                _text(r[j]).upper() == "DELETED" for j in status_cols if j < len(r)
            )
            oos = any(isinstance(c, str) and token_re.search(c) for c in r)
            res.rows.append(
                RawRow(
                    values=values,
                    source_file=path.name,
                    source_row=off,
                    deleted=deleted,
                    out_of_scope=oos,
                )
            )
            summary.deleted += deleted
            summary.out_of_scope += oos
        summary.rows = len(res.rows)
        if not res.rows:
            res.issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="info",
                    message=f"sheet '{ws.title}' has a header but no data rows",
                    source_file=path.name,
                )
            )
        results.append(res)
    wb.close()
    return results


if __name__ == "__main__":
    import sys

    for r in read_workbook(sys.argv[1]):
        print(r.summary.model_dump_json(indent=1, exclude={"columns"}))
