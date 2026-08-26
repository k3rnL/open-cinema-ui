import type {
  AudioApiMetadata,
  CurrentPlanDto,
  GraphActivationDto,
  GraphDefinitionDto,
  GraphRevisionDto,
  LogicalEndpointDto,
  OrchestrationEventDto,
  OrchestrationReadinessDto,
  ResolvedPlanDto,
  RuntimeProjectionDto,
  RuntimeSnapshotDto,
  SnapshotRecoveryDto,
} from './types'

export type OrchestrationConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'recovering'
  | 'offline'
  | 'incompatible'

export interface DesiredClientState {
  definitions: Record<string, GraphDefinitionDto>
  revisions: Record<string, GraphRevisionDto>
  activations: Record<string, GraphActivationDto>
  selectedDefinitionId: string | null
  editingRevisionId: string | null
}

export interface ResolvedClientState {
  plans: Record<string, ResolvedPlanDto>
  currentPlanByDefinition: Record<string, string | null>
}

export interface AppliedClientState {
  byDefinition: Record<string, CurrentPlanDto['applied']>
}

export interface RuntimeClientState {
  projections: Record<string, RuntimeProjectionDto>
  endpoints: Record<string, LogicalEndpointDto>
  worldGeneration: number | null
  worldSequence: number | null
  available: boolean
}

export interface OrchestrationClientState {
  compatibility: AudioApiMetadata | null
  connection: OrchestrationConnectionState
  connectionMessage: string | null
  lastEventId: number | null
  recoveryRequired: boolean
  desired: DesiredClientState
  resolved: ResolvedClientState
  applied: AppliedClientState
  runtime: RuntimeClientState
  readiness: OrchestrationReadinessDto | null
}

export type StoreListener = () => void

function initialState(): OrchestrationClientState {
  return {
    compatibility: null,
    connection: 'idle',
    connectionMessage: null,
    lastEventId: null,
    recoveryRequired: false,
    desired: {
      definitions: {},
      revisions: {},
      activations: {},
      selectedDefinitionId: null,
      editingRevisionId: null,
    },
    resolved: { plans: {}, currentPlanByDefinition: {} },
    applied: { byDefinition: {} },
    runtime: {
      projections: {},
      endpoints: {},
      worldGeneration: null,
      worldSequence: null,
      available: false,
    },
    readiness: null,
  }
}

function projectionKey(value: RuntimeProjectionDto): string {
  return `${value.type}:${value.subject}`
}

export class OrchestrationStore {
  private state: OrchestrationClientState = initialState()
  private readonly listeners = new Set<StoreListener>()

