import {writeFileSync} from 'node:fs'
import {expect, test, type Locator, type Page, type Route} from '@playwright/test'
import axe from 'axe-core'
import {adminUxFixture} from '../packages/shared/tests/fixtures/adminUx'

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'http://127.0.0.1:4173/admin'
const ON_BOX_BASE_URL = process.env.ON_BOX_BASE_URL || 'http://127.0.0.1:4174/ui'

const endpoints = [
  {
    id: 'endpoint-tv',
    name: 'TV / SPDIF',
    ownerId: 'user-1',
    direction: 'input',
    selector: {version: 1, match: 'all', predicates: [{path: 'node.name', operator: 'exact', value: 'alsa_input.tv'}]},
    tags: ['programme'],
    groups: ['room:living'],
    policyMetadata: {},
    explicitBinding: null,
    lastKnown: {description: 'Television digital input', lastSeen: '2026-08-23T12:00:00Z'},
    updateVersion: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-23T12:00:00Z',
  },
  {
    id: 'endpoint-speakers',
    name: 'Main speakers',
    ownerId: 'user-1',
    direction: 'output',
    selector: {version: 1, match: 'all', predicates: [{path: 'device.name', operator: 'exact', value: 'alsa_card.main'}]},
    tags: ['main'],
    groups: ['room:living'],
    policyMetadata: {},
    explicitBinding: null,
    lastKnown: {description: 'Living room amplifier', lastSeen: '2026-08-23T12:00:00Z'},
    updateVersion: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-23T12:00:00Z',
  },
  {
    id: 'endpoint-headset',
    name: 'Headset',
    ownerId: 'user-1',
    direction: 'output',
    selector: {version: 1, match: 'all', predicates: [{path: 'device.name', operator: 'exact', value: 'bluez_card.headset'}]},
    tags: ['private'],
    groups: [],
    policyMetadata: {},
    explicitBinding: null,
    lastKnown: {description: 'Living-room headset', lastSeen: '2026-08-20T12:00:00Z'},
    updateVersion: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-20T12:00:00Z',
  },
] as const

const graph = {
  id: 'graph-1',
  name: 'Living room',
  kind: 'graph',
  ownerId: 'user-1',
  labels: {room: 'living'},
  createdAt: '2026-08-22T00:00:00Z',
  updatedAt: '2026-08-23T12:00:00Z',
  archivedAt: null,
  activeRevisionId: 'published-1',
  desiredStateVersion: 2,
}

const graphDocument = {
  schemaVersion: 1,
  id: 'graph:living-room',
  kind: 'graph',
  metadata: {name: 'Living room'},
  parameters: [],
  publicPorts: [],
  conditions: [],
  nodes: [
    {id: 'source', type: 'core.endpoint-reference', version: 1, configuration: {logicalEndpointId: 'endpoint-tv', direction: 'input'}, layout: {x: 40, y: 140}},
    {id: 'decoder', type: 'processor.pcm-auto-decoder', version: 1, configuration: {pcmBehavior: 'bypass', encodedBehavior: 'decode', unsupportedBehavior: 'error', supportedCodecs: ['ac3', 'eac3', 'dts'], minimumConfidence: 0.7}, layout: {x: 340, y: 120}},
    {id: 'room-dsp', type: 'processor.camilladsp-profile-selector', version: 1, configuration: {profileId: 'profile-lineage-1', profileVersion: 2, parameterBindings: {gainDb: -3}, bypassAllowed: false}, layout: {x: 660, y: 120}},
    {id: 'speakers', type: 'core.endpoint-reference', version: 1, configuration: {logicalEndpointId: 'endpoint-speakers', direction: 'output'}, layout: {x: 980, y: 140}},
  ],
  edges: [
    {id: 'edge-source-decoder', from: {node: 'source', port: 'output'}, to: {node: 'decoder', port: 'input'}},
    {id: 'edge-decoder-dsp', from: {node: 'decoder', port: 'output'}, to: {node: 'room-dsp', port: 'input'}},
    {id: 'edge-dsp-output', from: {node: 'room-dsp', port: 'output'}, to: {node: 'speakers', port: 'input'}},
  ],
  layout: {viewport: {x: 0, y: 0, zoom: 0.8}},
}

function revision(id: string, state: 'draft' | 'published', updateVersion: number, content = graphDocument) {
  return {
    id,
    definitionId: graph.id,
    revisionNumber: state === 'draft' ? 2 : 1,
    schemaVersion: 1,
    state,
    authorId: 'user-1',
    contentDigest: 'a'.repeat(64),
    validation: {valid: true, issues: [], nodeCount: content.nodes.length, edgeCount: content.edges.length},
    updateVersion,
    createdAt: '2026-08-23T12:00:00Z',
    publishedAt: state === 'published' ? '2026-08-23T12:00:00Z' : null,
    content,
  }
}

const metadata = {
  service: 'open-cinema-audio-orchestration',
  apiVersion: 1,
  schemaVersion: 1,
  supportedApiVersions: [1],
  mediaType: 'application/json',
  problemMediaType: 'application/problem+json',
  desiredGraphSchemaVersion: 1,
  resolverReplaySchemaVersion: 1,
  eventSchemaVersion: 1,
  conventions: {
    pagination: {parameters: ['limit', 'offset'], maximumLimit: 100},
    optimisticConcurrency: {requestHeader: 'If-Match', responseHeader: 'ETag', conflictStatus: 412, missingStatus: 428},
    eventResumption: {requestHeader: 'Last-Event-ID', gapEvent: 'snapshot'},
  },
  links: {},
}

