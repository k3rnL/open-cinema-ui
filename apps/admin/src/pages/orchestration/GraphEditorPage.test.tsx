// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {MemoryRouter, Route, Routes} from 'react-router'
import {GraphEditorPage} from './GraphEditorPage'

const api = vi.hoisted(() => ({
  metadata: vi.fn(),
  definitions: vi.fn(),
  endpoints: vi.fn(),
  nodeTypes: vi.fn(),
  camilladspProfiles: vi.fn(),
  currentPlans: vi.fn(),
  runtimeSnapshot: vi.fn(),
  readiness: vi.fn(),
  revisions: vi.fn(),
  revision: vi.fn(),
  activation: vi.fn(),
  activateRevision: vi.fn(),
  deactivateGraph: vi.fn(),
  createRevision: vi.fn(),
  eventStreamUrl: vi.fn(() => '/api/audio/v1/events'),
}))

vi.mock('./client', () => ({audioApi: api}))

const graph = {
  id: 'graph-1',
  name: 'Published cinema graph',
  kind: 'graph' as const,
  ownerId: 'user-1',
  labels: {},
  createdAt: '2026-08-23T00:00:00Z',
  updatedAt: '2026-08-23T00:00:00Z',
  archivedAt: null,
  activeRevisionId: null,
  desiredStateVersion: 5,
}

const document = {
  schemaVersion: 1 as const,
  id: 'graph:published-cinema',
  kind: 'graph' as const,
  metadata: {name: 'Published cinema graph'},
  parameters: [],
  publicPorts: [],
  conditions: [],
  nodes: [],
  edges: [],
  layout: {viewport: {x: 0, y: 0, zoom: 1}},
}

const revision = {
  id: 'revision-3',
  definitionId: graph.id,
  revisionNumber: 3,
  schemaVersion: 1 as const,
  state: 'published' as const,
  authorId: 'user-1',
  contentDigest: 'a'.repeat(64),
  validation: {valid: true, issues: []},
  updateVersion: 1,
  createdAt: '2026-08-23T00:00:00Z',
  publishedAt: '2026-08-23T00:00:00Z',
  content: document,
}

const currentPlan = {
  definitionId: graph.id,
  applied: {
    status: 'converged' as const,
    currentPlanId: 'plan-1',
    previousPlanId: null,
    transitionGeneration: 1,
    correlationId: 'correlation-1',
    lastError: null,
    updatedAt: '2026-08-23T00:00:01Z',
  },
  plan: {
    id: 'plan-1',
    schemaVersion: 1 as const,
    definitionId: graph.id,
    revisionId: revision.id,
    desiredStateVersion: 6,
    worldGeneration: 1,
    worldSequence: 1,
    runtimeVersion: '1:1',
    resolutionMode: 'live' as const,
    status: 'resolved',
    document: {},
    explanation: {},
    planDigest: 'b'.repeat(64),
    correlationId: 'correlation-1',
    applied: {
      status: 'converged' as const,
      currentPlanId: 'plan-1',
      previousPlanId: null,
      transitionGeneration: 1,
      correlationId: 'correlation-1',
      lastError: null,
      updatedAt: '2026-08-23T00:00:01Z',
    },
    createdAt: '2026-08-23T00:00:01Z',
  },
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
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
      onopen: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      addEventListener() {}
      close() {}
    },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.eventStreamUrl.mockReturnValue('/api/audio/v1/events')
  api.metadata.mockResolvedValue({
    service: 'open-cinema-audio-orchestration',
    apiVersion: 1,
    schemaVersion: 1,
    supportedApiVersions: [1],
    mediaType: 'application/json',
    problemMediaType: 'application/problem+json',
    desiredGraphSchemaVersion: 1,
    resolverReplaySchemaVersion: 1,
    eventSchemaVersion: 1,
    conventions: {
      pagination: {parameters: ['limit', 'offset'], maximumLimit: 100},
      optimisticConcurrency: {requestHeader: 'If-Match', responseHeader: 'ETag', conflictStatus: 412, missingStatus: 428},
      eventResumption: {requestHeader: 'Last-Event-ID', gapEvent: 'snapshot'},
    },
    links: {},
  })
  api.definitions.mockResolvedValue({items: [graph]})
  api.endpoints.mockResolvedValue({items: []})
  api.nodeTypes.mockResolvedValue({items: []})
  api.camilladspProfiles.mockResolvedValue({items: []})
  api.currentPlans.mockResolvedValue({items: [currentPlan]})
  api.runtimeSnapshot.mockResolvedValue({
    representation: 'observedRuntime',
    runtimeAvailable: true,
    worldGeneration: 1,
    worldSequence: 1,
    items: [],
  })
  api.readiness.mockResolvedValue({
    ready: true,
    diagnosticsAvailable: true,
    desiredEditingAvailable: true,
    liveControlsAvailable: true,
    blockers: [],
    features: {},
    runtime: {available: true, worldGeneration: 1, worldSequence: 1},
    processorsReady: true,
  })
  api.revisions.mockResolvedValue({items: [revision]})
  api.revision.mockResolvedValue({value: revision, etag: '"1"'})
  api.activation.mockResolvedValue({
    value: {definitionId: graph.id, revisionId: null, desiredStateVersion: 5},
    etag: '"5"',
  })
  api.activateRevision.mockResolvedValue({
    value: {definitionId: graph.id, revisionId: revision.id, desiredStateVersion: 6},
    etag: '"6"',
  })
})

afterEach(cleanup)

describe('published graph activation', () => {
  it('offers one Apply action and activates without creating a draft', async () => {
    render(
      <MemoryRouter initialEntries={['/graphs/edit/graph-1']}>
        <Routes>
          <Route path="/graphs/edit/:id" element={<GraphEditorPage/>}/>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', {name: /Apply$/})).toBeTruthy()
    expect(screen.queryByRole('button', {name: 'Start draft'})).toBeNull()
    fireEvent.click(screen.getByRole('button', {name: /Apply$/}))

    await waitFor(() => expect(api.activateRevision).toHaveBeenCalledWith(
      revision.id,
      5,
      {},
      {active: 'cinema'},
    ))
    expect(api.createRevision).not.toHaveBeenCalled()
    expect(await screen.findByText('Activate published revision')).toBeTruthy()
  })

  it('keeps editing available while disabling the single Deactivate action when live control is unsafe', async () => {
    api.definitions.mockResolvedValue({items: [{...graph, activeRevisionId: revision.id}]})
    api.readiness.mockResolvedValue({
      ready: false,
      diagnosticsAvailable: true,
      desiredEditingAvailable: true,
      liveControlsAvailable: false,
      blockers: ['PipeWire runtime is unavailable'],
      features: {},
      runtime: {available: false, worldGeneration: 0, worldSequence: 0},
      processorsReady: false,
    })

    render(
      <MemoryRouter initialEntries={['/graphs/edit/graph-1']}>
        <Routes>
          <Route path="/graphs/edit/:id" element={<GraphEditorPage/>}/>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Apply is paused; editing and autosave remain available')).toBeTruthy()
    expect(screen.queryByRole('button', {name: /Apply$/})).toBeNull()
    expect((screen.getByRole('button', {name: /Deactivate$/}) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', {name: 'Start draft'})).toBeNull()
  })
})
