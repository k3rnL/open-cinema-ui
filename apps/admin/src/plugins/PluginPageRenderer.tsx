import type {
  JsonObject,
  JsonValue,
  PluginPageActionDto,
  PluginPageDto,
  PluginSectionDto,
} from '@open-cinema/shared'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {useNavigate, useParams} from 'react-router'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Progress,
  Result,
  Row,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {PageHeading, StableStatusRegion} from '@/components/admin'
import {pluginClient} from './client'
import {PluginField, pointerValue} from './PluginFields'
import {PluginPageErrorBoundary} from './PluginPageErrorBoundary'
import {usePluginRuntime} from './PluginRuntimeContext'

function endpoint(value: string): string {
  return value.startsWith('/api/') ? value.slice(4) : value
}

function asDocument(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The plugin endpoint must return an object for this page.')
  }
  return value as JsonObject
}

function optionalDocument(value: JsonValue | undefined): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null
}

function responseDocument(value: JsonObject): JsonObject {
  return optionalDocument(value.data) ?? value
}

function display(value: JsonValue | undefined): string {
  if (value === undefined || value === null || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map((item) => display(item)).join(', ')
  if (typeof value === 'object') {
    if (typeof value.message === 'string') return value.message
    if (typeof value.detail === 'string') return value.detail
    if (typeof value.code === 'string') return value.code
    return 'Configured'
  }
  return String(value)
}

interface ResourceAction {
  id: string
  label: string
  available: boolean
  reason?: string | null
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  href: string
  confirmation: 'none' | 'confirm' | 'destructive' | 'disconnecting'
  lifecycleImpact: 'hot' | 'application-restart' | 'host-reboot'
  concurrencyToken?: string | null
}

interface GuidedOperation {
  kind: string
  state?: string
  title?: string
  description?: string
  authorizationUrl?: string
  callback?: {
    label?: string
    placeholder?: string
    field?: string
    endpoint?: string
  }
  cancel?: {label?: string; endpoint?: string}
}

interface ResourceSummaryItem {
  label: string
  value: JsonValue
}

function confirmation(action: PluginPageActionDto | ResourceAction): string {
  if (action.lifecycleImpact === 'host-reboot') {
    return 'This action requires a Raspberry Pi reboot and a temporary loss of access.'
  }
  if (action.lifecycleImpact === 'application-restart') {
    return 'This action restarts Open Cinema. The page will reconnect automatically.'
  }
  if (action.confirmation === 'destructive') {
    return action.reason
      ? `This action may remove plugin-managed data. ${action.reason}`
      : 'This action may remove plugin-managed data.'
  }
  return `Run “${action.label}”?`
}

function ReadOnlySection({section, document}: {section: PluginSectionDto; document: JsonObject}) {
  const fields = section.fields.filter((field) => pointerValue(document, field.path) !== undefined)
  if (section.presentation === 'diagnostics') {
    const diagnosticValue = fields.map((field) => pointerValue(document, field.path)).flat()
    return diagnosticValue.length ? (
      <Space direction="vertical" style={{width: '100%'}}>
        {diagnosticValue.map((item, index) => (
          <Alert key={index} showIcon type="warning" message={display(item)}/>
        ))}
      </Space>
    ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No diagnostics"/>
  }
  return (
    <Descriptions column={{xs: 1, sm: 1, md: 2, xl: 3}} size="small">
      {fields.map((field) => (
        <Descriptions.Item key={field.id} label={field.label}>
          {display(pointerValue(document, field.path))}
        </Descriptions.Item>
      ))}
    </Descriptions>
  )
}

function SectionCard({
  section,
  document,
  editable,
  onChange,
}: {
  section: PluginSectionDto
  document: JsonObject
  editable: boolean
  onChange: (document: JsonObject) => void
}) {
  const content = editable ? (
    <>{section.fields.map((field) => (
      <PluginField key={field.id} field={field} document={document} onChange={onChange}/>
    ))}</>
  ) : <ReadOnlySection section={section} document={document}/>
  if (section.presentation === 'section') {
    return (
      <Space direction="vertical" size="small" style={{width: '100%'}}>
        <Typography.Title level={4} style={{margin: 0}}>{section.title}</Typography.Title>
        {section.description ? <Typography.Text type="secondary">{section.description}</Typography.Text> : null}
        {content}
      </Space>
    )
  }
  return (
    <Card
      title={section.title}
      type={section.emphasis === 'primary' ? 'inner' : undefined}
      styles={{body: {minHeight: section.presentation === 'status' ? 92 : undefined}}}
    >
      {section.description ? <Typography.Paragraph type="secondary">{section.description}</Typography.Paragraph> : null}
      {content}
    </Card>
  )
}

function PageSections({
  page,
  document,
  onChange,
  editable: editableOverride,
}: {
  page: PluginPageDto
  document: JsonObject
  onChange: (document: JsonObject) => void
  editable?: boolean
}) {
  const editable = editableOverride ?? (page.template === 'settings' || page.template === 'guided-flow')
  const tabs = page.sections.filter((section) => section.presentation === 'tab')
  const ordinary = page.sections.filter((section) => section.presentation !== 'tab')
  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      {tabs.length ? (
        <Card>
          <Tabs
            items={tabs.map((section) => ({
              key: section.id,
              label: section.title,
              children: <SectionCard section={section} document={document} editable={editable} onChange={onChange}/>,
            }))}
          />
        </Card>
      ) : null}
      <Row gutter={[16, 16]}>
        {ordinary.map((section) => (
          <Col
            key={section.id}
            xs={24}
            lg={section.width === 'full' ? 24 : section.width === 'narrow' ? 8 : 12}
          >
            <SectionCard section={section} document={document} editable={editable} onChange={onChange}/>
          </Col>
        ))}
      </Row>
    </Space>
  )
}

function parseActions(value: JsonValue | undefined): ResourceAction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const item = optionalDocument(raw)
    if (
      !item
      || typeof item.id !== 'string'
      || typeof item.label !== 'string'
      || typeof item.href !== 'string'
      || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(item.method))
    ) return []
    return [{
      id: item.id,
      label: item.label,
      available: item.available !== false,
      reason: typeof item.reason === 'string' ? item.reason : null,
      method: item.method as ResourceAction['method'],
      href: item.href,
      confirmation: ['confirm', 'destructive', 'disconnecting'].includes(String(item.confirmation))
        ? item.confirmation as ResourceAction['confirmation']
        : 'none',
      lifecycleImpact: ['application-restart', 'host-reboot'].includes(String(item.lifecycleImpact))
        ? item.lifecycleImpact as ResourceAction['lifecycleImpact']
        : 'hot',
      concurrencyToken: typeof item.concurrencyToken === 'string' ? item.concurrencyToken : null,
    }]
  })
}