const ports = (content: 'any' | 'pcm' = 'any') => [
  {name: 'input', direction: 'input', optional: true, cardinality: 'single', description: 'Audio input', contract: {mediaKind: 'audio', content}},
  {name: 'output', direction: 'output', optional: true, cardinality: 'single', description: 'Audio output', contract: {mediaKind: 'audio', content}},
]

const nodeTypes = [
  {
    id: 'core.endpoint-reference', version: 1, displayName: 'Endpoint reference', category: 'routing', description: 'Durable logical endpoint', ports: ports(),
    configurationSchema: {type: 'object', required: ['direction', 'logicalEndpointId'], properties: {logicalEndpointId: {type: 'string'}, direction: {enum: ['input', 'output']}}},
    requiresSubgraphReference: false, allowsDynamicPorts: false, allowsFeedback: false, available: true, source: 'core', pluginId: null, ui: {advanced: true, paletteGroup: 'routing', icon: 'routing'},
  },
  {
    id: 'processor.pcm-auto-decoder', version: 1, displayName: 'Adaptive PCM/encoded decoder', category: 'processing', description: 'Adaptive decoder', ports: ports(),
    configurationSchema: {type: 'object', properties: {pcmBehavior: {enum: ['bypass', 'silence', 'error']}, encodedBehavior: {enum: ['decode', 'passthrough', 'silence', 'error']}, unsupportedBehavior: {enum: ['passthrough', 'silence', 'error']}, supportedCodecs: {type: 'array'}, minimumConfidence: {type: 'number', minimum: 0, maximum: 1}}},
    requiresSubgraphReference: false, allowsDynamicPorts: false, allowsFeedback: false, available: true, source: 'managed', pluginId: null, ui: {advanced: true, paletteGroup: 'processing', icon: 'processing'},
  },
  {
    id: 'processor.camilladsp-profile-selector', version: 1, displayName: 'CamillaDSP profile', category: 'processing', description: 'CamillaDSP processor', ports: ports('pcm'),
    configurationSchema: {type: 'object', properties: {profileId: {type: 'string'}, profileVersion: {type: 'integer', minimum: 1}, parameterBindings: {type: 'object'}, bypassAllowed: {type: 'boolean'}, resourcePriority: {type: 'integer'}}},
    requiresSubgraphReference: false, allowsDynamicPorts: false, allowsFeedback: false, available: true, source: 'managed', pluginId: null, ui: {advanced: true, paletteGroup: 'processing', icon: 'processing'},
  },
  {
    id: 'core.mixer-intent', version: 1, displayName: 'Mixer intent', category: 'processing', description: 'Mix PCM', ports: ports('pcm'),
    configurationSchema: {type: 'object', properties: {headroomDb: {type: 'number', maximum: 0}, normalization: {enum: ['none', 'peak', 'loudness']}}},
    requiresSubgraphReference: false, allowsDynamicPorts: false, allowsFeedback: false, available: true, source: 'core', pluginId: null, ui: {advanced: true, paletteGroup: 'processing', icon: 'processing'},
  },
  {
    id: 'core.subgraph-instance', version: 1, displayName: 'Subgraph instance', category: 'structure', description: 'Pinned subgraph', ports: [], configurationSchema: {type: 'object'},
    requiresSubgraphReference: true, allowsDynamicPorts: true, allowsFeedback: false, available: true, source: 'core', pluginId: null, ui: {advanced: true, paletteGroup: 'structure', icon: 'structure'},
  },
]

const profile = {
  id: 'profile-revision-2', profileId: 'profile-lineage-1', version: 2, schemaVersion: 1, ownerId: 'user-1', name: 'Living room 5.1', description: 'Room correction', contentDigest: 'b'.repeat(64), validation: {valid: true}, createdAt: '2026-08-23T12:00:00Z',
  content: {schemaVersion: 1, parameters: [], signalContracts: {input: {mediaKind: 'audio', content: 'pcm'}, output: {mediaKind: 'audio', content: 'pcm'}}, processing: {chunksize: 1024, filters: {}, mixers: {}, pipeline: []}},
}

function projection(endpoint: typeof endpoints[number]) {
  return {
    id: `projection-${endpoint.id}`,
    type: 'endpoint-candidate',
    subject: `runtime:${endpoint.id}`,
    worldGeneration: 1,
    worldSequence: 2,
    payload: {
      runtimeKey: `runtime:1:node:${endpoint.id === 'endpoint-tv' ? 1 : endpoint.id === 'endpoint-speakers' ? 2 : 3}`,
      direction: endpoint.direction,
      name: endpoint.id === 'endpoint-tv' ? 'alsa_input.tv' : endpoint.id === 'endpoint-speakers' ? 'alsa_output.main' : 'bluez_output.headset',
      description: endpoint.lastKnown.description,
      activeSignal: endpoint.id === 'endpoint-tv',
      audioCapabilities: {volume: 0.46, mute: false, formats: [{rate: 48000, channels: endpoint.id === 'endpoint-speakers' ? 6 : 2}]},
      routes: [{name: 'main route', active: true}],
    },
    current: true,
    observedAt: '2026-08-23T12:00:00Z',
  }
}

const endpointProjections = endpoints.slice(0, 2).map(projection)
const processorProjection = {
  id: 'processor-camilla', type: 'processor-health', subject: 'camilladsp:0', worldGeneration: 1, worldSequence: 2,
  payload: {nodeId: 'room-dsp', nodeType: 'processor.camilladsp-profile-selector', health: 'ready', ready: true, activeProfile: 'Living room 5.1'}, current: true, observedAt: '2026-08-23T12:00:00Z',
}

