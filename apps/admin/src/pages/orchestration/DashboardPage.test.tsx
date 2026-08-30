// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { audioApi, systemApi } from './client'

vi.mock('./client', () => ({
  audioApi: {
    metadata: vi.fn(),
    masterLevel: vi.fn(),
    updateMasterLevel: vi.fn(),
    endpoints: vi.fn(),
    endpointExplanation: vi.fn(),
    definitions: vi.fn(),
    currentPlans: vi.fn(),
    managedResources: vi.fn(),
    runtimeSnapshot: vi.fn(),
    readiness: vi.fn(),
    eventStreamUrl: vi.fn(() => '/events'),
  },
  systemApi: {
    overview: vi.fn(),
    metrics: vi.fn(),
    components: vi.fn(),
    actions: vi.fn(),
    restartComponent: vi.fn(),
    reboot: vi.fn(),
    operation: vi.fn(),
  },
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
  Object.defineProperty(globalThis, 'EventSource', {
    writable: true,
    value: class {
      onopen = null
      onerror = null
      addEventListener() {}
      close() {}
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const master = {
  schemaVersion: 1 as const,
  scope: 'master-output' as const,
  desired: { level: 0.8, muted: false },
  effective: { level: 0.8, muted: false },
  observed: {},
  writable: true,
  applying: false,
  degraded: [],
  runtimeVersion: '3:9',
  updateVersion: 3,
  updatedAt: '2026-08-28T12:00:00Z',
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(systemApi.overview).mockResolvedValue({
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      hostname: 'open-cinema',
      model: 'Raspberry Pi 5',
      operatingSystem: 'Debian 13',
      kernel: '6.12',
      bootId: 'boot-1',
      uptimeSeconds: 90_000,
      storage: { usedBytes: 25, totalBytes: 100, percent: 25 },
      temperatureCelsius: 45.2,
      throttling: { supported: true, active: false, raw: '0x0' },
      application: { ready: true, status: 'ready', blockers: [] },
      unavailableFields: [],
    })
    vi.mocked(systemApi.metrics).mockResolvedValue({
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      cpuPercent: 7.5,
      memory: { usedBytes: 20, totalBytes: 80, percent: 25 },
      unavailableFields: [],
    })
    vi.mocked(systemApi.components).mockResolvedValue([{
      id: 'open-cinema',
      name: 'Open Cinema',
      version: '0.3.2',
      versionStatus: 'known',
      versionSource: 'manifest',
      health: 'ready',
      observedAt: new Date().toISOString(),
      actions: [{ id: 'restart', label: 'Restart', available: false, reason: 'Development helper unavailable', actionToken: null, method: 'POST', href: '/fixed' }],
    }])
    vi.mocked(systemApi.actions).mockResolvedValue([])
    vi.mocked(audioApi.metadata).mockResolvedValue({ apiVersion: 1 } as never)
    vi.mocked(audioApi.masterLevel).mockResolvedValue({ value: master, etag: '"3"' })
    vi.mocked(audioApi.endpoints).mockResolvedValue({ items: [{ id: 'endpoint-tv' }, { id: 'endpoint-speakers' }], pagination: {} } as never)
    vi.mocked(audioApi.endpointExplanation).mockResolvedValue({ resolution: { status: 'matched' } } as never)
    vi.mocked(audioApi.definitions).mockResolvedValue({ items: [{ id: 'graph-1', kind: 'graph', activeRevisionId: 'revision-1' }], pagination: {} } as never)
    vi.mocked(audioApi.currentPlans).mockResolvedValue({ items: [{
      definitionId: 'graph-1',
      applied: { status: 'converged' },
      plan: {
        id: 'plan-1',
        explanation: {
          presentation: {
            headline: { status: 'active', title: 'TV is playing on Main speakers', summary: 'The selected route is ready.' },
          },
        },
      },
    }] } as never)
    vi.mocked(audioApi.managedResources).mockResolvedValue({ schemaVersion: 1, items: [] })
    vi.mocked(audioApi.runtimeSnapshot).mockResolvedValue({ representation: 'observedRuntime', runtimeAvailable: true, worldGeneration: 3, worldSequence: 9, items: [] })
    vi.mocked(audioApi.readiness).mockResolvedValue({ ready: true, diagnosticsAvailable: true, desiredEditingAvailable: true, liveControlsAvailable: true, blockers: [], features: {}, runtime: { available: true, worldGeneration: 3, worldSequence: 9 }, processorsReady: true })
  })

  it('shows the appliance, human audio route, metrics, versions, and stable controls', async () => {
    render(<MemoryRouter><ConfigProvider><DashboardPage /></ConfigProvider></MemoryRouter>)

    expect(await screen.findByText('TV is playing on Main speakers')).toBeTruthy()
    expect(screen.getByText('Raspberry Pi 5')).toBeTruthy()
    expect(screen.getByText('0.3.2')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Master volume' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /CPU:/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Restart/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Page status')).toBeTruthy()
  })

  it('keeps the shell and reports partial failures instead of replacing the page', async () => {
    vi.mocked(systemApi.components).mockRejectedValue(new Error('Version probe unavailable'))
    vi.mocked(systemApi.overview).mockResolvedValue({
      ...(await systemApi.overview()),
      model: null,
      temperatureCelsius: null,
      throttling: { supported: false, active: null, raw: null },
    })

    render(<MemoryRouter><ConfigProvider><DashboardPage /></ConfigProvider></MemoryRouter>)

    expect(await screen.findByText('Some appliance information is unavailable')).toBeTruthy()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Not reported on this platform')).toBeTruthy()
    expect(screen.queryByText('Version probe unavailable')).toBeTruthy()
  })

  it('pauses metric polling while hidden and refreshes when visible again', async () => {
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<MemoryRouter><ConfigProvider><DashboardPage /></ConfigProvider></MemoryRouter>)
    await waitFor(() => expect(systemApi.metrics).toHaveBeenCalled())
    const initial = vi.mocked(systemApi.metrics).mock.calls.length

    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(4_000)
    expect(systemApi.metrics).toHaveBeenCalledTimes(initial)

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(systemApi.metrics).toHaveBeenCalledTimes(initial + 1))
  })
})
