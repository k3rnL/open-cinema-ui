import type { JsonObject } from '../orchestration/types'
import {
  SYSTEM_API_VERSION,
  SYSTEM_SCHEMA_VERSION,
  type ByteUsageDto,
  type CapabilityActionDto,
  type SystemApiMetadataDto,
  type SystemComponentDto,
  type SystemControlOperationDto,
  type SystemMetricsDto,
  type SystemOverviewDto,
} from './types'

export class UnsupportedSystemContractError extends Error {
  constructor(
    message: string,
    readonly receivedApiVersion?: unknown,
    readonly receivedSchemaVersion?: unknown,
  ) {
    super(message)
    this.name = 'UnsupportedSystemContractError'
  }
}

export class InvalidSystemContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSystemContractError'
  }
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidSystemContractError(`${name} must be an object`)
  }
  return value as JsonObject
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidSystemContractError(`${name} must be a non-empty string`)
  }
  return value
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidSystemContractError(`${name} must be a finite number`)
  }
  return value
}

function nullableText(value: unknown, name: string): string | null {
  return value === null ? null : text(value, name)
}

function schema(value: JsonObject, name: string): void {
  if (value.schemaVersion !== SYSTEM_SCHEMA_VERSION) {
    throw new UnsupportedSystemContractError(
      `Unsupported ${name} schema ${String(value.schemaVersion)}`,
      SYSTEM_API_VERSION,
      value.schemaVersion,
    )
  }
}

function byteUsage(value: unknown, name: string): ByteUsageDto {
  const candidate = object(value, name)
  finite(candidate.usedBytes, `${name}.usedBytes`)
  finite(candidate.totalBytes, `${name}.totalBytes`)
  finite(candidate.percent, `${name}.percent`)
  return candidate as unknown as ByteUsageDto
}

function action(value: unknown, name: string): CapabilityActionDto {
  const candidate = object(value, name)
  text(candidate.id, `${name}.id`)
  text(candidate.label, `${name}.label`)
  if (typeof candidate.available !== 'boolean') {
    throw new InvalidSystemContractError(`${name}.available must be a boolean`)
  }
  if (candidate.available && typeof candidate.actionToken !== 'string') {
    throw new InvalidSystemContractError(`${name}.actionToken is required when available`)
  }
  if (candidate.method !== 'POST') {
    throw new InvalidSystemContractError(`${name}.method must be POST`)
  }
  text(candidate.href, `${name}.href`)
  return candidate as unknown as CapabilityActionDto
}

export function parseSystemMetadata(value: unknown): SystemApiMetadataDto {
  const candidate = object(value, 'system API metadata')
  if (
    candidate.apiVersion !== SYSTEM_API_VERSION ||
    candidate.schemaVersion !== SYSTEM_SCHEMA_VERSION
  ) {
    throw new UnsupportedSystemContractError(
      'Open Cinema UI supports system API/schema v1 only',
      candidate.apiVersion,
      candidate.schemaVersion,
    )
  }
  if (candidate.service !== 'open-cinema-system') {
    throw new InvalidSystemContractError('system API service identifier is invalid')
  }
  object(candidate.links, 'system API links')
  return candidate as unknown as SystemApiMetadataDto
}

export function parseSystemOverview(value: unknown): SystemOverviewDto {
  const candidate = object(value, 'system overview')
  schema(candidate, 'system overview')
  text(candidate.observedAt, 'system overview.observedAt')
  nullableText(candidate.hostname, 'system overview.hostname')
  nullableText(candidate.model, 'system overview.model')
  nullableText(candidate.operatingSystem, 'system overview.operatingSystem')
  nullableText(candidate.kernel, 'system overview.kernel')
  nullableText(candidate.bootId, 'system overview.bootId')
  if (candidate.uptimeSeconds !== null) finite(candidate.uptimeSeconds, 'uptimeSeconds')
  if (candidate.storage !== null) byteUsage(candidate.storage, 'storage')
  if (candidate.temperatureCelsius !== null) finite(candidate.temperatureCelsius, 'temperature')
  object(candidate.throttling, 'throttling')
  object(candidate.application, 'application')
  if (!Array.isArray(candidate.unavailableFields)) {
    throw new InvalidSystemContractError('unavailableFields must be an array')
  }
  return candidate as unknown as SystemOverviewDto
}

export function parseSystemMetrics(value: unknown): SystemMetricsDto {
  const candidate = object(value, 'system metrics')
  schema(candidate, 'system metrics')
  text(candidate.observedAt, 'system metrics.observedAt')
  if (candidate.cpuPercent !== null) finite(candidate.cpuPercent, 'cpuPercent')
  if (candidate.memory !== null) byteUsage(candidate.memory, 'memory')
  if (!Array.isArray(candidate.unavailableFields)) {
    throw new InvalidSystemContractError('unavailableFields must be an array')
  }
  return candidate as unknown as SystemMetricsDto
}

export function parseSystemComponent(value: unknown): SystemComponentDto {
  const candidate = object(value, 'system component')
  text(candidate.id, 'component.id')
  text(candidate.name, 'component.name')
  if (candidate.version !== null) text(candidate.version, 'component.version')
  if (!['known', 'unknown'].includes(String(candidate.versionStatus))) {
    throw new InvalidSystemContractError('component.versionStatus is invalid')
  }
  if (!['ready', 'degraded', 'unknown'].includes(String(candidate.health))) {
    throw new InvalidSystemContractError('component.health is invalid')
  }
  if (!Array.isArray(candidate.actions)) {
    throw new InvalidSystemContractError('component.actions must be an array')
  }
  candidate.actions.forEach((item, index) => action(item, `component.actions[${index}]`))
  return candidate as unknown as SystemComponentDto
}

export function parseCapabilityAction(value: unknown): CapabilityActionDto {
  return action(value, 'capability action')
}

export function parseSystemOperation(value: unknown): SystemControlOperationDto {
  const candidate = object(value, 'system operation')
  text(candidate.id, 'operation.id')
  text(candidate.correlationId, 'operation.correlationId')
  text(candidate.action, 'operation.action')
  text(candidate.targetId, 'operation.targetId')
  if (!['requested', 'executing', 'reconnecting', 'succeeded', 'failed'].includes(String(candidate.status))) {
    throw new InvalidSystemContractError('operation.status is invalid')
  }
  text(candidate.requestedAt, 'operation.requestedAt')
  text(candidate.updatedAt, 'operation.updatedAt')
  object(candidate.links, 'operation.links')
  return candidate as unknown as SystemControlOperationDto
}
