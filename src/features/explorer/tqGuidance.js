// Investigation guidance for a TQ, chosen from the kind of issue its own message states. The "why" and
// "check" lines describe what that kind of conflict generally affects. The proposal is a suggestion for the
// owner to confirm: no root cause is established here and nothing is marked resolved.
const GUIDANCE = [
  [/already occupied|allocation conflict/i, {
    why: "Two records claim one physical position, so only one of them can be wired there as listed.",
    check: "Compare the source rows that share this cabinet, CIOC, baseplate and channel, and confirm which signal is intended.",
    proposal: "Move one signal to an empty or spare position once the signal owner confirms which one stays.",
  }],
  [/charm type|incompatib/i, {
    why: "A CHARM that does not suit the signal type cannot carry that signal as specified.",
    check: "Compare the CHARM type with the signal type in the approved hardware selection.",
    proposal: "Select the CHARM type approved for this signal type, or correct the signal type if the row is wrong.",
  }],
  [/segregation/i, {
    why: "Signals that must be kept apart may be grouped together, which the project rules do not allow.",
    check: "Review the segregation class of this signal and its neighbours against the project segregation rule.",
    proposal: "Regroup the signal with others of its segregation class, subject to the rule owner's confirmation.",
  }],
  [/cabinet\/cioc|parent hardware|mapping is incomplete/i, {
    why: "Without a confirmed parent cabinet and CIOC, the signal's physical location cannot be relied on.",
    check: "Confirm the marshalling cabinet, controller and CIOC for this signal in the hardware schedule.",
    proposal: "Fill in the confirmed parent hardware in the source record.",
  }],
  [/cable pair|cable schedule/i, {
    why: "A missing or inconsistent pair makes the field wiring for this signal hard to trace.",
    check: "Compare the cable and pair on this row with the cable schedule.",
    proposal: "Correct the pair in the source record once the cable schedule confirms it.",
  }],
  [/metadata|source mdb/i, {
    why: "Required signal data is absent, so the signal cannot be checked fully.",
    check: "Compare this row with its source record in the MDB export.",
    proposal: "Supply the missing fields from the source record.",
  }],
  [/service description/i, {
    why: "An incomplete description makes the signal harder to recognise during review.",
    check: "Compare the description on this row with the instrument index.",
    proposal: "Complete the description from the instrument index.",
  }],
  [/spare.capacity|threshold/i, {
    why: "Spare capacity is close to the configured limit, which leaves little room for later changes.",
    check: "Compare the spare count for this controller and I/O type with the configured limit.",
    proposal: "Review whether more spare positions are needed.",
  }],
  [/grouping|rule set/i, {
    why: "The signal's grouping may not follow the project rule set.",
    check: "Review the signal's group against the active rule set.",
    proposal: "Confirm the intended grouping with the rule owner.",
  }],
];

const GENERIC = {
  why: "The source flags this signal for review.",
  check: "Review the source record and the rule or schedule the message refers to.",
  proposal: "Agree a correction with the owner of the source data.",
};

export function tqGuidance(message) {
  return GUIDANCE.find(([pattern]) => pattern.test(String(message ?? "")))?.[1] ?? GENERIC;
}

// A TQ is Resolved only when the data says so; anything else is shown as given, or Unknown.
export function tqStatusText(status) {
  const value = String(status ?? "").trim();
  if (!value || value.toLowerCase() === "unknown") return "Status not supplied";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
