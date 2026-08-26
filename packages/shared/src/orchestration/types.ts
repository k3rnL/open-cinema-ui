export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export const AUDIO_API_VERSION = 1 as const
export const AUDIO_SCHEMA_VERSION = 1 as const

export interface AudioApiMetadata {
  service: 'open-cinema-audio-orchestration'
  apiVersion: 1
  schemaVersion: 1
  supportedApiVersions: number[]
  mediaType: string
  problemMediaType: string
  desiredGraphSchemaVersion: 1
  resolverReplaySchemaVersion: 1
  eventSchemaVersion: 1
  conventions: {
    pagination: { parameters: string[]; maximumLimit: number }
    optimisticConcurrency: {
      requestHeader: 'If-Match'
      responseHeader: 'ETag'
      conflictStatus: 412
      missingStatus: 428
    }
    eventResumption: { requestHeader: 'Last-Event-ID'; gapEvent: 'snapshot' }
  }
  links: Record<string, string>
}

export interface AudioApiProblem {
  type: string
  title: string
  status: number
  detail: string
  code: string
  instance: string
  apiVersion: number
  errors?: JsonValue
  currentVersion?: number
}

export interface Page<T> {
  items: T[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
  }
}

export type GraphKind = 'graph' | 'subgraph'
export type GraphRevisionState = 'draft' | 'published'

export interface GraphDefinitionDto {
  id: string
  name: string
  kind: GraphKind
  ownerId: string
  labels: Record<string, string>
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  activeRevisionId: string | null
  desiredStateVersion: number
}

export interface SignalContractDto {
  mediaKind: string
  content?: 'any' | 'pcm' | 'encoded'
  rate?: number | number[]
  sampleFormat?: string | string[]
  channels?: number | number[]
  positions?: string[]
  codec?: string | string[]
  latency?: JsonObject
  capabilities?: JsonObject
}

export interface GraphParameterDto {
  name: string
  type: 'boolean' | 'integer' | 'number' | 'string'
  required?: boolean
  default?: JsonValue
  minimum?: number
  maximum?: number
  enum?: JsonValue[]
  description?: string
}

export interface GraphPublicPortDto {
  name: string
  direction: 'input' | 'output'
  contract: SignalContractDto
  internal?: { node: string; port: string }
}

export interface GraphNodeDto {
  id: string
  type: string
  version: number
  configuration: JsonObject
  condition?: JsonObject
  subgraph?: {
    definitionId: string
    revisionId: string
    parameterBindings?: JsonObject
    portBindings?: Record<string, string>
  }
  layout?: { x: number; y: number; collapsed?: boolean }
  extensions?: JsonObject
}

export interface GraphEdgeDto {
  id: string
  from: { node: string; port: string }
  to: { node: string; port: string }
  condition?: JsonObject
  extensions?: JsonObject
}

export interface DesiredGraphDocumentDto {
  schemaVersion: 1
  id: string
  kind: GraphKind
  metadata: { name: string; description?: string; labels?: Record<string, string> }
  parameters: GraphParameterDto[]
  publicPorts: GraphPublicPortDto[]
  conditions: Array<{ id: string; expression: JsonObject }>
  nodes: GraphNodeDto[]
  edges: GraphEdgeDto[]
  layout?: JsonObject
  extensions?: JsonObject
}

export interface ValidationIssueDto {
  path: string
  code: string
  message: string
  severity?: 'error' | 'warning'
}

export interface GraphRevisionDto {
  id: string
  definitionId: string
  revisionNumber: number
  schemaVersion: 1
  state: GraphRevisionState
  authorId: string
  contentDigest: string
  validation: {
    valid: boolean
    issues: ValidationIssueDto[]
    nodeCount?: number
    edgeCount?: number
    pathDepth?: number | null
  }
  updateVersion: number
  createdAt: string
  publishedAt: string | null
  content?: DesiredGraphDocumentDto
}