const observedAt = '2026-08-29T12:00:00Z'

const masterLevel = {
  schemaVersion: 1,
  scope: 'master-output',
  desired: {level: 0.8, muted: false},
  effective: {level: 0.8, muted: false},
  observed: {outputs: 1},
  writable: true,
  applying: false,
  degraded: [],
  runtimeVersion: '1:2',
  updateVersion: 3,
  updatedAt: observedAt,
}

function endpointLevel(endpoint: typeof endpoints[number]) {
  const available = endpoint.id !== 'endpoint-headset'
  return {
    schemaVersion: 1,
    scope: endpoint.direction === 'output' ? 'device-level' : 'input-level',
    endpointId: endpoint.id,
    direction: endpoint.direction,
    availability: available ? 'available' : 'unavailable',
    desired: {level: endpoint.id === 'endpoint-speakers' ? 0.65 : 1, muted: false},
    master: endpoint.direction === 'output' ? {level: 0.8, muted: false, updateVersion: 3} : null,
    effective: {level: endpoint.id === 'endpoint-speakers' ? 0.52 : 1, muted: false},
    observed: {level: available ? 0.65 : null, muted: available ? false : null, known: available},
    capabilities: {
      volume: {readable: available, writable: available},
      mute: {readable: available, writable: available},
    },
    applying: false,
    degraded: available ? [] : [{code: 'endpoint-unavailable', detail: 'The device is disconnected.'}],
    runtimeVersion: available ? '1:2' : null,
    updateVersion: 2,
    updatedAt: observedAt,
  }
}

const adapterResource = {
  schemaVersion: 1,
  id: 'adapter:roc-input',
  resourceType: 'adapter',
  name: 'Television ROC input',
  kind: 'roc-receiver',
  version: null,
  versionStatus: 'unknown',
  desired: {lifecycle: 'running', enabled: true, updateVersion: 4},
  observed: {lifecycle: 'ready', health: 'healthy', mode: null, profile: null, lastError: {}, observedAt},
  freshness: {observedAt, runtimeGeneration: 1, stale: false},
  actions: [{id: 'restart', label: 'Restart', available: true, reason: null, method: 'POST', href: '/api/audio/v1/adapters/roc-input/restart', updateVersion: 4}],
  correlations: [{kind: 'endpoint-candidate', subject: 'runtime:1:node:1', worldGeneration: 1, worldSequence: 2, evidence: {direction: 'input'}}],
}

const processorResource = {
  schemaVersion: 1,
  id: 'processor:camilladsp:main',
  resourceType: 'processor',
  name: 'CamillaDSP · main',
  kind: 'camilladsp',
  version: '4.0.3',
  versionStatus: 'known',
  desired: {lifecycle: 'managed', enabled: true, updateVersion: null},
  observed: {lifecycle: 'ready', health: 'healthy', mode: '6 channels', profile: 'Living room 5.1', lastError: {}, observedAt},
  freshness: {observedAt, runtimeGeneration: 1, stale: false},
  actions: [{id: 'restart', label: 'Restart', available: false, reason: 'A safe supervisor restart intent is not available yet.', method: null, href: null, updateVersion: null}],
  correlations: [],
}

const explanationPresentation = {
  schemaVersion: 1,
  headline: {
    status: 'active',
    title: 'TV audio is playing on Main speakers',
    summary: 'The headset is unavailable, so the main speakers were selected.',
  },
  route: [
    {kind: 'endpoint', name: 'TV / SPDIF', role: 'source', detail: 'Television digital input', referenceId: 'endpoint-tv', nodeId: 'source'},
    {kind: 'processor', name: 'Adaptive PCM decoder', role: 'decode', detail: 'Dolby Digital 5.1 to PCM 5.1', referenceId: 'decoder', nodeId: 'decoder'},
    {kind: 'processor', name: 'Living room CamillaDSP', role: 'process', detail: 'Room correction, 5.1', referenceId: 'room-dsp', nodeId: 'room-dsp'},
    {kind: 'endpoint', name: 'Main speakers', role: 'output', detail: 'Living room amplifier', referenceId: 'endpoint-speakers', nodeId: 'speakers'},
  ],
  selection: {
    trigger: 'Headset disconnected',
    winner: 'Main speakers',
    winnerReferenceId: 'endpoint-speakers',
    reasonCode: 'first-available',
    reason: 'First available preferred output',
    selectorNodeId: 'speakers',
  },
  alternatives: [{
    name: 'Headset', referenceId: 'endpoint-headset', status: 'unavailable',
    reasonCode: 'disconnected', reason: 'Device is disconnected', technicalEvidence: ['no runtime match'],
    selectorNodeId: 'speakers', role: 'output',
  }],
  signals: {
    input: {format: 'Dolby Digital', channels: 6, rate: 48000},
    path: [{
      edgeId: 'edge-source-decoder', fromNodeId: 'source', toNodeId: 'decoder',
      from: 'TV / SPDIF', to: 'Adaptive PCM decoder', signal: {format: 'PCM', channels: 6, rate: 48000},
      changes: {format: 'decoded'}, compatible: true,
    }],
  },
  processors: [
    {kind: 'processor', name: 'Adaptive PCM decoder', role: 'decode', detail: 'Dolby Digital 5.1 to PCM 5.1', referenceId: 'decoder', nodeId: 'decoder'},
    {kind: 'processor', name: 'Living room CamillaDSP', role: 'process', detail: 'Room correction, 5.1', referenceId: 'room-dsp', nodeId: 'room-dsp'},
  ],
  overrides: [],
  transition: {status: 'converged', durationMs: 4200, observedAt, message: 'Audio moved to the first available preferred output.'},
  errors: [],
  technicalReferences: {planId: 'plan-2', worldGeneration: 1, worldSequence: 2},
}

