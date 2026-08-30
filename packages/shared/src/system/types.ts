import type { JsonObject } from '../orchestration/types'

export const SYSTEM_API_VERSION = 1 as const
export const SYSTEM_SCHEMA_VERSION = 1 as const

export interface SystemApiMetadataDto {
  service: 'open-cinema-system'
  apiVersion: 1
  schemaVersion: 1
  supportedApiVersions: number[]
  mediaType: string
  problemMediaType: string
  links: Record<string, string>
}

export interface ByteUsageDto {
  usedBytes: number
  totalBytes: number
  percent: number
}

export interface SystemOverviewDto {
  schemaVersion: 1
  observedAt: string
  hostname: string | null
  model: string | null
  operatingSystem: string | null
  kernel: string | null
  bootId: string | null
  uptimeSeconds: number | null
  storage: ByteUsageDto | null
  temperatureCelsius: number | null
  throttling: {
    supported: boolean
    active: boolean | null
    raw: string | null
  }
  application: {
    ready: boolean
    status: 'ready' | 'degraded'
    blockers: string[]
  }
  unavailableFields: string[]
}

export interface SystemMetricsDto {
  schemaVersion: 1
  observedAt: string
  cpuPercent: number | null
  memory: ByteUsageDto | null
  unavailableFields: string[]
}

export interface CapabilityActionDto {
  id: string
  label: string
  available: boolean
  reason: string | null
  actionToken: string | null
  method: 'POST'
  href: string
}

export interface SystemComponentDto {
  id: string
  name: string
  version: string | null
  versionStatus: 'known' | 'unknown'
  versionSource: string
  health: 'ready' | 'degraded' | 'unknown'
  observedAt: string
  actions: CapabilityActionDto[]
}

export type SystemOperationStatus =
  | 'requested'
  | 'executing'
  | 'reconnecting'
  | 'succeeded'
  | 'failed'

export interface SystemControlOperationDto {
  id: string
  correlationId: string
  action: 'restart-open-cinema' | 'restart-orchestrator' | 'reboot-appliance'
  targetId: string
  status: SystemOperationStatus
  error: { code: string; detail: string } | null
  requestedAt: string
  updatedAt: string
  completedAt: string | null
  links: { self: string } & JsonObject
}
