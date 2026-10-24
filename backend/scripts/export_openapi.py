"""Write docs/openapi.json, the contract shared with the frontend. Run from backend/."""

import json
from pathlib import Path

from app.main import create_app

OUT = Path(__file__).resolve().parent.parent / "docs" / "openapi.json"


def build() -> str:
    return json.dumps(create_app().openapi(), indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUT.write_text(build())
    print(f"wrote {OUT}")
