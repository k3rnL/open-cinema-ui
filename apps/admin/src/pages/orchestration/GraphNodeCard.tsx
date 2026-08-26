import {useEffect, useState} from 'react'
import {
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  theme,
} from 'antd'
import {DeleteOutlined} from '@ant-design/icons'
import {Handle, NodeToolbar, Position, type NodeProps} from 'reactflow'
import type {
  CamillaDSPProfileDto,
  GraphNodeDto,
  JsonObject,
  JsonValue,
  LogicalEndpointDto,
  NodePortDto,
  NodeTypeDto,
  RuntimeProjectionDto,
  ValidationIssueDto,
} from '@open-cinema/shared'

const {Text} = Typography

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase())
}

function stringToColor(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 55%)`
}

function JsonField({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string
  value: JsonValue | undefined
  disabled: boolean
  onChange: (value: JsonValue) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2))
  const [error, setError] = useState<string>()

  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value])

  const save = () => {
    try {
      onChange(JSON.parse(text) as JsonValue)
      setError(undefined)
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <>
      <Button size="small" block disabled={disabled} onClick={() => setOpen(true)}>
        Edit {titleCase(name)}…
      </Button>
      <Modal title={titleCase(name)} open={open} onOk={save} onCancel={() => setOpen(false)}>
        <Input.TextArea
          aria-label={`${titleCase(name)} JSON`}
          rows={12}
          value={text}
          status={error ? 'error' : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        {error && <Text type="danger">{error}</Text>}
      </Modal>
    </>
  )
}

interface SchemaFieldProps {
  name: string
  schema: JsonObject
  value: JsonValue | undefined
  selected: boolean
  endpoints: LogicalEndpointDto[]
  profiles: CamillaDSPProfileDto[]
  issue?: ValidationIssueDto
  onChange: (value: JsonValue) => void
  onProfileChange: (profile: CamillaDSPProfileDto) => void
}

function SchemaField({
  name,
  schema,
  value,
  selected,
  endpoints,
  profiles,
  issue,
  onChange,
  onProfileChange,
}: SchemaFieldProps) {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : []
  const type = String(schema.type ?? '')
  let editor

  if (name === 'logicalEndpointId') {
    editor = (
      <Select
        size="small"
        value={typeof value === 'string' && value ? value : undefined}
        disabled={!selected}
        placeholder="Choose endpoint"
        style={{width: '100%'}}
        options={endpoints.map((endpoint) => ({
          value: endpoint.id,
          label: `${endpoint.name} (${endpoint.direction})`,
        }))}
        onChange={onChange}
      />
    )
  } else if (name === 'profileId') {
    editor = (
      <Select
        size="small"
        value={typeof value === 'string' && value ? value : undefined}
        disabled={!selected}
        placeholder="Choose profile"
        style={{width: '100%'}}
        options={profiles.map((profile) => ({
          value: profile.profileId,
          label: `${profile.name} · v${profile.version}`,
        }))}
        onChange={(profileId) => {
          const profile = profiles.find((item) => item.profileId === profileId)
          if (profile) onProfileChange(profile)
        }}
      />
    )
  } else if (enumValues.length > 0) {
    editor = (
      <Select
        size="small"
        value={value as string | number | undefined}
        disabled={!selected}
        style={{width: '100%'}}
        options={enumValues.map((item) => ({value: item, label: String(item)}))}
        onChange={onChange}
      />
    )
  } else if (type === 'boolean') {
    editor = <Switch size="small" checked={value === true} disabled={!selected} onChange={onChange}/>
  } else if (type === 'integer' || type === 'number') {
    editor = (
      <InputNumber
        size="small"
        value={typeof value === 'number' ? value : undefined}
        disabled={!selected}
        min={typeof schema.minimum === 'number' ? schema.minimum : undefined}
        max={typeof schema.maximum === 'number' ? schema.maximum : undefined}
        step={type === 'integer' ? 1 : 0.1}
        style={{width: '100%'}}
        onChange={(next) => onChange(next ?? 0)}
      />
    )
  } else if (type === 'object' || type === 'array' || schema.oneOf || schema.anyOf) {
    editor = <JsonField name={name} value={value} disabled={!selected} onChange={onChange}/>
  } else {
    editor = (
      <Input
        size="small"
        value={typeof value === 'string' ? value : ''}
        disabled={!selected}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  const endpoint = name === 'logicalEndpointId'
    ? endpoints.find((item) => item.id === value)
    : undefined
  const profile = name === 'profileId'
    ? profiles.find((item) => item.profileId === value)
    : undefined
  const display = endpoint
    ? `${endpoint.name} (${endpoint.direction})`
    : profile
      ? `${profile.name} · v${profile.version}`
      : typeof value === 'boolean'
        ? value ? 'on' : 'off'
        : typeof value === 'object'
          ? '{ … }'
          : value === undefined || value === ''
            ? 'Not set'
            : String(value)
  const help = issue?.message ?? (typeof schema.description === 'string' ? schema.description : undefined)

  return (
    <div style={{marginBottom: 8}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 8, minHeight: 24}}>
        <Text type="secondary" style={{fontSize: 12, flexShrink: 0}}>{titleCase(name)}:</Text>
        <div className="nodrag nopan" style={{flex: 1, minWidth: 0}}>
          {selected ? editor : <Text style={{fontSize: 13}}>{display}</Text>}
        </div>
      </div>
      {help && <Text type={issue ? 'danger' : 'secondary'} style={{display: 'block', fontSize: 11, fontStyle: 'italic'}}>{help}</Text>}
    </div>
  )
}

function Port({port, dark}: {port: NodePortDto; dark: boolean}) {
  const input = port.direction === 'input'
  return (
    <div style={{position: 'relative', padding: '8px 12px', textAlign: 'center'}}>
      <Handle
        id={port.name}
        type={input ? 'target' : 'source'}
        position={input ? Position.Left : Position.Right}
        style={{
          [input ? 'left' : 'right']: -20,
          width: 14,
          height: 14,
          background: port.contract.mediaKind === 'audio' ? '#52c41a' : '#1677ff',
          border: `2px solid ${dark ? '#141414' : '#ffffff'}`,
        }}
      />
      <Text style={{fontSize: 13, fontWeight: 500}}>{port.name}</Text>{' '}
      <Text type="secondary" style={{fontSize: 12}}>
        ({port.contract.content ?? port.contract.mediaKind})
      </Text>
      {port.cardinality !== 'single' && <Tag style={{marginInlineStart: 6}}>{port.cardinality}</Tag>}
    </div>
  )
}

export interface GraphNodeData extends Record<string, unknown> {
  graphNode: GraphNodeDto
  definition?: NodeTypeDto
  endpoints: LogicalEndpointDto[]
  profiles: CamillaDSPProfileDto[]
  issues: ValidationIssueDto[]
  resolved: boolean
  observed: boolean
  runtime?: RuntimeProjectionDto
  dirty: boolean
  editable: boolean
  onChange: (node: GraphNodeDto) => void
  onReset: (nodeId: string) => void
  onRemove: (nodeId: string) => void
  onToggleCollapsed: (nodeId: string) => void
  onSaveDraft: () => Promise<unknown>
}

export function GraphNodeCard({id, data, selected}: NodeProps<GraphNodeData>) {
  const {token} = theme.useToken()
  const node = data.graphNode
  const definition = data.definition
  const properties = object(definition?.configurationSchema.properties)
  const collapsed = node.layout?.collapsed === true
  const nodeColor = stringToColor(node.type)
  const invalid = data.issues.some((issue) => issue.severity !== 'warning')
  const borderColor = invalid
    ? token.colorError
    : selected
      ? nodeColor
      : data.dirty
        ? token.colorText
        : token.colorBorder
  const runtimeHealth = data.runtime?.payload.health ?? data.runtime?.payload.state

  const updateField = (name: string, value: JsonValue) => {
    data.onChange({...node, configuration: {...node.configuration, [name]: value}})
  }

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={12} style={{zIndex: 1000}}>
        <Space size="large">
          <Button type="primary" disabled={!data.editable} onClick={() => data.onChange({...node, configuration: {}})}>Clear</Button>
          <Button type="primary" disabled={!data.editable || !data.dirty} onClick={() => void data.onSaveDraft()}>Save draft</Button>
          <Button type="primary" disabled={!data.editable || !data.dirty} onClick={() => data.onReset(id)}>Reload</Button>
          <Button
            type="primary"
            disabled={!data.editable}
            onClick={() => data.onToggleCollapsed(id)}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
          <Button danger type="primary" disabled={!data.editable} icon={<DeleteOutlined/>} onClick={() => data.onRemove(id)}>
            Delete
          </Button>
        </Space>
      </NodeToolbar>
      <Card
        size="small"
        title={<Text strong>{definition?.displayName ?? node.type}</Text>}
        style={{
          minWidth: 230,
          maxWidth: 310,
          border: '2px solid',
          borderColor,
          boxShadow: selected ? `0 0 0 2px ${nodeColor}33` : undefined,
          opacity: definition?.available === false ? 0.75 : 1,
        }}
        extra={data.editable ? <Tag>{data.dirty ? 'draft changed' : 'draft'}</Tag> : <Tag>read only</Tag>}
      >
        <Space wrap size={[4, 4]}>
          <Tag>{definition?.category ?? 'unavailable'}</Tag>
          <Tag>v{node.version}</Tag>
          {definition?.source === 'plugin' && <Tag color="purple">plugin</Tag>}
          {data.resolved && <Tag color="green">resolved</Tag>}
          {data.observed && <Tag color="blue">observed</Tag>}
          {invalid && <Tag color="red">invalid</Tag>}
          {runtimeHealth !== undefined && <Tag color={runtimeHealth === 'ready' ? 'green' : 'orange'}>{String(runtimeHealth)}</Tag>}
          {definition?.available === false && <Tag color="red">unavailable</Tag>}
        </Space>

        {!collapsed && (
          <>
            {Object.entries(properties).length > 0 && <Divider style={{margin: '10px 0'}}/>}
            <div>
              {Object.entries(properties).map(([name, rawSchema]) => (
                <SchemaField
                  key={name}
                  name={name}
                  schema={object(rawSchema)}
                  value={node.configuration[name]}
                  selected={Boolean(selected && data.editable)}
                  endpoints={data.endpoints}
                  profiles={data.profiles}
                  issue={data.issues.find((issue) => issue.path.includes(`['${name}']`))}
                  onChange={(value) => updateField(name, value)}
                  onProfileChange={(profile) => {
                    data.onChange({
                      ...node,
                      configuration: {
                        ...node.configuration,
                        profileId: profile.profileId,
                        profileVersion: profile.version,
                      },
                    })
                  }}
                />
              ))}
            </div>
            {node.subgraph && (
              <Text type="secondary">
                Pinned {node.subgraph.definitionId} · {node.subgraph.revisionId}
              </Text>
            )}
            {definition?.ports.length ? <Divider style={{margin: '10px 0'}}/> : null}
            {definition?.ports.map((port) => <Port key={`${port.direction}:${port.name}`} port={port} dark={token.colorBgBase === '#000'}/>) }
            {data.issues.length > 0 && (
              <div role="alert">
                {data.issues.map((issue) => (
                  <Text key={`${issue.path}:${issue.code}`} type={issue.severity === 'warning' ? 'warning' : 'danger'} style={{display: 'block'}}>
                    {issue.message}
                  </Text>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}
