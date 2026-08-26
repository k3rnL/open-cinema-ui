import { ApiClient, ApiProblemError, type ApiResponse } from '../api/client'
import {
  AUDIO_API_VERSION,
  type AudioApiMetadata,
  type AudioAdapterKind,
  type AudioAdapterTypeCatalogueDto,
  type CamillaDSPProfileDto,
  type CurrentPlanDto,
  type DesiredGraphDocumentDto,
  type EndpointCandidateExplanationDto,
  type GraphActivationDto,
  type GraphDefinitionDto,
  type GraphKind,
  type GraphRevisionDto,
  type JsonObject,
  type LogicalEndpointDto,
  type ManualOverrideDto,
  type ManagedAudioAdapterDto,
  type NodeTypeCatalogueDto,
  type OrchestrationReadinessDto,
  type Page,
  type ResolvedPlanDto,
  type RuntimeProjectionDto,
  type RuntimeSnapshotDto,
  type SpeakerTestOverviewDto,
  type SpeakerTestStateDto,
  type SelectorPreviewDto,
  type ValidationIssueDto,
} from './types'
import {
  UnsupportedAudioContractError,
  parseAudioApiMetadata,
  parseGraphRevision,
  parseRuntimeSnapshot,
} from './validation'

const ROOT = '/audio/v1'

export interface VersionedResource<T> {
  value: T
  etag: string | null
}

export interface DraftComparisonDto {
  leftRevisionId: string
  rightRevisionId: string
  semanticEqual: boolean
  layoutEqual: boolean
  leftDigest: string
  rightDigest: string
  metadataChanged: boolean
  collections: Record<string, { added: string[]; removed: string[]; changed: string[] }>
}

export interface DryRunPlanDto {
  dryRun: true
  persisted: false
  audioMutated: false
  status: string
  planDigest: string
  document: JsonObject
  explanation: JsonObject
  versions: {
    desiredState: number
    world: string
    runtimeGeneration: number
    runtimeSequence: number
  }
}

export interface RuntimeCandidatePageDto {
  items: RuntimeProjectionDto[]
  runtimeAvailable: boolean
}

export interface AudioAPIOptions {
  client?: ApiClient
}

function query(values: Record<string, string | number | boolean | undefined>): string {
  const parameters = new URLSearchParams()
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) parameters.set(name, String(value))
  }
  const encoded = parameters.toString()
  return encoded ? `?${encoded}` : ''
}

export class AudioOrchestrationApi {
  readonly client: ApiClient

  constructor(options: AudioAPIOptions = {}) {
    this.client = options.client ?? new ApiClient()
  }

  eventStreamUrl(after?: number): string {
    return this.client.url(`${ROOT}/events${query({ after })}`)
  }

