import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import Landing from "./pages/Landing.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import Projects from "./pages/Projects.jsx";
import Upload from "./pages/Upload.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Landing />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/projects" element={<Projects />} />
            <Route path="/history" element={<Placeholder title="History" />} />
            <Route path="/projects/:id/upload" element={<Upload />} />
            <Route path="/projects/:id/mapping" element={<Placeholder title="Column mapping" />} />
            <Route path="/plant" element={<Placeholder title="3D plant view" />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
