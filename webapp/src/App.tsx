import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { cn } from '@/lib/cn'
import Layout from './pages/Layout'
import Login from './pages/Login'
import Plant from './pages/Plant'
import Run from './pages/Run'

/** Design-lock preview switcher. Removed when the real routes land. */
function PreviewBar() {
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('rounded px-2 py-1 text-xs transition-[background-color,color] duration-150 ease-out', isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg')
  return (
    <nav aria-label="Design preview" className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border-strong bg-surface-1 p-1 shadow-float">
      <span className="px-2 text-[11px] uppercase tracking-wider text-fg-subtle">Design preview</span>
      <NavLink to="/login" className={link}>Login</NavLink>
      <NavLink to="/run" className={link}>Run</NavLink>
      <NavLink to="/layout" className={link}>Layout</NavLink>
      <NavLink to="/plant" className={link}>3D</NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/run" element={<Run />} />
        <Route path="/layout" element={<Layout />} />
        <Route path="/plant" element={<Plant />} />
      </Routes>
      <PreviewBar />
    </>
  )
}
