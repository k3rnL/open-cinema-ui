import type { OrchestrationEventDto, OrchestrationEventKind, SnapshotRecoveryDto } from './types'
import { parseOrchestrationEvent } from './validation'
import type { OrchestrationStore } from './store'
import type { AudioOrchestrationApi } from './api'

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void
  close(): void
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

export type EventSourceFactory = (url: string) => EventSourceLike

const EVENT_KINDS: OrchestrationEventKind[] = [
  'runtime',
  'plan',
  'transition',
  'endpoint',
  'processor',
  'health',
  'volume',
  'managed-resource',
  'operation',
  'explanation',
]

function parseSnapshot(value: unknown): SnapshotRecoveryDto {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('replaceLocalState' in value) ||
    value.replaceLocalState !== true ||
    !('projections' in value) ||
    !Array.isArray(value.projections)
  ) {
    throw new Error('Invalid snapshot recovery event')
  }
  return value as SnapshotRecoveryDto
}

export class OrchestrationEventSubscription {
  private source: EventSourceLike | null = null
  private recovery: Promise<void> | null = null

  constructor(
    private readonly api: AudioOrchestrationApi,
    private readonly store: OrchestrationStore,
    private readonly createEventSource: EventSourceFactory = (url) =>
      new EventSource(url, { withCredentials: true }),
  ) {}

  connect(): void {
    this.close()
    const cursor = this.store.getState().lastEventId ?? undefined
    this.store.setConnection('connecting')
    const source = this.createEventSource(this.api.eventStreamUrl(cursor))
    source.onopen = () => this.store.setConnection('online')
    source.onerror = () =>
      this.store.setConnection('offline', 'Live updates are reconnecting; desired editing is safe.')
    source.addEventListener('snapshot', (message) => {
      try {
        this.store.requireRecovery()
        const snapshot = parseSnapshot(JSON.parse(message.data))
        this.store.replaceRuntime(snapshot)
        void this.recoverDerivedState().catch((error) => {
          this.store.requireRecovery(error instanceof Error ? error.message : String(error))
        })
        const eventId = Number(message.lastEventId)
        if (Number.isInteger(eventId) && eventId >= 0) {
          const state = this.store.getState()
          this.store.applyEvent('runtime', {
            sequence: eventId,
            id: `snapshot:${eventId}`,
            correlationId: 'snapshot-recovery',
            definitionId: null,
            type: 'snapshot.recovered',
            severity: 'info',
            payload: {},
            occurredAt: new Date().toISOString(),
          })
          if (state.connection === 'recovering') this.store.setConnection('online')
        }
      } catch (error) {
        this.store.requireRecovery(error instanceof Error ? error.message : String(error))
      }
    })
    for (const kind of EVENT_KINDS) {
      source.addEventListener(kind, (message) => {
        try {
          const event = parseOrchestrationEvent(JSON.parse(message.data))
          void this.applyWithGapRecovery(kind, event)
        } catch (error) {
          this.store.requireRecovery(error instanceof Error ? error.message : String(error))
        }
      })
    }
    this.source = source
  }

  close(): void {
    this.source?.close()
    this.source = null
  }

  private async applyWithGapRecovery(
    kind: OrchestrationEventKind,
    event: OrchestrationEventDto,
  ): Promise<void> {
    const previous = this.store.getState().lastEventId
    if (previous !== null && event.sequence <= previous) return
    if (previous !== null && event.sequence > previous + 1) {
      this.store.requireRecovery(
        `Live event sequence jumped from ${previous} to ${event.sequence}; replacing runtime state.`,
      )
      this.recovery ??= this.api
        .runtimeSnapshot()
        .then((snapshot) => {
          this.store.replaceRuntime(snapshot)
          return this.recoverDerivedState()
        })
        .finally(() => {
          this.recovery = null
        })
      try {
        await this.recovery
      } catch (error) {
        this.store.requireRecovery(error instanceof Error ? error.message : String(error))
        return
      }
    }
    this.store.applyEvent(kind, event)
  }

  private async recoverDerivedState(): Promise<void> {
    const [plans, readiness, masterLevel, resources] = await Promise.all([
      this.api.currentPlans(),
      this.api.readiness(),
      this.api.masterLevel(),
      this.api.managedResources(),
    ])
    this.store.installCurrentPlans(plans.items)
    this.store.setReadiness(readiness)
    this.store.installMasterLevel(masterLevel.value)
    this.store.installManagedResources(resources.items)
  }
}
