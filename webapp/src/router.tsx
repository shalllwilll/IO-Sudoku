import { createElement, lazy, Suspense, type ReactNode } from 'react'
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom'
import AppShell from './AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RouteError } from './components/ErrorView'
import Data from './pages/Data'
import MapPage from './pages/Map'
import Values from './pages/Values'
import Rules from './pages/Rules'
import RunPage from './pages/RunPage'
import ResultsFrame from './pages/ResultsFrame'
import Overview from './pages/results/Overview'
import { RevisionReport, RunReport } from './pages/Report'
import Landing from './pages/results/Landing'
import Tqs from './pages/Tqs'
import RunTqs from './pages/results/RunTqs'
import Login from './pages/Login'
import Projects from './pages/Projects'
import Revisions from './pages/Revisions'
import Settings from './pages/Settings'
import ProjectFrame from './pages/ProjectFrame'

const allocationPage = lazy(() => import('./pages/results/Allocation'))
const layoutPage = lazy(() => import('./pages/results/LayoutTab'))
const plantPage = lazy(() => import('./pages/Plant'))
const later = (view: ReactNode) => <Suspense fallback={<p className="p-8 text-[13px] text-fg-muted">Loading view…</p>}>{view}</Suspense>

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Navigate to="/projects" replace /> },
      { path: '/login', element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/projects', element: <Projects /> },
              {
                path: '/projects/:pid',
                element: <ProjectFrame />,
                children: [
                  { index: true, element: <Navigate to="data" replace /> },
                  { path: 'data', element: <Data />, handle: { crumb: 'Data' } },
                  { path: 'map', element: <MapPage />, handle: { crumb: 'Map' } },
                  { path: 'values', element: <Values />, handle: { crumb: 'Values' } },
                  { path: 'rules', element: <Rules />, handle: { crumb: 'Rules' } },
                  { path: 'run', element: <RunPage />, handle: { crumb: 'Run' } },
                  {
                    path: 'runs/:rid',
                    element: <ResultsFrame />,
                    handle: { crumb: 'Results' },
                    children: [
                      { index: true, element: <Landing /> },
                      { path: 'summary', element: <Overview /> },
                      { path: 'allocation', element: later(createElement(allocationPage)) },
                      { path: 'layout', element: later(createElement(layoutPage)) },
                      { path: 'tqs', element: <RunTqs /> },
                    ],
                  },
                  { path: 'tqs', element: <Tqs />, handle: { crumb: 'Technical queries' } },
                  { path: 'revisions/report', element: <RevisionReport />, handle: { crumb: 'Revision report' } },
                  { path: 'runs/:rid/report/:kind', element: <RunReport />, handle: { crumb: 'Report' } },
                  { path: 'revisions', element: <Revisions />, handle: { crumb: 'Change impact' } },
                  { path: 'runs/:rid/plant', element: later(createElement(plantPage)), handle: { crumb: '3D plant' } },
                ],
              },
              { path: '/settings', element: <Settings />, handle: { crumb: 'Settings' } },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
]

export const makeRouter = () => createBrowserRouter(routes)