const systemOverview = {
  schemaVersion: 1,
  observedAt,
  hostname: 'open-cinema',
  model: 'Raspberry Pi 5 Model B Rev 1.0',
  operatingSystem: 'Debian GNU/Linux 13 (trixie)',
  kernel: '6.12.47+rpt-rpi-2712',
  bootId: '11111111-2222-3333-4444-555555555555',
  uptimeSeconds: 86_400,
  storage: {usedBytes: 17_179_869_184, totalBytes: 68_719_476_736, percent: 25},
  temperatureCelsius: 46.8,
  throttling: {supported: true, active: false, raw: '0x0'},
  application: {ready: true, status: 'ready', blockers: []},
  unavailableFields: [],
}

const systemComponents = [
  {
    id: 'open-cinema', name: 'Open Cinema', version: '0.3.2', versionStatus: 'known', versionSource: 'package', health: 'ready', observedAt,
    actions: [{id: 'restart', label: 'Restart Open Cinema', available: true, reason: null, actionToken: 'restart-open-cinema:token', method: 'POST', href: '/api/system/v1/components/open-cinema/actions/restart'}],
  },
  {
    id: 'open-cinema-orchestrator', name: 'Audio orchestrator', version: '0.3.2', versionStatus: 'known', versionSource: 'package', health: 'ready', observedAt,
    actions: [{id: 'restart', label: 'Restart orchestrator', available: false, reason: 'Development helper unavailable', actionToken: null, method: 'POST', href: '/api/system/v1/components/open-cinema-orchestrator/actions/restart'}],
  },
]

const rebootAction = {
  id: 'reboot-appliance', label: 'Reboot appliance', available: false,
  reason: 'Reboot is disabled in this browser fixture.', actionToken: null, method: 'POST', href: '/api/system/v1/actions/reboot',
}

const page = (items: unknown[]) => ({items, pagination: {limit: 50, offset: 0, total: items.length, nextOffset: null}})

async function capture(pageUnderTest: Page, name: string) {
  if (process.env.UPDATE_UI_REFERENCES === '1') {
    await pageUnderTest.screenshot({path: `docs/ui-current/${name}.png`, fullPage: true})
  }
}

const layoutBaseline: Record<string, Record<string, unknown>> = {}

async function recordLayout(name: string, regions: Record<string, Locator>) {
  if (process.env.UPDATE_UI_REFERENCES !== '1') return
  const measurements: Record<string, unknown> = {}
  for (const [region, locator] of Object.entries(regions)) {
    const target = locator.first()
    if (await target.count() === 0) {
      measurements[region] = {visible: false}
      continue
    }
    measurements[region] = {
      visible: await target.isVisible(),
      enabled: await target.isEnabled().catch(() => undefined),
      text: (await target.textContent())?.trim() || null,
      ariaPressed: await target.getAttribute('aria-pressed'),
      box: await target.boundingBox(),
    }
  }
  layoutBaseline[name] = measurements
  writeFileSync(
    'docs/ui-current/layout-baseline.json',
    `${JSON.stringify(layoutBaseline, null, 2)}\n`,
    'utf8',
  )
}

async function expectAccessible(pageUnderTest: Page) {
  await pageUnderTest.addScriptTag({content: axe.source})
  const violations = await pageUnderTest.evaluate(async () => {
    const result = await (window as unknown as {axe: {run: (context: Document, options: unknown) => Promise<{violations: Array<{impact: string | null; id: string}>}>}}).axe.run(
      document,
      {rules: {'color-contrast': {enabled: false}}},
    )
    return result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
  })
  expect(violations).toEqual([])
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({status, contentType: 'application/json', headers: {'Open-Cinema-API-Version': '1'}, body: JSON.stringify(body)})
}

async function installEventSource(pageUnderTest: Page) {
  await pageUnderTest.addInitScript(() => {
    class StableEventSource {
      onopen: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      constructor() { setTimeout(() => this.onopen?.(new Event('open')), 0) }
      addEventListener() {}
      close() {}
    }
    Object.defineProperty(window, 'EventSource', {value: StableEventSource})
  })
}

