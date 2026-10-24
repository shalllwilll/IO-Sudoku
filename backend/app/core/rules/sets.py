import hashlib
import json

from pydantic import BaseModel

from app.core.model.pack import Pack
from app.core.rules.schema import Rule, RuleSetError, load_rules


class RuleSet(BaseModel):
    name: str
    rules: list[Rule]
    hash: str

    @property
    def enforced(self) -> list[Rule]:
        return [r for r in self.rules if r.enabled and (r.enforced or r.builtin)]

    @property
    def not_enforced(self) -> list[Rule]:
        return [r for r in self.rules if not r.enforced and not r.builtin]


def make_ruleset(name: str, rules: list[Rule]) -> RuleSet:
    """Hash over canonical JSON, so toggling any rule changes it."""
    raw = json.dumps([r.model_dump() for r in rules], sort_keys=True, separators=(",", ":"))
    return RuleSet(name=name, rules=rules, hash=hashlib.sha256(raw.encode()).hexdigest())


def load_preset(pack: Pack, preset: str | None = None) -> RuleSet:
    name = preset or pack.rules.default_preset
    if name not in pack.rules.presets:
        raise RuleSetError(f"unknown rule preset '{name}'; have {sorted(pack.rules.presets)}")
    return make_ruleset(name, load_rules(pack.rules.presets[name]))


def run_hash(pack_hash: str, ruleset_hash: str, *extra: str) -> str:
    """One hash for a run's inputs; the rule set is part of it."""
    return hashlib.sha256("|".join([pack_hash, ruleset_hash, *extra]).encode()).hexdigest()
