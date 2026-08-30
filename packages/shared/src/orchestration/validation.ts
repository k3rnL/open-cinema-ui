import {
  AUDIO_API_VERSION,
  AUDIO_SCHEMA_VERSION,
  type AudioApiMetadata,
  type EndpointAudioLevelDto,
  type GraphRevisionDto,
  type JsonObject,
  type ManagedResourceDto,
  type MasterAudioLevelDto,
  type OrchestrationEventDto,
  type ResolvedPlanDto,
  type RuntimeExplanationPresentationDto,
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

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidAudioContractError(`${name} must be a finite number`)
  }
  return value
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new InvalidAudioContractError(`${name} must be a boolean`)
  }
  return value
}

function schemaVersion(candidate: JsonObject, name: string): void {
  if (candidate.schemaVersion !== AUDIO_SCHEMA_VERSION) {
    throw new UnsupportedAudioContractError(
      `Unsupported ${name} schema ${String(candidate.schemaVersion)}`,
      AUDIO_API_VERSION,
      candidate.schemaVersion,
    )
  }
}

function levelValue(value: unknown, name: string): void {
  const candidate = object(value, name)
  const level = finiteNumber(candidate.level, `${name}.level`)
  if (level < 0 || level > 1) {
    throw new InvalidAudioContractError(`${name}.level must be between zero and one`)
  }
  boolean(candidate.muted, `${name}.muted`)
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

export function parseMasterAudioLevel(value: unknown): MasterAudioLevelDto {
  const candidate = object(value, 'master audio level')
  schemaVersion(candidate, 'master audio level')
  if (candidate.scope !== 'master-output') {
    throw new InvalidAudioContractError('master audio level scope must be master-output')
  }
  levelValue(candidate.desired, 'master desired level')
  levelValue(candidate.effective, 'master effective level')
  boolean(candidate.writable, 'master writable')
  boolean(candidate.applying, 'master applying')
  number(candidate.updateVersion, 'master updateVersion')
  if (!Array.isArray(candidate.degraded)) {
    throw new InvalidAudioContractError('master degraded state must be an array')
  }
  return candidate as unknown as MasterAudioLevelDto
}

export function parseEndpointAudioLevel(value: unknown): EndpointAudioLevelDto {
  const candidate = object(value, 'endpoint audio level')
  schemaVersion(candidate, 'endpoint audio level')
  string(candidate.endpointId, 'endpoint audio level.endpointId')
  if (!['device-level', 'input-level'].includes(String(candidate.scope))) {
    throw new InvalidAudioContractError('endpoint audio level scope is invalid')
  }
  if (!['input', 'output'].includes(String(candidate.direction))) {
    throw new InvalidAudioContractError('endpoint audio level direction is invalid')
  }
  if (!['available', 'unavailable', 'ambiguous', 'invalid'].includes(String(candidate.availability))) {
    throw new InvalidAudioContractError('endpoint audio level availability is invalid')
  }
  levelValue(candidate.desired, 'endpoint desired level')
  levelValue(candidate.effective, 'endpoint effective level')
  const capabilities = object(candidate.capabilities, 'endpoint capabilities')
  for (const kind of ['volume', 'mute']) {
    const capability = object(capabilities[kind], `${kind} capability`)
    boolean(capability.readable, `${kind} capability.readable`)
    boolean(capability.writable, `${kind} capability.writable`)
  }
  boolean(candidate.applying, 'endpoint applying')
  number(candidate.updateVersion, 'endpoint updateVersion')
  return candidate as unknown as EndpointAudioLevelDto
}

function parseManagedResourceAction(value: unknown, name: string): void {
  const candidate = object(value, name)
  string(candidate.id, `${name}.id`)
  string(candidate.label, `${name}.label`)
  boolean(candidate.available, `${name}.available`)
  if (candidate.available) {
    if (candidate.method !== 'POST' || typeof candidate.href !== 'string') {
      throw new InvalidAudioContractError(`${name} has no executable action route`)
    }
    number(candidate.updateVersion, `${name}.updateVersion`)
  } else if (typeof candidate.reason !== 'string' || candidate.reason.length === 0) {
    throw new InvalidAudioContractError(`${name}.reason is required when unavailable`)
  }
}

export function parseManagedResource(value: unknown): ManagedResourceDto {
  const candidate = object(value, 'managed resource')
  schemaVersion(candidate, 'managed resource')
  string(candidate.id, 'managed resource.id')
  string(candidate.name, 'managed resource.name')
  string(candidate.kind, 'managed resource.kind')
  if (!['adapter', 'plugin-managed-source', 'processor'].includes(String(candidate.resourceType))) {
    throw new InvalidAudioContractError('managed resource type is invalid')
  }
  object(candidate.desired, 'managed resource.desired')
  object(candidate.observed, 'managed resource.observed')
  object(candidate.freshness, 'managed resource.freshness')
  if (!Array.isArray(candidate.actions) || !Array.isArray(candidate.correlations)) {
    throw new InvalidAudioContractError('managed resource actions/correlations must be arrays')
  }
  candidate.actions.forEach((item, index) =>
    parseManagedResourceAction(item, `managed resource.actions[${index}]`),
  )
  return candidate as unknown as ManagedResourceDto
}

export function parseRuntimeExplanation(
  value: unknown,
): RuntimeExplanationPresentationDto {
  const candidate = object(value, 'runtime explanation presentation')
  schemaVersion(candidate, 'runtime explanation presentation')
  const headline = object(candidate.headline, 'explanation.headline')
  if (!['active', 'inactive', 'waiting', 'degraded', 'failed'].includes(String(headline.status))) {
    throw new InvalidAudioContractError('explanation headline status is invalid')
  }
  string(headline.title, 'explanation.headline.title')
  string(headline.summary, 'explanation.headline.summary')
  if (!Array.isArray(candidate.route)) {
    throw new InvalidAudioContractError('explanation.route must be an array')
  }
  candidate.route.forEach((value, index) => {
    const segment = object(value, `explanation.route[${index}]`)
    string(segment.name, `explanation.route[${index}].name`)
    if (!['source', 'decode', 'process', 'output'].includes(String(segment.role))) {
      throw new InvalidAudioContractError(`explanation.route[${index}].role is invalid`)
    }
  })
  for (const field of ['selection', 'signals', 'transition', 'technicalReferences']) {
    object(candidate[field], `explanation.${field}`)
  }
  for (const field of ['alternatives', 'processors', 'overrides', 'errors']) {
    if (!Array.isArray(candidate[field])) {
      throw new InvalidAudioContractError(`explanation.${field} must be an array`)
    }
  }
  return candidate as unknown as RuntimeExplanationPresentationDto
}

export function parseResolvedPlan(value: unknown): ResolvedPlanDto {
  const candidate = object(value, 'resolved plan')
  schemaVersion(candidate, 'resolved plan')
  string(candidate.id, 'resolved plan.id')
  string(candidate.definitionId, 'resolved plan.definitionId')
  const explanation = object(candidate.explanation, 'resolved plan.explanation')
  if (explanation.presentation !== undefined) parseRuntimeExplanation(explanation.presentation)
  return candidate as unknown as ResolvedPlanDto
}

export function parseOrchestrationEvent(value: unknown): OrchestrationEventDto {
  const candidate = object(value, 'orchestration event')
  number(candidate.sequence, 'event.sequence')
  string(candidate.id, 'event.id')
  string(candidate.type, 'event.type')
  object(candidate.payload, 'event.payload')
  return candidate as unknown as OrchestrationEventDto
}
