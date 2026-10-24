import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth.jsx";
import PageTransition from "./components/PageTransition.jsx";
import Landing from "./pages/Landing.jsx";
import Projects from "./pages/Projects.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Landing />} />
        <Route element={<RequireAuth />}>
          <Route
            path="/projects"
            element={
              <PageTransition focusHeading>
                <Projects />
              </PageTransition>
            }
          />
          <Route path="/plant" element={<Navigate to="/projects" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
