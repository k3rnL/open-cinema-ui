import type {JsonObject} from '../orchestration/types'
import {
  PLUGIN_UI_SCHEMA_VERSION,
  type EnabledPluginUIDto,
  type PluginFieldDto,
  type PluginPageDto,
  type PluginUIBootstrapDto,
  type PluginUIDescriptorDto,
} from './types'

export class InvalidPluginUIContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPluginUIContractError'
  }
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidPluginUIContractError(`${name} must be an object`)
  }
  return value as JsonObject
}

function text(value: unknown, name: string, maximum = 512): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new InvalidPluginUIContractError(`${name} must be non-empty and bounded`)
  }
  return value
}

const templates = new Set(['settings', 'resource-list', 'resource-detail', 'overview', 'guided-flow'])
const widgets = new Set([
  'text', 'number', 'boolean', 'enum', 'multiselect', 'duration', 'path', 'url',
  'secret', 'repeatable', 'group',
])
const presentations = new Set(['section', 'card', 'tab', 'status', 'diagnostics'])

function field(value: unknown, name: string, depth = 0): PluginFieldDto {
  if (depth > 8) throw new InvalidPluginUIContractError(`${name} nesting is too deep`)
  const candidate = object(value, name)
  text(candidate.id, `${name}.id`, 128)
  const path = text(candidate.path, `${name}.path`)
  if (!path.startsWith('/')) throw new InvalidPluginUIContractError(`${name}.path must be a JSON pointer`)
  text(candidate.label, `${name}.label`, 120)
  if (!widgets.has(String(candidate.widget))) {
    throw new InvalidPluginUIContractError(`${name}.widget is unsupported`)
  }
  if (candidate.choices !== undefined && !Array.isArray(candidate.choices)) {
    throw new InvalidPluginUIContractError(`${name}.choices must be an array`)
  }
  if (candidate.item !== undefined) field(candidate.item, `${name}.item`, depth + 1)
  if (candidate.fields !== undefined) {
    if (!Array.isArray(candidate.fields) || candidate.fields.length > 64) {
      throw new InvalidPluginUIContractError(`${name}.fields must be a bounded array`)
    }
    candidate.fields.forEach((item, index) => field(item, `${name}.fields[${index}]`, depth + 1))
  }
  return candidate as unknown as PluginFieldDto
}

function page(value: unknown, name: string): PluginPageDto {
  const candidate = object(value, name)
  text(candidate.id, `${name}.id`, 128)
  text(candidate.title, `${name}.title`, 120)
  if (!templates.has(String(candidate.template))) {
    throw new InvalidPluginUIContractError(`${name}.template is unsupported`)
  }
  const binding = object(candidate.binding, `${name}.binding`)
  text(binding.read, `${name}.binding.read`)
  if (binding.successPageId !== undefined) {
    text(binding.successPageId, `${name}.binding.successPageId`, 128)
  }
  if (!Array.isArray(candidate.sections) || candidate.sections.length > 64) {
    throw new InvalidPluginUIContractError(`${name}.sections must be a bounded array`)
  }
  candidate.sections.forEach((sectionValue, sectionIndex) => {
    const section = object(sectionValue, `${name}.sections[${sectionIndex}]`)
    text(section.id, `${name}.sections[${sectionIndex}].id`, 128)
    text(section.title, `${name}.sections[${sectionIndex}].title`, 120)
    if (!presentations.has(String(section.presentation))) {
      throw new InvalidPluginUIContractError(`${name}.sections[${sectionIndex}].presentation is unsupported`)
    }
    if (!Array.isArray(section.fields) || section.fields.length > 128) {
      throw new InvalidPluginUIContractError(`${name}.sections[${sectionIndex}].fields must be bounded`)
    }
    section.fields.forEach((item, index) => field(item, `${name}.sections[${sectionIndex}].fields[${index}]`))
  })
  if (candidate.actions !== undefined) {
    if (!Array.isArray(candidate.actions) || candidate.actions.length > 32) {
      throw new InvalidPluginUIContractError(`${name}.actions must be a bounded array`)
    }
    candidate.actions.forEach((actionValue, index) => {
      const action = object(actionValue, `${name}.actions[${index}]`)
      text(action.id, `${name}.actions[${index}].id`, 128)
      text(action.label, `${name}.actions[${index}].label`, 80)
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(action.method))) {
        throw new InvalidPluginUIContractError(`${name}.actions[${index}].method is unsupported`)
      }
      const actionEndpoint = text(action.endpoint, `${name}.actions[${index}].endpoint`)
      if (!actionEndpoint.startsWith('/')) {
        throw new InvalidPluginUIContractError(`${name}.actions[${index}].endpoint must be absolute`)
      }
      if (!['none', 'confirm', 'destructive', 'disconnecting'].includes(String(action.confirmation))) {
        throw new InvalidPluginUIContractError(`${name}.actions[${index}].confirmation is unsupported`)
      }
      if (!['hot', 'application-restart', 'host-reboot'].includes(String(action.lifecycleImpact))) {
        throw new InvalidPluginUIContractError(`${name}.actions[${index}].lifecycleImpact is unsupported`)
      }
    })
  }
  return candidate as unknown as PluginPageDto
}

