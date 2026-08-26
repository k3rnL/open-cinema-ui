import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../src/api/client'
import { AudioOrchestrationApi } from '../src/orchestration/api'
import {
  type EventSourceLike,
  OrchestrationEventSubscription,
} from '../src/orchestration/events'
import { compileSelectorRules } from '../src/orchestration/rules'
import { OrchestrationStore } from '../src/orchestration/store'
import type {
  ManagedAudioAdapterDto,
  AudioApiMetadata,
  DesiredGraphDocumentDto,
  GraphRevisionDto,
  OrchestrationEventDto,
  RuntimeProjectionDto,
} from '../src/orchestration/types'
import {
  InvalidAudioContractError,
  UnsupportedAudioContractError,
  parseAudioApiMetadata,
  parseGraphRevision,
  parseRuntimeSnapshot,
} from '../src/orchestration/validation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client browser security', () => {
  it('sends the Django CSRF cookie on writes but not reads', async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', request)
    vi.stubGlobal('document', {
      cookie: 'sessionid=session-1; csrftoken=browser%3Atoken',
    })
    const client = new ApiClient('http://open-cinema.test/api')

    await client.get('/audio/v1/schema')
    await client.patch('/audio/v1/revisions/revision-1', { content: {} })

    const readHeaders = new Headers(request.mock.calls[0][1]?.headers)
    const writeHeaders = new Headers(request.mock.calls[1][1]?.headers)
    expect(readHeaders.has('X-CSRFToken')).toBe(false)
    expect(writeHeaders.get('X-CSRFToken')).toBe('browser:token')
  })

  it('deactivates a graph with its desired-state precondition and no request body', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      definitionId: 'graph-1',
      revisionId: null,
      desiredStateVersion: 6,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'ETag': '"6"',
        'Open-Cinema-API-Version': '1',
      },
    }))
    vi.stubGlobal('fetch', request)
    const api = new AudioOrchestrationApi({
      client: new ApiClient('http://open-cinema.test/api'),
    })

    const result = await api.deactivateGraph('graph-1', 5)

    expect(result.value.revisionId).toBeNull()
    expect(result.value.desiredStateVersion).toBe(6)
    expect(result.etag).toBe('"6"')
    expect(request).toHaveBeenCalledWith(
      'http://open-cinema.test/api/audio/v1/graphs/graph-1/activation',
      expect.objectContaining({method: 'DELETE', body: undefined}),
    )
    const headers = new Headers(request.mock.calls[0][1]?.headers)
    expect(headers.get('If-Match')).toBe('5')
  })
})

const metadata: AudioApiMetadata = {
  service: 'open-cinema-audio-orchestration',
  apiVersion: 1,
  schemaVersion: 1,
  supportedApiVersions: [1],
  mediaType: 'application/vnd.open-cinema.audio+json;version=1',
  problemMediaType: 'application/problem+json',
  desiredGraphSchemaVersion: 1,
  resolverReplaySchemaVersion: 1,
  eventSchemaVersion: 1,
  conventions: {
    pagination: { parameters: ['limit', 'offset'], maximumLimit: 200 },
    optimisticConcurrency: {
      requestHeader: 'If-Match',
      responseHeader: 'ETag',
      conflictStatus: 412,
      missingStatus: 428,
    },
    eventResumption: { requestHeader: 'Last-Event-ID', gapEvent: 'snapshot' },
  },
  links: { runtime: '/api/audio/v1/runtime/snapshot' },
}

const document: DesiredGraphDocumentDto = {
  schemaVersion: 1,
  id: 'graph:living-room',
  kind: 'graph',
  metadata: { name: 'Living room' },
  parameters: [],
  publicPorts: [],
  conditions: [],
  nodes: [],
  edges: [],
}

const revision: GraphRevisionDto = {
  id: 'revision-1',
  definitionId: 'graph-1',
  revisionNumber: 1,
  schemaVersion: 1,
  state: 'draft',
  authorId: 'user-1',
  contentDigest: 'sha256:abc',
  validation: { valid: true, issues: [] },
  updateVersion: 4,
  createdAt: '2026-08-22T00:00:00Z',
  publishedAt: null,
  content: document,
}