function parseGuidedOperation(value: JsonValue | undefined): GuidedOperation | null {
  const operation = optionalDocument(value)
  if (!operation || typeof operation.kind !== 'string') return null
  const callback = optionalDocument(operation.callback)
  const cancel = optionalDocument(operation.cancel)
  return {
    kind: operation.kind,
    state: typeof operation.state === 'string' ? operation.state : undefined,
    title: typeof operation.title === 'string' ? operation.title : undefined,
    description: typeof operation.description === 'string' ? operation.description : undefined,
    authorizationUrl: typeof operation.authorizationUrl === 'string' ? operation.authorizationUrl : undefined,
    callback: callback ? {
      label: typeof callback.label === 'string' ? callback.label : undefined,
      placeholder: typeof callback.placeholder === 'string' ? callback.placeholder : undefined,
      field: typeof callback.field === 'string' ? callback.field : undefined,
      endpoint: typeof callback.endpoint === 'string' ? callback.endpoint : undefined,
    } : undefined,
    cancel: cancel ? {
      label: typeof cancel.label === 'string' ? cancel.label : undefined,
      endpoint: typeof cancel.endpoint === 'string' ? cancel.endpoint : undefined,
    } : undefined,
  }
}

function parseSummary(value: JsonValue | undefined): ResourceSummaryItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const item = optionalDocument(raw)
    return item && typeof item.label === 'string' && item.value !== undefined
      ? [{label: item.label, value: item.value}]
      : []
  })
}

function statusColor(status: JsonValue | undefined): string {
  if (['healthy', 'started', 'playing', 'enabled', 'ready'].includes(String(status))) return 'success'
  if (['failed', 'error'].includes(String(status))) return 'error'
  if (['degraded', 'unknown'].includes(String(status))) return 'warning'
  return 'default'
}