async function installApi(pageUnderTest: Page) {
  let draft = revision('draft-2', 'draft', 1)
  let applied = true
  let currentMaster = {...masterLevel}
  const currentLevels = Object.fromEntries(endpoints.map((endpoint) => [endpoint.id, endpointLevel(endpoint)]))
  let speakerState = {
    active: false,
    token: null as string | null,
    runtimeKey: null as string | null,
    outputName: null as string | null,
    channel: null as string | null,
    startedAt: null as string | null,
    endsAt: null as string | null,
    durationMs: null as number | null,
  }
  await pageUnderTest.route('**/api/audio/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path.endsWith('/schema')) return fulfill(route, metadata)
    if (path.endsWith('/levels/master')) {
      if (method === 'PATCH') {
        currentMaster = {
          ...currentMaster,
          desired: {...currentMaster.desired, ...request.postDataJSON()},
          effective: {...currentMaster.effective, ...request.postDataJSON()},
          updateVersion: currentMaster.updateVersion + 1,
        }
      }
      return fulfill(route, currentMaster)
    }
    if (/\/endpoints\/[^/]+\/level$/.test(path)) {
      const endpointId = path.split('/').at(-2)!
      const level = currentLevels[endpointId]
      if (!level) return fulfill(route, {detail: 'Unknown endpoint'}, 404)
      if (method === 'PATCH') {
        const changes = request.postDataJSON()
        currentLevels[endpointId] = {
          ...level,
          desired: {...level.desired, ...changes},
          updateVersion: level.updateVersion + 1,
        }
      }
      return fulfill(route, currentLevels[endpointId])
    }
    if (/\/endpoints\/[^/]+\/binding$/.test(path) && method === 'POST') {
      const endpointId = path.split('/').at(-2)!
      const endpoint = endpoints.find((item) => item.id === endpointId)
      if (!endpoint) return fulfill(route, {detail: 'Unknown endpoint'}, 404)
      return fulfill(route, {
        endpoint: {...endpoint, updateVersion: endpoint.updateVersion + 1},
        selectorReview: {status: 'accepted', evidence: ['Stable device identity preserved.']},
        persistentDesiredChange: true,
      })
    }
    if (/\/endpoints\/[^/]+\/candidates$/.test(path)) {
      const endpointId = path.split('/').at(-2)!
      const endpoint = endpoints.find((item) => item.id === endpointId)!
      const candidate = endpointProjections.find((item) => item.payload.direction === endpoint.direction && (endpoint.id !== 'endpoint-headset' || item.subject.includes('headset')))
      return fulfill(route, {
        endpoint,
        resolution: candidate ? {status: 'matched', selectedRuntimeKey: candidate.payload.runtimeKey, tiedRuntimeKeys: [], diagnostics: [{runtimeKey: candidate.payload.runtimeKey, name: endpoint.name, matched: true, score: 10, predicates: [], acceptedEvidence: ['stable hardware identity'], rejectedEvidence: []}], selectorIssues: []} : {status: 'no_match', selectedRuntimeKey: null, tiedRuntimeKeys: [], diagnostics: [], selectorIssues: []},
        world: {generation: 1, sequence: 2, runtimeAvailable: true},
      })
    }
    if (path.endsWith('/endpoint-candidates')) return fulfill(route, {items: endpointProjections, runtimeAvailable: true})
    if (path.endsWith('/endpoints')) return fulfill(route, page([...endpoints]))
    if (path.endsWith('/graphs')) return fulfill(route, page([graph]))
    if (path.endsWith('/graphs/graph-1/revisions')) return fulfill(route, page([draft, revision('published-1', 'published', 1)]))
    if (path.endsWith('/revisions/draft-2') && method === 'GET') return fulfill(route, draft)
    if (path.endsWith('/revisions/published-1')) return fulfill(route, revision('published-1', 'published', 1))
    if (path.endsWith('/revisions/draft-2') && method === 'PATCH') {
      draft = revision('draft-2', 'draft', draft.updateVersion + 1, request.postDataJSON().content)
      return fulfill(route, draft)
    }
    if (path.endsWith('/revisions/draft-2/validate')) return fulfill(route, {valid: true, issues: []})
    if (path.endsWith('/revisions/draft-2/publish')) {
      expect(request.postDataJSON().activate).toBe(true)
      applied = true
      draft = revision('draft-2', 'published', draft.updateVersion, draft.content)
      return fulfill(route, draft)
    }
    if (path.endsWith('/graphs/graph-1/activation')) return fulfill(route, {definitionId: graph.id, revisionId: applied ? 'published-1' : null, desiredStateVersion: 2})
    if (path.endsWith('/node-types')) return fulfill(route, {schemaVersion: 1, items: nodeTypes})
    if (path.endsWith('/camilladsp/profiles')) return fulfill(route, page([profile]))
    if (path.endsWith('/plans/current')) {
      return fulfill(route, {items: applied ? [{
        definitionId: graph.id,
        applied: {status: 'converged', currentPlanId: 'plan-2', previousPlanId: 'plan-1', transitionGeneration: 3, correlationId: 'correlation-2', lastError: null, updatedAt: '2026-08-23T12:01:00Z'},
        plan: {id: 'plan-2', schemaVersion: 1, definitionId: graph.id, revisionId: 'draft-2', desiredStateVersion: 3, worldGeneration: 1, worldSequence: 2, runtimeVersion: '1:2', resolutionMode: 'live', status: 'resolved', document: {paths: {activeNodeIds: ['source', 'decoder', 'room-dsp', 'speakers'], selectedEdgeIds: ['edge-source-decoder', 'edge-decoder-dsp', 'edge-dsp-output']}, endpointBindings: []}, explanation: {summary: {selectedEndpoints: ['endpoint-tv', 'endpoint-speakers'], selectedEdges: []}, stages: [], presentation: explanationPresentation}, planDigest: 'plan', correlationId: 'correlation-2', applied: {status: 'converged', currentPlanId: 'plan-2', previousPlanId: 'plan-1', transitionGeneration: 3, correlationId: 'correlation-2', lastError: null, updatedAt: '2026-08-23T12:01:00Z'}, createdAt: '2026-08-23T12:01:00Z'},
      }] : []})
    }
    if (path.endsWith('/runtime/snapshot')) return fulfill(route, {representation: 'observedRuntime', runtimeAvailable: true, worldGeneration: 1, worldSequence: 2, items: [...endpointProjections, processorProjection]})
    if (path.endsWith('/runtime/readiness')) return fulfill(route, {ready: true, diagnosticsAvailable: true, desiredEditingAvailable: true, liveControlsAvailable: true, blockers: [], features: {}, runtime: {available: true, worldGeneration: 1, worldSequence: 2}, processorsReady: true})
    if (path.endsWith('/runtime/resources')) return fulfill(route, {schemaVersion: 1, items: [adapterResource, processorResource]})
    if (path.endsWith('/runtime/processors')) return fulfill(route, {items: [processorProjection]})
    if (path.endsWith('/adapters/roc-input/restart') && method === 'POST') return fulfill(route, {ok: true})
    if (path.endsWith('/speaker-test')) {
      const outputs = [adminUxFixture.speakerOutput]
      if (method === 'POST') {
        speakerState = {
          active: true,
          token: 'speaker-test-1',
          runtimeKey: request.postDataJSON().runtimeKey,
          outputName: 'Main speakers',
          channel: request.postDataJSON().channel,
          startedAt: '2026-08-28T12:00:00Z',
          endsAt: '2026-08-28T12:00:02Z',
          durationMs: 2_000,
        }
        return fulfill(route, speakerState)
      }
      if (method === 'DELETE') {
        speakerState = {...speakerState, active: false, token: null, channel: null}
        return fulfill(route, speakerState)
      }
      return fulfill(route, {outputs, active: speakerState})
    }
    throw new Error(`Unhandled orchestration API request: ${method} ${path}`)
  })
}

