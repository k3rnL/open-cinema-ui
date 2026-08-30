import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Badge,
  Button,
  Collapse,
  Descriptions,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Select,
  Slider,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  AudioMutedOutlined,
  AudioOutlined,
  PlusSquareOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type {
  EndpointAudioLevelDto,
  EndpointCandidateExplanationDto,
  EndpointSelectorDto,
  JsonObject,
  JsonValue,
  LogicalEndpointDto,
  RuntimeProjectionDto,
  SelectorPreviewDto,
} from '@open-cinema/shared'
import {
  PageHeading,
  SectionSkeleton,
  StableStatusRegion,
  ValueWithFreshness,
} from '@/components/admin'
import {audioApi} from './client'

const {Text} = Typography

function candidateName(candidate: RuntimeProjectionDto): string {
  return String(candidate.payload.description ?? candidate.payload.name ?? candidate.subject)
}

function candidateOptionLabel(candidate: RuntimeProjectionDto): string {
  return candidate.payload.origin === 'managed-adapter'
    ? `${candidateName(candidate)} · managed adapter`
    : candidateName(candidate)
}

function candidateFor(
  endpoint: LogicalEndpointDto,
  explanation: EndpointCandidateExplanationDto | undefined,
  candidates: RuntimeProjectionDto[],
) {
  return candidates.find((candidate) =>
    candidate.payload.runtimeKey === explanation?.resolution.selectedRuntimeKey
    && candidate.payload.direction === endpoint.direction,
  )
}

function selectorFor(candidate: RuntimeProjectionDto): EndpointSelectorDto {
  const payload = candidate.payload
  const name = payload.name ?? payload.description ?? candidate.subject
  return {
    version: 1,
    match: 'all',
    predicates: [
      {path: 'direction', operator: 'exact', value: String(payload.direction)},
      {path: typeof payload.name === 'string' ? 'node.name' : 'node.description', operator: 'exact', value: String(name)},
    ],
  }
}

