import {useEffect, useMemo, useState} from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type Viewport,
} from 'reactflow'
import 'reactflow/dist/style.css'
import './reactflow-custom.css'
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Modal,
  Col,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
  theme,
} from 'antd'
import {
  ApartmentOutlined,
  ApiOutlined,
  BuildOutlined,
  ExportOutlined,
  ImportOutlined,
  PartitionOutlined,
} from '@ant-design/icons'
import type {
  CamillaDSPProfileDto,
  CurrentPlanDto,
  DesiredGraphDocumentDto,
  GraphDefinitionDto,
  GraphNodeDto,
  GraphRevisionDto,
  JsonObject,
  JsonValue,
  LogicalEndpointDto,
  NodePortDto,
  NodeTypeDto,
  RuntimeProjectionDto,
  ValidationIssueDto,
} from '@open-cinema/shared'
import {getLayoutedNodes} from '@/hooks/useLayoutNodes'
import {createClientId} from './clientId'
import {GraphNodeCard, type GraphNodeData} from './GraphNodeCard'
import {GraphNodeInspector} from './GraphNodeInspector'
import {GraphInterfaceEditor, KeyValueBindings} from './GraphInterfaceEditor'

const {Text, Title} = Typography
const nodeTypes = {orchestration: GraphNodeCard}

interface SubgraphOption {
  definition: GraphDefinitionDto
  revisions: GraphRevisionDto[]
}

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function compatible(source: NodePortDto | undefined, target: NodePortDto | undefined): boolean {
  if (!source || !target || source.direction !== 'output' || target.direction !== 'input') return false
  if (source.contract.mediaKind !== target.contract.mediaKind) return false
  const sourceContent = source.contract.content ?? 'any'
  const targetContent = target.contract.content ?? 'any'
  return sourceContent === 'any' || targetContent === 'any' || sourceContent === targetContent
}

function defaultValue(schema: JsonObject): JsonValue | undefined {
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]
  if (schema.type === 'boolean') return false
  if (schema.type === 'integer' || schema.type === 'number') return 0
  if (schema.type === 'array') return []
  if (schema.type === 'object') return {}
  if (schema.type === 'string') return ''
  return undefined
}

function defaultConfiguration(
  definition: NodeTypeDto,
  endpoints: LogicalEndpointDto[],
  profiles: CamillaDSPProfileDto[],
): JsonObject {
  const schema = definition.configurationSchema
  const properties = object(schema.properties)
  const required = Array.isArray(schema.required) ? schema.required.map(String) : []
  const configuration: JsonObject = {}
  for (const name of required) {
    const value = defaultValue(object(properties[name]))
    if (value !== undefined) configuration[name] = value
  }
  if (definition.id === 'processor.pcm-auto-decoder') {
    return {
      pcmBehavior: 'bypass',
      encodedBehavior: 'decode',
      unsupportedBehavior: 'error',
      supportedCodecs: ['ac3', 'eac3', 'dts'],
      minimumConfidence: 0.7,
    }
  }
  if (definition.id === 'processor.camilladsp-profile-selector') {
    const profile = profiles[0]
    return profile
      ? {profileId: profile.profileId, profileVersion: profile.version, parameterBindings: {}, bypassAllowed: false}
      : {profileId: '', profileVersion: 1, parameterBindings: {}, bypassAllowed: false}
  }
  if (definition.id === 'core.endpoint-reference') {
    const endpoint = endpoints[0]
    return {logicalEndpointId: endpoint?.id ?? '', direction: endpoint?.direction ?? 'output'}
  }
  if (definition.id === 'core.conditional-bypass') {
    const endpoint = endpoints[0]
    return {
      condition: {
        op: 'exists',
        fact: endpoint ? `endpoint.${endpoint.id}.availability` : '',
      },
      unknownResult: 'bypass',
    }
  }
  return configuration
}