async function installAuth(pageUnderTest: Page, initiallyAuthenticated = true) {
  let authenticated = initiallyAuthenticated
  const session = () => ({
    authenticated,
    user: authenticated ? {
      id: '1',
      username: 'admin',
      name: 'admin',
      email: '',
      isStaff: true,
      isSuperuser: true,
    } : null,
  })
  await pageUnderTest.route('**/api/auth/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/login')) {
      const credentials = request.postDataJSON()
      authenticated = credentials.username === 'admin' && credentials.password === 'admin'
      return fulfill(route, session(), authenticated ? 200 : 401)
    }
    if (path.endsWith('/logout')) authenticated = false
    return fulfill(route, session())
  })
}

async function installSystemApi(pageUnderTest: Page) {
  let operationPolls = 0
  const operation = (status: 'reconnecting' | 'succeeded') => ({
    id: 'operation-1',
    correlationId: 'system-correlation-1',
    action: 'restart-open-cinema',
    targetId: 'open-cinema',
    status,
    error: null,
    requestedAt: observedAt,
    updatedAt: observedAt,
    completedAt: status === 'succeeded' ? observedAt : null,
    links: {self: '/api/system/v1/operations/operation-1'},
  })
  await pageUnderTest.route('**/api/system/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path.endsWith('/overview')) return fulfill(route, systemOverview)
    if (path.endsWith('/metrics')) return fulfill(route, {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      cpuPercent: 7.5,
      memory: {usedBytes: 2_147_483_648, totalBytes: 8_589_934_592, percent: 25},
      unavailableFields: [],
    })
    if (path.endsWith('/components')) return fulfill(route, {items: systemComponents})
    if (path.endsWith('/actions')) return fulfill(route, {items: [rebootAction]})
    if (path.endsWith('/components/open-cinema/actions/restart') && method === 'POST') {
      expect(request.postDataJSON()).toEqual({actionToken: 'restart-open-cinema:token'})
      return fulfill(route, operation('reconnecting'), 202)
    }
    if (path.endsWith('/operations/operation-1')) {
      operationPolls += 1
      return fulfill(route, operation(operationPolls > 0 ? 'succeeded' : 'reconnecting'))
    }
    throw new Error(`Unhandled system API request: ${method} ${path}`)
  })
}

test.beforeEach(async ({page: pageUnderTest}) => {
  await installEventSource(pageUnderTest)
  await installAuth(pageUnderTest)
  await installApi(pageUnderTest)
  await installSystemApi(pageUnderTest)
})

test('@release management UI signs in through the Refine auth flow', async ({page}) => {
  await page.unroute('**/api/auth/**')
  await installAuth(page, false)

  await page.goto(`${ADMIN_BASE_URL}/dashboard`)
  await expect(page.getByRole('heading', {name: 'Sign in to Open Cinema'})).toBeVisible()
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('admin')
  await page.getByRole('button', {name: 'Sign in'}).click()

  await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
  await expect(page.getByRole('menuitem', {name: /Logout/})).toBeVisible()
  await expectAccessible(page)
})

test('@release apps/ui remains the independent on-box placeholder', async ({page}) => {
  await page.goto(`${ON_BOX_BASE_URL}/`)
  await expect(page.getByRole('heading', {name: 'Open Cinema'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'HDMI 1'})).toBeVisible()
  await expect(page.getByText('Audio graphs')).toHaveCount(0)
})

test('@release dashboard exposes daily controls, live status, and guarded restart', async ({page}) => {
  await page.goto(`${ADMIN_BASE_URL}/dashboard`)
  await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
  await expect(page.getByText('TV audio is playing on Main speakers')).toBeVisible()
  await expect(page.getByRole('slider', {name: 'Master volume'})).toHaveAttribute('aria-valuenow', '80')
  await expect(page.getByText('Raspberry Pi 5 Model B Rev 1.0', {exact: true})).toBeVisible()
  await expect(page.getByText('0.3.2').first()).toBeVisible()
  await expect(page.getByRole('button', {name: 'Restart orchestrator'})).toBeDisabled()
  await expect(page.getByRole('button', {name: 'Reboot appliance'})).toBeDisabled()

  await page.getByRole('slider', {name: 'Master volume'}).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('slider', {name: 'Master volume'})).toHaveAttribute('aria-valuenow', '79')

  await page.getByRole('button', {name: 'Restart Open Cinema'}).click()
  await expect(page.getByText('Audio control may be briefly unavailable while Open Cinema reconnects.')).toBeVisible()
  await page.getByRole('button', {name: 'Restart Open Cinema'}).last().click()
  await expect(page.getByText('succeeded', {exact: true}).first()).toBeVisible({timeout: 5_000})
  await expectAccessible(page)
})

