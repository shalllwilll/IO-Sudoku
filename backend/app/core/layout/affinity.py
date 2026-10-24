from app.core.model.layout import Block, Group


class UnionFind:
    """Deterministic union-find: the smallest id always becomes the root."""

    def __init__(self, items: list[str]):
        self.parent = {i: i for i in sorted(items)}

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            lo, hi = sorted((ra, rb))
            self.parent[hi] = lo


def build_groups(blocks: list[Block]) -> list[Group]:
    """Cables that share a Logic Number belong to one affinity group (also sets block.group)."""
    ids = sorted(b.id for b in blocks)
    uf = UnionFind(ids)
    first_cable_for: dict[str, str] = {}
    for b in sorted(blocks, key=lambda b: b.id):
        for ln in sorted(b.logic_numbers):
            if ln in first_cable_for:
                uf.union(first_cable_for[ln], b.id)
            else:
                first_cable_for[ln] = b.id
    members: dict[str, list[Block]] = {}
    for b in sorted(blocks, key=lambda b: b.id):
        b.group = uf.find(b.id)
        members.setdefault(b.group, []).append(b)
    return [
        Group(
            id=gid,
            cables=[b.id for b in bs],
            positions=sum(b.size for b in bs),
            signals=sum(len(b.signals) for b in bs),
        )
        for gid, bs in sorted(members.items())
    ]
