import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react'
import {Alert, Badge, Button, Card, Col, Descriptions, Row, Space, Spin, Table, Tag, Typography} from 'antd'
import {ReloadOutlined} from '@ant-design/icons'
import {
  OrchestrationEventSubscription,
  OrchestrationStore,
  type CurrentPlanDto,
  type EndpointCandidateExplanationDto,
  type GraphDefinitionDto,
  type LogicalEndpointDto,
  type RuntimeProjectionDto,
} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

export function DashboardPage() {
  const store = useMemo(() => new OrchestrationStore(), [])
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [endpoints, setEndpoints] = useState<LogicalEndpointDto[]>([])
  const [definitions, setDefinitions] = useState<GraphDefinitionDto[]>([])
  const [plans, setPlans] = useState<CurrentPlanDto[]>([])
  const [processors, setProcessors] = useState<RuntimeProjectionDto[]>([])
  const [matches, setMatches] = useState<Record<string, EndpointCandidateExplanationDto>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const metadata = await audioApi.metadata()
      store.setCompatibility(metadata)
      const [endpointPage, graphPage, currentPlans, runtime, readiness, processorPage] = await Promise.all([
        audioApi.endpoints(),
        audioApi.definitions(),
        audioApi.currentPlans(),
        audioApi.runtimeSnapshot(),
        audioApi.readiness(),
        audioApi.processors(),
      ])
      setEndpoints(endpointPage.items)
      setDefinitions(graphPage.items)
      setPlans(currentPlans.items)
      setProcessors(processorPage.items)
      store.installDesired({definitions: graphPage.items, endpoints: endpointPage.items})
      store.installCurrentPlans(currentPlans.items)
      store.replaceRuntime(runtime)
      store.setReadiness(readiness)
      const explanations = await Promise.all(endpointPage.items.map(async (endpoint) => [
        endpoint.id,
        await audioApi.endpointExplanation(endpoint.id),
      ] as const))
      setMatches(Object.fromEntries(explanations))
      setError(undefined)
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught)
      setError(detail)
      store.setConnection(caught instanceof Error && caught.name === 'UnsupportedAudioContractError' ? 'incompatible' : 'offline', detail)
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    void load()
    const subscription = new OrchestrationEventSubscription(audioApi, store)
    subscription.connect()
    return () => subscription.close()
  }, [load, store])

  if (loading) return <Spin fullscreen tip="Loading Open Cinema status…"/>

  const activePlans = plans.filter((plan) => plan.applied.status !== 'idle')
  const readyProcessors = processors.filter((processor) => processor.payload.ready === true)

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <div>
        <Title level={2}>Dashboard</Title>
        <Paragraph>Current appliance and audio-orchestration status.</Paragraph>
      </div>
      {error && <Alert type="error" showIcon message="Open Cinema status is unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>}/>}
      {!state.readiness?.liveControlsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="Desired audio can still be edited; live changes are paused"
          description={state.readiness?.blockers.join(', ') || state.connectionMessage}
        />
      )}
      {state.recoveryRequired && <Alert type="info" showIcon message="Recovering missed live events from a full snapshot"/>}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card title="Application">
            <Badge status={state.connection === 'online' ? 'success' : 'warning'} text={state.connection}/>
            <Descriptions size="small" column={1} style={{marginTop: 12}}>
              <Descriptions.Item label="Desired editing">available</Descriptions.Item>
              <Descriptions.Item label="Runtime">{state.runtime.available ? 'available' : 'unavailable'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Endpoints">
            <Title level={3}>{endpoints.length}</Title>
            <Text type="secondary">{Object.values(matches).filter((item) => item.resolution.status === 'matched').length} connected</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Desired graphs">
            <Title level={3}>{definitions.filter((item) => item.kind === 'graph').length}</Title>
            <Text type="secondary">{activePlans.length} active plan(s)</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Processors">
            <Title level={3}>{processors.length}</Title>
            <Text type="secondary">{readyProcessors.length} ready</Text>
          </Card>
        </Col>
      </Row>

      <Card title="Devices" extra={<Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh</Button>}>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={endpoints}
          columns={[
            {title: 'Name', dataIndex: 'name'},
            {title: 'Direction', dataIndex: 'direction', render: (value: string) => <Tag>{value}</Tag>},
            {
              title: 'Availability',
              render: (_, endpoint) => {
                const status = matches[endpoint.id]?.resolution.status ?? 'unknown'
                return <Badge status={status === 'matched' ? 'success' : status === 'ambiguous' ? 'warning' : 'default'} text={status}/>
              },
            },
            {title: 'Last seen', render: (_, endpoint) => String(endpoint.lastKnown.lastSeen ?? endpoint.updatedAt ?? 'unknown')},
          ]}
        />
      </Card>
      <Alert type="info" showIcon message="System information, updates, and reboot controls will extend this dashboard in a later deployment change."/>
    </Space>
  )
}