  getState = (): OrchestrationClientState => this.state

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(next: OrchestrationClientState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  reset(): void {
    this.publish(initialState())
  }

  setCompatibility(metadata: AudioApiMetadata): void {
    this.publish({ ...this.state, compatibility: metadata })
  }

  setConnection(connection: OrchestrationConnectionState, message: string | null = null): void {
    this.publish({ ...this.state, connection, connectionMessage: message })
  }

  setReadiness(readiness: OrchestrationReadinessDto): void {
    this.publish({ ...this.state, readiness })
  }

  installDesired(input: {
    definitions?: GraphDefinitionDto[]
    revisions?: GraphRevisionDto[]
    activations?: GraphActivationDto[]
    endpoints?: LogicalEndpointDto[]
  }): void {
    const desired = { ...this.state.desired }
    if (input.definitions) {
      desired.definitions = Object.fromEntries(input.definitions.map((item) => [item.id, item]))
    }
    if (input.revisions) {
      desired.revisions = {
        ...desired.revisions,
        ...Object.fromEntries(input.revisions.map((item) => [item.id, item])),
      }
    }
    if (input.activations) {
      desired.activations = Object.fromEntries(
        input.activations.map((item) => [item.definitionId, item]),
      )
    }
    const runtime = input.endpoints
      ? {
          ...this.state.runtime,
          endpoints: Object.fromEntries(input.endpoints.map((item) => [item.id, item])),
        }
      : this.state.runtime
    this.publish({ ...this.state, desired, runtime })
  }

  selectDefinition(definitionId: string | null, revisionId: string | null = null): void {
    this.publish({
      ...this.state,
      desired: {
        ...this.state.desired,
        selectedDefinitionId: definitionId,
        editingRevisionId: revisionId,
      },
    })
  }

  installCurrentPlans(items: CurrentPlanDto[]): void {
    const plans = { ...this.state.resolved.plans }
    const currentPlanByDefinition = { ...this.state.resolved.currentPlanByDefinition }
    const applied = { ...this.state.applied.byDefinition }
    for (const item of items) {
      currentPlanByDefinition[item.definitionId] = item.plan?.id ?? null
      applied[item.definitionId] = item.applied
      if (item.plan) plans[item.plan.id] = item.plan
    }
    this.publish({
      ...this.state,
      resolved: { plans, currentPlanByDefinition },
      applied: { byDefinition: applied },
    })
  }

  replaceRuntime(snapshot: RuntimeSnapshotDto | SnapshotRecoveryDto): void {
    const items = 'items' in snapshot ? snapshot.items : snapshot.projections
    this.publish({
      ...this.state,
      connection: 'online',
      connectionMessage: null,
      recoveryRequired: false,
      runtime: {
        ...this.state.runtime,
        projections: Object.fromEntries(items.map((item) => [projectionKey(item), item])),
        worldGeneration: snapshot.worldGeneration,
        worldSequence: snapshot.worldSequence,
        available: snapshot.runtimeAvailable,
      },
    })
  }

  requireRecovery(message = 'Some live updates were missed; refreshing runtime state.'): void {
    this.publish({
      ...this.state,
      connection: 'recovering',
      connectionMessage: message,
      recoveryRequired: true,
    })
  }

  applyEvent(kind: string, event: OrchestrationEventDto): void {
    let next = { ...this.state, lastEventId: event.sequence }
    if (kind === 'plan') {
      const plan = event.payload.plan as unknown as ResolvedPlanDto | undefined
      if (plan?.id) {
        next = {
          ...next,
          resolved: {
            plans: { ...next.resolved.plans, [plan.id]: plan },
            currentPlanByDefinition: {
              ...next.resolved.currentPlanByDefinition,
              [plan.definitionId]: plan.id,
            },
          },
        }
      }
    }
    if (kind === 'transition' && event.definitionId) {
      const existing = next.applied.byDefinition[event.definitionId] ?? {
        status: 'idle' as const,
        currentPlanId: null,
        previousPlanId: null,
        transitionGeneration: 0,
        correlationId: null,
        lastError: null,
        updatedAt: null,
      }
      const final = event.payload.final
      const finalObject = typeof final === 'object' && final !== null && !Array.isArray(final)
        ? final
        : {}
      const convergence = String(finalObject.convergenceStatus ?? '')
      const status = convergence === 'converged'
        ? 'converged'
        : convergence === 'failed'
          ? 'failed'
          : convergence === 'degraded'
            ? 'degraded'
            : 'applying'
      next = {
        ...next,
        applied: {
          byDefinition: {
            ...next.applied.byDefinition,
            [event.definitionId]: {
              ...existing,
              status,
              transitionGeneration: Number(event.payload.generation ?? existing.transitionGeneration),
              correlationId: event.correlationId,
              lastError: status === 'failed' ? {errors: event.payload.errors ?? []} : null,
              updatedAt: event.occurredAt,
            },
          },
        },
      }
    }
    if (kind === 'runtime' || kind === 'endpoint' || kind === 'processor' || kind === 'health') {
      const projection = event.payload.projection as unknown as RuntimeProjectionDto | undefined
      if (projection?.type && projection.subject) {
        next = {
          ...next,
          runtime: {
            ...next.runtime,
            projections: {
              ...next.runtime.projections,
              [projectionKey(projection)]: projection,
            },
            worldGeneration: projection.worldGeneration,
            worldSequence: projection.worldSequence,
            available: true,
          },
        }
      }
    }
    this.publish(next)
  }
}

export const orchestrationStore = new OrchestrationStore()
