// @vitest-environment jsdom

import {act, cleanup, renderHook} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DesiredGraphDocumentDto, GraphRevisionDto} from '@open-cinema/shared'
import {
  emptyGraphAutosaveState,
  graphAutosaveNeedsWarning,
  graphAutosaveReducer,
} from './graphAutosave'
import {useGraphAutosave} from './useGraphAutosave'

function documentAt(x: number, name = 'Cinema'): DesiredGraphDocumentDto {
  return {
    schemaVersion: 1,
    id: 'graph:cinema',
    kind: 'graph',
    metadata: {name},
    parameters: [],
    publicPorts: [],
    conditions: [],
    nodes: [{id: 'speaker', type: 'core.endpoint-reference', version: 1, configuration: {}, layout: {x, y: 20}}],
    edges: [],
    layout: {viewport: {x: 0, y: 0, zoom: 1}},
  }
}

function revision(
  state: 'draft' | 'published',
  updateVersion: number,
  content: DesiredGraphDocumentDto,
): GraphRevisionDto {
  return {
    id: state === 'draft' ? 'draft-1' : 'published-1',
    definitionId: 'graph-1',
    revisionNumber: state === 'draft' ? 2 : 1,
    schemaVersion: 1,
    state,
    authorId: 'user-1',
    contentDigest: String(updateVersion).repeat(64).slice(0, 64),
    validation: {valid: true, issues: []},
    updateVersion,
    createdAt: '2026-08-28T20:00:00Z',
    publishedAt: state === 'published' ? '2026-08-28T20:00:00Z' : null,
    content,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, resolve, reject}
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('graph autosave state machine', () => {
  it('never lets an older save response reset a newer node position or value', () => {
    const base = documentAt(0)
    let state = graphAutosaveReducer(emptyGraphAutosaveState, {type: 'install', revision: revision('draft', 1, base), document: base})
    state = graphAutosaveReducer(state, {type: 'mutate', document: documentAt(120)})
    state = graphAutosaveReducer(state, {type: 'save-started', sequence: 1})
    const newest = documentAt(240, 'Cinema edited')
    state = graphAutosaveReducer(state, {type: 'mutate', document: newest})
    state = graphAutosaveReducer(state, {type: 'save-succeeded', revision: revision('draft', 2, documentAt(120)), sequence: 1})

    expect(state.document).toEqual(newest)
    expect(state.baseDocument).toEqual(documentAt(120))
    expect(state.status).toBe('pending')
    expect(state.acknowledgedSequence).toBe(1)
  })

  it('preserves local content in conflict, offline, and failed states', () => {
    const local = documentAt(99)
    let state = graphAutosaveReducer(emptyGraphAutosaveState, {type: 'install', revision: revision('draft', 1, documentAt(0)), document: documentAt(0)})
    state = graphAutosaveReducer(state, {type: 'mutate', document: local})
    state = graphAutosaveReducer(state, {type: 'conflict', error: 'changed elsewhere', currentVersion: 7})
    expect(state.document).toEqual(local)
    expect(state.conflictVersion).toBe(7)
    expect(graphAutosaveNeedsWarning(state)).toBe(true)

    state = graphAutosaveReducer(state, {type: 'rebase-local', revision: revision('draft', 7, documentAt(10))})
    expect(state.document).toEqual(local)
    expect(state.status).toBe('pending')
  })

  it('preserves edge, auto-layout, and viewport mutations and replaces them only on explicit remote reload', () => {
    const base = documentAt(0)
    const changed: DesiredGraphDocumentDto = {
      ...documentAt(320, 'Auto laid out'),
      nodes: [
        ...documentAt(320).nodes,
        {id: 'headset', type: 'core.endpoint-reference', version: 1, configuration: {}, layout: {x: 640, y: 20}},
      ],
      edges: [{id: 'edge:speaker-headset', from: {node: 'speaker', port: 'output'}, to: {node: 'headset', port: 'input'}}],
      layout: {viewport: {x: -120, y: 40, zoom: 0.7}},
    }
    let state = graphAutosaveReducer(emptyGraphAutosaveState, {
      type: 'install',
      revision: revision('draft', 1, base),
      document: base,
    })
    state = graphAutosaveReducer(state, {type: 'mutate', document: changed})
    state = graphAutosaveReducer(state, {type: 'save-started', sequence: 1})
    const newer = {...changed, metadata: {...changed.metadata, description: 'newer field edit'}}
    state = graphAutosaveReducer(state, {type: 'mutate', document: newer})
    state = graphAutosaveReducer(state, {
      type: 'save-succeeded',
      revision: revision('draft', 2, changed),
      sequence: 1,
    })

    expect(state.document).toEqual(newer)
    expect(state.document?.edges).toEqual(changed.edges)
    expect(state.document?.layout).toEqual(changed.layout)

    const remote = revision('draft', 9, documentAt(5, 'Remote draft'))
    state = graphAutosaveReducer(state, {type: 'accept-remote', revision: remote, fallback: base})
    expect(state.document).toEqual(remote.content)
    expect(state.status).toBe('saved')
    expect(graphAutosaveNeedsWarning(state)).toBe(false)
  })

  it('creates a draft on first edit and queues edits made while creation is in flight', async () => {
    vi.useFakeTimers()
    const creation = deferred<GraphRevisionDto>()
    const createDraft = vi.fn(() => creation.promise)
    const saveDraft = vi.fn(async (_id: string, content: DesiredGraphDocumentDto) => revision('draft', 2, content))
    const {result} = renderHook(() => useGraphAutosave({createDraft, saveDraft, debounceMs: 20}))
    const published = revision('published', 1, documentAt(0))

    act(() => result.current.install(published, documentAt(0)))
    act(() => result.current.mutate(documentAt(100)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(createDraft).toHaveBeenCalledWith(documentAt(100))

    act(() => result.current.mutate(documentAt(200, 'Newest')))
    await act(async () => {
      creation.resolve(revision('draft', 1, documentAt(100)))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(saveDraft).toHaveBeenCalledWith('draft-1', documentAt(200, 'Newest'), 1)
    expect(result.current.state.status).toBe('saved')
    expect(result.current.state.document).toEqual(documentAt(200, 'Newest'))
  })

  it('coalesces rapid mutations and persists only the newest document', async () => {
    vi.useFakeTimers()
    const saveDraft = vi.fn(async (_id: string, content: DesiredGraphDocumentDto) => revision('draft', 2, content))
    const {result} = renderHook(() => useGraphAutosave({
      createDraft: vi.fn(),
      saveDraft,
      debounceMs: 20,
    }))

    act(() => result.current.install(revision('draft', 1, documentAt(0)), documentAt(0)))
    act(() => {
      result.current.mutate(documentAt(10))
      result.current.mutate(documentAt(20))
      result.current.mutate(documentAt(30, 'Latest'))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
      await Promise.resolve()
    })

    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(saveDraft).toHaveBeenCalledWith('draft-1', documentAt(30, 'Latest'), 1)
    expect(result.current.state.status).toBe('saved')
  })

  it('retains local content and retries a transient save failure', async () => {
    vi.useFakeTimers()
    const saveDraft = vi.fn()
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockImplementationOnce(async (_id: string, content: DesiredGraphDocumentDto) => revision('draft', 2, content))
    const {result} = renderHook(() => useGraphAutosave({
      createDraft: vi.fn(),
      saveDraft,
      debounceMs: 20,
    }))

    act(() => result.current.install(revision('draft', 1, documentAt(0)), documentAt(0)))
    act(() => result.current.mutate(documentAt(55, 'Retained')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
      await Promise.resolve()
    })
    expect(result.current.state.status).toBe('failed')
    expect(result.current.state.document).toEqual(documentAt(55, 'Retained'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
      await Promise.resolve()
    })
    expect(saveDraft).toHaveBeenCalledTimes(2)
    expect(result.current.state.status).toBe('saved')
  })

  it('flushes a newer edit made while a save is in flight before returning', async () => {
    vi.useFakeTimers()
    const firstSave = deferred<GraphRevisionDto>()
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(async (_id: string, content: DesiredGraphDocumentDto) => revision('draft', 3, content))
    const {result} = renderHook(() => useGraphAutosave({
      createDraft: vi.fn(),
      saveDraft,
      debounceMs: 20,
    }))

    act(() => result.current.install(revision('draft', 1, documentAt(0)), documentAt(0)))
    act(() => result.current.mutate(documentAt(100)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(saveDraft).toHaveBeenCalledTimes(1)

    act(() => result.current.mutate(documentAt(200, 'Apply me')))
    let flushed: Promise<GraphRevisionDto | null>
    await act(async () => {
      flushed = result.current.flush()
      firstSave.resolve(revision('draft', 2, documentAt(100)))
      await flushed
    })

    expect(saveDraft).toHaveBeenCalledTimes(2)
    expect(saveDraft).toHaveBeenLastCalledWith('draft-1', documentAt(200, 'Apply me'), 2)
    expect(result.current.state.document).toEqual(documentAt(200, 'Apply me'))
    expect(result.current.state.status).toBe('saved')
  })

  it('does not continue saving after unmount while draft creation is in flight', async () => {
    vi.useFakeTimers()
    const creation = deferred<GraphRevisionDto>()
    const saveDraft = vi.fn()
    const {result, unmount} = renderHook(() => useGraphAutosave({
      createDraft: vi.fn(() => creation.promise),
      saveDraft,
      debounceMs: 20,
    }))

    act(() => result.current.install(revision('published', 1, documentAt(0)), documentAt(0)))
    act(() => result.current.mutate(documentAt(99)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    unmount()
    await act(async () => {
      creation.resolve(revision('draft', 1, documentAt(99)))
      await Promise.resolve()
      await vi.runAllTimersAsync()
    })

    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('does not let an in-flight response overwrite an explicitly refreshed revision', async () => {
    vi.useFakeTimers()
    const saving = deferred<GraphRevisionDto>()
    const saveDraft = vi.fn(() => saving.promise)
    const {result} = renderHook(() => useGraphAutosave({
      createDraft: vi.fn(),
      saveDraft,
      debounceMs: 20,
    }))
    const initial = revision('draft', 1, documentAt(0))
    const remote = revision('draft', 8, documentAt(800, 'Refreshed remote'))

    act(() => result.current.install(initial, initial.content!))
    act(() => result.current.mutate(documentAt(100, 'Old local')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(saveDraft).toHaveBeenCalledTimes(1)

    act(() => result.current.install(remote, remote.content!))
    await act(async () => {
      saving.resolve(revision('draft', 2, documentAt(100, 'Old local')))
      await Promise.resolve()
    })

    expect(result.current.state.revision?.updateVersion).toBe(8)
    expect(result.current.state.document).toEqual(remote.content)
    expect(result.current.state.status).toBe('saved')
  })
})