export function parsePluginUIDescriptor(value: unknown): PluginUIDescriptorDto {
  const candidate = object(value, 'plugin UI descriptor')
  if (candidate.schemaVersion !== PLUGIN_UI_SCHEMA_VERSION) {
    throw new InvalidPluginUIContractError(`Unsupported plugin UI schema ${String(candidate.schemaVersion)}`)
  }
  if (!Array.isArray(candidate.navigation) || candidate.navigation.length > 32) {
    throw new InvalidPluginUIContractError('plugin navigation must be a bounded array')
  }
  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0 || candidate.pages.length > 64) {
    throw new InvalidPluginUIContractError('plugin pages must be a non-empty bounded array')
  }
  const pages = candidate.pages.map((item, index) => page(item, `pages[${index}]`))
  const pageIds = new Set(pages.map((item) => item.id))
  pages.forEach((item, index) => {
    if (item.binding.successPageId && !pageIds.has(item.binding.successPageId)) {
      throw new InvalidPluginUIContractError(`pages[${index}] references an unknown success page`)
    }
  })
  candidate.navigation.forEach((item, index) => {
    const navigation = object(item, `navigation[${index}]`)
    text(navigation.id, `navigation[${index}].id`, 128)
    text(navigation.label, `navigation[${index}].label`, 80)
    if (!pageIds.has(text(navigation.pageId, `navigation[${index}].pageId`, 128))) {
      throw new InvalidPluginUIContractError(`navigation[${index}] references an unknown page`)
    }
  })
  return candidate as unknown as PluginUIDescriptorDto
}

export function parsePluginUIBootstrap(value: unknown): PluginUIBootstrapDto {
  const candidate = object(value, 'plugin UI bootstrap')
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.plugins) || candidate.plugins.length > 128) {
    throw new InvalidPluginUIContractError('plugin UI bootstrap is incompatible or excessive')
  }
  candidate.plugins.forEach((item, index) => {
    const plugin = object(item, `plugins[${index}]`)
    text(plugin.id, `plugins[${index}].id`, 128)
    text(plugin.displayName, `plugins[${index}].displayName`, 120)
    text(plugin.version, `plugins[${index}].version`, 64)
    plugin.descriptor = parsePluginUIDescriptor(plugin.descriptor) as unknown as JsonObject
  })
  return candidate as unknown as PluginUIBootstrapDto
}

export function enabledPlugin(value: unknown): EnabledPluginUIDto {
  const candidate = object(value, 'enabled plugin UI')
  candidate.descriptor = parsePluginUIDescriptor(candidate.descriptor) as unknown as JsonObject
  return candidate as unknown as EnabledPluginUIDto
}
