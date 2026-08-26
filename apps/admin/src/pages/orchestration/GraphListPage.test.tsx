// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {MemoryRouter} from 'react-router'
import {GraphListPage} from './GraphListPage'

const api = vi.hoisted(() => ({
  definitions: vi.fn(),
  readiness: vi.fn(),
  revisions: vi.fn(),
  revision: vi.fn(),
  activation: vi.fn(),
  activateRevision: vi.fn(),
  createDefinition: vi.fn(),
  createRevision: vi.fn(),
  deactivateGraph: vi.fn(),
}))

vi.mock('./client', () => ({audioApi: api}))

const activeGraph = {
  id: 'graph-1',
  name: 'Living room cinema',
  kind: 'graph' as const,
  ownerId: 'user-1',
  labels: {},
  createdAt: '2026-08-23T00:00:00Z',
  updatedAt: '2026-08-23T00:00:00Z',
  archivedAt: null,
  activeRevisionId: 'revision-1',
  desiredStateVersion: 5,
}

const publishedRevision = {
  id: 'revision-1',
  definitionId: 'graph-1',
  revisionNumber: 3,
  schemaVersion: 1 as const,
  state: 'published' as const,
  authorId: 'user-1',
  contentDigest: 'a'.repeat(64),
  validation: {valid: true, issues: []},
  updateVersion: 1,
  createdAt: '2026-08-23T00:00:00Z',
  publishedAt: '2026-08-23T00:00:00Z',
  content: {
    schemaVersion: 1 as const,
    id: 'graph:living-room',
    kind: 'graph' as const,
    metadata: {name: 'Living room cinema'},
    parameters: [],
    publicPorts: [],
    conditions: [],
    nodes: [],
    edges: [],
  },
}

beforeAll(() => {
  const getComputedStyle = window.getComputedStyle
  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: (element: Element) => getComputedStyle(element),
  })
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
})

beforeEach(() => {
  vi.clearAllMocks()
  api.definitions.mockResolvedValue({
    items: [activeGraph],
    pagination: {limit: 50, offset: 0, total: 1, nextOffset: null},
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
  api.revisions.mockResolvedValue({
    items: [publishedRevision],
    pagination: {limit: 50, offset: 0, total: 1, nextOffset: null},
  })
  api.revision.mockResolvedValue({value: publishedRevision, etag: '"1"'})
  api.activation.mockResolvedValue({
    value: {definitionId: 'graph-1', revisionId: 'revision-1', desiredStateVersion: 5},
    etag: '"5"',
  })
  api.activateRevision.mockResolvedValue({
    value: {definitionId: 'graph-1', revisionId: 'revision-1', desiredStateVersion: 6},
    etag: '"6"',
  })
  api.deactivateGraph.mockResolvedValue({
    value: {...activeGraph, revisionId: null, desiredStateVersion: 6},
    etag: '"6"',
  })
})

afterEach(cleanup)

describe('graph activation actions', () => {
  it('applies the latest published revision without touching a draft', async () => {
    render(<MemoryRouter><GraphListPage/></MemoryRouter>)

    expect(await screen.findByText('Living room cinema')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', {name: 'Apply Living room cinema'}))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Published revision 3/)).toBeTruthy()
    expect(within(dialog).getByText(/independent draft remains unchanged/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', {name: 'Apply graph'}))

    await waitFor(() => expect(api.activateRevision).toHaveBeenCalledWith(
      'revision-1',
      5,
      {},
      {active: 'cinema'},
    ))
    expect(api.createRevision).not.toHaveBeenCalled()
  })

  it('confirms that runtime routes are removed while saved graph data remains', async () => {
    render(<MemoryRouter><GraphListPage/></MemoryRouter>)

    expect(await screen.findByText('Living room cinema')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: 'Deactivate Living room cinema'}))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/drafts, published revisions, and layout remain saved/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', {name: 'Deactivate graph'}))

    await waitFor(() => expect(api.deactivateGraph).toHaveBeenCalledWith('graph-1', 5))
  })

  it('keeps editing reachable while disabling every live action in degraded mode', async () => {
    api.readiness.mockResolvedValue({
      ready: false,
      diagnosticsAvailable: true,
      desiredEditingAvailable: true,
      liveControlsAvailable: false,
      blockers: ['WirePlumber runtime is unavailable'],
      features: {},
      runtime: {available: false, worldGeneration: 0, worldSequence: 0},
      processorsReady: false,
    })

    render(<MemoryRouter><GraphListPage/></MemoryRouter>)

    expect(await screen.findByText('Desired audio can still be edited; live changes are paused')).toBeTruthy()
    expect(screen.getByText('WirePlumber runtime is unavailable')).toBeTruthy()
    expect((screen.getByRole('button', {name: 'Apply Living room cinema'}) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', {name: 'Deactivate Living room cinema'}) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', {name: 'Edit Living room cinema'})).toBeTruthy()
  })
})
