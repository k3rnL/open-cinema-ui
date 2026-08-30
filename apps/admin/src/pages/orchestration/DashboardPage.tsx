import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Progress,
  Row,
  Slider,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  AudioMutedOutlined,
  AudioOutlined,
  ReloadOutlined,
  RetweetOutlined,
} from '@ant-design/icons'
import {
  OrchestrationEventSubscription,
  OrchestrationStore,
  type CapabilityActionDto,
  type CurrentPlanDto,
  type EndpointCandidateExplanationDto,
  type GraphDefinitionDto,
  type LogicalEndpointDto,
  type ManagedResourceDto,
  type MasterAudioLevelDto,
  type SystemComponentDto,
  type SystemControlOperationDto,
  type SystemMetricsDto,
  type SystemOverviewDto,
} from '@open-cinema/shared'
import { Link } from 'react-router'
import {
  CapabilityAction,
  MetricSparkline,
  PageHeading,
  SectionSkeleton,
  StableStatusRegion,
  ValueWithFreshness,
} from '@/components/admin'
import { audioApi, systemApi } from './client'

const { Text } = Typography
const METRIC_LIMIT = 60
const METRIC_INTERVAL_MS = 2_000

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unknown'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${amount.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'Unknown'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3_600) / 60)}m`
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function HealthBadge({ status }: { status: string }) {
  const badge = status === 'ready' || status === 'healthy' || status === 'converged'
    ? 'success'
    : status === 'degraded' || status === 'applying' || status === 'reconnecting'
      ? 'warning'
      : status === 'failed'
        ? 'error'
        : 'default'
  return <Badge status={badge} text={status.replace(/-/g, ' ')} />
}

