import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {PlusSquareOutlined, ReloadOutlined} from '@ant-design/icons'
import type {
  EndpointCandidateExplanationDto,
  EndpointSelectorDto,
  JsonObject,
  LogicalEndpointDto,
  RuntimeProjectionDto,
  SelectorPreviewDto,
} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

function candidateName(candidate: RuntimeProjectionDto): string {
  return String(candidate.payload.description ?? candidate.payload.name ?? candidate.subject)
}

function candidateOptionLabel(candidate: RuntimeProjectionDto): string {
  return candidate.payload.origin === 'managed-adapter'
    ? `${candidateName(candidate)} · managed adapter`
    : candidateName(candidate)
}

function capabilitySummary(candidate: RuntimeProjectionDto | undefined): string {
  if (!candidate) return 'last known only'
  const capabilities = candidate.payload.audioCapabilities
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) return 'not reported'
  const formats = Array.isArray(capabilities.formats) ? capabilities.formats.length : 0
  const details = [`${formats} format(s)`]
  if (capabilities.volume !== undefined) details.push('volume')
  if (capabilities.mute !== undefined) details.push('mute')
  return details.join(', ')
}

function candidateFor(
  endpoint: LogicalEndpointDto,
  explanation: EndpointCandidateExplanationDto | undefined,
  candidates: RuntimeProjectionDto[],
) {
  return candidates.find((candidate) =>
    candidate.payload.runtimeKey === explanation?.resolution.selectedRuntimeKey &&
    candidate.payload.direction === endpoint.direction,
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

export function DeviceDiscoveryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [endpoints, setEndpoints] = useState<LogicalEndpointDto[]>([])
  const [candidates, setCandidates] = useState<RuntimeProjectionDto[]>([])
  const [managedResources, setManagedResources] = useState<RuntimeProjectionDto[]>([])
  const [processors, setProcessors] = useState<RuntimeProjectionDto[]>([])
  const [explanations, setExplanations] = useState<Record<string, EndpointCandidateExplanationDto>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [preview, setPreview] = useState<SelectorPreviewDto>()
  const [review, setReview] = useState<JsonObject>()
  const [form] = Form.useForm<{name: string; direction: 'input' | 'output'; runtimeKey: string}>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await audioApi.metadata()
      const [endpointPage, candidatePage, resourcePage, processorPage] = await Promise.all([
        audioApi.endpoints(),
        audioApi.endpointCandidates(),
        audioApi.managedResources(),
        audioApi.processors(),
      ])
      setEndpoints(endpointPage.items)
      setCandidates(candidatePage.items)
      setManagedResources(resourcePage.items)
      setProcessors(processorPage.items)
      const details = await Promise.all(endpointPage.items.map(async (endpoint) => [
        endpoint.id,
        await audioApi.endpointExplanation(endpoint.id),
      ] as const))
      setExplanations(Object.fromEntries(details))
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const updateEndpoint = (endpoint: LogicalEndpointDto) => {
    setEndpoints((items) => items.map((item) => item.id === endpoint.id ? endpoint : item))
    void audioApi.endpointExplanation(endpoint.id).then((explanation) => {
      setExplanations((items) => ({...items, [endpoint.id]: explanation}))
    })
  }

  const bind = async (endpoint: LogicalEndpointDto, runtimeKey: string | null) => {
    try {
      const result = await audioApi.bindEndpoint(endpoint.id, runtimeKey, endpoint.updateVersion)
      updateEndpoint(result.endpoint)
      setReview(result.selectorReview ?? undefined)
      message.success(runtimeKey ? 'Stable endpoint binding saved.' : 'Explicit binding cleared.')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
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
          <Text>This persistent selector currently resolves as <Tag>{selectorPreview.resolution.status}</Tag>.</Text>
          <pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(selector, null, 2)}</pre>
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

  if (loading) return <Spin fullscreen tip="Discovering audio devices…"/>

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <Space style={{width: '100%', justifyContent: 'space-between'}} align="start" wrap>
        <div>
          <Title level={2}>Devices</Title>
          <Paragraph>Connected devices and durable logical endpoints remain distinct from transient PipeWire IDs.</Paragraph>
        </div>
        <Space>
          <Button type="primary" icon={<PlusSquareOutlined/>} onClick={() => setCreateOpen(true)}>Create endpoint</Button>
          <Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh Devices</Button>
        </Space>
      </Space>
      {error && <Alert type="error" showIcon message="Device discovery failed" description={error}/>}
      {review && <Alert closable type="success" showIcon message="Binding selector review" description={<pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(review, null, 2)}</pre>} onClose={() => setReview(undefined)}/>}

      <Table
        rowKey="id"
        dataSource={endpoints}
        expandable={{
          expandedRowRender: (endpoint) => {
            const explanation = explanations[endpoint.id]
            const candidate = candidateFor(endpoint, explanation, candidates)
            return (
              <Descriptions bordered size="small" column={{xs: 1, lg: 2}}>
                <Descriptions.Item label="Selector"><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(endpoint.explicitBinding ?? endpoint.selector, null, 2)}</pre></Descriptions.Item>
                <Descriptions.Item label="Matching evidence">{explanation?.resolution.diagnostics.find((item) => item.runtimeKey === explanation.resolution.selectedRuntimeKey)?.acceptedEvidence.join(', ') || 'none'}</Descriptions.Item>
                <Descriptions.Item label="Ambiguity">{explanation?.resolution.tiedRuntimeKeys.join(', ') || 'none'}</Descriptions.Item>
                <Descriptions.Item label="Routes">{Array.isArray(candidate?.payload.routes) ? candidate.payload.routes.map((item) => String((item as JsonObject).name)).join(', ') : 'not observed'}</Descriptions.Item>
                <Descriptions.Item label="Tags">{endpoint.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Descriptions.Item>
                <Descriptions.Item label="Groups">{endpoint.groups.map((group) => <Tag key={group}>{group}</Tag>)}</Descriptions.Item>
              </Descriptions>
            )
          },
        }}
        columns={[
          {title: 'Name', dataIndex: 'name'},
          {title: 'Direction', dataIndex: 'direction', render: (value: string) => <Tag>{value}</Tag>},
          {
            title: 'Availability',
            render: (_, endpoint) => {
              const status = explanations[endpoint.id]?.resolution.status ?? 'unavailable'
              return <Badge status={status === 'matched' ? 'success' : status === 'ambiguous' ? 'warning' : 'default'} text={status}/>
            },
          },
          {
            title: 'Capabilities',
            render: (_, endpoint) => capabilitySummary(candidateFor(endpoint, explanations[endpoint.id], candidates)),
          },
          {
            title: 'Last seen',
            render: (_, endpoint) => candidateFor(endpoint, explanations[endpoint.id], candidates)?.observedAt ?? String(endpoint.lastKnown.lastSeen ?? endpoint.updatedAt),
          },
          {
            title: 'Binding',
            render: (_, endpoint) => (
              <Select
                aria-label={`Bind ${endpoint.name}`}
                allowClear
                placeholder="Automatic selector"
                value={explanations[endpoint.id]?.resolution.selectedRuntimeKey ?? undefined}
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

      <Card title="Managed processor resources" extra={<Tag>not physical endpoints</Tag>}>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={[...managedResources, ...processors.filter((processor) => !managedResources.some((resource) => resource.subject === processor.subject))]}
          locale={{emptyText: 'No managed CamillaDSP or decoder resource is currently observed.'}}
          columns={[
            {title: 'Resource', dataIndex: 'subject'},
            {title: 'Kind', dataIndex: 'type', render: (value: string) => <Tag color="purple">{value}</Tag>},
            {title: 'Lifecycle / health', render: (_, item) => String(item.payload.health ?? item.payload.state ?? (item.payload.ready === true ? 'ready' : 'unknown'))},
            {title: 'Profile / mode', render: (_, item) => String(item.payload.profile ?? item.payload.activeProfile ?? item.payload.mode ?? 'not reported')},
            {title: 'Observed', dataIndex: 'observedAt'},
          ]}
        />
      </Card>

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
        {preview && <Text type="secondary">Last preview: {preview.resolution.status}</Text>}
      </Modal>
    </Space>
  )
}
