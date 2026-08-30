import {Button, Card, Divider, Space, Tag, Tooltip, Typography, theme} from 'antd'
import {InfoCircleOutlined} from '@ant-design/icons'
import {Handle, Position, type NodeProps} from 'reactflow'
import type {
  GraphNodeDto,
  JsonValue,
  NodePortDto,
  NodeTypeDto,
  RuntimeProjectionDto,
  ValidationIssueDto,
} from '@open-cinema/shared'

const {Text} = Typography

function stringToColor(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 55%)`
}

function summary(value: JsonValue | undefined): string {
  if (value === undefined || value === '') return 'Not set'
  if (Array.isArray(value)) return value.length ? `${value.length} selected` : 'None'
  if (value !== null && typeof value === 'object') return Object.keys(value).length ? `${Object.keys(value).length} values` : 'None'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value)
}

function Port({port, dark}: {port: NodePortDto; dark: boolean}) {
  const input = port.direction === 'input'
  return (
    <div style={{position: 'relative', padding: '7px 12px', textAlign: 'center'}}>
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
      <Text type="secondary" style={{fontSize: 12}}>({port.contract.content ?? port.contract.mediaKind})</Text>
    </div>
  )
}

export interface GraphNodeData extends Record<string, unknown> {
  graphNode: GraphNodeDto
  definition?: NodeTypeDto
  issues: ValidationIssueDto[]
  resolved: boolean
  observed: boolean
  runtime?: RuntimeProjectionDto
  dirty: boolean
  editable: boolean
  onSelect?: (nodeId: string) => void
}

export function GraphNodeCard({data, selected}: NodeProps<GraphNodeData>) {
  const {token} = theme.useToken()
  const node = data.graphNode
  const definition = data.definition
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
  const configuration = Object.entries(node.configuration).slice(0, 3)

  return (
    <Card
      size="small"
      title={(
        <Space size="small">
          <Text strong>{definition?.displayName ?? node.type}</Text>
          <Tooltip title={definition?.description ?? 'This node type is not available in the current catalogue.'} placement="top">
            <Button
              type="text"
              size="small"
              aria-label={`About ${definition?.displayName ?? node.type}`}
              icon={<InfoCircleOutlined/>}
              onFocus={() => data.onSelect?.(node.id)}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            />
          </Tooltip>
        </Space>
      )}
      style={{
        width: 270,
        border: '2px solid',
        borderColor,
        boxShadow: selected ? `0 0 0 2px ${nodeColor}33` : undefined,
        opacity: definition?.available === false ? 0.75 : 1,
      }}
      extra={<Tag>{data.editable ? data.dirty ? 'saving' : 'draft' : 'read only'}</Tag>}
    >
      <Space wrap size={[4, 4]}>
        <Tag>{definition?.category ?? 'unavailable'}</Tag>
        <Tag>v{node.version}</Tag>
        {data.resolved && <Tag color="green">resolved</Tag>}
        {data.observed && <Tag color="blue">observed</Tag>}
        {invalid && <Tag color="red">invalid</Tag>}
        {runtimeHealth !== undefined && <Tag color={runtimeHealth === 'ready' ? 'green' : 'orange'}>{String(runtimeHealth)}</Tag>}
      </Space>

      {!collapsed && configuration.length > 0 && (
        <>
          <Divider style={{margin: '10px 0'}}/>
          <Space direction="vertical" size={2} style={{width: '100%'}}>
            {configuration.map(([name, value]) => (
              <Space key={name} size="small" style={{justifyContent: 'space-between', width: '100%'}}>
                <Text type="secondary" ellipsis style={{maxWidth: 112}}>{name}</Text>
                <Text ellipsis style={{maxWidth: 112}}>{summary(value)}</Text>
              </Space>
            ))}
          </Space>
        </>
      )}
      {!collapsed && definition?.ports.length ? <Divider style={{margin: '10px 0'}}/> : null}
      {!collapsed && definition?.ports.map((port) => <Port key={`${port.direction}:${port.name}`} port={port} dark={token.colorBgBase === '#000'}/>) }
      {collapsed && <Text type="secondary">Collapsed · select to configure</Text>}
    </Card>
  )
}