function nodeIssueMap(document: DesiredGraphDocumentDto, issues: ValidationIssueDto[]) {
  return new Map(
    document.nodes.map((node, index) => [
      node.id,
      issues.filter((issue) => issue.path === `$.nodes[${index}]` || issue.path.startsWith(`$.nodes[${index}].`)),
    ]),
  )
}

function edgeIssues(document: DesiredGraphDocumentDto, edgeId: string, issues: ValidationIssueDto[]) {
  const index = document.edges.findIndex((edge) => edge.id === edgeId)
  return issues.filter((issue) => issue.path === `$.edges[${index}]` || issue.path.startsWith(`$.edges[${index}].`))
}

function runtimeForNode(node: GraphNodeDto, runtime: RuntimeProjectionDto[]) {
  return runtime.find((projection) => {
    const payload = projection.payload
    return payload.nodeId === node.id || payload.graphNodeId === node.id || payload.nodeType === node.type
  })
}

export interface AdvancedGraphEditorProps {
  value: DesiredGraphDocumentDto
  savedValue: DesiredGraphDocumentDto
  editable: boolean
  catalogue: NodeTypeDto[]
  endpoints: LogicalEndpointDto[]
  profiles: CamillaDSPProfileDto[]
  validationIssues: ValidationIssueDto[]
  currentPlan: CurrentPlanDto | null
  runtime: RuntimeProjectionDto[]
  subgraphs: SubgraphOption[]
  onChange: (value: DesiredGraphDocumentDto) => void
  onCreateSubgraph: () => Promise<void>
  onPreviewUpgrade: (currentRevisionId: string, targetRevisionId: string) => Promise<string>
}