test('dashboard keeps a coherent partial/read-only shell at a narrow viewport', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.route('**/api/system/v1/overview', (route) => fulfill(route, {
    ...systemOverview,
    model: null,
    temperatureCelsius: null,
    storage: null,
    throttling: {supported: false, active: null, raw: null},
    application: {ready: false, status: 'degraded', blockers: ['Optional Raspberry probes are unavailable.']},
    unavailableFields: ['model', 'temperatureCelsius', 'storage', 'throttling'],
  }))
  await page.route('**/api/system/v1/metrics', (route) => fulfill(route, {
    schemaVersion: 1,
    observedAt: '2020-01-01T00:00:00Z',
    cpuPercent: null,
    memory: null,
    unavailableFields: ['cpuPercent', 'memory'],
  }))
  await page.route('**/api/audio/v1/levels/master', async (route) => {
    if (route.request().method() === 'GET') return fulfill(route, {...masterLevel, writable: false})
    return fulfill(route, {detail: 'Read only'}, 409)
  })

  await page.goto(`${ADMIN_BASE_URL}/dashboard`)
  await expect(page.getByText('Platform not reported')).toBeVisible()
  await expect(page.getByText('Unsupported').first()).toBeVisible()
  await expect(page.getByRole('slider', {name: 'Master volume'})).toBeDisabled()
  await expect(page.getByText('Stale').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expectAccessible(page)
})

test('@release Devices and Managed resources remain separate and capability-aware', async ({page}) => {
  await page.goto(`${ADMIN_BASE_URL}/devices`)
  await expect(page.getByRole('heading', {name: 'Devices'})).toBeVisible()
  await expect(page.getByText('Headset')).toBeVisible()
  await expect(page.getByText('unavailable')).toBeVisible()
  await expect(page.getByRole('slider', {name: 'Main speakers level'})).toBeEnabled()
  await expect(page.getByRole('slider', {name: 'Headset level'})).toBeDisabled()
  await expect(page.getByText('CamillaDSP · main')).toHaveCount(0)
  const speakerRow = page.getByText('Main speakers').locator('xpath=ancestor::tr')
  await speakerRow.getByRole('button', {name: /Expand row/}).click()
  await expect(page.getByText('stable hardware identity')).toBeVisible()
  await expectAccessible(page)

  await page.goto(`${ADMIN_BASE_URL}/managed-resources`)
  await expect(page.getByRole('heading', {name: 'Managed resources'})).toBeVisible()
  await expect(page.getByText('Television ROC input')).toBeVisible()
  await expect(page.getByText('CamillaDSP · main')).toBeVisible()
  const adapterRow = page.getByText('Television ROC input').locator('xpath=ancestor::tr')
  const processorRow = page.getByText('CamillaDSP · main').locator('xpath=ancestor::tr')
  await expect(adapterRow.getByRole('button', {name: 'Restart'})).toBeEnabled()
  await expect(processorRow.getByRole('button', {name: 'Restart'})).toBeDisabled()
  await adapterRow.getByRole('button', {name: 'Restart'}).click()
  await page.getByRole('button', {name: 'Restart'}).last().click()
  await expect(page.getByText('Television ROC input restart requested.')).toBeVisible()
  await expectAccessible(page)
})

