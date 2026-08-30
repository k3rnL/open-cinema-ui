import {AutoComplete, Button, Card, Form, Input, InputNumber, Select, Space, Typography} from 'antd'
import {DeleteOutlined, PlusOutlined} from '@ant-design/icons'
import type {GraphNodeDto, GraphParameterDto, JsonObject, JsonValue, LogicalEndpointDto, NodeTypeDto} from '@open-cinema/shared'

const {Text} = Typography

type FactKind = 'boolean' | 'integer' | 'number' | 'string' | 'enum' | 'object'

interface FactOption {
  value: string
  label: string
  description: string
  kind: FactKind
  values?: JsonValue[]
}

const operators = [
  {value: 'eq', label: 'Equals'},
  {value: 'ne', label: 'Does not equal'},
  {value: 'lt', label: 'Is less than'},
  {value: 'lte', label: 'Is at most'},
  {value: 'gt', label: 'Is greater than'},
  {value: 'gte', label: 'Is at least'},
  {value: 'in', label: 'Is one of'},
  {value: 'not_in', label: 'Is not one of'},
  {value: 'exists', label: 'Is known'},
  {value: 'stable_for', label: 'Remains true for a duration'},
  {value: 'all', label: 'All conditions are true'},
  {value: 'any', label: 'At least one condition is true'},
  {value: 'not', label: 'Condition is false'},
]

const endpointStates = ['discovered', 'route-available', 'selected', 'linked', 'active-signal', 'suspended', 'unavailable', 'ambiguous', 'error']
const processorStates = ['unknown', 'ready', 'degraded', 'failed', 'unavailable']