export interface GraphActivationDto {
  id?: string
  definitionId: string
  revisionId: string | null
  parameterBindings?: JsonObject
  sceneBindings?: JsonObject
  desiredStateVersion: number
  activatedAt?: string
  updatedAt?: string
}

export interface NodePortDto {
  name: string
  direction: 'input' | 'output'
  optional: boolean
  cardinality: 'single' | 'variadic' | 'dynamic'
  description: string
  contract: SignalContractDto
}

export interface NodeTypeDto {
  id: string
  version: number
  displayName: string
  category: string
  description: string
  ports: NodePortDto[]
  configurationSchema: JsonObject
  requiresSubgraphReference: boolean
  allowsDynamicPorts: boolean
  allowsFeedback: boolean
  available: boolean
  source: 'core' | 'managed' | 'plugin'
  pluginId: string | null
  pluginState?: string
  availabilityDiagnostics?: JsonValue[]
  ui: { advanced: boolean; paletteGroup: string; icon: string }
}

export interface NodeTypeCatalogueDto {
  schemaVersion: 1
  items: NodeTypeDto[]
}

export interface CamillaDSPProfileDto {
  id: string
  profileId: string
  version: number
  schemaVersion: 1
  ownerId: string
  name: string
  description: string
  contentDigest: string
  validation: JsonObject
  createdAt: string
  content: JsonObject
}

export interface EndpointSelectorDto {
  version: 1
  match: 'all' | 'any'
  predicates: Array<{
    path: string
    operator: 'exact' | 'oneOf' | 'pattern'
    value: JsonValue
    caseSensitive?: boolean
  }>
}

export interface LogicalEndpointDto {
  id: string
  name: string
  ownerId: string
  direction: 'input' | 'output'
  selector: EndpointSelectorDto
  tags: string[]
  groups: string[]
  policyMetadata: JsonObject
  explicitBinding: EndpointSelectorDto | null
  lastKnown: JsonObject
  updateVersion: number
  createdAt: string
  updatedAt: string
}

export interface RuntimeProjectionDto {
  id: string
  type: string
  subject: string
  worldGeneration: number
  worldSequence: number
  payload: JsonObject
  current: boolean
  observedAt: string
}

export interface RuntimeSnapshotDto {
  representation: 'observedRuntime'
  runtimeAvailable: boolean
  worldGeneration: number | null
  worldSequence: number | null
  items: RuntimeProjectionDto[]
}

export interface SpeakerTestChannelDto {
  position: string
  label: string
}

export interface SpeakerTestOutputDto {
  runtimeKey: string
  runtimeGeneration: number
  name: string
  description: string
  targetName: string
  channels: SpeakerTestChannelDto[]
  rate: number
}

export interface SpeakerTestStateDto {
  active: boolean
  token: string | null
  runtimeKey: string | null
  outputName: string | null
  channel: string | null
  startedAt: string | null
  endsAt: string | null
  durationMs: number | null
}

export interface SpeakerTestOverviewDto {
  outputs: SpeakerTestOutputDto[]
  active: SpeakerTestStateDto
}

export type AudioAdapterKind =
  | 'roc-receiver'
  | 'roc-sender'
  | 'debug-file-source'
  | 'debug-file-recorder'

export interface AudioAdapterTypeDto {
  kind: AudioAdapterKind
  title: string
  description: string
  direction: 'input' | 'output'
  schemaVersion: 1
  configurationSchema: JsonObject
}

export interface AudioAdapterTypeCatalogueDto {
  schemaVersion: 1
  items: AudioAdapterTypeDto[]
}

export interface ManagedAudioAdapterDto {
  id: string
  ownerId: string
  schemaVersion: 1
  desired: {
    name: string
    kind: AudioAdapterKind
    configuration: JsonObject
    enabled: boolean
    restartGeneration: number
    updateVersion: number
    createdAt: string
    updatedAt: string
  }
  observed: {
    lifecycle: string
    health: string
    processId: number | null
    runtimeGeneration: number
    configurationDigest: string
    expectedNodeName: string
    runtimeKey: string | null
    progress: JsonObject
    retryAt: string | null
    lastError: JsonObject
    startedAt: string | null
    observedAt: string | null
    updatedAt: string | null
  }
}

