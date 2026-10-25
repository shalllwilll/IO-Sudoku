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
import Allocation from './pages/results/Allocation'
import LayoutTab from './pages/results/LayoutTab'
import Tqs from './pages/Tqs'
import RunTqs from './pages/results/RunTqs'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import Projects from './pages/Projects'
import Plant from './pages/Plant'
import ProjectFrame from './pages/ProjectFrame'

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
                  { path: 'run', element: <RunPage />, handle: { crumb: 'Run' } },
                  {
                    path: 'runs/:rid',
                    element: <ResultsFrame />,
                    handle: { crumb: 'Results' },
                    children: [
                      { index: true, element: <Overview /> },
                      { path: 'allocation', element: <Allocation /> },
                      { path: 'layout', element: <LayoutTab /> },
                      { path: 'tqs', element: <RunTqs /> },
                    ],
                  },
                  { path: 'tqs', element: <Tqs />, handle: { crumb: 'TQ inbox' } },
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
      { path: '/preview/plant', element: <Plant /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
]

export const makeRouter = () => createBrowserRouter(routes)
