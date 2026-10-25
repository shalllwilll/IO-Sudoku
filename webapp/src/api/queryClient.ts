import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        // Missing items and network failures will not fix themselves on retry.
        retry: (count, error) => !(error instanceof ApiError && (error.status === 0 || error.status < 500)) && count < 2,
      },
    },
  })
}