const projection: RuntimeProjectionDto = {
  id: 'projection-1',
  type: 'endpoint-candidate',
  subject: 'alsa:headset',
  worldGeneration: 2,
  worldSequence: 8,
  payload: { available: true },
  current: true,
  observedAt: '2026-08-22T00:00:00Z',
}

const adapter: ManagedAudioAdapterDto = {
  id: 'adapter-1',
  ownerId: 'user-1',
  schemaVersion: 1,
  desired: {
    name: 'Mac ROC output',
    kind: 'roc-sender',
    configuration: {remoteAddress: '192.168.1.30'},
    enabled: true,
    restartGeneration: 0,
    updateVersion: 4,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-22T00:00:00Z',
  },
  observed: {
    lifecycle: 'ready',
    health: 'healthy',
    processId: 123,
    runtimeGeneration: 2,
    configurationDigest: 'sha256:adapter',
    expectedNodeName: 'open-cinema-adapter-adapter-1',
    runtimeKey: 'runtime:2:node:9',
    progress: {},
    retryAt: null,
    lastError: {},
    startedAt: '2026-08-22T00:00:00Z',
    observedAt: '2026-08-22T00:00:01Z',
    updatedAt: '2026-08-22T00:00:01Z',
  },
}

function event(sequence: number, payload: Record<string, unknown> = {}): OrchestrationEventDto {
  return {
    sequence,
    id: `event-${sequence}`,
    correlationId: 'correlation-1',
    definitionId: null,
    type: 'runtime.changed',
    severity: 'info',
    payload: payload as OrchestrationEventDto['payload'],
    occurredAt: '2026-08-22T00:00:00Z',
  }
}

describe('server schema contracts', () => {
  it('accepts the supported metadata and desired graph schema', () => {
    expect(parseAudioApiMetadata(metadata)).toEqual(metadata)
    expect(parseGraphRevision(revision).content?.id).toBe(document.id)
  })

  it('fails clearly when a future API or graph schema arrives', () => {
    expect(() => parseAudioApiMetadata({ ...metadata, apiVersion: 2 })).toThrow(
      UnsupportedAudioContractError,
    )
    expect(() =>
      parseGraphRevision({
        ...revision,
        content: { ...document, schemaVersion: 2 },
      }),
    ).toThrow(UnsupportedAudioContractError)
  })

  it('rejects a desired/runtime representation mix-up', () => {
    expect(() => parseRuntimeSnapshot({ representation: 'desiredGraph', items: [] })).toThrow(
      InvalidAudioContractError,
    )
  })
})

describe('orchestration state', () => {
  it('keeps desired, resolved, applied, and observed runtime state separate', () => {
    const store = new OrchestrationStore()
    store.installDesired({
      definitions: [
        {
          id: 'graph-1',
          name: 'Living room',
          kind: 'graph',
          ownerId: 'user-1',
          labels: {},
          createdAt: '2026-08-22T00:00:00Z',
          updatedAt: '2026-08-22T00:00:00Z',
          archivedAt: null,
          activeRevisionId: 'revision-1',
          desiredStateVersion: 5,
        },
      ],
    })
    store.installCurrentPlans([
      {
        definitionId: 'graph-1',
        applied: {
          status: 'converged',
          currentPlanId: 'plan-1',
          previousPlanId: null,
          transitionGeneration: 3,
          correlationId: 'correlation-1',
          lastError: null,
          updatedAt: '2026-08-22T00:00:00Z',
        },
        plan: {
          id: 'plan-1',
          schemaVersion: 1,
          definitionId: 'graph-1',
          revisionId: 'revision-1',
          desiredStateVersion: 5,
          worldGeneration: 2,
          worldSequence: 8,
          runtimeVersion: '2:8',
          resolutionMode: 'live',
          status: 'resolved',
          document: {},
          explanation: {},
          planDigest: 'sha256:plan',
          correlationId: 'correlation-1',
          applied: {
            status: 'converged',
            currentPlanId: 'plan-1',
            previousPlanId: null,
            transitionGeneration: 3,
            correlationId: 'correlation-1',
            lastError: null,
            updatedAt: '2026-08-22T00:00:00Z',
          },
          createdAt: '2026-08-22T00:00:00Z',
        },
      },
    ])
    store.replaceRuntime({
      representation: 'observedRuntime',
      runtimeAvailable: true,
      worldGeneration: 2,
      worldSequence: 8,
      items: [projection],
    })

    const state = store.getState()
    expect(state.desired.definitions['graph-1'].desiredStateVersion).toBe(5)
    expect(state.resolved.currentPlanByDefinition['graph-1']).toBe('plan-1')
    expect(state.applied.byDefinition['graph-1'].transitionGeneration).toBe(3)
    expect(state.runtime.projections['endpoint-candidate:alsa:headset']).toEqual(projection)
  })
})