function valueLabel(value: JsonValue): string {
  if (Array.isArray(value)) return value.map(valueLabel).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function predicateLabel(predicate: EndpointSelectorDto['predicates'][number]): string {
  const field = {
    direction: 'Direction',
    'node.name': 'Device name',
    'node.description': 'Device description',
    'device.name': 'Hardware device',
    'media.class': 'Media class',
  }[predicate.path] ?? predicate.path.replace(/[._]/g, ' ')
  const operator = predicate.operator === 'exact'
    ? 'is'
    : predicate.operator === 'oneOf'
      ? 'is one of'
      : 'matches'
  return `${field} ${operator} ${valueLabel(predicate.value)}`
}

function SelectorSummary({selector}: {selector: EndpointSelectorDto}) {
  return (
    <Space direction="vertical" size={2}>
      <Text type="secondary">{selector.match === 'all' ? 'All conditions must match:' : 'Any condition may match:'}</Text>
      {selector.predicates.map((predicate, index) => (
        <Text key={`${predicate.path}:${index}`}>• {predicateLabel(predicate)}</Text>
      ))}
    </Space>
  )
}

function capabilitySummary(level: EndpointAudioLevelDto | undefined): string {
  if (!level) return 'Not reported'
  const capabilities: string[] = []
  if (level.capabilities.volume.writable) capabilities.push('volume control')
  else if (level.capabilities.volume.readable) capabilities.push('volume read-only')
  if (level.capabilities.mute.writable) capabilities.push('mute control')
  else if (level.capabilities.mute.readable) capabilities.push('mute read-only')
  return capabilities.length ? capabilities.join(' · ') : 'No level controls'
}

export function DeviceDiscoveryPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [endpoints, setEndpoints] = useState<LogicalEndpointDto[]>([])
  const [candidates, setCandidates] = useState<RuntimeProjectionDto[]>([])
  const [explanations, setExplanations] = useState<Record<string, EndpointCandidateExplanationDto>>({})
  const [levels, setLevels] = useState<Record<string, EndpointAudioLevelDto>>({})
  const levelsRef = useRef<Record<string, EndpointAudioLevelDto>>({})
  const queuedLevels = useRef<Record<string, Partial<EndpointAudioLevelDto['desired']>>>({})
  const activeWriters = useRef(new Set<string>())
  const [writing, setWriting] = useState<string[]>([])
  const [bindingEndpoint, setBindingEndpoint] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState<SelectorPreviewDto>()
  const [review, setReview] = useState<JsonObject>()
  const [form] = Form.useForm<{name: string; direction: 'input' | 'output'; runtimeKey: string}>()

  const installLevel = useCallback((level: EndpointAudioLevelDto) => {
    levelsRef.current = {...levelsRef.current, [level.endpointId]: level}
    setLevels(levelsRef.current)
  }, [])

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      await audioApi.metadata()
      const [endpointPage, candidatePage] = await Promise.all([
        audioApi.endpoints(),
        audioApi.endpointCandidates(),
      ])
      setEndpoints(endpointPage.items)
      setCandidates(candidatePage.items)
      const [explanationResults, levelResults] = await Promise.all([
        Promise.allSettled(endpointPage.items.map((endpoint) => audioApi.endpointExplanation(endpoint.id))),
        Promise.allSettled(endpointPage.items.map((endpoint) => audioApi.endpointLevel(endpoint.id))),
      ])
      setExplanations(Object.fromEntries(explanationResults.flatMap((result, index) =>
        result.status === 'fulfilled' ? [[endpointPage.items[index].id, result.value] as const] : [],
      )))
      const nextLevels = Object.fromEntries(levelResults.flatMap((result) =>
        result.status === 'fulfilled' ? [[result.value.value.endpointId, result.value.value] as const] : [],
      ))
      levelsRef.current = nextLevels
      setLevels(nextLevels)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => void load(true), [load])

  const updateEndpoint = (endpoint: LogicalEndpointDto) => {
    setEndpoints((items) => items.map((item) => item.id === endpoint.id ? endpoint : item))
    void Promise.allSettled([
      audioApi.endpointExplanation(endpoint.id),
      audioApi.endpointLevel(endpoint.id),
    ]).then(([explanation, level]) => {
      if (explanation.status === 'fulfilled') {
        setExplanations((items) => ({...items, [endpoint.id]: explanation.value}))
      }
      if (level.status === 'fulfilled') installLevel(level.value.value)
    })
  }

  const bind = async (endpoint: LogicalEndpointDto, runtimeKey: string | null) => {
    setBindingEndpoint(endpoint.id)
    try {
      const result = await audioApi.bindEndpoint(endpoint.id, runtimeKey, endpoint.updateVersion)
      updateEndpoint(result.endpoint)
      setReview(result.selectorReview ?? undefined)
      message.success(runtimeKey ? 'Stable endpoint binding saved.' : 'Explicit binding cleared.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBindingEndpoint(undefined)
    }
  }

  const writeLevel = useCallback(async (
    endpointId: string,
    changes: Partial<EndpointAudioLevelDto['desired']>,
  ) => {
    queuedLevels.current[endpointId] = {...queuedLevels.current[endpointId], ...changes}
    if (activeWriters.current.has(endpointId)) return
    activeWriters.current.add(endpointId)
    setWriting((items) => [...items, endpointId])
    try {
      while (queuedLevels.current[endpointId]) {
        const next = queuedLevels.current[endpointId]
        delete queuedLevels.current[endpointId]
        const current = levelsRef.current[endpointId]
        if (!current?.runtimeVersion) throw new Error('This device is not currently available for level control.')
        const result = await audioApi.updateEndpointLevel(
          endpointId,
          current.updateVersion,
          current.runtimeVersion,
          next,
        )
        installLevel(result.value)
      }
      setError(undefined)
    } catch (caught) {
      delete queuedLevels.current[endpointId]
      setError(caught instanceof Error ? caught.message : String(caught))
      const current = await audioApi.endpointLevel(endpointId).catch(() => undefined)
      if (current) installLevel(current.value)
    } finally {
      activeWriters.current.delete(endpointId)
      setWriting((items) => items.filter((item) => item !== endpointId))
    }
  }, [installLevel])

  const optimisticLevel = (endpointId: string, changes: Partial<EndpointAudioLevelDto['desired']>) => {
    const current = levelsRef.current[endpointId]
    if (!current) return
    installLevel({...current, desired: {...current.desired, ...changes}, applying: true})
  }

  const create = async () => {
    const values = await form.validateFields()
    const candidate = candidates.find((item) => item.payload.runtimeKey === values.runtimeKey)
    if (!candidate) return
    const selector = selectorFor(candidate)
    const selectorPreview = await audioApi.previewSelector(selector, values.direction)
    setPreview(selectorPreview)
    Modal.confirm({
      title: 'Create this logical endpoint?',
      width: 680,
      content: (
        <Space direction="vertical" style={{width: '100%'}}>
          <Text>This selector currently resolves as <Tag>{selectorPreview.resolution.status.replace('_', ' ')}</Tag>.</Text>
          <SelectorSummary selector={selector}/>
          <Collapse
            ghost
            items={[{key: 'technical', label: 'Technical selector', children: (
              <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify(selector, null, 2)}</pre>
            )}]}
          />
        </Space>
      ),
      onOk: async () => {
        const endpoint = await audioApi.createEndpoint({
          name: values.name,
          direction: values.direction,
          selector,
          lastKnown: {description: candidateName(candidate), lastSeen: candidate.observedAt},
        })
        const result = await audioApi.bindEndpoint(endpoint.id, String(candidate.payload.runtimeKey), endpoint.updateVersion)
        setCreateOpen(false)
        form.resetFields()
        await load()
        setReview(result.selectorReview ?? undefined)
      },
    })
  }

  const bindableCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.payload.managedProcessor !== true),
    [candidates],
  )

  const status = error ? {
    type: 'error' as const,
    message: 'Some device information or control could not be updated',
    description: error,
    action: <Button onClick={() => void load()}>Retry</Button>,
  } : review ? {
    type: 'success' as const,
    message: 'Binding saved',
    description: (
      <Space direction="vertical">
        <Text>The stable selector will be used again when this device reconnects.</Text>
        <Collapse ghost items={[{key: 'review', label: 'Technical review', children: (
          <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{JSON.stringify(review, null, 2)}</pre>
        )}]}/>
      </Space>
    ),
  } : null

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading
        title="Devices"
        description="Persistent inputs and outputs. Disconnected devices remain visible and keep their saved identity and level preferences."
        actions={(
          <>
            <Button type="primary" icon={<PlusSquareOutlined/>} onClick={() => setCreateOpen(true)}>Create endpoint</Button>
            <Button icon={<ReloadOutlined/>} loading={refreshing} onClick={() => void load()}>Refresh</Button>
          </>
        )}
      />
      <StableStatusRegion status={status} loading={loading && endpoints.length === 0}/>

      {loading && endpoints.length === 0 ? <SectionSkeleton rows={5}/> : (
        <Table
          rowKey="id"
          dataSource={endpoints}
          scroll={{x: 1180}}
          locale={{emptyText: 'No logical devices have been created yet.'}}
          expandable={{
            columnTitle: 'Details',
            expandedRowRender: (endpoint) => {
              const explanation = explanations[endpoint.id]
              const candidate = candidateFor(endpoint, explanation, candidates)
              const diagnostic = explanation?.resolution.diagnostics.find((item) =>
                item.runtimeKey === explanation.resolution.selectedRuntimeKey,
              )
              const selector = endpoint.explicitBinding ?? endpoint.selector
              return (
                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                  <Descriptions bordered size="small" column={{xs: 1, lg: 2}}>
                    <Descriptions.Item label="How it is found"><SelectorSummary selector={selector}/></Descriptions.Item>
                    <Descriptions.Item label="Why this device matched">
                      {diagnostic?.acceptedEvidence.length
                        ? <List size="small" dataSource={diagnostic.acceptedEvidence} renderItem={(item) => <List.Item>{item}</List.Item>}/>
                        : 'No matching evidence is currently available.'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Ambiguity">
                      {explanation?.resolution.tiedRuntimeKeys.length
                        ? `${explanation.resolution.tiedRuntimeKeys.length} devices matched equally.`
                        : 'No ambiguity detected.'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Routes">
                      {Array.isArray(candidate?.payload.routes)
                        ? candidate.payload.routes.map((item) => String((item as JsonObject).name ?? 'Unnamed route')).join(', ')
                        : 'Not observed'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tags">{endpoint.tags.length ? endpoint.tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : 'None'}</Descriptions.Item>
                    <Descriptions.Item label="Groups">{endpoint.groups.length ? endpoint.groups.map((group) => <Tag key={group}>{group}</Tag>) : 'None'}</Descriptions.Item>
                  </Descriptions>
                  <Collapse ghost items={[{key: 'technical', label: 'Technical details', children: (
                    <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>
                      {JSON.stringify({selector, explanation, level: levels[endpoint.id]}, null, 2)}
                    </pre>
                  )}]}/>
                </Space>
              )
            },
          }}
          columns={[
            {
              title: 'Device',
              render: (_, endpoint) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{endpoint.name}</Text>
                  <Tag>{endpoint.direction}</Tag>
                </Space>
              ),
            },
            {
              title: 'Availability',
              render: (_, endpoint) => {
                const level = levels[endpoint.id]
                const availability = level?.availability
                  ?? explanations[endpoint.id]?.resolution.status
                  ?? 'unavailable'
                const available = level
                  ? level.availability === 'available'
                  : explanations[endpoint.id]?.resolution.status === 'matched'
                return <Badge status={available ? 'success' : availability === 'ambiguous' ? 'warning' : 'default'} text={availability.replace('_', ' ')}/>
              },
            },
            {
              title: 'Capabilities',
              render: (_, endpoint) => capabilitySummary(levels[endpoint.id]),
            },
            {
              title: 'Last seen',
              responsive: ['xl'],
              render: (_, endpoint) => {
                const observedAt = candidateFor(endpoint, explanations[endpoint.id], candidates)?.observedAt
                  ?? (typeof endpoint.lastKnown.lastSeen === 'string' ? endpoint.lastKnown.lastSeen : null)
                return <ValueWithFreshness value={observedAt ? new Date(observedAt).toLocaleString() : null} observedAt={observedAt} stale={!candidateFor(endpoint, explanations[endpoint.id], candidates)}/>
              },
            },
            {
              title: 'Level',
              render: (_, endpoint) => {
                const level = levels[endpoint.id]
                if (!level) return <Text type="secondary">Unavailable</Text>
                const volumeWritable = level.availability === 'available' && level.capabilities.volume.writable && Boolean(level.runtimeVersion)
                const muteWritable = level.availability === 'available' && level.capabilities.mute.writable && Boolean(level.runtimeVersion)
                return (
                  <Flex gap="small" align="center" style={{minWidth: 230}}>
                    <Button
                      aria-label={`${level.desired.muted ? 'Unmute' : 'Mute'} ${endpoint.name}`}
                      icon={level.desired.muted ? <AudioMutedOutlined/> : <AudioOutlined/>}
                      disabled={!muteWritable}
                      loading={writing.includes(endpoint.id)}
                      onClick={() => {
                        const muted = !level.desired.muted
                        optimisticLevel(endpoint.id, {muted})
                        void writeLevel(endpoint.id, {muted})
                      }}
                    />
                    <Slider
                      ariaLabelForHandle={`${endpoint.name} level`}
                      min={0}
                      max={100}
                      value={Math.round(level.desired.level * 100)}
                      disabled={!volumeWritable}
                      tooltip={{formatter: (value) => `${value}%`}}
                      style={{flex: 1, minWidth: 100}}
                      onChange={(value) => optimisticLevel(endpoint.id, {level: value / 100})}
                      onChangeComplete={(value) => void writeLevel(endpoint.id, {level: value / 100})}
                    />
                    <Text style={{minWidth: 38, textAlign: 'right'}}>{Math.round(level.desired.level * 100)}%</Text>
                  </Flex>
                )
              },
            },
            {
              title: 'Binding',
              render: (_, endpoint) => (
                <Select
                  aria-label={`Bind ${endpoint.name}`}
                  allowClear
                  loading={bindingEndpoint === endpoint.id}
                  placeholder="Automatic selector"
                  value={endpoint.explicitBinding ? explanations[endpoint.id]?.resolution.selectedRuntimeKey ?? undefined : undefined}
                  style={{minWidth: 230}}
                  options={bindableCandidates
                    .filter((candidate) => candidate.payload.direction === endpoint.direction)
                    .map((candidate) => ({value: String(candidate.payload.runtimeKey), label: candidateOptionLabel(candidate)}))}
                  onChange={(runtimeKey) => void bind(endpoint, runtimeKey ?? null)}
                />
              ),
            },
          ]}
        />
      )}

      <Modal title="Create a logical endpoint" open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)}>
        <Form form={form} layout="vertical" initialValues={{direction: 'output'}}>
          <Form.Item name="name" label="Name" rules={[{required: true}]}><Input/></Form.Item>
          <Form.Item name="direction" label="Direction" rules={[{required: true}]}>
            <Select options={[{value: 'input', label: 'Input'}, {value: 'output', label: 'Output'}]}/>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.direction !== current.direction}>
            {({getFieldValue}) => (
              <Form.Item name="runtimeKey" label="Observed device" rules={[{required: true}]}>
                <Select options={bindableCandidates
                  .filter((candidate) => candidate.payload.direction === getFieldValue('direction'))
                  .map((candidate) => ({value: String(candidate.payload.runtimeKey), label: candidateOptionLabel(candidate)}))}/>
              </Form.Item>
            )}
          </Form.Item>
        </Form>
        {preview && <Text type="secondary">Last preview: {preview.resolution.status.replace('_', ' ')}</Text>}
      </Modal>
    </Space>
  )
}
