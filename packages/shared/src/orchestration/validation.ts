import {
  AUDIO_API_VERSION,
  AUDIO_SCHEMA_VERSION,
  type AudioApiMetadata,
  type GraphRevisionDto,
  type JsonObject,
  type OrchestrationEventDto,
  type RuntimeSnapshotDto,
} from './types'

export class UnsupportedAudioContractError extends Error {
  readonly expectedApiVersion = AUDIO_API_VERSION
  readonly expectedSchemaVersion = AUDIO_SCHEMA_VERSION

  constructor(
    message: string,
    readonly receivedApiVersion?: unknown,
    readonly receivedSchemaVersion?: unknown,
  ) {
    super(message)
    this.name = 'UnsupportedAudioContractError'
  }
}

export class InvalidAudioContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidAudioContractError'
  }
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidAudioContractError(`${name} must be an object`)
  }
  return value as JsonObject
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidAudioContractError(`${name} must be a non-empty string`)
  }
  return value
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new InvalidAudioContractError(`${name} must be a non-negative integer`)
  }
  return value
}

export function parseAudioApiMetadata(value: unknown): AudioApiMetadata {
  const candidate = object(value, 'audio API metadata')
  if (
    candidate.apiVersion !== AUDIO_API_VERSION ||
    candidate.schemaVersion !== AUDIO_SCHEMA_VERSION ||
    candidate.desiredGraphSchemaVersion !== AUDIO_SCHEMA_VERSION
  ) {
    throw new UnsupportedAudioContractError(
      `Open Cinema UI supports audio API/schema v${AUDIO_API_VERSION} only`,
      candidate.apiVersion,
      candidate.schemaVersion,
    )
  }
  string(candidate.service, 'service')
  object(candidate.conventions, 'conventions')
  object(candidate.links, 'links')
  return candidate as unknown as AudioApiMetadata
}

export function parseGraphRevision(value: unknown): GraphRevisionDto {
  const candidate = object(value, 'graph revision')
  if (candidate.schemaVersion !== AUDIO_SCHEMA_VERSION) {
    throw new UnsupportedAudioContractError(
      `Unsupported desired graph schema ${String(candidate.schemaVersion)}`,
      AUDIO_API_VERSION,
      candidate.schemaVersion,
    )
  }
  string(candidate.id, 'revision.id')
  string(candidate.definitionId, 'revision.definitionId')
  number(candidate.revisionNumber, 'revision.revisionNumber')
  number(candidate.updateVersion, 'revision.updateVersion')
  if (candidate.content !== undefined) {
    const content = object(candidate.content, 'revision.content')
    if (content.schemaVersion !== AUDIO_SCHEMA_VERSION) {
      throw new UnsupportedAudioContractError(
        `Unsupported graph document schema ${String(content.schemaVersion)}`,
        AUDIO_API_VERSION,
        content.schemaVersion,
      )
    }
  }
  return candidate as unknown as GraphRevisionDto
}

export function parseRuntimeSnapshot(value: unknown): RuntimeSnapshotDto {
  const candidate = object(value, 'runtime snapshot')
  if (candidate.representation !== 'observedRuntime') {
    throw new InvalidAudioContractError('runtime snapshot representation must be observedRuntime')
  }
  if (!Array.isArray(candidate.items)) {
    throw new InvalidAudioContractError('runtime snapshot items must be an array')
  }
  return candidate as unknown as RuntimeSnapshotDto
}

export function parseOrchestrationEvent(value: unknown): OrchestrationEventDto {
  const candidate = object(value, 'orchestration event')
  number(candidate.sequence, 'event.sequence')
  string(candidate.id, 'event.id')
  string(candidate.type, 'event.type')
  object(candidate.payload, 'event.payload')
  return candidate as unknown as OrchestrationEventDto
}
