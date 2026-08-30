import type {DesiredGraphDocumentDto, GraphRevisionDto} from '@open-cinema/shared'

export type GraphAutosaveStatus =
  | 'uninitialized'
  | 'saved'
  | 'pending'
  | 'saving'
  | 'offline'
  | 'failed'
  | 'conflict'

export interface GraphAutosaveState {
  document: DesiredGraphDocumentDto | null
  baseDocument: DesiredGraphDocumentDto | null
  revision: GraphRevisionDto | null
  localSequence: number
  acknowledgedSequence: number
  inFlightSequence: number | null
  creatingDraft: boolean
  status: GraphAutosaveStatus
  error: string | null
  conflictVersion: number | null
  retryAttempt: number
}

export type GraphAutosaveAction =
  | {type: 'install'; revision: GraphRevisionDto | null; document: DesiredGraphDocumentDto}
  | {type: 'mutate'; document: DesiredGraphDocumentDto}
  | {type: 'draft-started'}
  | {type: 'draft-created'; revision: GraphRevisionDto; sequence: number}
  | {type: 'save-started'; sequence: number}
  | {type: 'save-succeeded'; revision: GraphRevisionDto; sequence: number}
  | {type: 'save-failed'; error: string; offline: boolean}
  | {type: 'conflict'; error: string; currentVersion: number | null}
  | {type: 'retry'}
  | {type: 'rebase-local'; revision: GraphRevisionDto}
  | {type: 'accept-remote'; revision: GraphRevisionDto; fallback: DesiredGraphDocumentDto}
  | {type: 'published'; revision: GraphRevisionDto}

export const emptyGraphAutosaveState: GraphAutosaveState = {
  document: null,
  baseDocument: null,
  revision: null,
  localSequence: 0,
  acknowledgedSequence: 0,
  inFlightSequence: null,
  creatingDraft: false,
  status: 'uninitialized',
  error: null,
  conflictVersion: null,
  retryAttempt: 0,
}

function canonicalDocument(
  revision: GraphRevisionDto,
  fallback: DesiredGraphDocumentDto,
): DesiredGraphDocumentDto {
  return revision.content ?? fallback
}

export function graphAutosaveReducer(
  state: GraphAutosaveState,
  action: GraphAutosaveAction,
): GraphAutosaveState {
  switch (action.type) {
    case 'install':
      return {
        ...emptyGraphAutosaveState,
        document: action.document,
        baseDocument: action.document,
        revision: action.revision,
        status: 'saved',
      }
    case 'mutate':
      return {
        ...state,
        document: action.document,
        localSequence: state.localSequence + 1,
        status: state.status === 'conflict' ? 'conflict' : 'pending',
        error: state.status === 'conflict' ? state.error : null,
      }
    case 'draft-started':
      return {...state, creatingDraft: true, status: 'saving', error: null}
    case 'draft-created': {
      const fallback = state.document ?? state.baseDocument
      if (!fallback) return state
      const canonical = canonicalDocument(action.revision, fallback)
      const current = state.localSequence === action.sequence
      return {
        ...state,
        revision: action.revision,
        baseDocument: canonical,
        document: current ? canonical : state.document,
        acknowledgedSequence: Math.max(state.acknowledgedSequence, action.sequence),
        creatingDraft: false,
        status: current ? 'saved' : 'pending',
        error: null,
        retryAttempt: 0,
      }
    }
    case 'save-started':
      return {...state, inFlightSequence: action.sequence, status: 'saving', error: null}
    case 'save-succeeded': {
      const fallback = state.document ?? state.baseDocument
      if (!fallback) return state
      const canonical = canonicalDocument(action.revision, fallback)
      const current = state.localSequence === action.sequence
      return {
        ...state,
        revision: action.revision,
        baseDocument: canonical,
        document: current ? canonical : state.document,
        acknowledgedSequence: Math.max(state.acknowledgedSequence, action.sequence),
        inFlightSequence: null,
        status: current ? 'saved' : 'pending',
        error: null,
        conflictVersion: null,
        retryAttempt: 0,
      }
    }
    case 'save-failed':
      return {
        ...state,
        inFlightSequence: null,
        creatingDraft: false,
        status: action.offline ? 'offline' : 'failed',
        error: action.error,
        retryAttempt: state.retryAttempt + 1,
      }
    case 'conflict':
      return {
        ...state,
        inFlightSequence: null,
        creatingDraft: false,
        status: 'conflict',
        error: action.error,
        conflictVersion: action.currentVersion,
      }
    case 'retry':
      return {...state, status: 'pending', error: null}
    case 'rebase-local':
      return {
        ...state,
        revision: action.revision,
        baseDocument: canonicalDocument(action.revision, state.baseDocument ?? state.document!),
        status: 'pending',
        error: null,
        conflictVersion: null,
      }
    case 'accept-remote': {
      const document = canonicalDocument(action.revision, action.fallback)
      return {
        ...emptyGraphAutosaveState,
        revision: action.revision,
        document,
        baseDocument: document,
        status: 'saved',
      }
    }
    case 'published': {
      const document = canonicalDocument(action.revision, state.document ?? state.baseDocument!)
      return {
        ...state,
        revision: action.revision,
        document,
        baseDocument: document,
        acknowledgedSequence: state.localSequence,
        inFlightSequence: null,
        status: 'saved',
        error: null,
      }
    }
  }
}

export function graphAutosaveNeedsWarning(state: GraphAutosaveState): boolean {
  return ['pending', 'saving', 'offline', 'failed', 'conflict'].includes(state.status)
}
