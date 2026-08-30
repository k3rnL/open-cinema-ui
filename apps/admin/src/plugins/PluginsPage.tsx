import type {
  InstalledPluginDto,
  PluginActionDto,
  PluginCatalogueEntryDto,
  PluginOperationDto,
  PluginSourceInspectionDto,
} from '@open-cinema/shared'
import {
  CheckCircleOutlined,
  CodeOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Radio,
  Result,
  Row,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import {useCallback, useEffect, useState} from 'react'
import {useNavigate, useParams} from 'react-router'
import {PageHeading, StableStatusRegion} from '@/components/admin'
import {pluginApi} from './client'

type Inventory = {
  catalogue: PluginCatalogueEntryDto[]
  installed: InstalledPluginDto[]
  operations: PluginOperationDto[]
}

function useInventory() {
  const [value, setValue] = useState<Inventory>({catalogue: [], installed: [], operations: []})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const refresh = useCallback(async () => {
    try {
      const [catalogue, installed, operations] = await Promise.all([
        pluginApi.catalogue(),
        pluginApi.installed(),
        pluginApi.operations(),
      ])
      setValue({catalogue, installed, operations})
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Plugin inventory is unavailable'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    return () => window.clearInterval(timer)
  }, [refresh])
  return {value, loading, error, refresh}
}

function stateColor(value: string | null): string {
  if (['healthy', 'started', 'available', 'succeeded', 'enabled'].includes(value ?? '')) return 'success'
  if (['failed', 'rejected', 'incompatible'].includes(value ?? '')) return 'error'
  if (['degraded', 'restart-pending', 'rolling-back'].includes(value ?? '')) return 'warning'
  return 'default'
}

function OperationRegion({operations}: {operations: PluginOperationDto[]}) {
  const ordered = [...operations].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
  const terminal = new Set(['succeeded', 'failed', 'cancelled'])
  const active = ordered.find((item) => !terminal.has(item.status))
  const latestTerminal = ordered.find((item) => terminal.has(item.status))
  const latestFailure = latestTerminal?.status === 'failed' ? latestTerminal : undefined
  return (
    <div style={{minHeight: 94}} aria-live="polite">
      {active ? (
        <Card size="small">
          <Flex justify="space-between" align="center" gap="middle" wrap="wrap">
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{active.pluginId}: {active.kind}</Typography.Text>
              <Typography.Text type="secondary">{active.stage}</Typography.Text>
            </Space>
            <Progress percent={active.progress} style={{maxWidth: 360, minWidth: 220}}/>
          </Flex>
        </Card>
      ) : latestFailure ? (
        <Alert
          showIcon
          type="error"
          message={`Last plugin operation failed during ${latestFailure.stage}`}
          description={String((latestFailure.diagnostics.at(-1) as {message?: string} | undefined)?.message ?? 'Open the plugin details for diagnostics.')}
        />
      ) : null}
    </div>
  )
}

function MarketplaceCard({
  plugin,
  busy,
  onInstall,
  onOpen,
}: {
  plugin: PluginCatalogueEntryDto
  busy: boolean
  onInstall: () => void
  onOpen: () => void
}) {
  const latest = plugin.versions.find((item) => item.version === plugin.latestVersion)
  const installLabel = plugin.installed
    ? 'Installed'
    : plugin.installable
      ? 'Install'
      : !plugin.compatible
        ? 'Incompatible'
        : latest?.currentPlatform.artifactAvailable === false
          ? `Unavailable on ${latest.currentPlatform.architecture}`
          : 'Not published yet'
  return (
    <Card
      title={(
        <Space>
          <span>{plugin.displayName}</span>
          {plugin.verifiedPublisher ? <SafetyCertificateOutlined title="Verified first-party publisher"/> : null}
        </Space>
      )}
      extra={<Tag color={plugin.compatible ? 'success' : 'error'}>{plugin.compatible ? 'Compatible' : 'Incompatible'}</Tag>}
      actions={[
        <Button key="details" type="link" onClick={onOpen}>Details</Button>,
        <Button
          key="install"
          type="primary"
          icon={<DownloadOutlined/>}
          disabled={!plugin.installable || plugin.installed}
          loading={busy}
          onClick={onInstall}
        >
          {installLabel}
        </Button>,
      ]}
      style={{height: '100%'}}
    >
      <Space direction="vertical" size="middle" style={{width: '100%'}}>
        <Typography.Paragraph type="secondary" style={{minHeight: 44}}>{plugin.summary}</Typography.Paragraph>
        <Space wrap>
          <Tag>{plugin.publisher}</Tag>
          <Tag>v{plugin.latestVersion}</Tag>
          {latest?.capabilities.map((capability) => <Tag key={capability}>{capability}</Tag>)}
        </Space>
      </Space>
    </Card>
  )
}

function InstalledCard({plugin, onOpen}: {plugin: InstalledPluginDto; onOpen: () => void}) {
  return (
    <Card
      title={plugin.manifest.displayName ? String(plugin.manifest.displayName) : plugin.id}
      extra={<Badge status={stateColor(plugin.health) as 'success' | 'error' | 'warning' | 'default'} text={plugin.health}/>} 
      actions={[<Button key="open" type="link" onClick={onOpen}>Manage</Button>]}
    >
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Version">{plugin.installedVersion}</Descriptions.Item>
        <Descriptions.Item label="Desired state">{plugin.desiredState}</Descriptions.Item>
        <Descriptions.Item label="Runtime state">{plugin.observedState}</Descriptions.Item>
        <Descriptions.Item label="Source">{String(plugin.provenance.sourceType ?? 'unknown')}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

function GitInstallModal({open, onClose, onAccepted}: {open: boolean; onClose: () => void; onAccepted: (operation: PluginOperationDto) => void}) {
  const [form] = Form.useForm()
  const [inspection, setInspection] = useState<PluginSourceInspectionDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const inspect = async () => {
    const values = await form.validateFields()
    setBusy(true)
    try {
      setInspection(await pluginApi.inspectSource({...values, trustedCodeAcknowledged: true}))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Source inspection failed'))
    } finally {
      setBusy(false)
    }
  }
  const install = async () => {
    if (!inspection) return
    const values = form.getFieldsValue()
    setBusy(true)
    try {
      const manifest = inspection.manifest
      const operation = await pluginApi.install(
        {
          pluginId: manifest.id,
          sourceType: 'git',
          repository: values.repository,
          revision: inspection.provenance.resolvedRevision,
          trustedCodeAcknowledged: true,
        },
        crypto.randomUUID(),
      )
      onAccepted(operation)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Installation could not start'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      title="Install trusted plugin source"
      onCancel={onClose}
      width={720}
      footer={(
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          {inspection
            ? <Button type="primary" loading={busy} onClick={() => void install()}>Install verified candidate</Button>
            : <Button type="primary" loading={busy} onClick={() => void inspect()}>Inspect source</Button>}
        </Space>
      )}
    >
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <Alert
          showIcon
          type="warning"
          message="Git plugins execute trusted Python code"
          description="Install only code you have reviewed. Plugins run with Open Cinema's service permissions; they are not sandboxed."
        />
        <Form form={form} layout="vertical" onValuesChange={() => setInspection(null)}>
          <Form.Item name="repository" label="HTTPS Git repository" rules={[{required: true, type: 'url'}]}>
            <Input placeholder="https://github.com/example/open-cinema-plugin.git"/>
          </Form.Item>
          <Form.Item name="revision" label="Revision" extra="Prefer a tag or full commit. Branches are mutable.">
            <Input placeholder="v1.0.0 or commit SHA"/>
          </Form.Item>
          <Form.Item name="trusted" valuePropName="checked" rules={[{validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Trust acknowledgement is required'))}]}>
            <Checkbox>I understand this source executes with Open Cinema service privileges.</Checkbox>
          </Form.Item>
        </Form>
        <StableStatusRegion status={error ? {type: 'error', message: 'Candidate validation failed', description: error.message} : null}/>
        {inspection ? (
          <Card title="Verified candidate" extra={<CheckCircleOutlined style={{color: '#52c41a'}}/>}>
            <Descriptions column={{xs: 1, md: 2}}>
              <Descriptions.Item label="Plugin">{String(inspection.manifest.displayName ?? inspection.manifest.id)}</Descriptions.Item>
              <Descriptions.Item label="Version">{String(inspection.manifest.version)}</Descriptions.Item>
              <Descriptions.Item label="Resolved commit" span={2}><Typography.Text code copyable>{String(inspection.provenance.resolvedRevision)}</Typography.Text></Descriptions.Item>
            </Descriptions>
            {inspection.warnings.map((warning) => <Alert key={warning} type="warning" showIcon message={warning} style={{marginTop: 12}}/>)}
          </Card>
        ) : null}
      </Space>
    </Modal>
  )
}

export function PluginsPage() {
  const navigate = useNavigate()
  const {message} = App.useApp()
  const {value, loading, error, refresh} = useInventory()
  const [view, setView] = useState<'marketplace' | 'installed'>('marketplace')
  const [gitOpen, setGitOpen] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [query, setQuery] = useState('')
  const matches = (id: string, name: string) => {
    const normalized = query.trim().toLowerCase()
    return !normalized || id.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized)
  }
  const catalogueItems = value.catalogue.filter((item) => matches(item.id, item.displayName))
  const installedItems = value.installed.filter((item) => matches(item.id, String(item.manifest.displayName ?? item.id)))
  const installFirstParty = async (plugin: PluginCatalogueEntryDto) => {
    setBusy(plugin.id)
    try {
      const operation = await pluginApi.install(
        {pluginId: plugin.id, sourceType: 'catalogue', version: plugin.latestVersion, trustedCodeAcknowledged: true},
        crypto.randomUUID(),
      )
      void message.success(`Installation started: ${operation.id}`)
      await refresh()
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : 'Installation failed')
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading
        title="Plugins"
        description="Add first-party integrations or install reviewed source without rebuilding the administration UI."
        actions={<Button icon={<CodeOutlined/>} onClick={() => setGitOpen(true)}>Install from Git</Button>}
      />
      <OperationRegion operations={value.operations}/>
      <Flex justify="space-between" gap="middle" wrap="wrap">
        <Segmented
          value={view}
          onChange={(next) => setView(next as 'marketplace' | 'installed')}
          options={[
            {label: `Marketplace (${value.catalogue.length})`, value: 'marketplace'},
            {label: `Installed (${value.installed.length})`, value: 'installed'},
          ]}
        />
        <Input.Search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" allowClear style={{maxWidth: 320}}/>
      </Flex>
      <StableStatusRegion status={error ? {type: 'error', message: 'Plugin inventory could not be refreshed', description: error.message, action: <Button onClick={() => void refresh()}>Retry</Button>} : null}/>
      {loading ? <Row gutter={[16, 16]}>{[0, 1].map((item) => <Col xs={24} lg={12} key={item}><Card><Skeleton active/></Card></Col>)}</Row> : view === 'marketplace' ? (
        catalogueItems.length ? <Row gutter={[16, 16]}>{catalogueItems.map((plugin) => <Col xs={24} xl={12} key={plugin.id}><MarketplaceCard plugin={plugin} busy={busy === plugin.id} onInstall={() => void installFirstParty(plugin)} onOpen={() => navigate(`/plugins/manage/${plugin.id}`)}/></Col>)}</Row> : <Empty description={query ? 'No marketplace plugins match your search' : 'No first-party plugins are published'}/>
      ) : installedItems.length ? (
        <Row gutter={[16, 16]}>{installedItems.map((plugin) => <Col xs={24} lg={12} xl={8} key={plugin.id}><InstalledCard plugin={plugin} onOpen={() => navigate(`/plugins/manage/${plugin.id}`)}/></Col>)}</Row>
      ) : <Empty description={query ? 'No installed plugins match your search' : 'No plugins installed'}/>}
      <GitInstallModal open={gitOpen} onClose={() => setGitOpen(false)} onAccepted={() => void refresh()}/>
    </Space>
  )
}

function LifecycleButton({action, plugin, onComplete}: {action: PluginActionDto; plugin: InstalledPluginDto; onComplete: () => Promise<void>}) {
  const {message} = App.useApp()
  const [busy, setBusy] = useState(false)
  const run = () => {
    const execute = async (deleteData = false) => {
      setBusy(true)
      try {
        await pluginApi.lifecycle(
          plugin.id,
          action.id,
          {
            expectedVersion: plugin.updateVersion,
            deleteData,
            sourceType: plugin.provenance.sourceType === 'catalogue' ? 'catalogue' : 'git',
            repository: plugin.provenance.sourceType === 'catalogue' ? undefined : plugin.provenance.sourceUrl,
            revision: plugin.provenance.requestedRevision,
            version: plugin.provenance.version ?? plugin.installedVersion,
            trustedCodeAcknowledged: action.id === 'update',
          },
          crypto.randomUUID(),
        )
        void message.success(`${action.label} requested`)
        await onComplete()
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : `${action.label} failed`)
      } finally {
        setBusy(false)
      }
    }
    if (action.id === 'uninstall') {
      let deleteData = false
      Modal.confirm({
        title: 'Uninstall plugin',
        content: (
          <Space direction="vertical">
            <Typography.Text>Desired graphs are preserved. Choose what happens to plugin configuration and secrets.</Typography.Text>
            <Radio.Group defaultValue="retain" onChange={(event) => {deleteData = event.target.value === 'delete'}}>
              <Space direction="vertical"><Radio value="retain">Retain data for reinstall</Radio><Radio value="delete">Delete plugin data</Radio></Space>
            </Radio.Group>
          </Space>
        ),
        okText: 'Uninstall',
        okButtonProps: {danger: true},
        onOk: () => execute(deleteData),
      })
      return
    }
    Modal.confirm({
      title: action.label,
      content: action.lifecycleImpact === 'application-restart' ? 'Open Cinema will need to restart after this action.' : action.reason,
      okText: action.label,
      okButtonProps: {danger: action.confirmation === 'destructive'},
      onOk: execute,
    })
  }
  return <Button danger={action.confirmation === 'destructive'} disabled={!action.available} loading={busy} title={action.reason ?? undefined} onClick={run}>{action.label}</Button>
}

export function PluginDetailPage() {
  const {pluginId} = useParams()
  const navigate = useNavigate()
  const {value, loading, error, refresh} = useInventory()
  const plugin = value.installed.find((item) => item.id === pluginId)
  const catalogue = value.catalogue.find((item) => item.id === pluginId)
  const catalogueVersion = catalogue?.versions.find((item) => item.version === catalogue.latestVersion)
  const catalogueArtifact = catalogueVersion?.artifacts.find(
    (item) => item.operatingSystem === catalogueVersion.currentPlatform.operatingSystem
      && item.architecture === catalogueVersion.currentPlatform.architecture,
  )
  const permissions = Array.isArray(plugin?.manifest.permissions)
    ? plugin.manifest.permissions
    : catalogueVersion?.permissions ?? []
  const operations = value.operations.filter((item) => item.pluginId === pluginId)
  if (loading) return <Skeleton active paragraph={{rows: 8}}/>
  if (!plugin && !catalogue) return <Result status="404" title="Plugin not found" extra={<Button onClick={() => navigate('/plugins')}>Back to Plugins</Button>}/>
  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading title={plugin?.manifest.displayName ? String(plugin.manifest.displayName) : catalogue?.displayName ?? pluginId} description={catalogue?.summary} actions={<Button onClick={() => navigate('/plugins')}>Back to Plugins</Button>}/>
      <StableStatusRegion status={error ? {type: 'error', message: 'Plugin details are stale', description: error.message} : null}/>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Installation">
            <Descriptions column={{xs: 1, md: 2}}>
              <Descriptions.Item label="Version">{plugin?.installedVersion ?? catalogue?.latestVersion}</Descriptions.Item>
              <Descriptions.Item label="Publisher">{catalogue?.publisher ?? String(plugin?.manifest.vendor ?? 'Unknown')}</Descriptions.Item>
              <Descriptions.Item label="Desired state">{plugin?.desiredState ?? 'Not installed'}</Descriptions.Item>
              <Descriptions.Item label="Runtime state"><Tag color={stateColor(plugin?.observedState ?? null)}>{plugin?.observedState ?? 'Not installed'}</Tag></Descriptions.Item>
              <Descriptions.Item label="Source" span={2}>{String(plugin?.provenance.sourceUrl ?? catalogueArtifact?.url ?? catalogue?.repository ?? 'Unknown')}</Descriptions.Item>
              <Descriptions.Item label="Resolved commit" span={2}><Typography.Text code copyable>{String(plugin?.provenance.resolvedRevision ?? 'Not recorded')}</Typography.Text></Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Lifecycle" styles={{body: {minHeight: 174}}}>
            {plugin ? <Space wrap>{plugin.actions.map((action) => <LifecycleButton key={action.id} action={action} plugin={plugin} onComplete={refresh}/>)}</Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Install from Marketplace"/>}
          </Card>
        </Col>
      </Row>
      <Card title="Capabilities and permissions">
        <Space wrap>{Array.isArray(plugin?.manifest.capabilities) ? plugin.manifest.capabilities.map((item, index) => <Tag key={index}>{String((item as {kind?: string}).kind ?? item)}</Tag>) : catalogueVersion?.capabilities.map((item) => <Tag key={item}>{item}</Tag>)}</Space>
        <List
          style={{marginTop: 16}}
          dataSource={permissions}
          locale={{emptyText: 'No special permissions declared'}}
          renderItem={(item) => <List.Item>{String((item as {id?: string}).id ?? item)} — {String((item as {reason?: string}).reason ?? '')}</List.Item>}
        />
      </Card>
      <Card title="Operation history">
        <List dataSource={operations} locale={{emptyText: 'No operations yet'}} renderItem={(operation) => <List.Item extra={<Tag color={stateColor(operation.status)}>{operation.status}</Tag>}><List.Item.Meta title={`${operation.kind} · ${operation.stage}`} description={operation.updatedAt}/>{typeof operation.progress === 'number' ? <Progress percent={operation.progress} size="small" style={{width: 180}}/> : null}</List.Item>}/>
      </Card>
    </Space>
  )
}
