import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    data_dir: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    gemini_fallback_model: str | None = None
    db_path: str = "sudoku.db"
    cpsat_enabled: bool = True
    qiga_enabled: bool = True
    max_upload_bytes: int = 25 * 1024 * 1024
    template_path: str | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=os.environ.get("SUDOKU_DATA_DIR") or None,
            gemini_api_key=os.environ.get("GEMINI_API_KEY") or None,
            gemini_model=os.environ.get("GEMINI_MODEL") or None,
            gemini_fallback_model=os.environ.get("GEMINI_FALLBACK_MODEL") or None,
            db_path=os.environ.get("DB_PATH") or "sudoku.db",
            cpsat_enabled=os.environ.get("SUDOKU_CPSAT", "1").strip().lower()
            not in ("0", "false", "off", "no"),
            qiga_enabled=os.environ.get("SUDOKU_QIGA", "1").strip().lower()
            not in ("0", "false", "off", "no"),
            max_upload_bytes=int(float(os.environ.get("MAX_UPLOAD_MB") or 25) * 1024 * 1024),
            template_path=os.environ.get("TEMPLATE_PATH") or None,
        )

    def resolve_template(self) -> str | None:
        """The blank allocation workbook: TEMPLATE_PATH, else a 'blank' workbook in the data dir."""
        if self.template_path:
            return self.template_path if os.path.isfile(self.template_path) else None
        if self.data_dir and os.path.isdir(self.data_dir):
            hits = sorted(
                f for f in os.listdir(self.data_dir)
                if f.lower().endswith(".xlsx") and "blank" in f.lower()
            )  # fmt: skip
            if hits:
                return os.path.join(self.data_dir, hits[0])
        return None

    @property
    def ai_available(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_model)
