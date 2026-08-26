import type {
  DesiredGraphDocumentDto,
  GraphEdgeDto,
  GraphNodeDto,
  JsonObject,
  SelectorRuleDraft,
} from './types'

function conditionExpression(rule: SelectorRuleDraft): JsonObject {
  if (rule.operator === 'exists') return { op: 'exists', fact: rule.fact }
  return {
    op: rule.operator === 'equals' ? 'eq' : 'neq',
    fact: rule.fact,
    value: rule.value ?? null,
  }
}

function not(expression: JsonObject): JsonObject {
  return { op: 'not', arg: expression }
}

function all(expressions: JsonObject[]): JsonObject {
  return expressions.length === 1 ? expressions[0] : { op: 'all', args: expressions }
}

export function compileSelectorRules(
  graphId: string,
  name: string,
  inputEndpointId: string,
  rules: SelectorRuleDraft[],
  scene = 'cinema',
): DesiredGraphDocumentDto {
  const ordered = [...rules].sort((left, right) => right.priority - left.priority)
  const nodes: GraphNodeDto[] = [
    {
      id: 'source',
      type: 'core.endpoint-reference',
      version: 1,
      configuration: { logicalEndpointId: inputEndpointId, direction: 'input' },
      layout: { x: 0, y: 160 },
    },
    {
      id: 'rule-fan-out',
      type: 'core.fan-out',
      version: 1,
      configuration: { failureMode: 'best-effort' },
      layout: { x: 280, y: 160 },
    },
  ]
  const edges: GraphEdgeDto[] = [
    {
      id: 'edge:source-to-rule-fan-out',
      from: { node: 'source', port: 'output' },
      to: { node: 'rule-fan-out', port: 'input' },
    },
  ]
  const conditions = ordered.map((rule) => ({
    id: `condition:${rule.id}`,
    expression: conditionExpression(rule),
  }))
  const previous: JsonObject[] = []
  ordered.forEach((rule, index) => {
    const expression = conditionExpression(rule)
    const winningExpression = all([expression, ...previous.map(not)])
    const outputNodeId = `output:${rule.id}`
    nodes.push({
      id: outputNodeId,
      type: 'core.endpoint-reference',
      version: 1,
      configuration: { logicalEndpointId: rule.thenEndpointId, direction: 'output' },
      condition: { expression: winningExpression, unknownResult: 'waiting' },
      layout: { x: 580 + index * 240, y: 80 + index * 140 },
    })
    edges.push({
      id: `edge:${rule.id}:then`,
      from: { node: 'rule-fan-out', port: 'outputs' },
      to: { node: outputNodeId, port: 'input' },
    })
    previous.push(expression)
  })
  const fallbackEndpoint = [...ordered]
    .reverse()
    .find((rule) => rule.otherwiseEndpointId)?.otherwiseEndpointId
  if (fallbackEndpoint) {
    const fallbackExpression = not(
      previous.length === 1 ? previous[0] : { op: 'any', args: previous },
    )
    nodes.push({
      id: 'output:fallback',
      type: 'core.endpoint-reference',
      version: 1,
      configuration: { logicalEndpointId: fallbackEndpoint, direction: 'output' },
      condition: { expression: fallbackExpression, unknownResult: 'waiting' },
      layout: { x: 580, y: 80 + ordered.length * 140 },
    })
    edges.push({
      id: 'edge:fallback',
      from: { node: 'rule-fan-out', port: 'outputs' },
      to: { node: 'output:fallback', port: 'input' },
    })
  }
  return {
    schemaVersion: 1,
    id: graphId,
    kind: 'graph',
    metadata: { name },
    parameters: [],
    publicPorts: [],
    conditions,
    nodes,
    edges,
    layout: { editor: 'rules-v1' },
    extensions: {
      simpleRules: {
        version: 1,
        inputEndpointId,
        scene,
        rules: ordered as unknown as JsonObject[],
      },
    },
  }
}

export function selectorRulesFromDocument(document: DesiredGraphDocumentDto): {
  supported: boolean
  inputEndpointId: string
  scene: string
  rules: SelectorRuleDraft[]
} {
  const extension = document.extensions?.simpleRules
  if (typeof extension !== 'object' || extension === null || Array.isArray(extension)) {
    return {supported: document.nodes.length === 0, inputEndpointId: '', scene: 'cinema', rules: []}
  }
  const candidate = extension as JsonObject
  return {
    supported: candidate.version === 1 && Array.isArray(candidate.rules),
    inputEndpointId: typeof candidate.inputEndpointId === 'string' ? candidate.inputEndpointId : '',
    scene: typeof candidate.scene === 'string' ? candidate.scene : 'cinema',
    rules: Array.isArray(candidate.rules) ? candidate.rules as unknown as SelectorRuleDraft[] : [],
  }
}

export function readableRule(rule: SelectorRuleDraft, endpointNames: Record<string, string>): string {
  const value = rule.operator === 'exists' ? '' : ` ${String(rule.value)}`
  const fallback = rule.otherwiseEndpointId
    ? `, OTHERWISE use ${endpointNames[rule.otherwiseEndpointId] ?? rule.otherwiseEndpointId}`
    : ''
  return `WHEN ${rule.fact} ${rule.operator}${value}, THEN use ${
    endpointNames[rule.thenEndpointId] ?? rule.thenEndpointId
  }${fallback}`
}
