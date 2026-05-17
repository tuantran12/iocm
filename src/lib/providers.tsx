'use client'

import { useState, useMemo, createContext, useContext, useCallback } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, createTRPCClient } from './trpc'
import { lightTheme, darkTheme } from './theme'

type ColorMode = 'light' | 'dark'

interface ColorModeContextType {
  mode: ColorMode
  toggleColorMode: () => void
}

const ColorModeContext = createContext<ColorModeContextType>({
  mode: 'light',
  toggleColorMode: () => {},
})

export function useColorMode() {
  return useContext(ColorModeContext)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>('light')

  const toggleColorMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const colorModeValue = useMemo(
    () => ({ mode, toggleColorMode }),
    [mode, toggleColorMode],
  )

  const activeTheme = useMemo(
    () => (mode === 'light' ? lightTheme : darkTheme),
    [mode],
  )

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const [trpcClient] = useState(() => createTRPCClient())

  return (
    <SessionProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ColorModeContext.Provider value={colorModeValue}>
            <ThemeProvider theme={activeTheme}>
              <CssBaseline />
              {children}
            </ThemeProvider>
          </ColorModeContext.Provider>
        </QueryClientProvider>
      </trpc.Provider>
    </SessionProvider>
  )
}
