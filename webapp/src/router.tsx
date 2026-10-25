import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom'
import AppShell from './AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RouteError } from './components/ErrorView'
import Data from './pages/Data'
import MapPage from './pages/Map'
import Values from './pages/Values'
import Rules from './pages/Rules'
import Layout from './pages/Layout'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Projects from './pages/Projects'
import Plant from './pages/Plant'
import ProjectFrame from './pages/ProjectFrame'
import Run from './pages/Run'

const stub = (title: string, milestone: string) => <Placeholder title={title} milestone={milestone} />

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
                  { path: 'run', element: stub('Run', 'U5'), handle: { crumb: 'Run' } },
                  { path: 'runs/:rid', element: stub('Results', 'U6'), handle: { crumb: 'Results' } },
                  { path: 'tqs', element: stub('TQ inbox', 'U7'), handle: { crumb: 'TQ inbox' } },
                  { path: 'revisions', element: stub('Revisions', 'U9'), handle: { crumb: 'Revisions' } },
                  { path: 'plant', element: stub('3D plant', 'U10'), handle: { crumb: '3D plant' } },
                ],
              },
              { path: '/settings', element: stub('Settings', 'U10'), handle: { crumb: 'Settings' } },
            ],
          },
        ],
      },
      // Design-lock screens, kept as a visual reference until the real ones replace them.
      { path: '/preview/run', element: <Run /> },
      { path: '/preview/layout', element: <Layout /> },
      { path: '/preview/plant', element: <Plant /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
]

export const makeRouter = () => createBrowserRouter(routes)
