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
export type MappingOut = Schemas['MappingOut']
export type ValuesOut = Schemas['ValuesOut']
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

// -- Rules --------------------------------------------------------------------------------

export type Candidate = Schemas['Candidate']
export type Finding = Schemas['Finding']
export type DryRun = Schemas['DryRun']

export const rulesQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'rules'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/rules', { params: { path: { pid } }, signal })),
  })
export const runsQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'runs'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs', { params: { path: { pid } }, signal })),
  })

export const useRules = (pid: string) => useQuery(rulesQuery(pid))
export const useRuns = (pid: string, enabled = true) => useQuery({ ...runsQuery(pid), enabled })

/** Lint and dry-run a candidate rule list against the project's current data. */
export const useLint = (pid: string, rules: Record<string, unknown>[] | undefined) =>
  useQuery({
    queryKey: [...sub(pid, 'lint'), JSON.stringify(rules)],
    queryFn: ({ signal }) => unwrap(api.POST('/api/projects/{pid}/lint', { params: { path: { pid } }, body: { rules }, signal })),
    enabled: rules !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  })

export function usePutRules(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['RulesIn']) => unwrap(api.PUT('/api/projects/{pid}/rules', { params: { path: { pid } }, body })),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: sub(pid, 'rules') }), qc.invalidateQueries({ queryKey: sub(pid, 'lint') }), qc.invalidateQueries({ queryKey: keys.project(pid) })]),
  })
}

export function useMineRun(pid: string) {
  return useMutation({
    mutationFn: (run_id: string) => unwrap(api.POST('/api/projects/{pid}/rules/mine', { params: { path: { pid } }, body: { run_id } })),
  })
}

export function useMineUpload(pid: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return unwrap(api.POST('/api/projects/{pid}/rules/mine/upload', { params: { path: { pid } }, body: { file: '' }, bodySerializer: () => form }))
    },
  })
}

// -- Runs ---------------------------------------------------------------------------------

export type Run = Schemas['RunOut']
export type RunOptions = Schemas['RunCreate']

export const runQuery = (pid: string, rid: string) =>
  queryOptions({
    queryKey: [...sub(pid, 'runs'), rid] as const,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}', { params: { path: { pid, rid } }, signal })),
  })

export function useStartRun(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RunOptions) => unwrap(api.POST('/api/projects/{pid}/runs', { params: { path: { pid } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: sub(pid, 'runs') }),
  })
}

/** After a run ends: counts on the project, the run list and the TQ inbox have all changed. */
export function useRefreshAfterRun(pid: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: keys.project(pid) })
}

// -- Results ------------------------------------------------------------------------------

export type Report = Schemas['CompletionReport']
export type Allocation = Schemas['AllocationOut']
export type LayoutData = Schemas['LayoutOut']
export type PlacementOut = Allocation['placements'][number]

const finished = { staleTime: Infinity, retry: false } as const // a finished run never changes

export const useRun = (pid: string, rid: string) =>
  useQuery({
    ...runQuery(pid, rid),
    // a run opened before it ends keeps refreshing until it does
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  })
export const useReport = (pid: string, rid: string) =>
  useQuery({
    queryKey: [...sub(pid, 'runs'), rid, 'report'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}/report', { params: { path: { pid, rid } }, signal })),
    ...finished,
  })
export const useAllocation = (pid: string, rid: string) =>
  useQuery({
    queryKey: [...sub(pid, 'runs'), rid, 'allocation'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}/allocation', { params: { path: { pid, rid } }, signal })),
    ...finished,
  })
export const useLayout = (pid: string, rid: string) =>
  useQuery({
    queryKey: [...sub(pid, 'runs'), rid, 'layout'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}/layout', { params: { path: { pid, rid } }, signal })),
    ...finished,
  })

// -- TQs ----------------------------------------------------------------------------------

export type TqItem = Schemas['TQ']
export type AnswerResult = Schemas['AnswerOut']

export const projectTqsQuery = (pid: string) =>
  queryOptions({
    queryKey: keys.tqs(pid, 'all'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/tqs', { params: { path: { pid } }, signal })),
  })
export const useProjectTqs = (pid: string) => useQuery(projectTqsQuery(pid))
export const useRunTqs = (pid: string, rid: string) =>
  useQuery({
    queryKey: [...sub(pid, 'runs'), rid, 'tqs'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}/tqs', { params: { path: { pid, rid } }, signal })),
  })

export function useAnswerTq(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tid, body }: { tid: string; body: Schemas['AnswerIn'] }) =>
      unwrap(api.POST('/api/projects/{pid}/tqs/{tid}/answer', { params: { path: { pid, tid } }, body })),
    // statuses change in every list that shows this TQ: inbox, run tab and the sidebar badge
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', pid] }),
  })
}

export const useExplainTq = (pid: string) =>
  useMutation({
    mutationFn: (tid: string) => unwrap(api.GET('/api/projects/{pid}/tqs/{tid}/explain', { params: { path: { pid, tid } } })),
  })

// -- Assistant ----------------------------------------------------------------------------

export type IntentResult = Schemas['IntentPreview']

export const useIntent = (pid: string) =>
  useMutation({
    mutationFn: (request: string) => unwrap(api.POST('/api/projects/{pid}/intent', { params: { path: { pid } }, body: { request } })),
  })