describe('simple rule compilation', () => {
  it('compiles priorities and OTHERWISE into canonical desired-graph conditions', () => {
    const compiled = compileSelectorRules('graph-1', 'Cinema', 'tv', [
      {
        id: 'speakers',
        name: 'Default speakers',
        fact: 'endpoint.headset.availability',
        operator: 'notEquals',
        value: 'available',
        thenEndpointId: 'speakers',
        priority: 10,
      },
      {
        id: 'headset',
        name: 'Headset wins',
        fact: 'endpoint.headset.availability',
        operator: 'equals',
        value: 'available',
        thenEndpointId: 'headset',
        otherwiseEndpointId: 'speakers',
        priority: 100,
      },
    ])

    expect(compiled.nodes.map((item) => item.id)).toEqual([
      'source',
      'rule-fan-out',
      'output:headset',
      'output:speakers',
      'output:fallback',
    ])
    expect(compiled.conditions[0].expression).toEqual({
      op: 'eq',
      fact: 'endpoint.headset.availability',
      value: 'available',
    })
    expect(compiled.nodes[3].condition?.expression).toEqual({
      op: 'all',
      args: [
        { op: 'neq', fact: 'endpoint.headset.availability', value: 'available' },
        {
          op: 'not',
          arg: { op: 'eq', fact: 'endpoint.headset.availability', value: 'available' },
        },
      ],
    })
    expect(compiled.extensions?.simpleRules).toBeTruthy()
  })
})

class FakeEventSource implements EventSourceLike {
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>()
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener)
  }

  close(): void {
    this.closed = true
  }

  dispatch(type: string, value: unknown, lastEventId = ''): void {
    this.listeners.get(type)?.({ data: JSON.stringify(value), lastEventId } as MessageEvent<string>)
  }
}

describe('live event recovery', () => {
  it('resumes from its cursor and replaces runtime state after a sequence gap', async () => {
    const store = new OrchestrationStore()
    store.applyEvent('runtime', event(1))
    const source = new FakeEventSource()
    const runtimeSnapshot = vi.fn(async () => ({
      representation: 'observedRuntime' as const,
      runtimeAvailable: true,
      worldGeneration: 2,
      worldSequence: 8,
      items: [projection],
    }))
    const api = {
      eventStreamUrl: (after?: number) => `/events?after=${after}`,
      runtimeSnapshot,
      currentPlans: vi.fn(async () => ({items: []})),
      readiness: vi.fn(async () => ({
        ready: true,
        diagnosticsAvailable: true,
        desiredEditingAvailable: true,
        liveControlsAvailable: true,
        blockers: [],
        features: {},
        runtime: {available: true, worldGeneration: 2, worldSequence: 8},
        processorsReady: true,
      })),
    } as unknown as AudioOrchestrationApi
    let openedUrl = ''
    const subscription = new OrchestrationEventSubscription(api, store, (url) => {
      openedUrl = url
      return source
    })

    subscription.connect()
    expect(openedUrl).toBe('/events?after=1')
    source.dispatch('runtime', event(3, { projection }))

    await vi.waitFor(() => expect(store.getState().lastEventId).toBe(3))
    expect(runtimeSnapshot).toHaveBeenCalledOnce()
    expect(store.getState().runtime.projections['endpoint-candidate:alsa:headset']).toEqual(
      projection,
    )
    expect(store.getState().recoveryRequired).toBe(false)
    subscription.close()
    expect(source.closed).toBe(true)
  })

  it('enters degraded offline state without discarding desired state', () => {
    const store = new OrchestrationStore()
    store.installDesired({ revisions: [revision] })
    const source = new FakeEventSource()
    const api = {
      eventStreamUrl: () => '/events',
      runtimeSnapshot: vi.fn(),
      currentPlans: vi.fn(),
      readiness: vi.fn(),
    } as unknown as AudioOrchestrationApi
    new OrchestrationEventSubscription(api, store, () => source).connect()

    source.onerror?.(new Event('error'))
    expect(store.getState().connection).toBe('offline')
    expect(store.getState().desired.revisions['revision-1']).toEqual(revision)
  })
})