test('@release graph actions, autosave inspector, and zoom-independent palette remain coherent', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', {configurable: true, value: undefined})
  })
  await page.goto(`${ADMIN_BASE_URL}/graphs`)
  await expect(page.getByRole('button', {name: 'Deactivate Living room'})).toHaveCount(1)
  await expect(page.getByRole('button', {name: 'Apply Living room'})).toHaveCount(0)
  const row = page.getByRole('row', {name: 'Open Living room'})
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/admin\/graphs\/edit\/graph-1$/)

  const decoder = page.locator('.react-flow__node').filter({hasText: 'Adaptive PCM/encoded decoder'})
  await expect(decoder).toBeVisible()
  const before = await decoder.boundingBox()
  await decoder.click()
  await expect(page.getByRole('combobox', {name: 'Encoded Behavior'})).toBeVisible()
  await expect(page.getByRole('spinbutton', {name: 'Minimum Confidence'})).toBeVisible()
  const after = await decoder.boundingBox()
  expect(after?.width).toBe(before?.width)
  expect(after?.height).toBe(before?.height)
  await page.getByRole('spinbutton', {name: 'Minimum Confidence'}).fill('0.85')
  await expect(page.getByText(/Autosave (pending|saving|saved)/)).toBeVisible()
  await expect(page.getByText('Autosave saved')).toBeVisible({timeout: 5_000})
  await expect(page.getByRole('button', {name: 'Apply changes'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Deactivate'})).toHaveCount(0)

  await page.getByRole('button', {name: 'Add processor'}).click()
  const visibleMenu = page.locator('.ant-dropdown-menu:visible')
  await expect.poll(async () => (await visibleMenu.boundingBox())?.width ?? 0).toBeGreaterThan(120)
  const firstMenu = await visibleMenu.boundingBox()
  expect(firstMenu).not.toBeNull()
  expect(firstMenu!.width).toBeGreaterThan(120)
  expect(firstMenu!.width).toBeLessThan(520)
  await page.keyboard.press('Escape')
  await page.getByRole('button', {name: /Zoom out/i}).click()
  await page.getByRole('button', {name: /Zoom out/i}).click()
  await page.getByRole('button', {name: 'Add processor'}).click()
  await expect.poll(async () => (await visibleMenu.boundingBox())?.width ?? 0).toBeGreaterThan(120)
  const zoomedMenu = await visibleMenu.boundingBox()
  expect(zoomedMenu).not.toBeNull()
  expect(Math.abs(zoomedMenu!.width - firstMenu!.width)).toBeLessThan(3)
  await expectAccessible(page)
})

test('@release runtime explanation is human-first and speaker states are spatially stable', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  await page.goto(`${ADMIN_BASE_URL}/graphs/edit/graph-1`)
  await page.getByRole('tab', {name: 'Resolved & runtime explanation'}).click()
  await expect(page.getByRole('heading', {name: 'Resolved audio'})).toBeVisible()
  for (const heading of ['Result', 'Audio path', 'Why this route', 'Signal and processing', 'Transition']) {
    await expect(page.getByText(heading, {exact: true}).first()).toBeVisible()
  }
  await expect(page.getByText('Headset disconnected')).toBeVisible()
  await expect(page.getByText('Device is disconnected')).toBeVisible()
  await expect(page.getByText('Technical details')).toBeVisible()
  await expect(page.getByText('system-correlation-1')).toHaveCount(0)
  await expectAccessible(page)

  let state = {
    active: false,
    token: null as string | null,
    runtimeKey: null as string | null,
    outputName: null as string | null,
    channel: null as string | null,
    startedAt: null as string | null,
    endsAt: null as string | null,
    durationMs: null as number | null,
  }
  let failNext = false
  await page.route('**/api/audio/v1/speaker-test', async (route) => {
    const method = route.request().method()
    if (method === 'GET') return fulfill(route, {outputs: [adminUxFixture.speakerOutput], active: state})
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (method === 'POST') {
      if (failNext) return fulfill(route, {detail: 'Test output disappeared.'}, 409)
      const request = route.request().postDataJSON()
      state = {...state, active: true, token: 'tone-1', runtimeKey: request.runtimeKey, outputName: 'Main speakers', channel: request.channel, startedAt: observedAt, endsAt: observedAt, durationMs: 2_000}
      return fulfill(route, state)
    }
    state = {...state, active: false, token: null, channel: null}
    return fulfill(route, state)
  })
  await page.goto(`${ADMIN_BASE_URL}/speaker-test`)
  const firstChannel = page.getByRole('button', {name: 'FL · Front left'})
  const centerChannel = page.getByRole('button', {name: 'FC · Front center'})
  const inactiveBox = await firstChannel.boundingBox()
  await centerChannel.click()
  await expect(page.getByText('Starting FC…')).toBeVisible()
  expect(await firstChannel.boundingBox()).toEqual(inactiveBox)
  await expect(page.getByText(/Testing FC on Main speakers/)).toBeVisible()
  expect(await firstChannel.boundingBox()).toEqual(inactiveBox)
  await page.getByRole('button', {name: 'Stop speaker test'}).click()
  await expect(page.getByText('Stopping the test tone…')).toBeVisible()
  expect(await firstChannel.boundingBox()).toEqual(inactiveBox)
  await expect(page.getByRole('button', {name: 'Stop speaker test'})).toBeDisabled()
  failNext = true
  await centerChannel.click()
  await expect(page.getByText('Speaker test failed')).toBeVisible()
  expect(await firstChannel.boundingBox()).toEqual(inactiveBox)
  await expectAccessible(page)
})

test('records desktop, narrow, light, and dark visual references', async ({page}) => {
  test.setTimeout(90_000)
  const pages = [
    ['/dashboard', 'Dashboard', 'dashboard'],
    ['/devices', 'Devices', 'device-discovery'],
    ['/managed-resources', 'Managed resources', 'managed-resources'],
    ['/graphs', 'Audio graphs', 'graph-list'],
    ['/graphs/edit/graph-1', 'Advanced desired graph', 'graph-editor'],
    ['/speaker-test', 'Speaker test', 'speaker-test'],
  ] as const
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript((colorMode) => window.localStorage.setItem('colorMode', colorMode), theme)
    for (const viewport of [{name: 'desktop', width: 1440, height: 1000}, {name: 'narrow', width: 390, height: 844}]) {
      await page.setViewportSize(viewport)
      for (const [route, heading, name] of pages) {
        await page.goto(`${ADMIN_BASE_URL}${route}`)
        await expect(page.getByRole('heading', {name: heading})).toBeVisible()
        await capture(page, `${name}-${theme}-${viewport.name}`)
      }
      await page.goto(`${ADMIN_BASE_URL}/graphs/edit/graph-1`)
      await page.getByRole('tab', {name: 'Resolved & runtime explanation'}).click()
      await expect(page.getByRole('heading', {name: 'Resolved audio'})).toBeVisible()
      await capture(page, `runtime-explanation-${theme}-${viewport.name}`)
    }
  }
  await page.setViewportSize({width: 1440, height: 1000})
  await page.goto(`${ADMIN_BASE_URL}/speaker-test`)
  await recordLayout('speaker-test-inactive', {
    selector: page.getByLabel('Speaker output'),
    firstChannel: page.getByRole('button', {name: 'FL · Front left'}),
    stop: page.getByRole('button', {name: 'Stop speaker test'}),
  })
})