function human(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function facts(
  endpoints: LogicalEndpointDto[],
  nodes: GraphNodeDto[],
  definitions: NodeTypeDto[],
  parameters: GraphParameterDto[],
): FactOption[] {
  const result: FactOption[] = []
  for (const endpoint of endpoints) {
    const prefix = `${endpoint.name} (${endpoint.direction})`
    const add = (property: string, label: string, kind: FactKind, description: string, values?: JsonValue[]) => result.push({
      value: `endpoint.${endpoint.id}.${property}`,
      label: `${prefix} · ${label}`,
      description,
      kind,
      values,
    })
    add('availability', 'availability', 'enum', 'The current route and connection state.', endpointStates)
    add('activeSignal', 'playing audio', 'boolean', 'Whether this device currently carries an active audio signal.')
    add('volume', 'volume', 'number', 'The observed device volume, when the device reports one.')
    add('mute', 'muted', 'boolean', 'Whether the device is muted, when the device reports it.')
    add('direction', 'direction', 'enum', 'Whether this is an input or output device.', ['input', 'output'])
  }
  for (const node of nodes) {
    const definition = definitions.find((item) => item.id === node.type && item.version === node.version)
    const name = definition?.displayName ?? node.id
    result.push(
      {value: `signal.${node.id}.content.codec`, label: `${name} · detected codec`, description: 'The detected input codec.', kind: 'string'},
      {value: `signal.${node.id}.confidence`, label: `${name} · detection confidence`, description: 'Confidence of the current signal observation.', kind: 'number'},
    )
    if (definition?.category === 'processing') {
      result.push(
        {value: `processor.${node.id}.health`, label: `${name} · processor health`, description: 'The current processor health.', kind: 'enum', values: processorStates},
        {value: `processor.${node.id}.ready`, label: `${name} · processor ready`, description: 'Whether the processor is ready to carry audio.', kind: 'boolean'},
      )
    }
  }
  for (const parameter of parameters) {
    result.push({
      value: `parameter.${parameter.name}`,
      label: `Graph parameter · ${human(parameter.name)}`,
      description: parameter.description ?? 'The configured graph parameter value.',
      kind: parameter.enum?.length ? 'enum' : parameter.type,
      values: parameter.enum,
    })
  }
  return result
}

function defaultFact(factOptions: FactOption[]): string {
  return factOptions[0]?.value ?? ''
}

function defaultCondition(op: string, factOptions: FactOption[]): JsonObject {
  if (op === 'all' || op === 'any') return {op, args: [{op: 'exists', fact: defaultFact(factOptions)}]}
  if (op === 'not') return {op, arg: {op: 'exists', fact: defaultFact(factOptions)}}
  if (op === 'stable_for') return {op, durationMs: 1000, arg: {op: 'exists', fact: defaultFact(factOptions)}}
  if (op === 'exists') return {op, fact: defaultFact(factOptions)}
  if (op === 'in' || op === 'not_in') return {op, fact: defaultFact(factOptions), values: []}
  return {op, fact: defaultFact(factOptions), value: null}
}

function ConditionValue({
  condition,
  factOptions,
  multiple,
  onChange,
}: {
  condition: JsonObject
  factOptions: FactOption[]
  multiple: boolean
  onChange: (value: JsonValue) => void
}) {
  const fact = factOptions.find((item) => item.value === condition.fact)
  const value = multiple ? condition.values : condition.value
  if (multiple) {
    const values = Array.isArray(value) ? value : []
    return (
      <Select
        aria-label="Comparison values"
        mode="tags"
        value={values as Array<string | number>}
        options={fact?.values?.map((item) => ({value: item as string | number, label: human(String(item))}))}
        placeholder="Add accepted values"
        style={{width: '100%'}}
        onChange={(next) => onChange(fact?.kind === 'number' || fact?.kind === 'integer' ? next.map(Number) : next)}
      />
    )
  }
  if (fact?.kind === 'enum') {
    return <Select aria-label="Comparison value" value={value as string | number | undefined} options={fact.values?.map((item) => ({value: item as string | number, label: human(String(item))}))} style={{width: '100%'}} onChange={onChange}/>
  }
  if (fact?.kind === 'boolean') {
    return <Select aria-label="Comparison value" value={typeof value === 'boolean' ? String(value) : undefined} options={[{value: 'true', label: 'Yes'}, {value: 'false', label: 'No'}]} style={{width: '100%'}} onChange={(next) => onChange(next === 'true')}/>
  }
  if (fact?.kind === 'number' || fact?.kind === 'integer') {
    return <InputNumber aria-label="Comparison value" value={typeof value === 'number' ? value : undefined} precision={fact.kind === 'integer' ? 0 : undefined} style={{width: '100%'}} onChange={(next) => onChange(next ?? 0)}/>
  }
  return <Input aria-label="Comparison value" value={typeof value === 'string' ? value : ''} placeholder={fact?.kind === 'object' ? 'Use “Is known” for complex values' : 'Value'} onChange={(event) => onChange(event.target.value)}/>
}

function Expression({
  value,
  factOptions,
  depth,
  onChange,
}: {
  value: JsonObject
  factOptions: FactOption[]
  depth: number
  onChange: (value: JsonObject) => void
}) {
  const op = typeof value.op === 'string' ? value.op : 'exists'
  const fact = typeof value.fact === 'string' ? value.fact : ''
  const selectedFact = factOptions.find((item) => item.value === fact)
  const options = factOptions.map((item) => ({value: item.value, label: item.label, title: item.description}))
  if (fact && !selectedFact) options.unshift({value: fact, label: `Existing fact · ${fact}`, title: 'This fact is preserved even though it is not part of the current graph.'})
  const group = op === 'all' || op === 'any'
  const unary = op === 'not' || op === 'stable_for'
  const args = Array.isArray(value.args) ? value.args.filter(isObject) : []
  const child = isObject(value.arg) ? value.arg : defaultCondition('exists', factOptions)

  return (
    <Space direction="vertical" size="small" style={{width: '100%'}}>
      <Form.Item label={depth === 0 ? 'Condition' : 'Rule'} style={{marginBottom: 8}}>
        <Select
          aria-label={depth === 0 ? 'Condition type' : `Nested condition type ${depth}`}
          value={op}
          options={operators}
          style={{width: '100%'}}
          onChange={(next) => onChange(defaultCondition(next, factOptions))}
        />
      </Form.Item>
      {group ? (
        <Space direction="vertical" style={{width: '100%'}}>
          {args.map((argument, index) => (
            <Card
              key={index}
              size="small"
              extra={<Button danger type="text" aria-label={`Remove rule ${index + 1}`} icon={<DeleteOutlined/>} disabled={args.length === 1} onClick={() => onChange({...value, args: args.filter((_, itemIndex) => itemIndex !== index)})}/>}>
              <Expression value={argument} factOptions={factOptions} depth={depth + 1} onChange={(next) => onChange({...value, args: args.map((item, itemIndex) => itemIndex === index ? next : item)})}/>
            </Card>
          ))}
          <Button type="dashed" block icon={<PlusOutlined/>} onClick={() => onChange({...value, args: [...args, defaultCondition('exists', factOptions)]})}>Add rule</Button>
        </Space>
      ) : unary ? (
        <Space direction="vertical" style={{width: '100%'}}>
          {op === 'stable_for' ? (
            <Form.Item label="Duration" extra="The nested condition must remain true for this long." style={{marginBottom: 8}}>
              <InputNumber aria-label="Stable duration milliseconds" addonAfter="ms" min={1} value={typeof value.durationMs === 'number' ? value.durationMs : 1000} style={{width: '100%'}} onChange={(durationMs) => onChange({...value, durationMs: durationMs ?? 1000})}/>
            </Form.Item>
          ) : null}
          <Card size="small"><Expression value={child} factOptions={factOptions} depth={depth + 1} onChange={(arg) => onChange({...value, arg})}/></Card>
        </Space>
      ) : (
        <>
          <Form.Item label="Observed value" extra={selectedFact?.description} style={{marginBottom: 8}}>
            <AutoComplete
              aria-label="Condition fact"
              value={fact}
              options={options}
              placeholder="Choose what the condition observes"
              filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              onChange={(nextFact) => onChange({...value, fact: nextFact})}
            />
          </Form.Item>
          {op !== 'exists' ? (
            <Form.Item label={op === 'in' || op === 'not_in' ? 'Accepted values' : 'Expected value'} style={{marginBottom: 8}}>
              <ConditionValue condition={value} factOptions={factOptions} multiple={op === 'in' || op === 'not_in'} onChange={(next) => onChange({...value, [op === 'in' || op === 'not_in' ? 'values' : 'value']: next})}/>
            </Form.Item>
          ) : null}
        </>
      )}
      {depth === 0 ? <Text type="secondary">This rule is evaluated from live device, signal, processor, or graph information.</Text> : null}
    </Space>
  )
}

export function ConditionEditor({
  value,
  endpoints,
  nodes,
  definitions,
  parameters,
  onChange,
}: {
  value: JsonValue | undefined
  endpoints: LogicalEndpointDto[]
  nodes: GraphNodeDto[]
  definitions: NodeTypeDto[]
  parameters: GraphParameterDto[]
  onChange: (value: JsonObject) => void
}) {
  const factOptions = facts(endpoints, nodes, definitions, parameters)
  const condition = isObject(value) && typeof value.op === 'string'
    ? value
    : defaultCondition('exists', factOptions)
  return <Expression value={condition} factOptions={factOptions} depth={0} onChange={onChange}/>
}
