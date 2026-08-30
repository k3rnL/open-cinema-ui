import {useEffect, useState} from 'react'
import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd'
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons'
import type {
  DesiredGraphDocumentDto,
  GraphParameterDto,
  GraphPublicPortDto,
  JsonObject,
  JsonValue,
  NodeTypeDto,
} from '@open-cinema/shared'

const {Text} = Typography

function parseValue(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue
  } catch {
    return value
  }
}

export function AdvancedJsonFallback({
  label = 'Advanced JSON',
  value,
  onChange,
}: {
  label?: string
  value: JsonValue
  onChange: (value: JsonValue) => void
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [error, setError] = useState<string>()
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value])
  return (
    <Collapse
      size="small"
      items={[{
        key: 'advanced',
        label,
        children: (
          <Space direction="vertical" style={{width: '100%'}}>
            <Text type="secondary">This lossless editor is for fields the structured controls cannot represent.</Text>
            <Input.TextArea aria-label={`${label} editor`} rows={10} value={text} status={error ? 'error' : undefined} onChange={(event) => setText(event.target.value)}/>
            {error && <Text type="danger">{error}</Text>}
            <Button onClick={() => {
              try {
                onChange(JSON.parse(text) as JsonValue)
                setError(undefined)
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught))
              }
            }}>Use JSON value</Button>
          </Space>
        ),
      }]}
    />
  )
}

export function KeyValueBindings({
  value,
  onChange,
  stringValues = false,
  label = 'Advanced bindings JSON',
}: {
  value: JsonObject
  onChange: (value: JsonObject) => void
  stringValues?: boolean
  label?: string
}) {
  const entries = Object.entries(value)
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      {entries.map(([key, item]) => (
        <Space.Compact key={key} block>
          <Input
            aria-label="Binding name"
            value={key}
            onChange={(event) => {
              const next = {...value}
              delete next[key]
              next[event.target.value] = item
              onChange(next)
            }}
          />
          <Input
            aria-label={`${key} binding value`}
            value={stringValues ? String(item) : typeof item === 'string' ? item : JSON.stringify(item)}
            onChange={(event) => onChange({...value, [key]: stringValues ? event.target.value : parseValue(event.target.value)})}
          />
          <Button danger aria-label={`Remove ${key}`} icon={<DeleteOutlined/>} onClick={() => {
            const next = {...value}
            delete next[key]
            onChange(next)
          }}/>
        </Space.Compact>
      ))}
      <Button icon={<PlusOutlined/>} onClick={() => onChange({...value, [`binding${entries.length + 1}`]: ''})}>Add binding</Button>
      <AdvancedJsonFallback label={label} value={value} onChange={(next) => {
        if (typeof next === 'object' && next !== null && !Array.isArray(next)) onChange(next)
      }}/>
    </Space>
  )
}

function defaultEditor(parameter: GraphParameterDto, onChange: (value: JsonValue) => void) {
  if (parameter.type === 'boolean') return <Switch checked={parameter.default === true} onChange={onChange}/>
  if (parameter.type === 'integer' || parameter.type === 'number') {
    return <InputNumber value={typeof parameter.default === 'number' ? parameter.default : undefined} min={parameter.minimum} max={parameter.maximum} precision={parameter.type === 'integer' ? 0 : undefined} style={{width: '100%'}} onChange={(value) => onChange(value ?? 0)}/>
  }
  return <Input value={typeof parameter.default === 'string' ? parameter.default : ''} onChange={(event) => onChange(event.target.value)}/>
}

