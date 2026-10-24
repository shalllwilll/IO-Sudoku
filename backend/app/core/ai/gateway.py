"""The one door every AI call goes through: redact, cache, call, parse, re-validate.

`ask` returns a typed `AiResult` or None. None always means "use the deterministic path": no key,
a blocked payload, a timeout, garbage output or an answer that fails validation. Nothing here
ever raises into the allocation pipeline, and AI output is only ever a suggestion.
"""

import hashlib
import json
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Generic, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.core.ai.cache import AiCache
from app.core.ai.redact import RedactionError, redact

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

API = "https://generativelanguage.googleapis.com/v1beta"
PROMPT_VERSION = "1"
RETRY_STATUS = {429, 500, 502, 503, 504}

# (model, request body, timeout seconds) -> (http status, parsed json)
Transport = Callable[[str, dict, float], tuple[int, dict]]


@dataclass
class AiResult(Generic[T]):
    value: T
    source: str  # always "ai"
    model: str
    prompt_hash: str
    confidence: float | None
    cached: bool = False


def http_transport(api_key: str) -> Transport:
    def send(model: str, body: dict, timeout: float) -> tuple[int, dict]:
        r = httpx.post(
            f"{API}/models/{model}:generateContent",
            headers={"x-goog-api-key": api_key},
            json=body,
            timeout=timeout,
        )
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, {}

    return send


class Gateway:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: Transport | None = None,
        cache: AiCache | None = None,
        timeout: float = 20.0,
        retries: int = 2,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.settings = settings
        self.models = [m for m in (settings.gemini_model, settings.gemini_fallback_model) if m]
        self.transport = transport or (
            http_transport(settings.gemini_api_key) if settings.gemini_api_key else None
        )
        self.cache = cache or AiCache()
        self.timeout, self.retries, self.sleep = timeout, retries, sleep
        self.calls = 0  # transport calls actually made (tests and rate awareness)

    @property
    def available(self) -> bool:
        return bool(self.transport and self.models and self.settings.ai_available)

    # -- one model, with timeout and backoff ---------------------------------------------

    def _call(self, model: str, body: dict) -> dict | None:
        assert self.transport is not None
        for attempt in range(self.retries + 1):
            self.calls += 1
            pool = ThreadPoolExecutor(max_workers=1)
            fut = pool.submit(self.transport, model, body, self.timeout)
            try:
                status, data = fut.result(timeout=self.timeout)
            except FutureTimeout:
                log.warning("AI call to %s timed out after %ss", model, self.timeout)
                return None
            except Exception as e:  # noqa: BLE001  a transport failure is "no answer"
                log.warning("AI call to %s failed: %s", model, e)
                return None
            finally:
                pool.shutdown(wait=False)
            if status == 200:
                return data
            if status in RETRY_STATUS and attempt < self.retries:
                self.sleep(min(8.0, 0.5 * 2**attempt))  # back off; limits are not assumed
                continue
            log.warning("AI call to %s returned HTTP %s", model, status)
            return None
        return None

    @staticmethod
    def _text(data: dict) -> str | None:
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            return None

    # -- the public door -----------------------------------------------------------------

    def ask(
        self,
        task: str,
        payload: dict,
        schema: type[T],
        instructions: str,
        check: Callable[[T], bool] | None = None,
    ) -> AiResult[T] | None:
        """Redact, cache, call, parse, re-validate. `check` rejects hallucinated content."""
        if not self.available:
            return None
        try:
            clean = redact(task, payload)
        except RedactionError:
            log.exception("AI payload blocked by redaction for task %s", task)
            raise  # a leak is a bug: fail loudly, never send
        canonical = json.dumps(
            [PROMPT_VERSION, task, instructions, schema.__name__, clean], sort_keys=True
        )
        phash = hashlib.sha256(canonical.encode()).hexdigest()
        hit = self.cache.get(phash)
        if hit is not None:
            model, data = hit
            res = self._accept(schema, data, check, model, phash, cached=True)
            if res is not None:
                self.cache.log(task, phash, model, "cache-hit")
                return res
        body = {
            "systemInstruction": {"parts": [{"text": instructions}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(clean)}]}],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
                "responseJsonSchema": schema.model_json_schema(),
            },
        }
        for model in self.models:
            data = self._call(model, body)
            if data is None:
                self.cache.log(task, phash, model, "failed")
                continue
            text = self._text(data)
            try:
                parsed = json.loads(text) if text else None
            except json.JSONDecodeError:
                parsed = None
            res = self._accept(schema, parsed, check, model, phash) if parsed is not None else None
            if res is None:
                self.cache.log(
                    task, phash, model, "rejected", "not valid JSON or failed validation"
                )
                continue
            self.cache.put(phash, model, parsed)
            self.cache.log(task, phash, model, "accepted")
            return res
        return None

    @staticmethod
    def _accept(schema, data, check, model, phash, cached=False):
        try:
            value = schema.model_validate(data)  # the provider ignores some constraints
        except ValidationError:
            return None
        if check is not None and not check(value):
            return None
        conf = getattr(value, "confidence", None)
        return AiResult(
            value, "ai", model, phash, conf if isinstance(conf, int | float) else None, cached
        )

    # -- configuration check -------------------------------------------------------------

    def verify_models(self) -> dict[str, bool]:
        """Ask the API whether each configured model name exists."""
        out = {}
        for m in self.models:
            try:
                r = httpx.get(
                    f"{API}/models/{m}",
                    headers={"x-goog-api-key": self.settings.gemini_api_key or ""},
                    timeout=10,
                )
                out[m] = r.status_code == 200
            except httpx.HTTPError:
                out[m] = False
        return out
