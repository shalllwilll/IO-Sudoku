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

// -- Data, mapping, values ---------------------------------------------------------------

export type Upload = Schemas['UploadOut']
export type MappingSheet = Schemas['MappingSheet']
export type UnknownValue = Schemas['UnknownValueOut']
export type ValueMaps = Schemas['ValueMaps']

const sub = (pid: string, part: string) => ['projects', pid, part] as const

export const uploadsQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'uploads'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/uploads', { params: { path: { pid } }, signal })),
  })
export const mappingQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'mapping'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/mapping', { params: { path: { pid } }, signal })),
  })
export const valuesQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'values'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/values', { params: { path: { pid } }, signal })),
  })

export const useUploads = (pid: string) => useQuery(uploadsQuery(pid))
export const useMapping = (pid: string, enabled = true) => useQuery({ ...mappingQuery(pid), enabled })
export const useValues = (pid: string, enabled = true) => useQuery({ ...valuesQuery(pid), enabled })

/** Anything derived from the uploaded data changes when an upload, mapping or value map does. */
function useInvalidateData(pid: string) {
  const qc = useQueryClient()
  return () => Promise.all([keys.project(pid), sub(pid, 'uploads'), sub(pid, 'mapping'), sub(pid, 'values')].map((queryKey) => qc.invalidateQueries({ queryKey })))
}

export function useUploadFile(pid: string) {
  const done = useInvalidateData(pid)
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return unwrap(
        api.POST('/api/projects/{pid}/uploads', {
          params: { path: { pid } },
          body: { file: '' },
          bodySerializer: () => form,
        }),
      )
    },
    onSuccess: done,
  })
}

export function useDeleteUpload(pid: string) {
  const done = useInvalidateData(pid)
  return useMutation({
    mutationFn: (uid: string) => unwrap(api.DELETE('/api/projects/{pid}/uploads/{uid}', { params: { path: { pid, uid } } })),
    onSuccess: done,
  })
}

export function usePutMapping(pid: string) {
  const done = useInvalidateData(pid)
  return useMutation({
    mutationFn: (confirmed: Record<string, Record<string, string>>) => unwrap(api.PUT('/api/projects/{pid}/mapping', { params: { path: { pid } }, body: { confirmed } })),
    onSuccess: done,
  })
}

export function usePutValues(pid: string) {
  const done = useInvalidateData(pid)
  return useMutation({
    mutationFn: (body: ValueMaps) => unwrap(api.PUT('/api/projects/{pid}/values', { params: { path: { pid } }, body })),
    onSuccess: done,
  })
}
