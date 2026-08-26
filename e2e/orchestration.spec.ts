import {expect, test, type Page, type Route} from '@playwright/test'
import axe from 'axe-core'

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

const page = (items: unknown[]) => ({items, pagination: {limit: 50, offset: 0, total: items.length, nextOffset: null}})

async function capture(pageUnderTest: Page, name: string) {
  if (process.env.UPDATE_UI_REFERENCES === '1') {
    await pageUnderTest.screenshot({path: `docs/ui-current/${name}.png`, fullPage: true})
  }
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
  let applied = false
  await pageUnderTest.route('**/api/audio/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path.endsWith('/schema')) return fulfill(route, metadata)
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
    if (path.endsWith('/graphs/graph-1/activation')) return fulfill(route, {definitionId: graph.id, revisionId: 'published-1', desiredStateVersion: 2})
    if (path.endsWith('/node-types')) return fulfill(route, {schemaVersion: 1, items: nodeTypes})
    if (path.endsWith('/camilladsp/profiles')) return fulfill(route, page([profile]))
    if (path.endsWith('/plans/current')) {
      return fulfill(route, {items: applied ? [{
        definitionId: graph.id,
        applied: {status: 'converged', currentPlanId: 'plan-2', previousPlanId: 'plan-1', transitionGeneration: 3, correlationId: 'correlation-2', lastError: null, updatedAt: '2026-08-23T12:01:00Z'},
        plan: {id: 'plan-2', schemaVersion: 1, definitionId: graph.id, revisionId: 'draft-2', desiredStateVersion: 3, worldGeneration: 1, worldSequence: 2, runtimeVersion: '1:2', resolutionMode: 'live', status: 'resolved', document: {paths: {activeNodeIds: ['source', 'decoder', 'room-dsp', 'speakers'], selectedEdgeIds: ['edge-source-decoder', 'edge-decoder-dsp', 'edge-dsp-output']}, endpointBindings: []}, explanation: {summary: {selectedEndpoints: ['endpoint-tv', 'endpoint-speakers'], selectedEdges: []}, stages: []}, planDigest: 'plan', correlationId: 'correlation-2', applied: {status: 'converged', currentPlanId: 'plan-2', previousPlanId: 'plan-1', transitionGeneration: 3, correlationId: 'correlation-2', lastError: null, updatedAt: '2026-08-23T12:01:00Z'}, createdAt: '2026-08-23T12:01:00Z'},
      }] : []})
    }
    if (path.endsWith('/runtime/snapshot')) return fulfill(route, {representation: 'observedRuntime', runtimeAvailable: true, worldGeneration: 1, worldSequence: 2, items: [...endpointProjections, processorProjection]})
    if (path.endsWith('/runtime/readiness')) return fulfill(route, {ready: true, diagnosticsAvailable: true, desiredEditingAvailable: true, liveControlsAvailable: true, blockers: [], features: {}, runtime: {available: true, worldGeneration: 1, worldSequence: 2}, processorsReady: true})
    if (path.endsWith('/runtime/resources')) return fulfill(route, {items: [processorProjection]})
    if (path.endsWith('/runtime/processors')) return fulfill(route, {items: [processorProjection]})
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

test.beforeEach(async ({page: pageUnderTest}) => {
  await installEventSource(pageUnderTest)
  await installAuth(pageUnderTest)
  await installApi(pageUnderTest)
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

test('management shell retains dashboard and dedicated device discovery', async ({page}) => {
  await page.goto(`${ADMIN_BASE_URL}/dashboard`)
  await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
  await expect(page.getByRole('menuitem', {name: /Devices/})).toBeVisible()
  await expect(page.getByText('TV / SPDIF')).toBeVisible()
  await capture(page, 'dashboard')

  await page.getByRole('menuitem', {name: /Devices/}).click()
  await expect(page.getByRole('heading', {name: 'Devices'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Refresh Devices'})).toBeVisible()
  await expect(page.getByText('Managed processor resources')).toBeVisible()
  await expect(page.getByText('camilladsp:0')).toBeVisible()
  await expect(page.getByText('Headset')).toBeVisible()
  await expect(page.getByText('no_match')).toBeVisible()
  await expectAccessible(page)
  await capture(page, 'device-discovery')
})

test('advanced graph preserves direct manipulation and explicit Save / Apply', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', {configurable: true, value: undefined})
  })
  await page.addInitScript(() => window.localStorage.setItem('colorMode', 'dark'))
  await page.goto(`${ADMIN_BASE_URL}/graphs/edit/graph-1`)
  await expect(page.getByRole('heading', {name: 'Living room'})).toBeVisible()
  await expect(page.getByRole('heading', {name: 'Advanced desired graph'})).toBeVisible()
  await expect(page.getByText('Adaptive PCM/encoded decoder')).toBeVisible()
  await expect(page.getByText('CamillaDSP profile', {exact: true})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Add audio input'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Add processor'})).toBeVisible()
  await expect(page.getByRole('button', {name: 'Auto Layout'})).toBeVisible()
  await expectAccessible(page)
  await capture(page, 'graph-editor')

  await page.locator('.react-flow__node').filter({hasText: 'Adaptive PCM/encoded decoder'}).click()
  await capture(page, 'graph-editor-selected-node')

  await page.getByRole('button', {name: 'Add processor'}).click()
  await page.getByText('Mixer intent', {exact: true}).click()
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', {name: 'Save draft'}).first().click()
  await expect(page.getByText(/Draft saved as version 2/)).toBeVisible()

  await page.getByRole('button', {name: 'Apply'}).click()
  await expect(page.getByText(/Applied revision converged with status converged/)).toBeVisible()
  await expect(page.getByText('Publish + activate')).toBeVisible()
  await expect(page.getByText('Complete')).toBeVisible()
})
