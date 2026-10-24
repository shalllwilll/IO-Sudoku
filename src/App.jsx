import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import Landing from "./pages/Landing.jsx";
import Run from "./pages/Run.jsx";
import Result from "./pages/Result.jsx";
import Mapping from "./pages/Mapping.jsx";
import Rules from "./pages/Rules.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import Projects from "./pages/Projects.jsx";
import Upload from "./pages/Upload.jsx";

// three.js is loaded only when the stage is opened, so it stays out of the main bundle (T-6.2-5).
const PlantStage = lazy(() => import("./pages/PlantStage.jsx"));

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
            <Route path="/projects/:id/mapping" element={<Mapping />} />
            <Route path="/projects/:id/rules" element={<Rules />} />
            <Route path="/projects/:id/run" element={<Run />}
            />
            <Route path="/projects/:id/result" element={<Result />} />
          </Route>
          {/* The stage is outside the shell: the presentation screen carries no navigation. */}
          <Route
            path="/plant"
            element={
              <Suspense fallback={<p role="status" className="p-8 text-sm text-soft-white">Loading the 3D view</p>}>
                <PlantStage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
