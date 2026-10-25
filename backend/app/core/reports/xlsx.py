"""A report document as a workbook: a cover sheet, then one sheet per section that holds a table."""

import re
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from app.core.reports.documents import ReportDoc

BOLD = Font(bold=True)


def _sheet_name(title: str, used: set[str]) -> str:
    base = re.sub(r"[\[\]:*?/\\]", " ", title).strip()[:28] or "Sheet"
    name, n = base, 2
    while name in used:
        name, n = f"{base[:25]} {n}", n + 1
    used.add(name)
    return name


def to_xlsx(doc: ReportDoc) -> bytes:
    wb = Workbook()
    ws = wb.active
    used: set[str] = set()
    ws.title = _sheet_name("Cover", used)
    ws.append([doc.title])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([doc.subtitle])
    ws.append([])
    for k, v in doc.meta:
        ws.append([k, v])
        ws.cell(ws.max_row, 1).font = BOLD
    ws.append([])
    for s in doc.sections:
        ws.append([s.heading])
        ws.cell(ws.max_row, 1).font = BOLD
        for line in s.text:
            ws.append([line])
        for f in s.figures:
            ws.append([f.label, f.value, f.hint])
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 40
    for s in doc.sections:
        for t in s.tables:
            if not t.rows:
                continue
            sheet = wb.create_sheet(_sheet_name(f"{s.heading} {t.title}".strip(), used))
            sheet.append(t.columns)
            for c in sheet[1]:
                c.font = BOLD
            for r in t.rows:
                sheet.append(r)
            sheet.freeze_panes = "A2"
            for i, col in enumerate(t.columns, 1):
                width = max(len(str(col)), *(len(str(r[i - 1] or "")) for r in t.rows))
                sheet.column_dimensions[get_column_letter(i)].width = min(width + 2, 60)
    out = BytesIO()
    wb.save(out)
    return out.getvalue()
