import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    data_dir: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    db_path: str = "sudoku.db"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=os.environ.get("SUDOKU_DATA_DIR") or None,
            gemini_api_key=os.environ.get("GEMINI_API_KEY") or None,
            gemini_model=os.environ.get("GEMINI_MODEL") or None,
            db_path=os.environ.get("DB_PATH") or "sudoku.db",
        )

    @property
    def ai_available(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_model)
