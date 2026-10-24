export function Table({ rows, cols, empty = "Nothing to show yet." }) {
  if (!rows || rows.length === 0) return <p><i>{empty}</i></p>;
  const keys = cols || Object.keys(rows[0]);
  return (
    <table border="1" cellPadding="3" style={{ borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{keys.map((k) => <td key={k}>{String(r[k] ?? "")}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
