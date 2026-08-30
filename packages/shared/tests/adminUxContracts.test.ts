import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiProblemError } from '../src/api/client'
import { AudioOrchestrationApi } from '../src/orchestration/api'
import { OrchestrationStore } from '../src/orchestration/store'
import type { OrchestrationEventDto } from '../src/orchestration/types'
import {
  InvalidAudioContractError,
  UnsupportedAudioContractError,
  parseEndpointAudioLevel,
  parseManagedResource,
  parseMasterAudioLevel,
  parseRuntimeExplanation,
} from '../src/orchestration/validation'
import { SystemApi } from '../src/system/api'
import {
  InvalidSystemContractError,
  UnsupportedSystemContractError,
  parseSystemComponent,
  parseSystemMetrics,
  parseSystemOverview,
} from '../src/system/validation'

afterEach(() => vi.unstubAllGlobals())

const overview = {
  schemaVersion: 1,
  observedAt: '2026-08-28T12:00:00Z',
  hostname: 'open-cinema',
  model: null,
  operatingSystem: 'Debian GNU/Linux 13',
  kernel: '6.12',
  bootId: 'boot-1',
  uptimeSeconds: 600,
  storage: { usedBytes: 25, totalBytes: 100, percent: 25 },
  temperatureCelsius: null,
  throttling: { supported: false, active: null, raw: null },
  application: { ready: true, status: 'ready', blockers: [] },
  unavailableFields: ['model', 'temperatureCelsius'],
} as const

const master = {
  schemaVersion: 1,
  scope: 'master-output',
  desired: { level: 0.8, muted: false },
  effective: { level: 0.8, muted: false },
  observed: { outputs: [], known: false },
  writable: true,
  applying: false,
  degraded: [],
  runtimeVersion: '3:9',
  updateVersion: 4,
  updatedAt: '2026-08-28T12:00:00Z',
} as const

const endpoint = {
  schemaVersion: 1,
  scope: 'device-level',
  endpointId: 'endpoint-speakers',
  direction: 'output',
  availability: 'available',
  desired: { level: 0.5, muted: false },
  master: { level: 0.8, muted: false, updateVersion: 4 },
  effective: { level: 0.4, muted: false },
  observed: { level: 0.4, muted: false, known: true },
  capabilities: {
    volume: { readable: true, writable: true },
    mute: { readable: true, writable: false },
  },
  applying: false,
  degraded: [],
  runtimeVersion: '3:9',
  updateVersion: 2,
  updatedAt: '2026-08-28T12:00:00Z',
} as const

const resource = {
  schemaVersion: 1,
  id: 'processor:camilladsp:room',
  resourceType: 'processor',
  name: 'CamillaDSP · room',
  kind: 'camilladsp',
  version: '4.1.3',
  versionStatus: 'known',
  desired: { lifecycle: 'managed', enabled: true, updateVersion: null },
  observed: {
    lifecycle: 'ready',
    health: 'healthy',
    mode: null,
    profile: 'Living room',
    lastError: {},
    observedAt: '2026-08-28T12:00:00Z',
  },
  freshness: { observedAt: '2026-08-28T12:00:00Z', runtimeGeneration: 3, stale: false },
  actions: [{
    id: 'restart',
    label: 'Restart',
    available: false,
    reason: 'A safe supervisor restart intent is not available yet.',
    method: null,
    href: null,
    updateVersion: null,
  }],
  correlations: [],
} as const

const explanation = {
  schemaVersion: 1,
  headline: { status: 'active', title: 'TV is playing on Speakers', summary: 'Ready.' },
  route: [
    { kind: 'endpoint', name: 'TV', role: 'source', detail: null, referenceId: 'tv', nodeId: 'source' },
    { kind: 'endpoint', name: 'Speakers', role: 'output', detail: null, referenceId: 'speakers', nodeId: 'sink' },
  ],
  selection: {},
  alternatives: [],
  signals: {},
  processors: [],
  overrides: [],
  transition: {},
  errors: [],
  technicalReferences: {},
} as const

