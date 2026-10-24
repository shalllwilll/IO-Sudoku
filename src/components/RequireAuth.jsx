import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../auth/session.js";

// Protected pages are never mounted until a session exists, so nothing flashes.
export default function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}