export function ResourceCollection({
  page,
  document,
  reload,
  reportError,
}: {
  page: PluginPageDto
  document: JsonObject
  reload: () => Promise<void>
  reportError: (error: Error) => void
}) {
  const {message} = App.useApp()
  const items = Array.isArray(document.items) ? document.items : []
  const [selected, setSelected] = useState<JsonObject | null>(null)
  const [editorDocument, setEditorDocument] = useState<JsonObject>({})
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string>()
  const [callbackUrl, setCallbackUrl] = useState('')
  const [resourceError, setResourceError] = useState<Error | null>(null)

  const selectedId = typeof selected?.id === 'string' ? selected.id : null
  useEffect(() => {
    if (!selectedId) return
    const fresh = items
      .map((item) => optionalDocument(item))
      .find((item) => item?.id === selectedId)
    setSelected(fresh ?? null)
  }, [document, selectedId])

  const fail = (error: Error) => {
    setResourceError(error)
    reportError(error)
  }

  const openResource = (item: JsonObject) => {
    const editor = optionalDocument(item.editor)
    setSelected(item)
    setEditorDocument(optionalDocument(editor?.document) ?? {})
    setCallbackUrl('')
    setResourceError(null)
  }

  const refreshSelected = async (href?: string) => {
    if (!href) {
      await reload()
      return
    }
    const fresh = asDocument(await pluginClient.get(endpoint(href)))
    openResource(fresh)
    await reload()
  }

  const saveResource = async () => {
    const editor = optionalDocument(selected?.editor)
    const href = typeof editor?.href === 'string' ? editor.href : null
    if (!href || saving) return
    setSaving(true)
    try {
      const response = await pluginClient.request<JsonObject>('PUT', endpoint(href), editorDocument)
      const fresh = responseDocument(asDocument(response.data))
      openResource(fresh)
      await reload()
      void message.success('Source settings saved')
    } catch (value) {
      fail(value instanceof Error ? value : new Error('Source settings could not be saved'))
    } finally {
      setSaving(false)
    }
  }

  const executeResourceAction = async (action: ResourceAction) => {
    if (!action.available || actionId) return
    if (action.confirmation !== 'none') {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: action.label,
          content: confirmation(action),
          okText: action.label,
          okButtonProps: {danger: action.confirmation === 'destructive'},
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
    setActionId(action.id)
    try {
      const response = await pluginClient.request<JsonObject>(
        action.method,
        endpoint(action.href),
        {concurrencyToken: action.concurrencyToken},
      )
      const returned = responseDocument(asDocument(response.data))
      if (action.method === 'DELETE') {
        setSelected(null)
        await reload()
      } else {
        const editor = optionalDocument(selected?.editor)
        await refreshSelected(
          typeof returned.editor === 'object'
            ? undefined
            : typeof editor?.href === 'string' ? editor.href : undefined,
        )
        if (typeof returned.editor === 'object') openResource(returned)
      }
      void message.success(`${action.label} requested`)
    } catch (value) {
      fail(value instanceof Error ? value : new Error(`${action.label} failed`))
    } finally {
      setActionId(undefined)
    }
  }

  const submitGuidedCallback = async (operation: GuidedOperation) => {
    const callback = operation.callback
    if (!callback?.endpoint || !callback.field || !callbackUrl.trim() || actionId) return
    setActionId('guided-callback')
    try {
      await pluginClient.request<JsonObject>('POST', endpoint(callback.endpoint), {
        [callback.field]: callbackUrl.trim(),
        concurrencyToken: typeof selected?.updateVersion === 'number'
          ? String(selected.updateVersion)
          : selected?.updateVersion,
      })
      const editor = optionalDocument(selected?.editor)
      await refreshSelected(typeof editor?.href === 'string' ? editor.href : undefined)
      void message.success('Authorization completed')
    } catch (value) {
      fail(value instanceof Error ? value : new Error('Authorization could not be completed'))
    } finally {
      setActionId(undefined)
    }
  }

  const actions = parseActions(selected?.actions)
  const guided = parseGuidedOperation(selected?.guidedOperation)
  const editor = optionalDocument(selected?.editor)
  const summary = parseSummary(selected?.summary)
  const diagnostics = Array.isArray(selected?.diagnostics) ? selected.diagnostics : []
  const compatibility = [
    {key: 'managed', label: 'Managed automatically', values: document.managedOptions},
    {key: 'unavailable', label: 'Unavailable in this integration', values: document.unavailableOptions},
  ].filter((group) => Array.isArray(group.values) && group.values.length)
  return (
    <>
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <Card styles={{body: {padding: 0}}}>
          <List
            dataSource={items}
            locale={{emptyText: <Empty description="No plugin resources yet"/>}}
            renderItem={(raw, index) => {
              const item = optionalDocument(raw) ?? {value: raw}
              const desired = item.desiredState
              const observed = item.observedState
              const status = item.status ?? observed
              const summaryItems = parseSummary(item.summary).slice(0, 2)
              return (
                <List.Item
                  style={{paddingInline: 24}}
                  actions={[
                    <Button key="manage" icon={<EditOutlined/>} onClick={() => openResource(item)}>
                      Manage
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={(
                      <Space wrap>
                        <Typography.Text strong>
                          {display(item.displayName ?? item.name ?? item.id ?? `Resource ${index + 1}`)}
                        </Typography.Text>
                        {item.health ? <Tag color={statusColor(item.health)}>{display(item.health)}</Tag> : null}
                      </Space>
                    )}
                    description={(
                      <Space split={<Divider type="vertical"/>} wrap>
                        <Typography.Text type="secondary">{display(status)}</Typography.Text>
                        {desired ? <Typography.Text type="secondary">Desired: {display(desired)}</Typography.Text> : null}
                        {observed ? <Typography.Text type="secondary">Observed: {display(observed)}</Typography.Text> : null}
                        {summaryItems.map((summaryItem) => (
                          <Typography.Text key={summaryItem.label} type="secondary">
                            {summaryItem.label}: {display(summaryItem.value)}
                          </Typography.Text>
                        ))}
                      </Space>
                    )}
                  />
                </List.Item>
              )
            }}
          />
        </Card>
        {compatibility.length ? (
          <Collapse
            ghost
            items={compatibility.map((group) => ({
              key: group.key,
              label: group.label,
              children: (
                <List
                  size="small"
                  dataSource={group.values as JsonValue[]}
                  renderItem={(value) => <List.Item><Typography.Text type="secondary">{display(value)}</Typography.Text></List.Item>}
                />
              ),
            }))}
          />
        ) : null}
      </Space>
      <Drawer
        open={selected !== null}
        width="min(840px, 100vw)"
        title={display(selected?.displayName ?? selected?.name ?? 'Plugin resource')}
        onClose={() => setSelected(null)}
        extra={editor ? <Button type="primary" loading={saving} onClick={() => void saveResource()}>Save changes</Button> : null}
      >
        <Form layout="vertical" onFinish={() => void saveResource()}>
          <Space direction="vertical" size="large" style={{width: '100%'}}>
            {resourceError ? (
              <Alert
                showIcon
                closable
                type="error"
                message="The resource could not be updated"
                description={resourceError.message}
                onClose={() => setResourceError(null)}
              />
            ) : null}
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Desired state">{display(selected?.desiredState)}</Descriptions.Item>
              <Descriptions.Item label="Observed state">{display(selected?.observedState)}</Descriptions.Item>
              <Descriptions.Item label="Playback">{display(selected?.status)}</Descriptions.Item>
              <Descriptions.Item label="Health">
                <Tag color={statusColor(selected?.health)}>{display(selected?.health)}</Tag>
              </Descriptions.Item>
              {summary.map((item) => (
                <Descriptions.Item key={item.label} label={item.label}>{display(item.value)}</Descriptions.Item>
              ))}
            </Descriptions>
            {diagnostics.length ? (
              <Card title="Diagnostics">
                <Space direction="vertical" style={{width: '100%'}}>
                  {diagnostics.map((item, index) => (
                    <Alert key={index} showIcon type="warning" message={display(item)}/>
                  ))}
                </Space>
              </Card>
            ) : null}
            {guided?.kind === 'external-authorization' ? (
              <Card title={guided.title ?? 'External authorization'}>
                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                  {guided.description ? <Typography.Text type="secondary">{guided.description}</Typography.Text> : null}
                  <Tag color={guided.state === 'completed' || guided.state === 'succeeded' ? 'success' : guided.state === 'failed' || guided.state === 'expired' ? 'error' : 'processing'}>
                    {display(guided.state)}
                  </Tag>
                  {guided.authorizationUrl ? (
                    <Button
                      type="primary"
                      icon={<ExportOutlined/>}
                      href={guided.authorizationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open authorization page
                    </Button>
                  ) : null}
                  {guided.callback?.endpoint ? (
                    <Input.Search
                      value={callbackUrl}
                      placeholder={guided.callback.placeholder}
                      enterButton={guided.callback.label ?? 'Submit callback'}
                      loading={actionId === 'guided-callback'}
                      onChange={(event) => setCallbackUrl(event.target.value)}
                      onSearch={() => void submitGuidedCallback(guided)}
                    />
                  ) : null}
                  {guided.cancel?.endpoint ? (
                    <Button
                      onClick={() => void executeResourceAction({
                        id: 'guided-cancel',
                        label: guided.cancel?.label ?? 'Cancel',
                        available: true,
                        method: 'POST',
                        href: guided.cancel?.endpoint ?? '',
                        confirmation: 'confirm',
                        lifecycleImpact: 'hot',
                        concurrencyToken: typeof selected?.updateVersion === 'number'
                          ? String(selected.updateVersion)
                          : typeof selected?.updateVersion === 'string' ? selected.updateVersion : undefined,
                      })}
                    >
                      {guided.cancel.label ?? 'Cancel'}
                    </Button>
                  ) : null}
                </Space>
              </Card>
            ) : null}
            {editor ? <PageSections page={page} document={editorDocument} onChange={setEditorDocument} editable/> : null}
            <Card title="Actions" styles={{body: {minHeight: 72}}}>
              {actions.length ? (
                <Space wrap>
                  {actions.map((action) => (
                    <Tooltip key={action.id} title={action.available ? undefined : action.reason}>
                      <Button
                        danger={action.confirmation === 'destructive'}
                        icon={action.id === 'restart' ? <ReloadOutlined/> : action.id === 'delete' ? <DeleteOutlined/> : action.id === 'start' ? <CheckCircleOutlined/> : undefined}
                        disabled={!action.available || Boolean(actionId)}
                        loading={actionId === action.id}
                        onClick={() => void executeResourceAction(action)}
                      >
                        {action.label}
                      </Button>
                    </Tooltip>
                  ))}
                </Space>
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No actions are available"/>}
            </Card>
          </Space>
        </Form>
      </Drawer>
    </>
  )
}

function PluginPage({page, pluginId}: {page: PluginPageDto; pluginId: string}) {
  const {message} = App.useApp()
  const navigate = useNavigate()
  const [document, setDocument] = useState<JsonObject>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string>()
  const [error, setError] = useState<Error | null>(null)
  const [stale, setStale] = useState(false)
  const [operation, setOperation] = useState<JsonObject | null>(null)
  const mounted = useRef(true)

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    try {
      const value = asDocument(await pluginClient.get(endpoint(page.binding.read)))
      if (mounted.current) {
        setDocument(value)
        setError(null)
        setStale(false)
      }
    } catch (value) {
      if (mounted.current) {
        setError(value instanceof Error ? value : new Error('Plugin data is unavailable'))
        setStale(background)
      }
    } finally {
      if (mounted.current && !background) setLoading(false)
    }
  }, [page.binding.read])

  useEffect(() => {
    mounted.current = true
    void load()
    const interval = page.binding.freshnessMs
      ? window.setInterval(() => void load(true), page.binding.freshnessMs)
      : undefined
    return () => {
      mounted.current = false
      if (interval) window.clearInterval(interval)
    }
  }, [load, page.binding.freshnessMs])

  const save = async () => {
    if (!page.binding.write || saving) return
    setSaving(true)
    try {
      const method = 'PUT'
      const value = await pluginClient.request<JsonObject>(method, endpoint(page.binding.write), document)
      const saved = responseDocument(asDocument(value.data))
      setDocument(saved)
      void message.success('Plugin settings saved')
      if (page.binding.successPageId) {
        void navigate(`/plugins/${pluginId}/${page.binding.successPageId}`)
      }
    } catch (value) {
      setError(value instanceof Error ? value : new Error('Plugin settings could not be saved'))
    } finally {
      setSaving(false)
    }
  }

  const execute = async (action: PluginPageActionDto) => {
    if (action.available === false || actionId) return
    if (action.confirmation !== 'none') {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: action.label,
          content: confirmation(action),
          okText: action.label,
          okButtonProps: {danger: action.confirmation === 'destructive'},
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
    setActionId(action.id)
    try {
      const response = await pluginClient.request<JsonObject>(
        action.method,
        endpoint(action.endpoint),
        action.method === 'DELETE' ? undefined : {
          concurrencyToken: action.concurrencyToken,
        },
      )
      setOperation(response.data)
      void message.success(`${action.label} requested`)
      await load(true)
    } catch (value) {
      setError(value instanceof Error ? value : new Error(`${action.label} failed`))
    } finally {
      setActionId(undefined)
    }
  }

  if (loading) {
    return (
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <Skeleton active paragraph={{rows: 2}}/>
        <Row gutter={[16, 16]}><Col span={12}><Card loading/></Col><Col span={12}><Card loading/></Col></Row>
      </Space>
    )
  }
  if (error && !stale && Object.keys(document).length === 0) {
    return <Result status="warning" title="Plugin data is unavailable" subTitle={error.message} extra={<Button onClick={() => void load()}>Retry</Button>}/>
  }

  const actions = page.actions ?? []
  return (
    <Form layout="vertical" onFinish={() => void save()}>
      <Space direction="vertical" size="large" style={{width: '100%'}}>
        <PageHeading
          title={page.title}
          description={page.description}
          actions={page.binding.write ? <Button type="primary" htmlType="submit" loading={saving}>Save changes</Button> : undefined}
        />
        <StableStatusRegion
          minHeight={72}
          status={error ? {type: 'warning', message: stale ? 'Showing the last known plugin data' : 'Plugin request failed', description: error.message} : null}
        />
        {page.template === 'resource-list'
          ? <ResourceCollection
              page={page}
              document={document}
              reload={() => load(true)}
              reportError={setError}
            />
          : <PageSections page={page} document={document} onChange={setDocument}/>
        }
        <Card title="Actions" styles={{body: {minHeight: 88}}}>
          {actions.length ? (
            <Flex justify="space-between" align="center" gap="middle" wrap="wrap">
              <Space wrap>
                {actions.map((action) => (
                  <Button
                    key={action.id}
                    danger={action.confirmation === 'destructive'}
                    disabled={action.available === false || Boolean(actionId)}
                    loading={actionId === action.id}
                    title={action.reason ?? undefined}
                    onClick={() => void execute(action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </Space>
              {operation ? (
                <Space direction="vertical" size={0} style={{minWidth: 220}}>
                  <Typography.Text>{display(operation.stage ?? operation.status)}</Typography.Text>
                  {typeof operation.progress === 'number' ? <Progress percent={operation.progress} size="small"/> : null}
                </Space>
              ) : <Typography.Text type="secondary">No action in progress</Typography.Text>}
            </Flex>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No actions are available"/>}
        </Card>
      </Space>
    </Form>
  )
}

export function PluginRoutePage() {
  const {pluginId, pageId} = useParams()
  const {plugins, loading, stale, refresh} = usePluginRuntime()
  const match = useMemo(() => {
    const plugin = plugins.find((item) => item.id === pluginId)
    const page = plugin?.descriptor.pages.find((item) => item.id === pageId)
    return plugin && page ? {plugin, page} : null
  }, [plugins, pluginId, pageId])

  if (loading) return <Skeleton active paragraph={{rows: 6}}/>
  if (!match) {
    return (
      <Result
        status="404"
        title="Plugin page unavailable"
        subTitle="The plugin may be disabled, incompatible, or its page descriptor may be invalid."
        extra={<Button onClick={() => void refresh()}>Refresh plugins</Button>}
      />
    )
  }
  return (
    <PluginPageErrorBoundary key={`${pluginId}:${pageId}`} pluginId={match.plugin.id}>
      {stale ? <Alert type="warning" showIcon message="Plugin navigation is stale" style={{marginBottom: 16}}/> : null}
      <PluginPage page={match.page} pluginId={match.plugin.id}/>
    </PluginPageErrorBoundary>
  )
}
