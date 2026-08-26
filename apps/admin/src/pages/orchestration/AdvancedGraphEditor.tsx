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
} from 'reactflow'
import 'reactflow/dist/style.css'
import './reactflow-custom.css'
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  Modal,
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

function JsonDocumentEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: JsonValue
  onChange: (value: JsonValue) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [error, setError] = useState<string>()
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value])
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        title={label}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => {
          try {
            onChange(JSON.parse(text) as JsonValue)
            setError(undefined)
            setOpen(false)
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught))
          }
        }}
      >
        <Input.TextArea rows={14} value={text} status={error ? 'error' : undefined} onChange={(event) => setText(event.target.value)}/>
        {error && <Text type="danger">{error}</Text>}
      </Modal>
    </>
  )
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
  onSaveDraft: () => Promise<unknown>
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
  onSaveDraft,
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
  const resetNode = (nodeId: string) => {
    const saved = savedNodes.get(nodeId)
    if (saved) updateNode(saved)
  }
  const toggleCollapsed = (nodeId: string) => {
    const node = value.nodes.find((item) => item.id === nodeId)
    if (!node) return
    updateNode({
      ...node,
      layout: {
        x: node.layout?.x ?? 0,
        y: node.layout?.y ?? 0,
        collapsed: !node.layout?.collapsed,
      },
    })
  }

  const buildNodes = (): Array<Node<GraphNodeData>> => value.nodes.map((node, index) => {
    const definition = definitions.get(`${node.type}:${node.version}`)
    const desiredEndpoint = String(node.configuration.logicalEndpointId ?? '')
    return {
      id: node.id,
      type: 'orchestration',
      selected: selectedNodeId === node.id,
      position: {x: node.layout?.x ?? index * 300, y: node.layout?.y ?? 120},
      data: {
        graphNode: node,
        definition,
        endpoints,
        profiles,
        issues: issuesByNode.get(node.id) ?? [],
        resolved: activeNodeIds.has(node.id),
        observed: runtimeEndpointIds.has(desiredEndpoint) || Boolean(runtimeForNode(node, runtime)),
        runtime: runtimeForNode(node, runtime),
        dirty: JSON.stringify(savedNodes.get(node.id)) !== JSON.stringify(node),
        editable,
        onChange: updateNode,
        onReset: resetNode,
        onRemove: removeNode,
        onToggleCollapsed: toggleCollapsed,
        onSaveDraft,
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
        <div style={{height: 650, background: token.colorBgContainer}}>
          {nodes.length === 0 ? (
            <Empty description={editable ? 'Use the toolbar to add the first graph node.' : 'This revision has no nodes.'} style={{paddingTop: 180}}/>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodesChange={changeNodes}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(undefined)}
              onConnect={connect}
              isValidConnection={validConnection}
              onEdgesDelete={(deleted) => editable && onChange({...value, edges: value.edges.filter((edge) => !deleted.some((item) => item.id === edge.id))})}
              nodesDraggable={editable}
              nodesConnectable={editable}
              edgesFocusable={editable}
              deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
              fitView
            >
              <Background variant={BackgroundVariant.Dots}/>
              <Controls/>
              <MiniMap/>
            </ReactFlow>
          )}
        </div>
        <Space wrap style={{padding: 12}} aria-label="Graph representation legend">
          <Tag>Desired graph</Tag>
          <Tag color="green">Resolved selection</Tag>
          <Tag color="blue">Observed runtime</Tag>
          <Tag color="red">Validation error</Tag>
          <Text type="secondary">Overlays never modify the saved desired graph.</Text>
        </Space>
      </Card>

      {value.kind === 'subgraph' && (
        <Card size="small" title="Reusable public interface" style={{marginTop: 16}}>
          <Space wrap>
            <JsonDocumentEditor
              label="Edit public parameters"
              value={value.parameters as unknown as JsonValue}
              onChange={(parameters) => editable && onChange({...value, parameters: parameters as unknown as DesiredGraphDocumentDto['parameters']})}
            />
            <JsonDocumentEditor
              label="Edit public ports"
              value={value.publicPorts as unknown as JsonValue}
              onChange={(publicPorts) => editable && onChange({...value, publicPorts: publicPorts as unknown as DesiredGraphDocumentDto['publicPorts']})}
            />
          </Space>
        </Card>
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
            {upgradeMessage && <Alert type="info" showIcon message="Compatibility preview" description={upgradeMessage}/>
            <JsonDocumentEditor
              label="Edit parameter bindings"
              value={selectedSubgraphNode.subgraph.parameterBindings ?? {}}
              onChange={(bindings) => updateNode({
                ...selectedSubgraphNode,
                subgraph: {...selectedSubgraphNode.subgraph!, parameterBindings: object(bindings)},
              })}
            />
            <JsonDocumentEditor
              label="Edit public port bindings"
              value={selectedSubgraphNode.subgraph.portBindings ?? {}}
              onChange={(bindings) => updateNode({
                ...selectedSubgraphNode,
                subgraph: {...selectedSubgraphNode.subgraph!, portBindings: object(bindings) as Record<string, string>},
              })}
            />
          </Space>
        )}
      </Modal>
    </section>
  )
}
