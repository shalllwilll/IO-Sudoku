import { Outlet } from 'react-router-dom'
import { Shell } from '@/components/Shell'

export default function AppShell() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
