import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/state/session'

export function ProtectedRoute() {
  const signedIn = useSession((s) => s.name !== null)
  const location = useLocation()
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
