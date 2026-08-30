import type {JsonObject, JsonValue} from '../orchestration/types'

export const PLUGIN_PLATFORM_API_VERSION = 2 as const
export const PLUGIN_UI_SCHEMA_VERSION = 1 as const

export type PluginPageTemplate =
  | 'settings'
  | 'resource-list'
  | 'resource-detail'
  | 'overview'
  | 'guided-flow'
export type PluginFieldWidget =
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'multiselect'
  | 'duration'
  | 'path'
  | 'url'
  | 'secret'
  | 'repeatable'
  | 'group'
export type PluginLifecycleImpact = 'hot' | 'application-restart' | 'host-reboot'
export type PluginConfirmation = 'none' | 'confirm' | 'destructive' | 'disconnecting'

export interface PluginNavigationDto {
  id: string
  label: string
  pageId: string
  icon?: string
  order: number
  permission?: string
}

export interface PluginChoiceDto {
  value: string | number | boolean
  label: string
  help?: string
}

export interface PluginFieldDto {
  id: string
  path: string
  label: string
  widget: PluginFieldWidget
  help?: string
  placeholder?: string
  required?: boolean
  readOnly?: boolean
  choices?: PluginChoiceDto[]
  constraints?: JsonObject
  visibleWhen?: JsonObject
  item?: PluginFieldDto
  fields?: PluginFieldDto[]
}

export interface PluginSectionDto {
  id: string
  title: string
  description?: string
  presentation: 'section' | 'card' | 'tab' | 'status' | 'diagnostics'
  emphasis?: 'normal' | 'primary' | 'advanced' | 'danger'
  width?: 'narrow' | 'normal' | 'wide' | 'full'
  fields: PluginFieldDto[]
}

export interface PluginPageBindingDto {
  read: string
  write?: string
  operationStatus?: string
  successPageId?: string
  freshnessMs?: number
}

export interface PluginPageActionDto {
  id: string
  label: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  endpoint: string
  confirmation: PluginConfirmation
  lifecycleImpact: PluginLifecycleImpact
  permission?: string
  operationStatus?: string
  available?: boolean
  reason?: string | null
  concurrencyToken?: string | null
}

export interface PluginPageDto {
  id: string
  title: string
  description?: string
  template: PluginPageTemplate
  binding: PluginPageBindingDto
  permission?: string
  sections: PluginSectionDto[]
  actions?: PluginPageActionDto[]
}

export interface PluginUIDescriptorDto {
  schemaVersion: 1
  navigation: PluginNavigationDto[]
  pages: PluginPageDto[]
}

export interface EnabledPluginUIDto {
  id: string
  displayName: string
  version: string
  health: 'healthy' | 'degraded'
  descriptor: PluginUIDescriptorDto
}

export interface PluginUIBootstrapDto {
  schemaVersion: 1
  plugins: EnabledPluginUIDto[]
}

export interface PluginActionDto {
  id: string
  label: string
  available: boolean
  reason: string | null
  method: 'POST'
  href: string
  confirmation: PluginConfirmation
  concurrencyToken: string
  lifecycleImpact: PluginLifecycleImpact
}

export interface PluginOperationDto {
  id: string
  pluginId: string
  kind: string
  status:
    | 'requested'
    | 'running'
    | 'restart-pending'
    | 'verifying'
    | 'rolling-back'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
  stage: string
  progress: number
  effectiveLifecycleImpact: PluginLifecycleImpact
  inputGeneration: string | null
  outputGeneration: string | null
  cancellation: {requested: boolean; allowed: boolean}
  concurrencyToken: string
  diagnostics: JsonValue[]
  requestedAt: string
  startedAt: string | null
  updatedAt: string
  completedAt: string | null
  restartAction: JsonObject | null
  links: {self: string; cancel: string}
}

export interface InstalledPluginDto {
  id: string
  distribution: string
  installedVersion: string
  desiredState: 'enabled' | 'disabled'
  observedState: string
  health: string
  activeGeneration: string | null
  lastKnownGoodGeneration: string | null
  manifest: JsonObject
  provenance: JsonObject
  lifecycleImpact: Record<string, PluginLifecycleImpact>
  updateVersion: number
  runtime: JsonObject | null
  actions: PluginActionDto[]
  updatedAt: string
}

export interface PluginCatalogueVersionDto {
  version: string
  revision: string
  resolvedCommit: string | null
  artifactDigest: string | null
  mutable: boolean
  published: boolean
  compatible: boolean
  installable: boolean
  capabilities: string[]
  permissions: Array<{id: string; reason: string}>
  artifacts: Array<{
    operatingSystem: string
    architecture: string
    url: string
    digest: string
  }>
  currentPlatform: {
    operatingSystem: string
    architecture: string
    artifactAvailable: boolean
  }
}

export interface PluginCatalogueEntryDto {
  id: string
  displayName: string
  summary: string
  publisher: string
  verifiedPublisher: boolean
  repository: string
  documentationUrl: string
  icon: string
  versions: PluginCatalogueVersionDto[]
  latestVersion: string
  compatible: boolean
  installable: boolean
  installed: boolean
  installedVersion: string | null
  desiredState: string | null
  observedState: string | null
  health: string | null
  updateAvailable: boolean
}

export interface PluginSourceInspectionDto {
  schemaVersion: 1
  manifest: JsonObject
  provenance: JsonObject
  warnings: string[]
}