/** Adding a previewed rule saves it to the project's rule set, so rules and their lint are stale afterwards. */
export function useConfirmRule(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rule: Record<string, unknown>) => unwrap(api.POST('/api/projects/{pid}/rules/compile/confirm', { params: { path: { pid } }, body: { rule } })),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: sub(pid, 'rules') }), qc.invalidateQueries({ queryKey: sub(pid, 'lint') })]),
  })
}

// -- Revisions ----------------------------------------------------------------------------

export type ChainEntry = Schemas['ChainEntry']
export type Comparison = Schemas['Comparison']
export type CumulativeRow = Schemas['CumulativeRow']
export type HistoryEntry = Schemas['HistoryEntry']

export const chainQuery = (pid: string) =>
  queryOptions({
    queryKey: sub(pid, 'revisions'),
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/revisions', { params: { path: { pid } }, signal })),
  })
export const useChain = (pid: string) => useQuery(chainQuery(pid))

export const useComparison = (pid: string, from: string, to: string) =>
  useQuery({
    queryKey: [...sub(pid, 'revisions'), 'compare', from, to] as const,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/revisions/compare', { params: { path: { pid }, query: { from, to } }, signal })),
    enabled: !!from && !!to && from !== to,
  })

export const useCumulative = (pid: string, enabled: boolean) =>
  useQuery({
    queryKey: [...sub(pid, 'revisions'), 'cumulative'] as const,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/revisions/cumulative', { params: { path: { pid } }, signal })),
    enabled,
  })

export const useSignalHistory = (pid: string, tag: string) =>
  useQuery({
    queryKey: [...sub(pid, 'revisions'), 'history', tag] as const,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/signals/history', { params: { path: { pid }, query: { tag } }, signal })),
    enabled: tag.length > 0,
  })

export function useSetBaseline(pid: string) {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: sub(pid, 'revisions') })
  return {
    fromRun: useMutation({
      mutationFn: (v: { run_id: string; label?: string }) => unwrap(api.POST('/api/projects/{pid}/baseline', { params: { path: { pid } }, body: { run_id: v.run_id, label: v.label || '00' } })),
      onSuccess: done,
    }),
    fromFile: useMutation({
      mutationFn: (v: { file: File; label?: string }) => {
        const form = new FormData()
        form.append('file', v.file)
        return unwrap(
          api.POST('/api/projects/{pid}/baseline/upload', {
            params: { path: { pid }, query: v.label ? { label: v.label } : {} },
            body: { file: '' },
            bodySerializer: () => form,
          }),
        )
      },
      onSuccess: done,
    }),
  }
}

export function useStartRevision(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['RevisionCreate']) => unwrap(api.POST('/api/projects/{pid}/revisions', { params: { path: { pid } }, body })),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: sub(pid, 'runs') }), qc.invalidateQueries({ queryKey: sub(pid, 'revisions') })]),
  })
}

// -- Demo ---------------------------------------------------------------------------------

export function useLoadSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/demo/sample')),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

// -- TQ groups ----------------------------------------------------------------------------

export type TqGroup = Schemas['TqGroup']
export type GroupOption = Schemas['GroupOption']

export const tqGroupsQuery = (pid: string) =>
  queryOptions({
    queryKey: [...sub(pid, 'tq-groups')],
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/tq-groups', { params: { path: { pid } }, signal })),
  })
export const useTqGroups = (pid: string) => useQuery(tqGroupsQuery(pid))

export function useBulkAnswer(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['BulkAnswerIn']) => unwrap(api.POST('/api/projects/{pid}/tqs/bulk-answer', { params: { path: { pid } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', pid] }),
  })
}

export function useTqPlacements(pid: string, rid: string | undefined, tid: string | null) {
  return useQuery({
    queryKey: [...sub(pid, 'runs'), rid ?? '', 'placements', tid ?? ''] as const,
    queryFn: ({ signal }) => unwrap(api.GET('/api/projects/{pid}/runs/{rid}/tqs/{tid}/placements', { params: { path: { pid, rid: rid ?? '', tid: tid ?? '' } }, signal })),
    enabled: !!rid && !!tid,
    staleTime: 0,
  })
}

// -- Reports ------------------------------------------------------------------------------

export type ReportDoc = Schemas['ReportDoc']

export const useRunReportDoc = (pid: string, rid: string, kind: 'allocation' | 'tq') =>
  useQuery({
    queryKey: [...sub(pid, 'runs'), rid, 'reportdoc', kind],
    queryFn: async ({ signal }) => (await unwrap(api.GET('/api/projects/{pid}/runs/{rid}/reports/{kind}', { params: { path: { pid, rid, kind }, query: { format: 'json' } }, signal }))) as unknown as ReportDoc,
  })

export const useRevisionReportDoc = (pid: string, from: string, to: string) =>
  useQuery({
    queryKey: [...sub(pid, 'revisions'), 'reportdoc', from, to] as const,
    queryFn: async ({ signal }) => (await unwrap(api.GET('/api/projects/{pid}/revisions/report', { params: { path: { pid }, query: { from, to, format: 'json' } }, signal }))) as unknown as ReportDoc,
    enabled: !!from && !!to && from !== to,
  })
