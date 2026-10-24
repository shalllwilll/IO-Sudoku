from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.conftest import PACK_DIR

PACK = Pack.load(PACK_DIR)

cable_spec = st.tuples(
    st.integers(1, 30),  # signals
    st.integers(0, 6),  # extra declared pairs
    st.sampled_from([None, "A", "B", "C", "UNKNOWN:Q", "UNKNOWN:R"]),
    st.sampled_from(["AIR", "DIR", "DOR", "AOR"]),
    st.sampled_from([None, "L1", "L2", "L3"]),
)


@given(st.lists(cable_spec, min_size=1, max_size=12))
@settings(max_examples=200, deadline=None)
def test_greedy_always_validates(specs):
    sigs = []
    for i, (n, extra, fam, io, ln) in enumerate(specs):
        declared = n + extra
        for p in range(1, n + 1):
            sigs.append(
                Signal(
                    tag=f"C{i}-{p}", io_type=io, cable=f"C{i:02d}", pair=p,
                    cable_formation=f"{declared:02d}PX1MM2", cable_pairs=declared,
                    segregation_family=fam, logic_number=ln, source_file="h", source_row=len(sigs),
                )
            )  # fmt: skip
    a = solve_greedy(build_blocks(sigs, PACK), PACK, "AR1", "100")
    assert validate_allocation(a, PACK, sigs) == []
