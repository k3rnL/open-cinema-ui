import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {ReloadOutlined, RetweetOutlined, SettingOutlined} from '@ant-design/icons'
import type {ManagedResourceActionDto, ManagedResourceDto} from '@open-cinema/shared'
import {Link} from 'react-router'
import {
  CapabilityAction,
  PageHeading,
  SectionSkeleton,
  StableStatusRegion,
  ValueWithFreshness,
} from '@/components/admin'
import {audioApi} from './client'

const {Text} = Typography

function healthBadge(resource: ManagedResourceDto) {
  const healthy = ['ready', 'healthy', 'running'].includes(resource.observed.health)
    || resource.observed.lifecycle === 'ready'
  const failed = ['failed', 'error', 'backoff'].includes(resource.observed.health)
    || ['failed', 'backoff'].includes(resource.observed.lifecycle)
  return (
    <Badge
      status={healthy ? 'success' : failed ? 'error' : resource.freshness.stale ? 'warning' : 'default'}
      text={`${resource.observed.lifecycle} · ${resource.observed.health}`}
    />
  )
}

function technicalDetails(resource: ManagedResourceDto) {
  return (
    <Collapse
      ghost
      items={[{
        key: 'technical',
        label: `Technical correlations (${resource.correlations.length})`,
        children: resource.correlations.length ? (
          <Space direction="vertical" style={{width: '100%'}}>
            {resource.correlations.map((correlation) => (
              <Descriptions
                key={`${correlation.kind}:${correlation.subject}`}
                bordered
                size="small"
                column={1}
              >
                <Descriptions.Item label="Projection">{correlation.kind}</Descriptions.Item>
                <Descriptions.Item label="Runtime subject"><Text copyable>{correlation.subject}</Text></Descriptions.Item>
                <Descriptions.Item label="Generation">{correlation.worldGeneration} / {correlation.worldSequence}</Descriptions.Item>
                <Descriptions.Item label="Evidence">
                  <pre style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0}}>
                    {JSON.stringify(correlation.evidence, null, 2)}
                  </pre>
                </Descriptions.Item>
              </Descriptions>
            ))}
          </Space>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No runtime correlation has been observed yet." />,
      }]}
    />
  )
}

export function ManagedResourcesPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [resources, setResources] = useState<ManagedResourceDto[]>([])
  const [actionInFlight, setActionInFlight] = useState<string>()

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    try {
      const page = await audioApi.managedResources()
      setResources(page.items)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => void load(true), [load])

  const invoke = useCallback(async (resource: ManagedResourceDto, action: ManagedResourceActionDto) => {
    if (
      !action.available
      || action.method !== 'POST'
      || action.updateVersion === null
      || !action.href
    ) return
    setActionInFlight(resource.id)
    try {
      await audioApi.invokeManagedResourceAction(action)
      message.success(`${resource.name}: ${action.label.toLowerCase()} requested.`)
      await load()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
      await load()
    } finally {
      setActionInFlight(undefined)
    }
  }, [load])

  const columns = useMemo(() => [
    {
      title: 'Resource',
      render: (_: unknown, resource: ManagedResourceDto) => (
        <Space direction="vertical" size={0}>
          <Text strong>{resource.name}</Text>
          <Text type="secondary">{resource.kind}</Text>
        </Space>
      ),
    },
    {
      title: 'Desired',
      responsive: ['md' as const],
      render: (_: unknown, resource: ManagedResourceDto) => (
        <Tag color={resource.desired.enabled ? 'blue' : 'default'}>{resource.desired.lifecycle}</Tag>
      ),
    },
    {
      title: 'Observed',
      render: (_: unknown, resource: ManagedResourceDto) => healthBadge(resource),
    },
    {
      title: 'Mode / profile',
      responsive: ['lg' as const],
      render: (_: unknown, resource: ManagedResourceDto) => (
        <Space direction="vertical" size={0}>
          <Text>{resource.observed.mode ?? 'Not reported'}</Text>
          {resource.observed.profile ? <Text type="secondary">{resource.observed.profile}</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Version',
      responsive: ['xl' as const],
      render: (_: unknown, resource: ManagedResourceDto) => (
        <ValueWithFreshness
          value={resource.version}
          unknownLabel="Not reported"
          observedAt={resource.freshness.observedAt}
          stale={resource.freshness.stale}
        />
      ),
    },
    {
      title: 'Actions',
      render: (_: unknown, resource: ManagedResourceDto) => (
        <Space wrap>
          {resource.actions.map((action) => (
            <CapabilityAction
              key={action.id}
              action={action}
              loading={actionInFlight === resource.id}
              icon={<RetweetOutlined />}
              confirmation={{
                title: `${action.label} ${resource.name}?`,
                description: 'Its audio endpoint may be briefly unavailable while it reconnects.',
              }}
              onConfirm={() => invoke(resource, action)}
            />
          ))}
        </Space>
      ),
    },
  ], [actionInFlight, invoke])

  const adapters = resources.filter((resource) => resource.resourceType === 'adapter')
  const pluginSources = resources.filter((resource) => resource.resourceType === 'plugin-managed-source')
  const processors = resources.filter((resource) => resource.resourceType === 'processor')
  const status = error
    ? {type: 'error' as const, message: 'Managed resources could not be loaded', description: error, action: <Button onClick={() => void load()}>Retry</Button>}
    : null

  const resourceTable = (items: ManagedResourceDto[], empty: string) => loading ? (
    <SectionSkeleton rows={3} />
  ) : (
    <Table
      rowKey="id"
      dataSource={items}
      columns={columns}
      pagination={false}
      scroll={{x: 840}}
      locale={{emptyText: empty}}
      expandable={{columnTitle: 'Details', expandedRowRender: technicalDetails}}
    />
  )

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading
        title="Managed resources"
        description="Processes Open Cinema starts and supervises for network endpoints and audio processing."
        actions={(
          <>
            <Link to="/managed-resources/adapters">
              <Button type="primary" icon={<SettingOutlined />}>Configure adapters</Button>
            </Link>
            <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void load()}>Refresh</Button>
          </>
        )}
      />
      <StableStatusRegion status={status} loading={loading && resources.length === 0} />

      <Card title="Endpoint adapters" extra={<Tag>{adapters.length}</Tag>}>
        {resourceTable(adapters, 'No managed adapters have been configured.')}
      </Card>
      <Card title="Plugin audio sources" extra={<Tag>{pluginSources.length}</Tag>}>
        {resourceTable(pluginSources, 'No plugin-managed audio sources have been configured.')}
      </Card>
      <Card title="Audio processors" extra={<Tag>{processors.length}</Tag>}>
        {resourceTable(processors, 'No managed processors have been observed.')}
      </Card>
    </Space>
  )
}