describe('validated admin UX contracts', () => {
  it('accepts partial platform fields and read-only capabilities', () => {
    expect(parseSystemOverview(overview).model).toBeNull()
    expect(parseMasterAudioLevel(master).desired.level).toBe(0.8)
    expect(parseEndpointAudioLevel(endpoint).capabilities.mute.writable).toBe(false)
    expect(parseManagedResource(resource).actions[0].available).toBe(false)
    expect(parseRuntimeExplanation(explanation).route[1].role).toBe('output')
  })

  it('rejects malformed values, unsafe actions, and future schemas', () => {
    expect(() => parseSystemMetrics({ schemaVersion: 1, observedAt: 'now', cpuPercent: '7', memory: null, unavailableFields: [] })).toThrow(InvalidSystemContractError)
    expect(() => parseMasterAudioLevel({ ...master, desired: { level: 2, muted: false } })).toThrow(InvalidAudioContractError)
    expect(() => parseManagedResource({
      ...resource,
      actions: [{ id: 'restart', label: 'Restart', available: true, reason: null, method: null, href: null, updateVersion: null }],
    })).toThrow(InvalidAudioContractError)
    expect(() => parseRuntimeExplanation({ ...explanation, schemaVersion: 2 })).toThrow(UnsupportedAudioContractError)
  })

  it('validates component action capability shape', () => {
    const component = parseSystemComponent({
      id: 'open-cinema',
      name: 'Open Cinema',
      version: null,
      versionStatus: 'unknown',
      versionSource: 'unknown',
      health: 'ready',
      observedAt: '2026-08-28T12:00:00Z',
      actions: [{ id: 'restart', label: 'Restart', available: false, reason: 'Not installed', actionToken: null, method: 'POST', href: '/fixed' }],
    })
    expect(component.actions[0].reason).toBe('Not installed')
  })
})

describe('system and level clients', () => {
  it('rejects a future system API response header', async () => {
    const client = {
      request: vi.fn(async () => ({ data: overview, status: 200, etag: null, apiVersion: '2', headers: new Headers() })),
    } as unknown as ApiClient
    await expect(new SystemApi(client).overview()).rejects.toBeInstanceOf(UnsupportedSystemContractError)
  })

  it('sends optimistic level versions and surfaces stale server responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: 'Refresh first', currentVersion: 5 }), {
      status: 412,
      headers: { 'Content-Type': 'application/problem+json' },
    }))
    vi.stubGlobal('fetch', fetcher)
    const api = new AudioOrchestrationApi({ client: new ApiClient('http://open-cinema.test/api') })

    await expect(api.updateMasterLevel(4, { level: 0.7 })).rejects.toBeInstanceOf(ApiProblemError)
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
    expect(headers.get('If-Match')).toBe('4')
  })
})

describe('monotonic operational state', () => {
  function event(sequence: number, payload: Record<string, unknown>): OrchestrationEventDto {
    return {
      sequence,
      id: `event-${sequence}`,
      correlationId: 'correlation',
      definitionId: null,
      type: 'changed',
      severity: 'info',
      payload: payload as OrchestrationEventDto['payload'],
      occurredAt: '2026-08-28T12:00:00Z',
    }
  }

  it('stores volume/resources and ignores duplicate or older event sequences', () => {
    const store = new OrchestrationStore()
    store.applyEvent('volume', event(2, { master }))
    store.applyEvent('managed-resource', event(3, { resource }))
    store.applyEvent('volume', event(2, { master: { ...master, desired: { level: 0.1, muted: false } } }))

    expect(store.getState().operational.masterLevel?.desired.level).toBe(0.8)
    expect(store.getState().operational.managedResources[resource.id].name).toContain('CamillaDSP')
    expect(store.getState().lastEventId).toBe(3)
  })
})