export interface CandidateDiagnosticDto {
  runtimeKey: string
  name: string | null
  matched: boolean
  score: number
  predicates: Array<{ path: string; operator: string; matched: boolean }>
  acceptedEvidence: string[]
  rejectedEvidence: string[]
}

export interface EndpointCandidateExplanationDto {
  endpoint: LogicalEndpointDto
  resolution: {
    status: 'matched' | 'no_match' | 'ambiguous' | 'invalid_selector'
    selectedRuntimeKey: string | null
    tiedRuntimeKeys: string[]
    diagnostics: CandidateDiagnosticDto[]
    selectorIssues: ValidationIssueDto[]
  }
  world: {
    generation: number | null
    sequence: number | null
    runtimeAvailable: boolean
  }
}

export interface SelectorPreviewDto {
  selector: EndpointSelectorDto
  resolution: EndpointCandidateExplanationDto['resolution']
  persistentDesiredChange: false
}

export type ResolvedPlanStatus =
  | 'resolved'
  | 'waiting'
  | 'degraded'
  | 'conflicted'
  | 'invalid'

export interface AppliedPlanStateDto {
  status: 'idle' | 'applying' | 'converged' | 'degraded' | 'failed'
  currentPlanId: string | null
  previousPlanId: string | null
  transitionGeneration: number
  correlationId: string | null
  lastError: JsonObject | null
  updatedAt: string | null
}

export interface ResolvedPlanDto {
  id: string
  schemaVersion: 1
  definitionId: string
  revisionId: string
  desiredStateVersion: number
  worldGeneration: number
  worldSequence: number
  runtimeVersion: string | null
  resolutionMode: 'live' | 'shadow'
  status: ResolvedPlanStatus
  document: JsonObject
  explanation: JsonObject
  planDigest: string
  correlationId: string
  applied: AppliedPlanStateDto
  createdAt: string
}

export interface CurrentPlanDto {
  definitionId: string
  applied: AppliedPlanStateDto
  plan: ResolvedPlanDto | null
}

export interface OrchestrationReadinessDto {
  ready: boolean
  diagnosticsAvailable: boolean
  desiredEditingAvailable: boolean
  liveControlsAvailable: boolean
  blockers: string[]
  features: Record<string, boolean>
  runtime: {
    available: boolean
    worldGeneration: number | null
    worldSequence: number | null
  }
  processorsReady: boolean
}

export type ManualOverrideScope =
  | 'endpoint'
  | 'scene'
  | 'volume'
  | 'mute'
  | 'route'
  | 'graph_parameter'

export interface ManualOverrideDto {
  id: string
  mutationKind: 'temporaryOverride'
  persistentDesiredChange: false
  scopeType: ManualOverrideScope
  scopeId: string
  value: JsonValue
  priority: number
  creatorId: string
  reason: string
  startsAt: string
  expiresAt: string | null
  cancelledAt: string | null
  cancelledById: string | null
  active: boolean
  createdAt: string
}

export type OrchestrationEventKind =
  | 'runtime'
  | 'plan'
  | 'transition'
  | 'endpoint'
  | 'processor'
  | 'health'

export interface OrchestrationEventDto {
  sequence: number
  id: string
  correlationId: string
  definitionId: string | null
  type: string
  severity: 'debug' | 'info' | 'warning' | 'error'
  payload: JsonObject
  occurredAt: string
}

export interface SnapshotRecoveryDto {
  schemaVersion: 1
  reason: 'event-gap'
  replaceLocalState: true
  worldGeneration: number | null
  worldSequence: number | null
  runtimeAvailable: boolean
  projections: RuntimeProjectionDto[]
}

export interface SelectorRuleDraft {
  id: string
  name: string
  fact: string
  operator: 'equals' | 'notEquals' | 'exists'
  value?: JsonValue
  thenEndpointId: string
  otherwiseEndpointId?: string
  priority: number
}