  private async response<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    etag?: string | number,
  ): Promise<ApiResponse<T>> {
    const response = await this.client.request<T>(method, `${ROOT}${endpoint}`, body, {
      headers: {
        'Open-Cinema-API-Version': String(AUDIO_API_VERSION),
        ...(etag !== undefined ? { 'If-Match': String(etag) } : {}),
      },
    })
    if (response.apiVersion !== null && response.apiVersion !== String(AUDIO_API_VERSION)) {
      throw new UnsupportedAudioContractError(
        `Server returned unsupported audio API version ${response.apiVersion}`,
        response.apiVersion,
        undefined,
      )
    }
    return response
  }

  async metadata(): Promise<AudioApiMetadata> {
    return parseAudioApiMetadata((await this.response<unknown>('GET', '/schema')).data)
  }

  async definitions(kind?: GraphKind): Promise<Page<GraphDefinitionDto>> {
    return (await this.response<Page<GraphDefinitionDto>>('GET', `/graphs${query({ kind })}`)).data
  }

  async createDefinition(input: {
    name: string
    kind: GraphKind
    labels?: Record<string, string>
  }): Promise<GraphDefinitionDto> {
    return (await this.response<GraphDefinitionDto>('POST', '/graphs', input)).data
  }

  async revisions(definitionId: string): Promise<Page<GraphRevisionDto>> {
    return (
      await this.response<Page<GraphRevisionDto>>('GET', `/graphs/${definitionId}/revisions`)
    ).data
  }

  async revision(revisionId: string): Promise<VersionedResource<GraphRevisionDto>> {
    const response = await this.response<unknown>('GET', `/revisions/${revisionId}`)
    return { value: parseGraphRevision(response.data), etag: response.etag }
  }

  async createRevision(
    definitionId: string,
    content: DesiredGraphDocumentDto,
  ): Promise<VersionedResource<GraphRevisionDto>> {
    const response = await this.response<unknown>(
      'POST',
      `/graphs/${definitionId}/revisions`,
      { schemaVersion: 1, content },
    )
    return { value: parseGraphRevision(response.data), etag: response.etag }
  }

  async saveDraft(
    revisionId: string,
    content: DesiredGraphDocumentDto,
    updateVersion: number,
  ): Promise<VersionedResource<GraphRevisionDto>> {
    const response = await this.response<unknown>(
      'PATCH',
      `/revisions/${revisionId}`,
      { content },
      updateVersion,
    )
    return { value: parseGraphRevision(response.data), etag: response.etag }
  }

  async discardDraft(revisionId: string, updateVersion: number): Promise<void> {
    await this.response<null>('DELETE', `/revisions/${revisionId}`, undefined, updateVersion)
  }

  async validateRevision(revisionId: string, content?: DesiredGraphDocumentDto): Promise<{
    valid: boolean
    issues: ValidationIssueDto[]
  }> {
    return (
      await this.response<{
        valid: boolean
        issues: ValidationIssueDto[]
      }>('POST', `/revisions/${revisionId}/validate`, content ? { content } : {})
    ).data
  }

  async compareRevisions(leftId: string, rightId: string): Promise<DraftComparisonDto> {
    return (
      await this.response<DraftComparisonDto>(
        'GET',
        `/revisions/${leftId}/compare${query({ other: rightId })}`,
      )
    ).data
  }

  async publishRevision(
    revisionId: string,
    updateVersion: number,
  ): Promise<VersionedResource<GraphRevisionDto>> {
    const response = await this.response<unknown>(
      'POST',
      `/revisions/${revisionId}/publish`,
      {},
      updateVersion,
    )
    return { value: parseGraphRevision(response.data), etag: response.etag }
  }

  async applyDraftRevision(
    revisionId: string,
    updateVersion: number,
    expectedActivationVersion: number,
    parameterBindings: JsonObject = {},
    sceneBindings: JsonObject = {},
  ): Promise<VersionedResource<GraphRevisionDto>> {
    const response = await this.response<unknown>(
      'POST',
      `/revisions/${revisionId}/publish`,
      {
        activate: true,
        expectedActivationVersion,
        parameterBindings,
        sceneBindings,
      },
      updateVersion,
    )
    return { value: parseGraphRevision(response.data), etag: response.etag }
  }

  async activation(definitionId: string): Promise<VersionedResource<GraphActivationDto>> {
    const response = await this.response<GraphActivationDto>(
      'GET',
      `/graphs/${definitionId}/activation`,
    )
    return { value: response.data, etag: response.etag }
  }

  async deactivateGraph(
    definitionId: string,
    desiredStateVersion: number,
  ): Promise<VersionedResource<GraphActivationDto>> {
    const response = await this.response<GraphActivationDto>(
      'DELETE',
      `/graphs/${definitionId}/activation`,
      undefined,
      desiredStateVersion,
    )
    return { value: response.data, etag: response.etag }
  }

  async activateRevision(
    revisionId: string,
    desiredStateVersion: number,
    parameterBindings: JsonObject = {},
    sceneBindings: JsonObject = {},
  ): Promise<VersionedResource<GraphActivationDto>> {
    const response = await this.response<GraphActivationDto>(
      'POST',
      `/revisions/${revisionId}/activate`,
      { parameterBindings, sceneBindings },
      desiredStateVersion,
    )
    return { value: response.data, etag: response.etag }
  }

  async nodeTypes(): Promise<NodeTypeCatalogueDto> {
    return (await this.response<NodeTypeCatalogueDto>('GET', '/node-types')).data
  }

  async camilladspProfiles(options: {
    profileId?: string
    allVersions?: boolean
  } = {}): Promise<Page<CamillaDSPProfileDto>> {
    return (
      await this.response<Page<CamillaDSPProfileDto>>(
        'GET',
        `/camilladsp/profiles${query(options)}`,
      )
    ).data
  }

  async createCamillaDSPProfile(input: {
    profileId?: string
    name?: string
    description?: string
    content: JsonObject
  }): Promise<CamillaDSPProfileDto> {
    return (
      await this.response<CamillaDSPProfileDto>('POST', '/camilladsp/profiles', input)
    ).data
  }

  async endpoints(filters: {
    direction?: 'input' | 'output'
    tag?: string
    group?: string
  } = {}): Promise<Page<LogicalEndpointDto>> {
    return (
      await this.response<Page<LogicalEndpointDto>>('GET', `/endpoints${query(filters)}`)
    ).data
  }

  async createEndpoint(input: {
    name: string
    direction: 'input' | 'output'
    selector: LogicalEndpointDto['selector']
    tags?: string[]
    groups?: string[]
    policyMetadata?: JsonObject
    lastKnown?: JsonObject
  }): Promise<LogicalEndpointDto> {
    return (await this.response<LogicalEndpointDto>('POST', '/endpoints', input)).data
  }

  async updateEndpoint(
    endpointId: string,
    updateVersion: number,
    changes: Partial<Pick<LogicalEndpointDto, 'name' | 'direction' | 'selector' | 'tags' | 'groups' | 'policyMetadata' | 'explicitBinding' | 'lastKnown'>>,
  ): Promise<LogicalEndpointDto> {
    return (
      await this.response<LogicalEndpointDto>(
        'PATCH',
        `/endpoints/${endpointId}`,
        changes,
        updateVersion,
      )
    ).data
  }

  async previewSelector(
    selector: LogicalEndpointDto['selector'],
    direction?: 'input' | 'output',
  ): Promise<SelectorPreviewDto> {
    return (
      await this.response<SelectorPreviewDto>('POST', '/endpoints/selector-preview', {
        selector,
        direction,
      })
    ).data
  }

  async endpointCandidates(direction?: 'input' | 'output'): Promise<RuntimeCandidatePageDto> {
    return (
      await this.response<RuntimeCandidatePageDto>(
        'GET',
        `/endpoint-candidates${query({ direction })}`,
      )
    ).data
  }

  async adapterTypes(): Promise<AudioAdapterTypeCatalogueDto> {
    return (
      await this.response<AudioAdapterTypeCatalogueDto>('GET', '/adapter-types')
    ).data
  }

  async adapters(kind?: AudioAdapterKind): Promise<Page<ManagedAudioAdapterDto>> {
    return (
      await this.response<Page<ManagedAudioAdapterDto>>(
        'GET',
        `/adapters${query({kind})}`,
      )
    ).data
  }

  async createAdapter(input: {
    name: string
    kind: AudioAdapterKind
    configuration: JsonObject
    enabled?: boolean
  }): Promise<ManagedAudioAdapterDto> {
    return (
      await this.response<ManagedAudioAdapterDto>('POST', '/adapters', {
        schemaVersion: 1,
        ...input,
      })
    ).data
  }

  async updateAdapter(
    adapterId: string,
    updateVersion: number,
    changes: Partial<Pick<ManagedAudioAdapterDto['desired'], 'name' | 'configuration' | 'enabled'>>,
  ): Promise<ManagedAudioAdapterDto> {
    return (
      await this.response<ManagedAudioAdapterDto>(
        'PATCH',
        `/adapters/${adapterId}`,
        changes,
        updateVersion,
      )
    ).data
  }

  async restartAdapter(
    adapterId: string,
    updateVersion: number,
  ): Promise<ManagedAudioAdapterDto> {
    return (
      await this.response<ManagedAudioAdapterDto>(
        'POST',
        `/adapters/${adapterId}/restart`,
        {},
        updateVersion,
      )
    ).data
  }

  async deleteAdapter(adapterId: string, updateVersion: number): Promise<void> {
    await this.response<null>('DELETE', `/adapters/${adapterId}`, undefined, updateVersion)
  }

  async endpointExplanation(endpointId: string): Promise<EndpointCandidateExplanationDto> {
    return (
      await this.response<EndpointCandidateExplanationDto>(
        'GET',
        `/endpoints/${endpointId}/candidates`,
      )
    ).data
  }

  async bindEndpoint(
    endpointId: string,
    runtimeKey: string | null,
    updateVersion: number,
  ): Promise<{ endpoint: LogicalEndpointDto; selectorReview?: JsonObject | null; persistentDesiredChange: true }> {
    return (
      await this.response<{ endpoint: LogicalEndpointDto; selectorReview?: JsonObject | null; persistentDesiredChange: true }>(
        'POST',
        `/endpoints/${endpointId}/binding`,
        { runtimeKey },
        updateVersion,
      )
    ).data
  }

  async currentPlans(graphId?: string): Promise<{ items: CurrentPlanDto[] }> {
    return (
      await this.response<{ items: CurrentPlanDto[] }>(
        'GET',
        `/plans/current${query({ graphId })}`,
      )
    ).data
  }

  async planHistory(graphId?: string): Promise<Page<ResolvedPlanDto>> {
    return (
      await this.response<Page<ResolvedPlanDto>>(
        'GET',
        `/plans/history${query({ graphId })}`,
      )
    ).data
  }

  async dryRun(replayBundle: JsonObject): Promise<DryRunPlanDto> {
    return (await this.response<DryRunPlanDto>('POST', '/plans/dry-run', replayBundle)).data
  }

  async runtimeSnapshot(types?: string[]): Promise<RuntimeSnapshotDto> {
    const response = await this.response<unknown>(
      'GET',
      `/runtime/snapshot${query({ types: types?.join(',') })}`,
    )
    return parseRuntimeSnapshot(response.data)
  }

  async speakerTest(): Promise<SpeakerTestOverviewDto> {
    return (await this.response<SpeakerTestOverviewDto>('GET', '/speaker-test')).data
  }

  async startSpeakerTest(runtimeKey: string, channel: string): Promise<SpeakerTestStateDto> {
    return (
      await this.response<SpeakerTestStateDto>('POST', '/speaker-test', {runtimeKey, channel})
    ).data
  }

  async stopSpeakerTest(): Promise<SpeakerTestStateDto> {
    return (await this.response<SpeakerTestStateDto>('DELETE', '/speaker-test')).data
  }

  async managedResources(): Promise<{ items: RuntimeProjectionDto[] }> {
    return (
      await this.response<{ items: RuntimeProjectionDto[] }>('GET', '/runtime/resources')
    ).data
  }

  async processors(): Promise<{ items: RuntimeProjectionDto[] }> {
    return (
      await this.response<{ items: RuntimeProjectionDto[] }>('GET', '/runtime/processors')
    ).data
  }

  async readiness(): Promise<OrchestrationReadinessDto> {
    return (await this.response<OrchestrationReadinessDto>('GET', '/runtime/readiness')).data
  }

  async overrides(active?: boolean): Promise<Page<ManualOverrideDto>> {
    return (
      await this.response<Page<ManualOverrideDto>>('GET', `/overrides${query({ active })}`)
    ).data
  }

  async createOverride(input: {
    scopeType: ManualOverrideDto['scopeType']
    scopeId: string
    value: ManualOverrideDto['value']
    priority?: number
    reason: string
    expiresAt?: string
  }): Promise<ManualOverrideDto> {
    return (await this.response<ManualOverrideDto>('POST', '/overrides', input)).data
  }

  async cancelOverride(overrideId: string): Promise<ManualOverrideDto> {
    return (
      await this.response<ManualOverrideDto>('POST', `/overrides/${overrideId}/cancel`, {})
    ).data
  }

}

export { ApiProblemError }
