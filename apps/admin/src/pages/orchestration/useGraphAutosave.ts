import {useCallback, useEffect, useRef, useState} from 'react'
import {ApiProblemError, type DesiredGraphDocumentDto, type GraphRevisionDto} from '@open-cinema/shared'
import {
  emptyGraphAutosaveState,
  graphAutosaveReducer,
  type GraphAutosaveAction,
  type GraphAutosaveState,
} from './graphAutosave'

const DEFAULT_DEBOUNCE_MS = 500
const MAX_RETRY_MS = 8_000

interface GraphAutosaveOptions {
  createDraft: (document: DesiredGraphDocumentDto) => Promise<GraphRevisionDto>
  saveDraft: (
    revisionId: string,
    document: DesiredGraphDocumentDto,
    updateVersion: number,
  ) => Promise<GraphRevisionDto>
  debounceMs?: number
}

export function useGraphAutosave({createDraft, saveDraft, debounceMs = DEFAULT_DEBOUNCE_MS}: GraphAutosaveOptions) {
  const [state, setState] = useState<GraphAutosaveState>(emptyGraphAutosaveState)
  const stateRef = useRef(state)
  const timerRef = useRef<number>()
  const inFlightRef = useRef<Promise<GraphRevisionDto | null>>()
  const generationRef = useRef(0)
  const disposedRef = useRef(false)
  const persistRef = useRef<() => Promise<GraphRevisionDto | null>>(async () => null)

  const transition = useCallback((action: GraphAutosaveAction) => {
    const next = graphAutosaveReducer(stateRef.current, action)
    stateRef.current = next
    if (!disposedRef.current) setState(next)
    return next
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  const schedule = useCallback((delay = debounceMs) => {
    clearTimer()
    if (disposedRef.current) return
    timerRef.current = window.setTimeout(() => void persistRef.current(), delay)
  }, [clearTimer, debounceMs])

  const persist = useCallback(async (): Promise<GraphRevisionDto | null> => {
    clearTimer()
    if (disposedRef.current) return null
    if (inFlightRef.current) return inFlightRef.current
    const initial = stateRef.current
    if (!initial.document || initial.status === 'conflict' || initial.status === 'uninitialized') {
      return initial.revision
    }
    if (
      initial.revision?.state === 'draft'
      && initial.localSequence <= initial.acknowledgedSequence
    ) return initial.revision

    const operation = (async () => {
      const generation = generationRef.current
      try {
        let current = stateRef.current
        if (current.revision?.state !== 'draft') {
          const sequence = current.localSequence
          const document = current.document!
          transition({type: 'draft-started'})
          const created = await createDraft(document)
          if (disposedRef.current || generation !== generationRef.current) return null
          transition({type: 'draft-created', revision: created, sequence})
          current = stateRef.current
        }
        if (
          current.revision?.state !== 'draft'
          || !current.document
          || current.localSequence <= current.acknowledgedSequence
        ) return current.revision
        const sequence = current.localSequence
        const document = current.document
        const revision = current.revision
        transition({type: 'save-started', sequence})
        const saved = await saveDraft(revision.id, document, revision.updateVersion)
        if (disposedRef.current || generation !== generationRef.current) return null
        transition({type: 'save-succeeded', revision: saved, sequence})
        return saved
      } catch (caught) {
        if (disposedRef.current || generation !== generationRef.current) return null
        const detail = caught instanceof Error ? caught.message : String(caught)
        if (caught instanceof ApiProblemError && caught.status === 412) {
          transition({
            type: 'conflict',
            error: detail,
            currentVersion: (caught.problem as {currentVersion?: number}).currentVersion ?? null,
          })
        } else {
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false
          const failed = transition({type: 'save-failed', error: detail, offline})
          schedule(Math.min(MAX_RETRY_MS, 500 * (2 ** Math.min(failed.retryAttempt, 4))))
        }
        return null
      }
    })()
    inFlightRef.current = operation
    try {
      return await operation
    } finally {
      inFlightRef.current = undefined
      const current = stateRef.current
      if (
        !disposedRef.current
        && current.status === 'pending'
        && current.localSequence > current.acknowledgedSequence
      ) schedule(0)
    }
  }, [clearTimer, createDraft, saveDraft, schedule, transition])

  persistRef.current = persist

  useEffect(() => {
    disposedRef.current = false
    const online = () => {
      if (['offline', 'failed'].includes(stateRef.current.status)) {
        transition({type: 'retry'})
        schedule(0)
      }
    }
    window.addEventListener('online', online)
    return () => {
      disposedRef.current = true
      generationRef.current += 1
      clearTimer()
      window.removeEventListener('online', online)
    }
  }, [clearTimer, schedule, transition])

  const install = useCallback((revision: GraphRevisionDto | null, document: DesiredGraphDocumentDto) => {
    clearTimer()
    generationRef.current += 1
    transition({type: 'install', revision, document})
  }, [clearTimer, transition])

  const mutate = useCallback((document: DesiredGraphDocumentDto) => {
    transition({type: 'mutate', document})
    schedule()
  }, [schedule, transition])

  const ensureDraft = useCallback(async () => {
    const current = stateRef.current
    if (current.revision?.state === 'draft') return current.revision
    return persist()
  }, [persist])

  const flush = useCallback(async (): Promise<GraphRevisionDto | null> => {
    clearTimer()
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (inFlightRef.current) await inFlightRef.current
      const current = stateRef.current
      if (['conflict', 'offline', 'failed', 'uninitialized'].includes(current.status)) return null
      if (
        current.revision?.state === 'draft'
        && current.localSequence <= current.acknowledgedSequence
      ) return current.revision
      await persist()
    }
    return null
  }, [clearTimer, persist])

  const retry = useCallback(() => {
    transition({type: 'retry'})
    schedule(0)
  }, [schedule, transition])

  const rebaseLocal = useCallback((revision: GraphRevisionDto) => {
    transition({type: 'rebase-local', revision})
    schedule(0)
  }, [schedule, transition])

  const acceptRemote = useCallback((revision: GraphRevisionDto) => {
    clearTimer()
    generationRef.current += 1
    const fallback = stateRef.current.document ?? stateRef.current.baseDocument
    if (fallback) transition({type: 'accept-remote', revision, fallback})
  }, [clearTimer, transition])

  const markPublished = useCallback((revision: GraphRevisionDto) => {
    transition({type: 'published', revision})
  }, [transition])

  return {state, install, mutate, ensureDraft, flush, retry, rebaseLocal, acceptRemote, markPublished}
}
