import { ApiClient, type ApiResponse } from '../api/client'
import type {
  CapabilityActionDto,
  SystemApiMetadataDto,
  SystemComponentDto,
  SystemControlOperationDto,
  SystemMetricsDto,
  SystemOverviewDto,
} from './types'
import { SYSTEM_API_VERSION } from './types'
import {
  UnsupportedSystemContractError,
  parseCapabilityAction,
  parseSystemComponent,
  parseSystemMetadata,
  parseSystemMetrics,
  parseSystemOperation,
  parseSystemOverview,
} from './validation'

const ROOT = '/system/v1'

export class SystemApi {
  readonly client: ApiClient

  constructor(client = new ApiClient()) {
    this.client = client
  }

  private async response<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await this.client.request<T>(method, `${ROOT}${path}`, body, {
      headers: { 'Open-Cinema-API-Version': String(SYSTEM_API_VERSION) },
    })
    if (response.apiVersion !== null && response.apiVersion !== String(SYSTEM_API_VERSION)) {
      throw new UnsupportedSystemContractError(
        `Server returned unsupported system API version ${response.apiVersion}`,
        response.apiVersion,
      )
    }
    return response
  }

  async metadata(): Promise<SystemApiMetadataDto> {
    return parseSystemMetadata((await this.response<unknown>('GET', '/schema')).data)
  }

  async overview(): Promise<SystemOverviewDto> {
    return parseSystemOverview((await this.response<unknown>('GET', '/overview')).data)
  }

  async metrics(): Promise<SystemMetricsDto> {
    return parseSystemMetrics((await this.response<unknown>('GET', '/metrics')).data)
  }

  async components(): Promise<SystemComponentDto[]> {
    const value = (await this.response<{ items?: unknown[] }>('GET', '/components')).data
    if (!Array.isArray(value.items)) throw new Error('system component collection is invalid')
    return value.items.map(parseSystemComponent)
  }

  async actions(): Promise<CapabilityActionDto[]> {
    const value = (await this.response<{ items?: unknown[] }>('GET', '/actions')).data
    if (!Array.isArray(value.items)) throw new Error('system action collection is invalid')
    return value.items.map(parseCapabilityAction)
  }

  async restartComponent(componentId: string, actionToken: string): Promise<SystemControlOperationDto> {
    return parseSystemOperation(
      (
        await this.response<unknown>(
          'POST',
          `/components/${encodeURIComponent(componentId)}/actions/restart`,
          { actionToken },
        )
      ).data,
    )
  }

  async reboot(actionToken: string): Promise<SystemControlOperationDto> {
    return parseSystemOperation(
      (await this.response<unknown>('POST', '/actions/reboot', { actionToken })).data,
    )
  }

  async operation(operationId: string): Promise<SystemControlOperationDto> {
    return parseSystemOperation(
      (
        await this.response<unknown>(
          'GET',
          `/operations/${encodeURIComponent(operationId)}`,
        )
      ).data,
    )
  }
}
