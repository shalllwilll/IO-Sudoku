import { useMemo } from 'react'
import { useAllocation, useLayout } from '@/api/queries'
import { buildSlots } from './results'

/** Layout and allocation of a finished run, joined into one slot per CHARM position. */
export function useSlots(pid: string, rid: string) {
  const layout = useLayout(pid, rid)
  const allocation = useAllocation(pid, rid)
  const slots = useMemo(() => (layout.data && allocation.data ? buildSlots(layout.data.layout, allocation.data.placements) : []), [layout.data, allocation.data])
  return {
    slots,
    layout: layout.data?.layout,
    allocation: allocation.data,
    error: layout.error ?? allocation.error,
    loading: layout.isPending || allocation.isPending,
    refetch: () => void Promise.all([layout.refetch(), allocation.refetch()]),
  }
}
