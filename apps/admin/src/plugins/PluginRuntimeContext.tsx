import type {EnabledPluginUIDto} from '@open-cinema/shared'
import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react'
import {pluginApi} from './client'

interface PluginRuntimeValue {
  plugins: EnabledPluginUIDto[]
  loading: boolean
  stale: boolean
  error: Error | null
  refresh: () => Promise<void>
}

const PluginRuntimeContext = createContext<PluginRuntimeValue | null>(null)

export function PluginRuntimeProvider({children}: {children: ReactNode}) {
  const [plugins, setPlugins] = useState<EnabledPluginUIDto[]>([])
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const etag = useRef<string>()

  const refresh = useCallback(async () => {
    try {
      const response = await pluginApi.ui(etag.current)
      if (response.value) setPlugins(response.value.plugins)
      if (response.etag) etag.current = response.etag
      setError(null)
      setStale(false)
    } catch (value) {
      setError(value instanceof Error ? value : new Error('Plugin navigation is unavailable'))
      setStale(plugins.length > 0)
    } finally {
      setLoading(false)
    }
  }, [plugins.length])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30_000)
    const update = () => void refresh()
    window.addEventListener('focus', update)
    window.addEventListener('open-cinema-session-changed', update)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', update)
      window.removeEventListener('open-cinema-session-changed', update)
    }
  }, [refresh])

  const value = useMemo(
    () => ({plugins, loading, stale, error, refresh}),
    [plugins, loading, stale, error, refresh],
  )
  return <PluginRuntimeContext.Provider value={value}>{children}</PluginRuntimeContext.Provider>
}

export function usePluginRuntime(): PluginRuntimeValue {
  const value = useContext(PluginRuntimeContext)
  if (!value) throw new Error('usePluginRuntime must be used inside PluginRuntimeProvider')
  return value
}