export function DashboardPage() {
  const store = useMemo(() => new OrchestrationStore(), [])
  const liveState = useSyncExternalStore(store.subscribe, store.getState)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [overview, setOverview] = useState<SystemOverviewDto>()
  const [metrics, setMetrics] = useState<SystemMetricsDto[]>([])
  const [components, setComponents] = useState<SystemComponentDto[]>([])
  const [applianceActions, setApplianceActions] = useState<CapabilityActionDto[]>([])
  const [master, setMaster] = useState<MasterAudioLevelDto>()
  const [masterWriting, setMasterWriting] = useState(false)
  const [endpoints, setEndpoints] = useState<LogicalEndpointDto[]>([])
  const [matches, setMatches] = useState<Record<string, EndpointCandidateExplanationDto>>({})
  const [definitions, setDefinitions] = useState<GraphDefinitionDto[]>([])
  const [plans, setPlans] = useState<CurrentPlanDto[]>([])
  const [resources, setResources] = useState<ManagedResourceDto[]>([])
  const [operation, setOperation] = useState<SystemControlOperationDto>()
  const [operationError, setOperationError] = useState<string>()
  const masterVersion = useRef(1)
  const queuedMaster = useRef<Partial<MasterAudioLevelDto['desired']>>()
  const writerActive = useRef(false)

  useEffect(() => {
    if (master) masterVersion.current = master.updateVersion
  }, [master])

  useEffect(() => {
    const liveMaster = liveState.operational.masterLevel
    if (liveMaster && liveMaster.updateVersion >= (master?.updateVersion ?? 0)) setMaster(liveMaster)
    const liveResources = Object.values(liveState.operational.managedResources)
    if (liveResources.length) setResources(liveResources)
  }, [liveState.operational.managedResources, liveState.operational.masterLevel, master?.updateVersion])

  const loadMetrics = useCallback(async () => {
    const sample = await systemApi.metrics()
    setMetrics((current) => [...current, sample].slice(-METRIC_LIMIT))
  }, [])

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    const failures: string[] = []
    const settled = await Promise.allSettled([
      systemApi.overview(),
      systemApi.components(),
      systemApi.actions(),
      audioApi.metadata(),
      audioApi.masterLevel(),
      audioApi.endpoints(),
      audioApi.definitions(),
      audioApi.currentPlans(),
      audioApi.managedResources(),
      audioApi.runtimeSnapshot(),
      audioApi.readiness(),
    ] as const)
    settled.forEach((result) => {
      if (result.status === 'rejected') {
        failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      }
    })
    const [overviewResult, componentResult, actionResult, metadataResult, masterResult, endpointResult, definitionResult, planResult, resourceResult, runtimeResult, readinessResult] = settled
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
    if (componentResult.status === 'fulfilled') setComponents(componentResult.value)
    if (actionResult.status === 'fulfilled') setApplianceActions(actionResult.value)
    if (metadataResult.status === 'fulfilled') store.setCompatibility(metadataResult.value)
    if (masterResult.status === 'fulfilled') {
      setMaster(masterResult.value.value)
      store.installMasterLevel(masterResult.value.value)
    }
    if (endpointResult.status === 'fulfilled') {
      setEndpoints(endpointResult.value.items)
      store.installDesired({ endpoints: endpointResult.value.items })
      const details = await Promise.allSettled(
        endpointResult.value.items.map((endpoint) => audioApi.endpointExplanation(endpoint.id)),
      )
      setMatches(Object.fromEntries(details.flatMap((result, index) =>
        result.status === 'fulfilled'
          ? [[endpointResult.value.items[index].id, result.value] as const]
          : [],
      )))
    }
    if (definitionResult.status === 'fulfilled') {
      setDefinitions(definitionResult.value.items)
      store.installDesired({ definitions: definitionResult.value.items })
    }
    if (planResult.status === 'fulfilled') {
      setPlans(planResult.value.items)
      store.installCurrentPlans(planResult.value.items)
    }
    if (resourceResult.status === 'fulfilled') {
      setResources(resourceResult.value.items)
      store.installManagedResources(resourceResult.value.items)
    }
    if (runtimeResult.status === 'fulfilled') store.replaceRuntime(runtimeResult.value)
    if (readinessResult.status === 'fulfilled') store.setReadiness(readinessResult.value)
    setError(failures.length ? [...new Set(failures)].join(' · ') : undefined)
    setLoading(false)
    setRefreshing(false)
  }, [store])

  useEffect(() => {
    void load(true)
    void loadMetrics().catch(() => undefined)
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMetrics().catch(() => undefined)
    }, METRIC_INTERVAL_MS)
    const visible = () => {
      if (document.visibilityState === 'visible') void loadMetrics().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', visible)
    const subscription = new OrchestrationEventSubscription(audioApi, store)
    subscription.connect()
    return () => {
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', visible)
      subscription.close()
    }
  }, [load, loadMetrics, store])

  const writeMaster = useCallback(async (changes: Partial<MasterAudioLevelDto['desired']>) => {
    queuedMaster.current = { ...queuedMaster.current, ...changes }
    if (writerActive.current) return
    writerActive.current = true
    setMasterWriting(true)
    try {
      while (queuedMaster.current) {
        const next = queuedMaster.current
        queuedMaster.current = undefined
        const result = await audioApi.updateMasterLevel(masterVersion.current, next)
        masterVersion.current = result.value.updateVersion
        setMaster(result.value)
        store.installMasterLevel(result.value)
      }
      setError(undefined)
    } catch (caught) {
      queuedMaster.current = undefined
      setError(caught instanceof Error ? caught.message : String(caught))
      const current = await audioApi.masterLevel().catch(() => undefined)
      if (current) setMaster(current.value)
    } finally {
      writerActive.current = false
      setMasterWriting(false)
    }
  }, [store])

  const trackOperation = useCallback(async (initial: SystemControlOperationDto) => {
    setOperation(initial)
    store.installOperation(initial)
    const deadline = Date.now() + 95_000
    let current = initial
    while (!['succeeded', 'failed'].includes(current.status) && Date.now() < deadline) {
      await sleep(1_500)
      try {
        current = await systemApi.operation(current.id)
        setOperation(current)
        store.installOperation(current)
      } catch {
        setOperationError('The appliance is reconnecting. Waiting for the API to return…')
      }
    }
    if (current.status === 'succeeded') {
      setOperationError(undefined)
      await load()
    } else if (current.status === 'failed') {
      setOperationError(current.error?.detail ?? 'The operation failed.')
    }
  }, [load, store])

  const invoke = useCallback(async (
    action: CapabilityActionDto,
    componentId?: string,
  ) => {
    if (!action.actionToken) return
    setOperationError(undefined)
    try {
      const accepted = componentId
        ? await systemApi.restartComponent(componentId, action.actionToken)
        : await systemApi.reboot(action.actionToken)
      await trackOperation(accepted)
    } catch (caught) {
      setOperationError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [trackOperation])

  const liveDefinitionId = Object.keys(liveState.applied.byDefinition).find((definitionId) =>
    liveState.applied.byDefinition[definitionId]?.status !== 'idle',
  )
  const livePlanId = liveDefinitionId ? liveState.resolved.currentPlanByDefinition[liveDefinitionId] : undefined
  const currentPlan = liveDefinitionId && livePlanId ? {
    definitionId: liveDefinitionId,
    applied: liveState.applied.byDefinition[liveDefinitionId],
    plan: liveState.resolved.plans[livePlanId] ?? null,
  } : plans.find((item) => item.plan && item.applied.status !== 'idle') ?? plans.find((item) => item.plan)
  const presentation = currentPlan?.plan?.explanation.presentation
  const latestMetric = metrics.at(-1)
  const metricAge = latestMetric ? Date.now() - Date.parse(latestMetric.observedAt) : Number.POSITIVE_INFINITY
  const metricsStale = metricAge > METRIC_INTERVAL_MS * 3
  const connectedEndpoints = Object.values(matches).filter((item) => item.resolution.status === 'matched').length
  const readyResources = resources.filter((item) => ['ready', 'healthy'].includes(item.observed.health) || item.observed.lifecycle === 'ready').length
  const activeGraphs = definitions.filter((item) => item.kind === 'graph' && item.activeRevisionId).length
  const systemHealth = overview?.application.status ?? (error ? 'degraded' : 'unknown')
  const operationPending = Boolean(operation && !['succeeded', 'failed'].includes(operation.status))
  const actionWhileIdle = (action: CapabilityActionDto): CapabilityActionDto => operationPending
    ? { ...action, available: false, reason: 'Another system operation is already in progress.' }
    : action
  const status = error
    ? { type: 'warning' as const, message: 'Some appliance information is unavailable', description: error, action: <Button onClick={() => void load()}>Retry</Button> }
    : operationError
      ? { type: 'warning' as const, message: 'System operation update', description: operationError }
      : liveState.recoveryRequired
        ? { type: 'info' as const, message: 'Recovering missed live updates from a full snapshot' }
        : null

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeading
        title="Dashboard"
        description="The current appliance, audio path, performance, and daily controls."
        actions={<Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void load()}>Refresh</Button>}
      />
      <StableStatusRegion status={status} loading={loading} />

      {loading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((value) => <Col xs={24} lg={8} key={value}><SectionSkeleton rows={2} /></Col>)}
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card size="small" title="Appliance">
              <Space direction="vertical">
                <HealthBadge status={systemHealth} />
                <Text type="secondary">{overview?.hostname ?? 'Open Cinema'} · {overview?.model ?? 'Platform not reported'}</Text>
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="Current audio path" extra={<Link to="/graphs"><ApiOutlined /> Details</Link>}>
              <Space direction="vertical" size={2}>
                <HealthBadge status={presentation?.headline.status ?? currentPlan?.applied.status ?? 'inactive'} />
                <Text strong>{presentation?.headline.title ?? 'No active audio route'}</Text>
                <Text type="secondary">{presentation?.headline.summary ?? 'Apply a graph to start routing audio.'}</Text>
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="Master volume">
              {master ? (
                <Flex gap="middle" align="center">
                  <Button
                    aria-label={master.desired.muted ? 'Unmute master audio' : 'Mute master audio'}
                    icon={master.desired.muted ? <AudioMutedOutlined /> : <AudioOutlined />}
                    loading={masterWriting}
                    disabled={!master.writable}
                    onClick={() => {
                      const muted = !master.desired.muted
                      setMaster({ ...master, desired: { ...master.desired, muted } })
                      void writeMaster({ muted })
                    }}
                  />
                  <Slider
                    ariaLabelForHandle="Master volume"
                    min={0}
                    max={100}
                    value={Math.round(master.desired.level * 100)}
                    disabled={!master.writable}
                    tooltip={{ formatter: (value) => `${value}%` }}
                    style={{ flex: 1 }}
                    onChange={(value) => setMaster({ ...master, desired: { ...master.desired, level: value / 100 } })}
                    onChangeComplete={(value) => void writeMaster({ level: value / 100 })}
                  />
                  <Text style={{ minWidth: 40, textAlign: 'right' }}>{Math.round(master.desired.level * 100)}%</Text>
                </Flex>
              ) : <Text type="secondary">Volume state unavailable</Text>}
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card title="CPU" size="small">
            <Statistic value={latestMetric?.cpuPercent ?? 0} precision={1} suffix="%" valueStyle={latestMetric?.cpuPercent === null ? { opacity: 0.45 } : undefined} />
            <MetricSparkline label="CPU" values={metrics.map((item) => item.cpuPercent)} stale={metricsStale} />
            <ValueWithFreshness value={latestMetric?.cpuPercent === null ? null : 'Live'} observedAt={latestMetric?.observedAt} stale={metricsStale} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Memory" size="small">
            <Statistic value={latestMetric?.memory?.percent ?? 0} precision={1} suffix="%" valueStyle={latestMetric?.memory === null ? { opacity: 0.45 } : undefined} />
            <MetricSparkline label="Memory" values={metrics.map((item) => item.memory?.percent)} stale={metricsStale} />
            <Text type="secondary">{formatBytes(latestMetric?.memory?.usedBytes)} of {formatBytes(latestMetric?.memory?.totalBytes)}</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Audio" size="small">
            <Row gutter={8}>
              <Col span={12}><Statistic title="Endpoints" value={connectedEndpoints} suffix={`/ ${endpoints.length}`} /></Col>
              <Col span={12}><Statistic title="Resources" value={readyResources} suffix={`/ ${resources.length}`} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="System" size="small">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Temperature">{overview?.temperatureCelsius === null || overview?.temperatureCelsius === undefined ? 'Unsupported' : `${overview.temperatureCelsius.toFixed(1)} °C`}</Descriptions.Item>
              <Descriptions.Item label="Storage">{overview?.storage ? `${overview.storage.percent.toFixed(0)}% used` : 'Unknown'}</Descriptions.Item>
              <Descriptions.Item label="Uptime">{formatUptime(overview?.uptimeSeconds ?? null)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="Components" extra={<Tag>{components.filter((item) => item.health === 'ready').length} ready</Tag>}>
            <Table
              rowKey="id"
              pagination={false}
              size="small"
              dataSource={components}
              columns={[
                { title: 'Component', dataIndex: 'name' },
                { title: 'Version', render: (_, item) => <ValueWithFreshness value={item.version} observedAt={item.observedAt} unknownLabel="Not reported" /> },
                { title: 'Health', render: (_, item) => <HealthBadge status={item.health} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="System controls" extra={operation ? <HealthBadge status={operation.status} /> : undefined}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Text type="secondary">Restart individual Open Cinema services, or reboot the complete appliance.</Text>
              <Space wrap>
                {components.flatMap((component) => component.actions.map((action) => (
                  <CapabilityAction
                    key={`${component.id}:${action.id}`}
                    action={actionWhileIdle(action)}
                    loading={operation?.targetId === component.id && !['succeeded', 'failed'].includes(operation.status)}
                    icon={<RetweetOutlined />}
                    confirmation={{ title: `${action.label}?`, description: `Audio control may be briefly unavailable while ${component.name} reconnects.` }}
                    onConfirm={() => invoke(action, component.id)}
                  />
                )))}
                {applianceActions.map((action) => (
                  <CapabilityAction
                    key={action.id}
                    action={actionWhileIdle(action)}
                    danger
                    loading={operation?.targetId === 'appliance' && !['succeeded', 'failed'].includes(operation.status)}
                    confirmation={{ title: 'Reboot the complete appliance?', description: 'Audio and this page will disconnect while the Raspberry Pi restarts.' }}
                    onConfirm={() => invoke(action)}
                  />
                ))}
              </Space>
              {operation ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Progress
                    aria-label="System operation progress"
                    percent={operation.status === 'succeeded' ? 100 : operation.status === 'failed' ? 100 : operation.status === 'requested' ? 20 : operation.status === 'executing' ? 50 : 70}
                    status={operation.status === 'failed' ? 'exception' : operation.status === 'succeeded' ? 'success' : 'active'}
                    showInfo={false}
                  />
                  <Text>{operation.status === 'reconnecting' ? 'Expected disconnection; waiting for a fresh service or boot identity…' : operation.status}</Text>
                </Space>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="Appliance information">
        <Descriptions bordered size="small" column={{ xs: 1, md: 2, xl: 3 }}>
          <Descriptions.Item label="Host">{overview?.hostname ?? 'Unknown'}</Descriptions.Item>
          <Descriptions.Item label="Hardware">{overview?.model ?? 'Not reported on this platform'}</Descriptions.Item>
          <Descriptions.Item label="Operating system">{overview?.operatingSystem ?? 'Unknown'}</Descriptions.Item>
          <Descriptions.Item label="Kernel">{overview?.kernel ?? 'Unknown'}</Descriptions.Item>
          <Descriptions.Item label="Throttling">{overview?.throttling.supported ? overview.throttling.active ? <Tag color="error">Active</Tag> : <Tag color="success">None</Tag> : 'Unsupported'}</Descriptions.Item>
          <Descriptions.Item label="Active graphs">{activeGraphs}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  )
}
