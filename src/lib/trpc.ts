'use client'

import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@/server/routers'

/**
 * Client-side tRPC hooks for React Query integration.
 * Usage: trpc.documents.list.useQuery(), trpc.auth.login.useMutation(), etc.
 */
export const trpc = createTRPCReact<AppRouter>()

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

/**
 * Creates a tRPC client instance with httpBatchLink.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        headers() {
          return {}
        },
      }),
    ],
  })
}
