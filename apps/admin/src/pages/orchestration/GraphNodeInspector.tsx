import {useEffect, useState} from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined} from '@ant-design/icons'
import type {
  CamillaDSPProfileDto,
  GraphParameterDto,
  GraphNodeDto,
  JsonObject,
  JsonValue,
  LogicalEndpointDto,
  NodeTypeDto,
  ValidationIssueDto,
} from '@open-cinema/shared'
import {ConditionEditor} from './ConditionEditor'
import {CamillaDSPConfigurationEditor, EndpointReferenceEditor, SignalContractEditor} from './NodeConfigurationEditors'

const {Text} = Typography

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {}
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase())
}

function AdvancedJson({
  value,
  onChange,
  label = 'Advanced JSON',
  help = 'Use this only when the schema cannot be represented by the structured fields.',
}: {
  value: JsonValue
  onChange: (value: JsonValue) => void
  label?: string
  help?: string
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [error, setError] = useState<string>()
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value])
  return (
    <Collapse
      size="small"
      items={[{
        key: 'json',
        label,
        children: (
          <Space direction="vertical" style={{width: '100%'}}>
            <Text type="secondary">{help}</Text>
            <Input.TextArea aria-label="Advanced JSON" rows={8} value={text} status={error ? 'error' : undefined} onChange={(event) => setText(event.target.value)}/>
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

type CandidateEligibility = 'connected' | 'route-available' | 'active-signal' | 'custom'

const selectorNodeTypes = new Set([
  'core.ordered-selector',
  'core.fallback-selector',
  'core.exclusive-choice',
])

function endpointFact(endpointId: string, property: 'availability' | 'activeSignal'): string {
  return `endpoint.${endpointId}.${property}`
}

function isCondition(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEquality(condition: JsonObject, fact: string, value: JsonValue): boolean {
  return condition.op === 'eq' && condition.fact === fact && condition.value === value
}

function candidateEligibility(candidate: JsonObject): CandidateEligibility {
  const endpointId = typeof candidate.endpoint === 'string' ? candidate.endpoint : ''
  const condition = candidate.eligibleWhen
  if (!isCondition(condition)) return 'connected'
  if (isEquality(condition, endpointFact(endpointId, 'availability'), 'route-available')) {
    return 'route-available'
  }
  if (condition.op === 'all' && Array.isArray(condition.args)) {
    const parts = condition.args.filter(isCondition)
    const available = parts.some((part) => isEquality(part, endpointFact(endpointId, 'availability'), 'route-available'))
    const active = parts.some((part) => isEquality(part, endpointFact(endpointId, 'activeSignal'), true))
    if (available && active && parts.length === 2) return 'active-signal'
  }
  return 'custom'
}

function withCandidateEligibility(candidate: JsonObject, eligibility: CandidateEligibility): JsonObject {
  const next = {...candidate}
  const endpointId = typeof candidate.endpoint === 'string' ? candidate.endpoint : ''
  if (eligibility === 'connected') {
    delete next.eligibleWhen
    delete next.unknownResult
    return next
  }
  if (eligibility === 'route-available') {
    next.eligibleWhen = {op: 'eq', fact: endpointFact(endpointId, 'availability'), value: 'route-available'}
    next.unknownResult = 'ineligible'
    return next
  }
  if (eligibility === 'active-signal') {
    next.eligibleWhen = {
      op: 'all',
      args: [
        {op: 'eq', fact: endpointFact(endpointId, 'availability'), value: 'route-available'},
        {op: 'eq', fact: endpointFact(endpointId, 'activeSignal'), value: true},
      ],
    }
    next.unknownResult = 'ineligible'
    return next
  }
  next.eligibleWhen = isCondition(candidate.eligibleWhen)
    ? {op: 'all', args: [candidate.eligibleWhen]}
    : {op: 'exists', fact: endpointFact(endpointId, 'availability')}
  next.unknownResult = typeof candidate.unknownResult === 'string' ? candidate.unknownResult : 'ineligible'
  return next
}

function SelectorCandidatesField({
  value,
  endpoints,
  nodes = [],
  definitions = [],
  parameters = [],
  onChange,
}: {
  value: JsonValue | undefined
  endpoints: LogicalEndpointDto[]
  nodes?: GraphNodeDto[]
  definitions?: NodeTypeDto[]
  parameters?: GraphParameterDto[]
  onChange: (value: JsonValue) => void
}) {
  const candidates = Array.isArray(value) ? value.map(object) : []
  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]))
  const endpointOptions = (['input', 'output'] as const).map((direction) => ({
    label: direction === 'input' ? 'Input devices' : 'Output devices',
    options: endpoints
      .filter((endpoint) => endpoint.direction === direction)
      .map((endpoint) => ({value: endpoint.id, label: endpoint.name})),
  })).filter((group) => group.options.length > 0)
  const updateCandidate = (index: number, candidate: JsonObject) => {
    onChange(candidates.map((item, itemIndex) => itemIndex === index ? candidate : item))
  }
  const moveCandidate = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= candidates.length) return
    const next = [...candidates]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const addCandidate = () => {
    const selected = new Set(candidates.map((candidate) => candidate.endpoint).filter((entry): entry is string => typeof entry === 'string'))
    const endpointId = endpoints.find((endpoint) => !selected.has(endpoint.id))?.id ?? endpoints[0]?.id
    if (!endpointId) return
    const priorities = candidates.map((candidate) => typeof candidate.priority === 'number' ? candidate.priority : 0)
    const priority = priorities.length ? Math.min(...priorities) - 100 : 100
    onChange([...candidates, {endpoint: endpointId, priority}])
  }

  return (
    <Space direction="vertical" size="middle" style={{width: '100%'}}>
      <Text type="secondary">
        The highest-priority eligible device is selected. Use the arrow buttons to set the order used when priorities are equal.
      </Text>
      {candidates.map((candidate, index) => {
        const endpointId = typeof candidate.endpoint === 'string' ? candidate.endpoint : undefined
        const endpoint = endpointId ? endpointById.get(endpointId) : undefined
        const dynamicSelector = isCondition(candidate.endpointSelector) && !endpointId
        const selector = object(candidate.endpointSelector)
        const eligibility = candidateEligibility(candidate)
        return (
          <Card
            key={`${endpointId ?? 'dynamic'}:${index}`}
            size="small"
            title={`${index + 1}. ${endpoint?.name ?? (dynamicSelector ? 'Dynamic device group' : 'Choose a device')}`}
            extra={(
              <Space.Compact>
                <Button aria-label={`Move candidate ${index + 1} up`} icon={<ArrowUpOutlined/>} disabled={index === 0} onClick={() => moveCandidate(index, -1)}/>
                <Button aria-label={`Move candidate ${index + 1} down`} icon={<ArrowDownOutlined/>} disabled={index === candidates.length - 1} onClick={() => moveCandidate(index, 1)}/>
                <Button danger aria-label={`Remove candidate ${index + 1}`} icon={<DeleteOutlined/>} onClick={() => onChange(candidates.filter((_, itemIndex) => itemIndex !== index))}/>
              </Space.Compact>
            )}
          >
            <Space direction="vertical" style={{width: '100%'}}>
              <Form.Item label="Reference" style={{marginBottom: 8}}>
                <Select
                  aria-label={`Candidate ${index + 1} reference type`}
                  value={dynamicSelector ? 'group' : 'device'}
                  options={[{value: 'device', label: 'Specific device'}, {value: 'group', label: 'Device group'}]}
                  onChange={(referenceType) => {
                    if (referenceType === 'group') {
                      const next: JsonObject = {...candidate, endpointSelector: {version: 1, direction: endpoint?.direction ?? 'output', requiredTags: []}}
                      delete next.endpoint
                      updateCandidate(index, next)
                    } else {
                      const nextEndpointId = endpoints[0]?.id
                      if (!nextEndpointId) return
                      const next: JsonObject = {...candidate, endpoint: nextEndpointId}
                      delete next.endpointSelector
                      updateCandidate(index, withCandidateEligibility(next, eligibility))
                    }
                  }}
                />
              </Form.Item>
              {!dynamicSelector ? <Form.Item label="Device" style={{marginBottom: 8}}>
                <Select
                  aria-label={`Candidate ${index + 1} device`}
                  value={endpointId}
                  placeholder="Choose device"
                  showSearch
                  optionFilterProp="label"
                  options={endpointOptions}
                  onChange={(nextEndpointId) => {
                    const next: JsonObject = {...candidate, endpoint: nextEndpointId}
                    delete next.endpointSelector
                    updateCandidate(index, withCandidateEligibility(next, eligibility))
                  }}
                />
              </Form.Item> : (
                <Card size="small" title="Dynamic device group">
                  <Form.Item label="Direction" style={{marginBottom: 8}}>
                    <Select aria-label={`Candidate ${index + 1} group direction`} value={selector.direction === 'input' ? 'input' : 'output'} options={[{value: 'input', label: 'Audio input'}, {value: 'output', label: 'Audio output'}]} onChange={(direction) => updateCandidate(index, {...candidate, endpointSelector: {...selector, version: 1, direction}})}/>
                  </Form.Item>
                  <Form.Item label="Required tags" style={{marginBottom: 8}}>
                    <Select aria-label={`Candidate ${index + 1} required tags`} mode="tags" value={Array.isArray(selector.requiredTags) ? selector.requiredTags.map(String) : []} placeholder="Type a tag and press Enter" onChange={(requiredTags) => updateCandidate(index, {...candidate, endpointSelector: {...selector, version: 1, requiredTags}})}/>
                  </Form.Item>
                  <Form.Item label="Preferred groups" extra="Groups are tried from left to right." style={{marginBottom: 0}}>
                    <Select aria-label={`Candidate ${index + 1} preferred groups`} mode="tags" value={Array.isArray(selector.orderedGroups) ? selector.orderedGroups.map(String) : []} placeholder="Type a group and press Enter" onChange={(orderedGroups) => updateCandidate(index, {...candidate, endpointSelector: {...selector, version: 1, orderedGroups}})}/>
                  </Form.Item>
                </Card>
              )}
              <Space wrap size="middle" style={{width: '100%'}}>
                <Form.Item label="Priority" style={{marginBottom: 8}}>
                  <InputNumber
                    aria-label={`Candidate ${index + 1} priority`}
                    value={typeof candidate.priority === 'number' ? candidate.priority : 0}
                    step={10}
                    onChange={(priority) => updateCandidate(index, {...candidate, priority: priority ?? 0})}
                  />
                </Form.Item>
                <Form.Item label="Eligible" style={{marginBottom: 8, minWidth: 260, flex: 1}}>
                  <Select
                    aria-label={`Candidate ${index + 1} eligibility`}
                    value={eligibility}
                    options={[
                      {value: 'connected', label: 'When device is connected'},
                      {value: 'route-available', label: 'When route is available'},
                      {value: 'active-signal', label: 'When route is available and playing'},
                      {value: 'custom', label: 'Custom condition (advanced)'},
                    ]}
                    onChange={(next) => updateCandidate(index, withCandidateEligibility(candidate, next))}
                  />
                </Form.Item>
              </Space>
              {eligibility === 'custom' && isCondition(candidate.eligibleWhen) ? (
                <>
                  <ConditionEditor
                    value={candidate.eligibleWhen}
                    endpoints={endpoints}
                    nodes={nodes}
                    definitions={definitions}
                    parameters={parameters}
                    onChange={(eligibleWhen) => updateCandidate(index, {...candidate, eligibleWhen})}
                  />
                  <Form.Item label="If condition data is unknown" style={{marginBottom: 0}}>
                    <Select
                      aria-label={`Candidate ${index + 1} unknown result`}
                      value={typeof candidate.unknownResult === 'string' ? candidate.unknownResult : 'ineligible'}
                      options={['eligible', 'ineligible', 'waiting', 'error'].map((result) => ({value: result, label: titleCase(result)}))}
                      onChange={(unknownResult) => updateCandidate(index, {...candidate, unknownResult})}
                    />
                  </Form.Item>
                </>
              ) : null}
            </Space>
          </Card>
        )
      })}
      <Button type="dashed" block icon={<PlusOutlined/>} disabled={!endpoints.length} onClick={addCandidate}>
        Add device
      </Button>
      {!endpoints.length ? <Text type="secondary">Create a logical input or output device before adding a candidate.</Text> : null}
    </Space>
  )
}

function ArrayField({label, schema, value, onChange}: {label: string; schema: JsonObject; value: JsonValue | undefined; onChange: (value: JsonValue) => void}) {
  const items = Array.isArray(value) ? value : []
  const itemSchema = object(schema.items)
  if (Array.isArray(itemSchema.enum)) {
    return <Select aria-label={label} mode="multiple" style={{width: '100%'}} value={items as Array<string | number>} options={itemSchema.enum.map((item) => ({value: item as string | number, label: String(item)}))} onChange={onChange}/>
  }
  const primitive = ['string', 'number', 'integer'].includes(String(itemSchema.type))
  if (!primitive) return <AdvancedJson value={items} onChange={onChange}/>
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      {items.map((item, index) => (
        <Space.Compact key={index} block>
          {itemSchema.type === 'number' || itemSchema.type === 'integer' ? (
            <InputNumber aria-label={`${label} item ${index + 1}`} value={typeof item === 'number' ? item : undefined} style={{width: '100%'}} onChange={(next) => onChange(items.map((entry, itemIndex) => itemIndex === index ? next ?? 0 : entry))}/>
          ) : (
            <Input aria-label={`${label} item ${index + 1}`} value={String(item)} onChange={(event) => onChange(items.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))}/>
          )}
          <Button danger icon={<DeleteOutlined/>} aria-label={`Remove item ${index + 1}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}/>
        </Space.Compact>
      ))}
      <Button icon={<PlusOutlined/>} onClick={() => onChange([...items, itemSchema.type === 'string' ? '' : 0])}>Add value</Button>
    </Space>
  )
}

function MapField({schema, value, onChange}: {schema: JsonObject; value: JsonValue | undefined; onChange: (value: JsonValue) => void}) {
  const current = object(value)
  const properties = object(schema.properties)
  if (Object.keys(properties).length) {
    return (
      <Space direction="vertical" style={{width: '100%'}}>
        {Object.entries(properties).map(([name, child]) => (
          <SchemaField key={name} name={name} schema={object(child)} value={current[name]} onChange={(next) => onChange({...current, [name]: next})}/>
        ))}
      </Space>
    )
  }
  if (!schema.additionalProperties) return <AdvancedJson value={current} onChange={onChange}/>
  return (
    <Space direction="vertical" style={{width: '100%'}}>
      {Object.entries(current).map(([key, entry]) => (
        <Space.Compact key={key} block>
          <Input value={key} aria-label="Map key" onChange={(event) => {
            const next = {...current}
            delete next[key]
            next[event.target.value] = entry
            onChange(next)
          }}/>
          <Input value={String(entry)} aria-label={`${key} value`} onChange={(event) => onChange({...current, [key]: event.target.value})}/>
          <Button danger icon={<DeleteOutlined/>} aria-label={`Remove ${key}`} onClick={() => {
            const next = {...current}
            delete next[key]
            onChange(next)
          }}/>
        </Space.Compact>
      ))}
      <Button icon={<PlusOutlined/>} onClick={() => onChange({...current, [`key${Object.keys(current).length + 1}`]: ''})}>Add entry</Button>
    </Space>
  )
}

function SchemaField({name, schema, value, onChange}: {name: string; schema: JsonObject; value: JsonValue | undefined; onChange: (value: JsonValue) => void}) {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : []
  const type = String(schema.type ?? '')
  const label = titleCase(name)
  let control
  if (enumValues.length) {
    control = <Select aria-label={label} value={value as string | number | undefined} style={{width: '100%'}} options={enumValues.map((item) => ({value: item as string | number, label: String(item)}))} onChange={onChange}/>
  } else if (type === 'boolean') {
    control = <Switch aria-label={label} checked={value === true} onChange={onChange}/>
  } else if (type === 'integer' || type === 'number') {
    control = <InputNumber aria-label={label} value={typeof value === 'number' ? value : undefined} min={typeof schema.minimum === 'number' ? schema.minimum : undefined} max={typeof schema.maximum === 'number' ? schema.maximum : undefined} step={type === 'integer' ? 1 : 0.1} style={{width: '100%'}} onChange={(next) => onChange(next ?? 0)}/>
  } else if (type === 'array') {
    control = <ArrayField label={label} schema={schema} value={value} onChange={onChange}/>
  } else if (type === 'object') {
    control = <MapField schema={schema} value={value} onChange={onChange}/>
  } else if (schema.oneOf || schema.anyOf) {
    control = <AdvancedJson value={value ?? null} onChange={onChange}/>
  } else {
    control = <Input aria-label={label} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}/>
  }
  return (
    <Form.Item label={label} extra={typeof schema.description === 'string' ? schema.description : undefined} style={{marginBottom: 12}}>
      {control}
    </Form.Item>
  )
}

export function GraphNodeInspector({
  node,
  definition,
  endpoints,
  profiles,
  nodes = [],
  definitions = [],
  parameters = [],
  issues,
  editable,
  onChange,
  onRemove,
}: {
  node?: GraphNodeDto
  definition?: NodeTypeDto
  endpoints: LogicalEndpointDto[]
  profiles: CamillaDSPProfileDto[]
  nodes?: GraphNodeDto[]
  definitions?: NodeTypeDto[]
  parameters?: GraphParameterDto[]
  issues: ValidationIssueDto[]
  editable: boolean
  onChange: (node: GraphNodeDto) => void
  onRemove: (nodeId: string) => void
}) {
  if (!node) return <Card title="Node inspector"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a node to inspect or configure it."/></Card>
  const properties = object(definition?.configurationSchema.properties)
  const updateField = (name: string, value: JsonValue) => onChange({...node, configuration: {...node.configuration, [name]: value}})
  return (
    <Card
      title={definition?.displayName ?? node.type}
      extra={<Tag>{definition?.category ?? 'unavailable'}</Tag>}
      actions={editable ? [
        <Button type="text" key="clear" onClick={() => onChange({...node, configuration: {}})}>Clear configuration</Button>,
        <Button type="text" key="collapse" onClick={() => onChange({...node, layout: {...node.layout, x: node.layout?.x ?? 0, y: node.layout?.y ?? 0, collapsed: !node.layout?.collapsed}})}>{node.layout?.collapsed ? 'Expand node' : 'Collapse node'}</Button>,
        <Popconfirm key="delete" title="Delete this node and its connected edges?" okText="Delete" okButtonProps={{danger: true}} onConfirm={() => onRemove(node.id)}><Button type="text" danger icon={<DeleteOutlined/>}>Delete</Button></Popconfirm>,
      ] : undefined}
    >
      <Space direction="vertical" style={{width: '100%'}}>
        <Text type="secondary">{definition?.description ?? 'This node type is not available in the current catalogue.'}</Text>
        {issues.length ? <Alert type="error" showIcon message={`${issues.length} validation issue(s)`} description={issues.map((issue) => <div key={`${issue.path}:${issue.code}`}>{issue.message}</div>)}/> : null}
        <Divider style={{margin: '8px 0'}}/>
        <Form layout="vertical" disabled={!editable}>
          {node.type === 'core.endpoint-reference' ? (
            <EndpointReferenceEditor configuration={node.configuration} endpoints={endpoints} onChange={(configuration) => onChange({...node, configuration})}/>
          ) : node.type === 'core.explicit-adapter' ? (
            <>
              <Form.Item label="Target signal" extra="Describe the signal this adapter must produce.">
                <SignalContractEditor value={node.configuration.targetContract} onChange={(targetContract) => updateField('targetContract', targetContract)}/>
              </Form.Item>
              <SchemaField name="strategy" schema={object(properties.strategy)} value={node.configuration.strategy} onChange={(value) => updateField('strategy', value)}/>
            </>
          ) : node.type === 'processor.camilladsp-profile-selector' ? (
            <CamillaDSPConfigurationEditor configuration={node.configuration} endpoints={endpoints} profiles={profiles} onChange={(configuration) => onChange({...node, configuration})}/>
          ) : Object.entries(properties).map(([name, rawSchema]) => {
            const fieldSchema = object(rawSchema)
            if (name === 'candidates' && selectorNodeTypes.has(node.type)) return (
              <Form.Item
                key={name}
                label="Device priority"
                extra="Device availability is evaluated at runtime; the graph remains valid when a configured device is disconnected."
              >
                <SelectorCandidatesField
                  value={node.configuration[name]}
                  endpoints={endpoints}
                  nodes={nodes}
                  definitions={definitions}
                  parameters={parameters}
                  onChange={(value) => updateField(name, value)}
                />
              </Form.Item>
            )
            if (name === 'condition' && node.type === 'core.conditional-bypass') return (
              <Form.Item key={name} label="Bypass rule" extra="When this rule is true, audio uses the processed input. Otherwise it uses the original bypass input.">
                <ConditionEditor
                  value={node.configuration[name]}
                  endpoints={endpoints}
                  nodes={nodes}
                  definitions={definitions}
                  parameters={parameters}
                  onChange={(condition) => updateField(name, condition)}
                />
              </Form.Item>
            )
            if (name === 'unknownResult' && node.type === 'core.conditional-bypass') return (
              <Form.Item key={name} label="When the rule cannot be evaluated" extra="Choose the safe behavior while required live information is not available.">
                <Select
                  aria-label="Unknown condition result"
                  value={typeof node.configuration[name] === 'string' ? node.configuration[name] : 'bypass'}
                  options={[
                    {value: 'bypass', label: 'Use original bypass path'},
                    {value: 'processed', label: 'Use processed path'},
                    {value: 'waiting', label: 'Wait for information'},
                    {value: 'error', label: 'Stop with an error'},
                  ]}
                  onChange={(value) => updateField(name, value)}
                />
              </Form.Item>
            )
            if (name === 'logicalEndpointId') return (
              <Form.Item key={name} label="Logical endpoint">
                <Select aria-label="Logical endpoint" value={String(node.configuration[name] ?? '') || undefined} placeholder="Choose endpoint" options={endpoints.map((endpoint) => ({value: endpoint.id, label: `${endpoint.name} (${endpoint.direction})`}))} onChange={(value) => updateField(name, value)}/>
              </Form.Item>
            )
            if (fieldSchema['x-open-cinema-widget'] === 'plugin-instance-select') {
              const pluginId = fieldSchema['x-open-cinema-plugin']
              const capabilityId = fieldSchema['x-open-cinema-capability']
              const options = endpoints.flatMap((endpoint) => {
                const metadata = endpoint.policyMetadata
                const instanceId = metadata.instanceId
                if (
                  metadata.managedSource !== true
                  || metadata.pluginId !== pluginId
                  || metadata.capabilityId !== capabilityId
                  || typeof instanceId !== 'string'
                ) return []
                return [{value: instanceId, label: endpoint.name}]
              })
              return (
                <Form.Item
                  key={name}
                  label={titleCase(name.replace(/Id$/, ''))}
                  extra={typeof fieldSchema.description === 'string'
                    ? fieldSchema.description
                    : 'Choose a stable plugin-managed source. It remains selected while its process is stopped.'}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    aria-label={titleCase(name.replace(/Id$/, ''))}
                    value={typeof node.configuration[name] === 'string' ? node.configuration[name] : undefined}
                    placeholder="Choose source instance"
                    notFoundContent="No matching managed sources"
                    options={options}
                    onChange={(value) => updateField(name, value)}
                  />
                </Form.Item>
              )
            }
            if (name === 'profileId') return (
              <Form.Item key={name} label="CamillaDSP profile">
                <Select aria-label="CamillaDSP profile" value={String(node.configuration[name] ?? '') || undefined} placeholder="Choose profile" options={profiles.map((profile) => ({value: profile.profileId, label: `${profile.name} · v${profile.version}`}))} onChange={(profileId) => {
                  const profile = profiles.find((item) => item.profileId === profileId)
                  if (profile) onChange({...node, configuration: {...node.configuration, profileId, profileVersion: profile.version}})
                }}/>
              </Form.Item>
            )
            return <SchemaField key={name} name={name} schema={fieldSchema} value={node.configuration[name]} onChange={(value) => updateField(name, value)}/>
          })}
        </Form>
        {node.subgraph ? (
          <Card size="small" title="Pinned reusable subgraph">
            <Space direction="vertical" size="small">
              <Text>Definition: {node.subgraph.definitionId}</Text>
              <Text>Revision: {node.subgraph.revisionId}</Text>
              <Text type="secondary">Use the Subgraphs menu above the canvas to change the pinned revision, parameters, or public port bindings.</Text>
            </Space>
          </Card>
        ) : null}
      </Space>
    </Card>
  )
}
