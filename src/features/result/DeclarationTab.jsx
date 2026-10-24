// The declaration page: rule set and assumptions come from the run report; the tool list is fixed.
const TOOLS = [
  ["Languages", "JavaScript (this app); the engine language is declared by the backend"],
  ["Libraries", "React, React Router, Zod, Tailwind CSS, three.js with react-three-fiber"],
  ["AI model", "Chosen and called by the backend only. The browser never holds a key."],
];

function List({ title, items }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase text-soft-white/70">{title}</h3>
      {items.length ? (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-soft-white/60">None</p>
      )}
    </section>
  );
}

export default function DeclarationTab({ report }) {
  const d = report.report.declaration;
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-steel p-3 text-sm font-medium">The AI never places a signal.</p>
      <p className="text-sm">
        Rule set: <strong>{d.rule_set}</strong>
      </p>
      <List title="Rules applied" items={d.rules ?? []} />
      <List title="Assumed" items={d.assumed ?? []} />
      <List title="Defaulted" items={d.defaulted ?? []} />
      <List title="Not enforced" items={d.not_enforced ?? []} />
      <dl className="space-y-2 text-sm">
        {TOOLS.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase text-soft-white/70">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