export function AdvancedGraphEditor({
  value,
  savedValue,
  editable,
  catalogue,
  endpoints,
  profiles,
  validationIssues,
  currentPlan,
  runtime,
  subgraphs,
  onChange,
  onCreateSubgraph,
  onPreviewUpgrade,
}: AdvancedGraphEditorProps) {
  const {token} = theme.useToken()
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const definitions = useMemo(
    () => new Map(catalogue.map((item) => [`${item.id}:${item.version}`, item])),
    [catalogue],
  )
  const issuesByNode = useMemo(() => nodeIssueMap(value, validationIssues), [value, validationIssues])
  const activeNodeIds = new Set(strings(object(currentPlan?.plan?.document.paths).activeNodeIds))
  const activeEdgeIds = new Set(strings(object(currentPlan?.plan?.document.paths).selectedEdgeIds))
  const runtimeEndpointIds = new Set(
    Array.isArray(currentPlan?.plan?.document.endpointBindings)
      ? currentPlan.plan.document.endpointBindings
        .filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item) && item.runtimeKey)
        .map((item) => String((item as JsonObject).logicalEndpointId))
      : [],
  )
  const savedNodes = useMemo(() => new Map(savedValue.nodes.map((node) => [node.id, node])), [savedValue])

  const updateNode = (node: GraphNodeDto) => {
    if (!editable) return
    onChange({...value, nodes: value.nodes.map((item) => item.id === node.id ? node : item)})
  }
  const removeNode = (nodeId: string) => {
    if (!editable) return
    onChange({
      ...value,
      nodes: value.nodes.filter((node) => node.id !== nodeId),
      edges: value.edges.filter((edge) => edge.from.node !== nodeId && edge.to.node !== nodeId),
    })
  }
  const buildNodes = (): Array<Node<GraphNodeData>> => value.nodes.map((node, index) => {
    const definition = definitions.get(`${node.type}:${node.version}`)
    const desiredEndpoint = String(node.configuration.logicalEndpointId ?? '')
    return {
      id: node.id,
      type: 'orchestration',
      focusable: false,
      selected: selectedNodeId === node.id,
      position: {x: node.layout?.x ?? index * 300, y: node.layout?.y ?? 120},
      data: {
        graphNode: node,
        definition,
        issues: issuesByNode.get(node.id) ?? [],
        resolved: activeNodeIds.has(node.id),
        observed: runtimeEndpointIds.has(desiredEndpoint) || Boolean(runtimeForNode(node, runtime)),
        runtime: runtimeForNode(node, runtime),
        dirty: JSON.stringify(savedNodes.get(node.id)) !== JSON.stringify(node),
        editable,
        onSelect: setSelectedNodeId,
      },
    }
  })
  const [nodes, setNodes] = useState<Array<Node<GraphNodeData>>>(buildNodes)
  useEffect(() => setNodes(buildNodes()), [value, catalogue, endpoints, profiles, validationIssues, currentPlan, runtime, editable, selectedNodeId])

  const flowEdges: Edge[] = value.edges.map((edge) => ({
    id: edge.id,
    source: edge.from.node,
    sourceHandle: edge.from.port,
    target: edge.to.node,
    targetHandle: edge.to.port,
    animated: activeEdgeIds.has(edge.id),
    style: {
      stroke: edgeIssues(value, edge.id, validationIssues).length
        ? token.colorError
        : activeEdgeIds.has(edge.id)
          ? token.colorSuccess
          : token.colorTextSecondary,
      strokeWidth: activeEdgeIds.has(edge.id) ? 3 : 2,
    },
  }))

  const port = (nodeId: string | null, portName: string | null, direction: 'input' | 'output') => {
    const graphNode = value.nodes.find((node) => node.id === nodeId)
    return definitions
      .get(`${graphNode?.type}:${graphNode?.version}`)
      ?.ports.find((item) => item.name === portName && item.direction === direction)
  }
  const validConnection = (connection: Connection | Edge) => compatible(
    port(connection.source, connection.sourceHandle ?? null, 'output'),
    port(connection.target, connection.targetHandle ?? null, 'input'),
  )
  const connect = (connection: Connection) => {
    if (!editable) return
    if (!validConnection(connection)) {
      message.error('These ports have incompatible direction, media, or signal contracts.')
      return
    }
    const next = addEdge(connection, flowEdges)
    const added = next[next.length - 1]
    onChange({
      ...value,
      edges: [
        ...value.edges,
        {
          id: `edge:${createClientId()}`,
          from: {node: added.source, port: added.sourceHandle ?? ''},
          to: {node: added.target, port: added.targetHandle ?? ''},
        },
      ],
    })
  }
  const changeNodes = (changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, nodes)
    setNodes(next)
    const moved = changes.filter(
      (change): change is Extract<NodeChange, {type: 'position'}> =>
        change.type === 'position' && change.dragging === false && Boolean(change.position),
    )
    const changedPosition = moved.some((change) => {
      const graphNode = value.nodes.find((node) => node.id === change.id)
      return graphNode && change.position && (
        Math.abs((graphNode.layout?.x ?? 0) - change.position.x) > 0.5 ||
        Math.abs((graphNode.layout?.y ?? 0) - change.position.y) > 0.5
      )
    })
    if (!editable || !changedPosition) return
    const positions = new Map(next.map((node) => [node.id, node.position]))
    onChange({
      ...value,
      nodes: value.nodes.map((node) => ({
        ...node,
        layout: {
          x: positions.get(node.id)?.x ?? node.layout?.x ?? 0,
          y: positions.get(node.id)?.y ?? node.layout?.y ?? 0,
          collapsed: node.layout?.collapsed,
        },
      })),
    })
  }

  const addDefinition = (definition: NodeTypeDto, configuration?: JsonObject) => {
    if (!editable) return
    const node: GraphNodeDto = {
      id: `node:${createClientId()}`,
      type: definition.id,
      version: definition.version,
      configuration: configuration ?? defaultConfiguration(definition, endpoints, profiles),
      layout: {x: 100 + value.nodes.length * 55, y: 100 + value.nodes.length * 35},
    }
    onChange({...value, nodes: [...value.nodes, node]})
  }
  const endpointDefinition = catalogue.find((item) => item.id === 'core.endpoint-reference')
  const endpointMenu = (direction: 'input' | 'output') => ({
    items: [
      ...endpoints.filter((endpoint) => endpoint.direction === direction).map((endpoint) => ({
        key: endpoint.id,
        label: endpoint.name,
        onClick: () => endpointDefinition && addDefinition(endpointDefinition, {
          logicalEndpointId: endpoint.id,
          direction,
        }),
      })),
      {
        key: 'unbound',
        label: `Unbound ${direction}`,
        onClick: () => endpointDefinition && addDefinition(endpointDefinition, {
          logicalEndpointId: '',
          direction,
        }),
      },
    ],
  })
  const definitionMenu = (items: NodeTypeDto[]) => ({
    items: items.map((definition) => ({
      key: `${definition.id}:${definition.version}`,
      label: (
        <Space>
          <span>{definition.displayName}</span>
          {definition.source === 'plugin' && <Tag color="purple">plugin</Tag>}
          {!definition.available && <Tag color="red">unavailable</Tag>}
        </Space>
      ),
      disabled: !definition.available,
      onClick: () => addDefinition(definition),
    })),
  })

  const [subgraphModal, setSubgraphModal] = useState(false)
  const [subgraphDefinitionId, setSubgraphDefinitionId] = useState<string>()
  const [subgraphRevisionId, setSubgraphRevisionId] = useState<string>()
  const [selectedSubgraphNodeId, setSelectedSubgraphNodeId] = useState<string>()
  const [upgradeMessage, setUpgradeMessage] = useState<string>()
  const selectedSubgraphNode = value.nodes.find((node) => node.id === selectedSubgraphNodeId && node.subgraph)
  const insertSubgraph = () => {
    if (!subgraphDefinitionId || !subgraphRevisionId || !editable) return
    const definition = catalogue.find((item) => item.id === 'core.subgraph-instance')
    if (!definition) return
    const node: GraphNodeDto = {
      id: `subgraph:${createClientId()}`,
      type: definition.id,
      version: definition.version,
      configuration: {},
      subgraph: {
        definitionId: subgraphDefinitionId,
        revisionId: subgraphRevisionId,
        parameterBindings: {},
        portBindings: {},
      },
      layout: {x: 180, y: 180, collapsed: true},
    }
    onChange({...value, nodes: [...value.nodes, node]})
    setSubgraphModal(false)
  }

  const autoLayout = async () => {
    const layouted = await getLayoutedNodes(nodes, flowEdges)
    const positions = new Map(layouted.map((node) => [node.id, node.position]))
    onChange({
      ...value,
      nodes: value.nodes.map((node) => ({
        ...node,
        layout: {
          x: positions.get(node.id)?.x ?? 0,
          y: positions.get(node.id)?.y ?? 0,
          collapsed: node.layout?.collapsed,
        },
      })),
    })
  }

  const savedViewport = object(object(value.layout).viewport)
  const defaultViewport: Viewport = {
    x: typeof savedViewport.x === 'number' ? savedViewport.x : 0,
    y: typeof savedViewport.y === 'number' ? savedViewport.y : 0,
    zoom: typeof savedViewport.zoom === 'number' ? savedViewport.zoom : 1,
  }
  const persistViewport = (_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (!editable) return
    const changed = Math.abs(defaultViewport.x - viewport.x) > 0.5
      || Math.abs(defaultViewport.y - viewport.y) > 0.5
      || Math.abs(defaultViewport.zoom - viewport.zoom) > 0.001
    if (!changed) return
    onChange({...value, layout: {...value.layout, viewport}})
  }
  const selectedNode = value.nodes.find((node) => node.id === selectedNodeId)
  const selectedDefinition = selectedNode
    ? definitions.get(`${selectedNode.type}:${selectedNode.version}`)
    : undefined

  return (
    <section aria-labelledby="advanced-editor-title">
      <Title level={4} id="advanced-editor-title">Advanced desired graph</Title>
      <Card
        size="small"
        styles={{body: {padding: 0}}}
        title={
          <Space wrap>
            <Dropdown menu={endpointMenu('input')} disabled={!editable}>
              <Button icon={<ImportOutlined/>}>Add audio input</Button>
            </Dropdown>
            <Dropdown menu={endpointMenu('output')} disabled={!editable}>
              <Button icon={<ExportOutlined/>}>Add audio output</Button>
            </Dropdown>
            <Dropdown menu={definitionMenu(catalogue.filter((item) => item.category === 'processing'))} disabled={!editable}>
              <Button icon={<BuildOutlined/>}>Add processor</Button>
            </Dropdown>
            <Dropdown menu={definitionMenu(catalogue.filter((item) => ['routing', 'control'].includes(item.category)))} disabled={!editable}>
              <Button icon={<ApiOutlined/>}>Add routing / control</Button>
            </Dropdown>
            <Dropdown
              menu={{
                items: [
                  {key: 'insert', label: 'Insert pinned subgraph', onClick: () => setSubgraphModal(true)},
                  {key: 'create', label: 'Create reusable subgraph', onClick: () => void onCreateSubgraph()},
                  ...value.nodes.filter((node) => node.subgraph).map((node) => ({
                    key: node.id,
                    label: `Configure ${node.id}`,
                    onClick: () => setSelectedSubgraphNodeId(node.id),
                  })),
                ],
              }}
              disabled={!editable}
            >
              <Button icon={<ApartmentOutlined/>}>Subgraphs</Button>
            </Dropdown>
            <Button icon={<PartitionOutlined/>} disabled={!editable || nodes.length === 0} onClick={() => void autoLayout()}>
              Auto Layout
            </Button>
          </Space>
        }
      >
        {validationIssues.length > 0 && (
          <Alert
            type={validationIssues.some((issue) => issue.severity !== 'warning') ? 'error' : 'warning'}
            showIcon
            message={`${validationIssues.length} graph validation issue(s)`}
            description={validationIssues.slice(0, 4).map((issue) => <div key={`${issue.path}:${issue.code}`}>{issue.path}: {issue.message}</div>)}
          />
        )}
        <Row gutter={[16, 16]} style={{padding: 12}}>
          <Col xs={24} xl={17}>
            <div style={{height: 650, background: token.colorBgContainer}}>
              {nodes.length === 0 ? (
                <Empty description={editable ? 'Use the toolbar to add the first graph node.' : 'This revision has no nodes.'} style={{paddingTop: 180}}/>
              ) : (
                <ReactFlow
                  key={value.id}
                  nodes={nodes}
                  edges={flowEdges}
                  nodeTypes={nodeTypes}
                  defaultViewport={defaultViewport}
                  onMoveEnd={persistViewport}
                  onNodesChange={changeNodes}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(undefined)}
                  onConnect={connect}
                  isValidConnection={validConnection}
                  onNodesDelete={(deleted) => editable && onChange({
                    ...value,
                    nodes: value.nodes.filter((node) => !deleted.some((item) => item.id === node.id)),
                    edges: value.edges.filter((edge) => !deleted.some((item) => item.id === edge.from.node || item.id === edge.to.node)),
                  })}
                  onEdgesDelete={(deleted) => editable && onChange({...value, edges: value.edges.filter((edge) => !deleted.some((item) => item.id === edge.id))})}
                  nodesDraggable={editable}
                  nodesConnectable={editable}
                  edgesFocusable={editable}
                  deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
                >
                  <Background variant={BackgroundVariant.Dots}/>
                  <Controls/>
                  <MiniMap/>
                </ReactFlow>
              )}
            </div>
          </Col>
          <Col xs={24} xl={7}>
            <div style={{maxHeight: 650, overflowY: 'auto'}}>
              <GraphNodeInspector
                node={selectedNode}
                definition={selectedDefinition}
                endpoints={endpoints}
                profiles={profiles}
                nodes={value.nodes}
                definitions={catalogue}
                parameters={value.parameters}
                issues={selectedNode ? issuesByNode.get(selectedNode.id) ?? [] : []}
                editable={editable}
                onChange={updateNode}
                onRemove={(nodeId) => {
                  removeNode(nodeId)
                  setSelectedNodeId(undefined)
                }}
              />
            </div>
          </Col>
        </Row>
        <Space wrap style={{padding: 12}} aria-label="Graph representation legend">
          <Tag>Desired graph</Tag>
          <Tag color="green">Resolved selection</Tag>
          <Tag color="blue">Observed runtime</Tag>
          <Tag color="red">Validation error</Tag>
          <Text type="secondary">Overlays never modify the saved desired graph.</Text>
        </Space>
      </Card>

      {value.kind === 'subgraph' && (
        <GraphInterfaceEditor value={value} catalogue={catalogue} editable={editable} onChange={onChange}/>
      )}

      <Modal
        title="Insert a pinned reusable subgraph"
        open={subgraphModal}
        okButtonProps={{disabled: !subgraphDefinitionId || !subgraphRevisionId}}
        onOk={insertSubgraph}
        onCancel={() => setSubgraphModal(false)}
      >
        <Space direction="vertical" style={{width: '100%'}}>
          <Select
            aria-label="Subgraph definition"
            placeholder="Choose subgraph"
            options={subgraphs.map((item) => ({value: item.definition.id, label: item.definition.name}))}
            onChange={(definitionId) => {
              setSubgraphDefinitionId(definitionId)
              setSubgraphRevisionId(undefined)
            }}
          />
          <Select
            aria-label="Pinned subgraph revision"
            placeholder="Choose published revision"
            options={subgraphs
              .find((item) => item.definition.id === subgraphDefinitionId)
              ?.revisions.filter((revision) => revision.state === 'published')
              .map((revision) => ({value: revision.id, label: `revision ${revision.revisionNumber}`})) ?? []}
            onChange={setSubgraphRevisionId}
          />
        </Space>
      </Modal>

      <Modal
        title="Pinned subgraph interface and upgrade"
        open={Boolean(selectedSubgraphNode)}
        footer={null}
        onCancel={() => {
          setSelectedSubgraphNodeId(undefined)
          setUpgradeMessage(undefined)
        }}
      >
        {selectedSubgraphNode?.subgraph && (
          <Space direction="vertical" style={{width: '100%'}}>
            <Text>Definition {selectedSubgraphNode.subgraph.definitionId}</Text>
            <Select
              aria-label="Pinned subgraph version"
              value={selectedSubgraphNode.subgraph.revisionId}
              options={subgraphs
                .find((item) => item.definition.id === selectedSubgraphNode.subgraph?.definitionId)
                ?.revisions.filter((revision) => revision.state === 'published')
                .map((revision) => ({value: revision.id, label: `revision ${revision.revisionNumber}`})) ?? []}
              onChange={async (targetRevisionId) => {
                const preview = await onPreviewUpgrade(selectedSubgraphNode.subgraph!.revisionId, targetRevisionId)
                setUpgradeMessage(preview)
                Modal.confirm({
                  title: 'Upgrade this pinned subgraph?',
                  content: preview,
                  okText: 'Upgrade draft',
                  onOk: () => updateNode({
                    ...selectedSubgraphNode,
                    subgraph: {...selectedSubgraphNode.subgraph!, revisionId: targetRevisionId},
                  }),
                })
              }}
            />
            {upgradeMessage && <Alert type="info" showIcon message="Compatibility preview" description={upgradeMessage}/>}
            <Text strong>Parameter bindings</Text>
            <KeyValueBindings
              value={selectedSubgraphNode.subgraph.parameterBindings ?? {}}
              onChange={(bindings) => updateNode({
                ...selectedSubgraphNode,
                subgraph: {...selectedSubgraphNode.subgraph!, parameterBindings: bindings},
              })}
            />
            <Text strong>Public port bindings</Text>
            <KeyValueBindings
              stringValues
              value={selectedSubgraphNode.subgraph.portBindings ?? {}}
              onChange={(bindings) => updateNode({
                ...selectedSubgraphNode,
                subgraph: {...selectedSubgraphNode.subgraph!, portBindings: bindings as Record<string, string>},
              })}
            />
          </Space>
        )}
      </Modal>
    </section>
  )
}