describe('optimistic API contract', () => {
  it('keeps adapter desired mutations versioned and exposes restart explicitly', async () => {
    const request = vi.fn(async () => ({
      data: adapter,
      status: 200,
      etag: '"5"',
      apiVersion: '1',
      headers: new Headers(),
    }))
    const client = {
      url: (path: string) => path,
      request,
    } as unknown as ApiClient
    const api = new AudioOrchestrationApi({client})

    await api.updateAdapter('adapter-1', 4, {enabled: false})
    await api.restartAdapter('adapter-1', 5)
    await api.deleteAdapter('adapter-1', 6)

    expect(request.mock.calls.map((call) => [call[0], call[1], call[3].headers['If-Match']])).toEqual([
      ['PATCH', '/audio/v1/adapters/adapter-1', '4'],
      ['POST', '/audio/v1/adapters/adapter-1/restart', '5'],
      ['DELETE', '/audio/v1/adapters/adapter-1', '6'],
    ])
  })

  it('sends API and If-Match versions and retains the returned ETag', async () => {
    const request = vi.fn(async () => ({
      data: revision,
      status: 200,
      etag: '"revision-1:5"',
      apiVersion: '1',
      headers: new Headers(),
    }))
    const client = {
      url: (path: string) => `http://example.test/api${path}`,
      request,
    } as unknown as ApiClient
    const api = new AudioOrchestrationApi({ client })

    const saved = await api.saveDraft('revision-1', document, 4)

    expect(saved.etag).toBe('"revision-1:5"')
    expect(request).toHaveBeenCalledWith(
      'PATCH',
      '/audio/v1/revisions/revision-1',
      { content: document },
      {
        headers: {
          'Open-Cinema-API-Version': '1',
          'If-Match': '4',
        },
      },
    )
  })

  it('publishes and activates one validated draft atomically for Apply', async () => {
    const request = vi.fn(async () => ({
      data: {...revision, state: 'published'},
      status: 200,
      etag: '"5"',
      apiVersion: '1',
      headers: new Headers(),
    }))
    const client = {
      url: (path: string) => path,
      request,
    } as unknown as ApiClient
    const api = new AudioOrchestrationApi({client})

    await api.applyDraftRevision('revision-1', 4, 7, {gain: -3}, {active: 'cinema'})

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/audio/v1/revisions/revision-1/publish',
      {
        activate: true,
        expectedActivationVersion: 7,
        parameterBindings: {gain: -3},
        sceneBindings: {active: 'cinema'},
      },
      {
        headers: {
          'Open-Cinema-API-Version': '1',
          'If-Match': '4',
        },
      },
    )
  })

  it('rejects a response advertising a future API contract', async () => {
    const client = {
      url: (path: string) => path,
      request: vi.fn(async () => ({
        data: metadata,
        status: 200,
        etag: null,
        apiVersion: '2',
        headers: new Headers(),
      })),
    } as unknown as ApiClient
    await expect(new AudioOrchestrationApi({ client }).metadata()).rejects.toBeInstanceOf(
      UnsupportedAudioContractError,
    )
  })
})
