import {ApiClient} from '../api/client'
import type {
  InstalledPluginDto,
  PluginCatalogueEntryDto,
  PluginOperationDto,
  PluginSourceInspectionDto,
  PluginUIBootstrapDto,
} from './types'
import {parsePluginUIBootstrap} from './validation'

const ROOT = '/plugin-platform/v2'

export class PluginPlatformApi {
  constructor(readonly client = new ApiClient()) {}

  async ui(etag?: string): Promise<{value: PluginUIBootstrapDto | null; etag: string | null}> {
    const response = await this.client.request<unknown>('GET', `${ROOT}/ui`, undefined, {
      headers: etag ? {'If-None-Match': etag} : undefined,
    })
    return {
      value: response.status === 304 ? null : parsePluginUIBootstrap(response.data),
      etag: response.etag,
    }
  }

  async catalogue(): Promise<PluginCatalogueEntryDto[]> {
    const response = await this.client.get<{items: PluginCatalogueEntryDto[]}>(`${ROOT}/catalogue`)
    if (!Array.isArray(response.items)) throw new Error('Plugin catalogue is invalid')
    return response.items
  }

  async installed(): Promise<InstalledPluginDto[]> {
    const response = await this.client.get<{items: InstalledPluginDto[]}>(`${ROOT}/installed`)
    if (!Array.isArray(response.items)) throw new Error('Installed plugin inventory is invalid')
    return response.items
  }

  async operations(): Promise<PluginOperationDto[]> {
    const response = await this.client.get<{items: PluginOperationDto[]}>(`${ROOT}/operations`)
    if (!Array.isArray(response.items)) throw new Error('Plugin operations are invalid')
    return response.items
  }

  async operation(id: string): Promise<PluginOperationDto> {
    return this.client.get(`${ROOT}/operations/${encodeURIComponent(id)}`)
  }

  async inspectSource(input: {
    repository: string
    revision?: string
    trustedCodeAcknowledged: true
  }): Promise<PluginSourceInspectionDto> {
    return this.client.post(`${ROOT}/inspect-source`, input)
  }

  async install(input: Record<string, unknown>, idempotencyKey: string): Promise<PluginOperationDto> {
    return this.client.post(`${ROOT}/install`, input, {
      headers: {'Idempotency-Key': idempotencyKey},
    })
  }

  async lifecycle(
    pluginId: string,
    action: string,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<PluginOperationDto> {
    return this.client.post(
      `${ROOT}/plugins/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(action)}`,
      input,
      {headers: {'Idempotency-Key': idempotencyKey}},
    )
  }
}
