import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOutSession } from "../auth/session.js";
import PageTransition from "./PageTransition.jsx";

const link = ({ isActive }) =>
  `focus-ring rounded-full px-4 py-1.5 text-sm ${isActive ? "bg-soft-white text-graphite" : "text-soft-white hover:bg-gunmetal"}`;

// Pill navigation shared by every signed-in page.
export default function AppShell() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-graphite">
      <header className="px-6 pt-5">
        <nav aria-label="Main" className="flex items-center justify-between rounded-full border border-steel bg-carbon px-5 py-2">
          <span className="text-sm font-semibold tracking-wide">IO Signal Sudoku</span>
          <div className="flex items-center gap-2">
            <NavLink to="/projects" className={link}>
              Projects
            </NavLink>
            <NavLink to="/history" className={link}>
              History
            </NavLink>
            <button
              type="button"
              className="focus-ring rounded-full border border-steel px-4 py-1.5 text-sm hover:bg-gunmetal"
              onClick={() => {
                signOutSession();
                navigate("/", { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        </nav>
      </header>
      <main className="min-h-0 flex-1 p-6">
        <PageTransition focusHeading>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}
