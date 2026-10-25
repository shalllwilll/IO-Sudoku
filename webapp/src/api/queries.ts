import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type Schemas } from './client'

export type Project = Schemas['ProjectOut']

export const keys = {
  health: ['health'] as const,
  ai: ['ai-status'] as const,
  projects: ['projects'] as const,
  project: (pid: string) => ['projects', pid] as const,
  tqs: (pid: string, status?: string) => ['projects', pid, 'tqs', status ?? 'all'] as const,
}

export const healthQuery = queryOptions({
  queryKey: keys.health,
  queryFn: ({ signal }) => unwrap(api.GET('/api/health', { signal })),
  refetchInterval: 15_000,
  retry: false,
})

export const aiStatusQuery = queryOptions({
  queryKey: keys.ai,
  queryFn: ({ signal }) => unwrap(api.GET('/api/ai/status', { signal })),
  staleTime: 60_000,
  retry: false,
})

export const projectsQuery = queryOptions({
  queryKey: keys.projects,
  queryFn: ({ signal }) => unwrap(api.GET('/api/projects', { signal })),
  placeholderData: keepPreviousData,
})

export const projectQuery = (pid: string) =>
  queryOptions({
    queryKey: keys.project(pid),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}', { params: { path: { pid } }, signal })),
  })

export const openTqsQuery = (pid: string) =>
  queryOptions({
    queryKey: keys.tqs(pid, 'open'),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/projects/{pid}/tqs', { params: { path: { pid }, query: { status: 'open' } }, signal })),
  })

export const useHealth = () => useQuery(healthQuery)
export const useAiStatus = () => useQuery(aiStatusQuery)
export const useProjects = () => useQuery(projectsQuery)
export const useProject = (pid: string | undefined) => useQuery({ ...projectQuery(pid ?? ''), enabled: !!pid })
export const useOpenTqs = (pid: string | undefined) => useQuery({ ...openTqsQuery(pid ?? ''), enabled: !!pid })

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['ProjectCreate']) => unwrap(api.POST('/api/projects', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}
