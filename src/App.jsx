import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Placeholder shell for M0.2. Real screens arrive in later milestones.
function Landing() {
  return (
    <main>
      <h1>IO Signal Sudoku</h1>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Landing />} />
        <Route path="/plant" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
