import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { makeQueryClient } from './api/queryClient'
import { makeRouter } from './router'

export default function App() {
  const [queryClient] = useState(makeQueryClient)
  const [router] = useState(makeRouter)
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MotionConfig>
  )
}