export function GraphInterfaceEditor({
  value,
  catalogue,
  editable,
  onChange,
}: {
  value: DesiredGraphDocumentDto
  catalogue: NodeTypeDto[]
  editable: boolean
  onChange: (value: DesiredGraphDocumentDto) => void
}) {
  const changeParameter = (index: number, changes: Partial<GraphParameterDto>) => onChange({
    ...value,
    parameters: value.parameters.map((parameter, itemIndex) => itemIndex === index ? {...parameter, ...changes} : parameter),
  })
  const changePort = (index: number, changes: Partial<GraphPublicPortDto>) => onChange({
    ...value,
    publicPorts: value.publicPorts.map((port, itemIndex) => itemIndex === index ? {...port, ...changes} : port),
  })
  const nodeOptions = value.nodes.map((node) => ({
    value: node.id,
    label: catalogue.find((item) => item.id === node.type && item.version === node.version)?.displayName ?? node.id,
  }))

  return (
    <Card size="small" title="Reusable public interface" style={{marginTop: 16}}>
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <Card type="inner" title="Parameters" extra={<Button size="small" disabled={!editable} icon={<PlusOutlined/>} onClick={() => onChange({...value, parameters: [...value.parameters, {name: `parameter${value.parameters.length + 1}`, type: 'string'}]})}>Add parameter</Button>}>
          <Space direction="vertical" style={{width: '100%'}}>
            {value.parameters.length === 0 ? <Text type="secondary">No public parameters.</Text> : value.parameters.map((parameter, index) => (
              <Card key={`${parameter.name}:${index}`} size="small" actions={editable ? [
                <Popconfirm key="remove" title="Remove this public parameter?" onConfirm={() => onChange({...value, parameters: value.parameters.filter((_, itemIndex) => itemIndex !== index)})}><Button type="text" danger icon={<DeleteOutlined/>}>Remove</Button></Popconfirm>,
              ] : undefined}>
                <Form layout="vertical" disabled={!editable}>
                  <Space wrap align="start" style={{width: '100%'}}>
                    <Form.Item label="Name" required><Input value={parameter.name} onChange={(event) => changeParameter(index, {name: event.target.value})}/></Form.Item>
                    <Form.Item label="Type"><Select style={{width: 130}} value={parameter.type} options={['string', 'boolean', 'integer', 'number'].map((type) => ({value: type, label: type}))} onChange={(type) => changeParameter(index, {type})}/></Form.Item>
                    <Form.Item label="Required"><Switch checked={parameter.required === true} onChange={(required) => changeParameter(index, {required})}/></Form.Item>
                  </Space>
                  <Form.Item label="Description"><Input value={parameter.description ?? ''} onChange={(event) => changeParameter(index, {description: event.target.value})}/></Form.Item>
                  <Form.Item label="Default value">{defaultEditor(parameter, (next) => changeParameter(index, {default: next}))}</Form.Item>
                </Form>
              </Card>
            ))}
          </Space>
        </Card>

        <Card type="inner" title="Public ports" extra={<Button size="small" disabled={!editable} icon={<PlusOutlined/>} onClick={() => onChange({...value, publicPorts: [...value.publicPorts, {name: `port${value.publicPorts.length + 1}`, direction: 'input', contract: {mediaKind: 'audio', content: 'any'}}]})}>Add port</Button>}>
          <Space direction="vertical" style={{width: '100%'}}>
            {value.publicPorts.length === 0 ? <Text type="secondary">No public ports.</Text> : value.publicPorts.map((port, index) => {
              const selectedNode = value.nodes.find((node) => node.id === port.internal?.node)
              const nodeType = selectedNode ? catalogue.find((item) => item.id === selectedNode.type && item.version === selectedNode.version) : undefined
              return (
                <Card key={`${port.name}:${index}`} size="small" actions={editable ? [
                  <Popconfirm key="remove" title="Remove this public port?" onConfirm={() => onChange({...value, publicPorts: value.publicPorts.filter((_, itemIndex) => itemIndex !== index)})}><Button type="text" danger icon={<DeleteOutlined/>}>Remove</Button></Popconfirm>,
                ] : undefined}>
                  <Form layout="vertical" disabled={!editable}>
                    <Space wrap align="start">
                      <Form.Item label="Name" required><Input value={port.name} onChange={(event) => changePort(index, {name: event.target.value})}/></Form.Item>
                      <Form.Item label="Direction"><Select style={{width: 120}} value={port.direction} options={[{value: 'input', label: 'Input'}, {value: 'output', label: 'Output'}]} onChange={(direction) => changePort(index, {direction})}/></Form.Item>
                      <Form.Item label="Signal"><Select style={{width: 130}} value={port.contract.content ?? 'any'} options={['any', 'pcm', 'encoded'].map((content) => ({value: content, label: content}))} onChange={(content) => changePort(index, {contract: {...port.contract, content: content as 'any' | 'pcm' | 'encoded'}})}/></Form.Item>
                    </Space>
                    <Space wrap align="start">
                      <Form.Item label="Internal node"><Select allowClear style={{width: 220}} value={port.internal?.node} options={nodeOptions} onChange={(node) => changePort(index, {internal: node ? {node, port: ''} : undefined})}/></Form.Item>
                      <Form.Item label="Internal port"><Select style={{width: 180}} value={port.internal?.port} disabled={!selectedNode} options={nodeType?.ports.map((item) => ({value: item.name, label: `${item.name} (${item.direction})`})) ?? []} onChange={(internalPort) => changePort(index, {internal: selectedNode ? {node: selectedNode.id, port: internalPort} : undefined})}/></Form.Item>
                    </Space>
                  </Form>
                </Card>
              )
            })}
          </Space>
        </Card>
        <AdvancedJsonFallback
          label="Advanced interface JSON"
          value={{parameters: value.parameters, publicPorts: value.publicPorts} as unknown as JsonValue}
          onChange={(next) => {
            if (typeof next !== 'object' || next === null || Array.isArray(next)) return
            const candidate = next as JsonObject
            if (Array.isArray(candidate.parameters) && Array.isArray(candidate.publicPorts)) {
              onChange({...value, parameters: candidate.parameters as unknown as GraphParameterDto[], publicPorts: candidate.publicPorts as unknown as GraphPublicPortDto[]})
            }
          }}
        />
      </Space>
    </Card>
  )
}
