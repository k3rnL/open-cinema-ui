import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
} from '@ant-design/icons'
import {Link} from 'react-router'
import type {
  AudioAdapterKind,
  AudioAdapterTypeDto,
  JsonObject,
  JsonValue,
  ManagedAudioAdapterDto,
} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

interface AdapterFormValues {
  name: string
  kind: AudioAdapterKind
  enabled: boolean
  configuration: Record<string, JsonValue>
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function schemaProperties(type: AudioAdapterTypeDto | undefined): Array<[string, JsonObject]> {
  const properties = type?.configurationSchema.properties
  if (!isObject(properties)) return []
  return Object.entries(properties).filter((item): item is [string, JsonObject] => isObject(item[1]))
}

function defaultsFor(type: AudioAdapterTypeDto | undefined): Record<string, JsonValue> {
  return Object.fromEntries(
    schemaProperties(type)
      .filter(([, property]) => property.default !== undefined)
      .map(([name, property]) => [name, property.default]),
  )
}

function labelFor(propertyName: string, property: JsonObject): string {
  return typeof property.title === 'string' ? property.title : propertyName
}

function fieldFor(propertyName: string, property: JsonObject) {
  if (Array.isArray(property.enum)) {
    return (
      <Select
        aria-label={labelFor(propertyName, property)}
        options={property.enum.map((value) => ({value, label: String(value)}))}
      />
    )
  }
  if (property.type === 'boolean') return <Switch aria-label={labelFor(propertyName, property)}/>
  if (property.type === 'integer' || property.type === 'number') {
    return (
      <InputNumber
        aria-label={labelFor(propertyName, property)}
        min={typeof property.minimum === 'number' ? property.minimum : undefined}
        max={typeof property.maximum === 'number' ? property.maximum : undefined}
        precision={property.type === 'integer' ? 0 : undefined}
        style={{width: '100%'}}
      />
    )
  }
  return <Input aria-label={labelFor(propertyName, property)}/>
}

function statusBadge(adapter: ManagedAudioAdapterDto) {
  const lifecycle = adapter.observed.lifecycle
  const status = lifecycle === 'ready'
    ? 'success'
    : lifecycle === 'failed' || lifecycle === 'backoff'
      ? 'error'
      : lifecycle === 'starting' || lifecycle === 'stopping'
        ? 'processing'
        : 'default'
  return <Badge status={status} text={`${lifecycle} · ${adapter.observed.health}`}/>
}

function diagnostics(value: JsonObject): string {
  return Object.keys(value).length ? JSON.stringify(value, null, 2) : 'None'
}

export function EndpointAdaptersPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [types, setTypes] = useState<AudioAdapterTypeDto[]>([])
  const [adapters, setAdapters] = useState<ManagedAudioAdapterDto[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedAudioAdapterDto>()
  const [form] = Form.useForm<AdapterFormValues>()
  const selectedKind = Form.useWatch('kind', form)
  const selectedType = useMemo(
    () => types.find((type) => type.kind === selectedKind),
    [selectedKind, types],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catalogue, page] = await Promise.all([audioApi.adapterTypes(), audioApi.adapters()])
      setTypes(catalogue.items)
      setAdapters(page.items)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dialogOpen || !form.isFieldsTouched()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dialogOpen, form])

  const openCreate = () => {
    const type = types[0]
    setEditing(undefined)
    form.resetFields()
    if (type) {
      form.setFieldsValue({
        kind: type.kind,
        enabled: true,
        configuration: defaultsFor(type),
      })
    }
    setDialogOpen(true)
  }

  const openEdit = (adapter: ManagedAudioAdapterDto) => {
    setEditing(adapter)
    form.resetFields()
    form.setFieldsValue({
      name: adapter.desired.name,
      kind: adapter.desired.kind,
      enabled: adapter.desired.enabled,
      configuration: adapter.desired.configuration,
    })
    setDialogOpen(true)
  }

  const closeDialog = () => {
    if (!form.isFieldsTouched()) {
      setDialogOpen(false)
      return
    }
    Modal.confirm({
      title: 'Discard unsaved adapter changes?',
      content: 'The values in this form have not been saved.',
      okText: 'Discard',
      okButtonProps: {danger: true},
      onOk: () => setDialogOpen(false),
    })
  }

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (editing) {
        await audioApi.updateAdapter(editing.id, editing.desired.updateVersion, {
          name: values.name,
          enabled: values.enabled,
          configuration: values.configuration,
        })
        message.success('Endpoint adapter saved.')
      } else {
        await audioApi.createAdapter({
          name: values.name,
          kind: values.kind,
          enabled: values.enabled,
          configuration: values.configuration,
        })
        message.success('Endpoint adapter created.')
      }
      setDialogOpen(false)
      form.resetFields()
      await load()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation()
      message.success(success)
      await load()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const remove = (adapter: ManagedAudioAdapterDto) => {
    Modal.confirm({
      title: `Delete ${adapter.desired.name}?`,
      content: 'The disabled adapter definition will be removed. Audio files are preserved.',
      okText: 'Delete',
      okButtonProps: {danger: true},
      onOk: () => mutate(
        () => audioApi.deleteAdapter(adapter.id, adapter.desired.updateVersion),
        'Endpoint adapter deleted.',
      ),
    })
  }

  if (loading && adapters.length === 0) return <Spin fullscreen tip="Loading endpoint adapters…"/>

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <Space style={{width: '100%', justifyContent: 'space-between'}} align="start" wrap>
        <div>
          <Title level={2}>Endpoint adapters</Title>
          <Paragraph>
            Create network and debug audio endpoints. They become available to the same logical endpoint and graph workflow as physical devices.
          </Paragraph>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined/>} onClick={openCreate}>Create adapter</Button>
          <Button icon={<ReloadOutlined/>} loading={loading} onClick={() => void load()}>Refresh</Button>
        </Space>
      </Space>

      {error && <Alert type="error" showIcon message="Endpoint adapters could not be loaded" description={error}/>}

      <Card>
        <Table
          rowKey="id"
          dataSource={adapters}
          scroll={{x: 1050}}
          locale={{emptyText: 'No endpoint adapters yet. Create a ROC or debug-file endpoint to get started.'}}
          expandable={{
            columnTitle: <Tooltip title="Expand details"><InfoCircleOutlined aria-label="Details"/></Tooltip>,
            expandedRowRender: (adapter) => (
              <Descriptions bordered size="small" column={{xs: 1, lg: 2}}>
                <Descriptions.Item label="Expected PipeWire node">{adapter.observed.expectedNodeName || 'Not started'}</Descriptions.Item>
                <Descriptions.Item label="Runtime link">{adapter.observed.runtimeKey || 'Not observed'}</Descriptions.Item>
                <Descriptions.Item label="Configuration"><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(adapter.desired.configuration, null, 2)}</pre></Descriptions.Item>
                <Descriptions.Item label="Progress"><pre style={{whiteSpace: 'pre-wrap'}}>{diagnostics(adapter.observed.progress)}</pre></Descriptions.Item>
                <Descriptions.Item label="Last error"><pre style={{whiteSpace: 'pre-wrap'}}>{diagnostics(adapter.observed.lastError)}</pre></Descriptions.Item>
                <Descriptions.Item label="Retry">{adapter.observed.retryAt || 'Not scheduled'}</Descriptions.Item>
              </Descriptions>
            ),
          }}
          columns={[
            {title: 'Name', render: (_, adapter) => <Text strong>{adapter.desired.name}</Text>},
            {
              title: 'Type',
              render: (_, adapter) => {
                const type = types.find((item) => item.kind === adapter.desired.kind)
                return <Space direction="vertical" size={0}><Text>{type?.title ?? adapter.desired.kind}</Text><Tag>{type?.direction ?? 'unknown'}</Tag></Space>
              },
            },
            {title: 'Desired', render: (_, adapter) => <Tag color={adapter.desired.enabled ? 'blue' : 'default'}>{adapter.desired.enabled ? 'enabled' : 'disabled'}</Tag>},
            {title: 'Observed', render: (_, adapter) => statusBadge(adapter)},
            {
              title: 'Endpoint',
              render: (_, adapter) => adapter.observed.runtimeKey
                ? <Link to="/devices"><LinkOutlined/> View in Devices</Link>
                : <Text type="secondary">Not available</Text>,
            },
            {
              title: 'Actions',
              fixed: 'right',
              render: (_, adapter) => (
                <Space wrap>
                  <Tooltip title="Edit configuration"><Button aria-label={`Edit ${adapter.desired.name}`} icon={<EditOutlined/>} onClick={() => openEdit(adapter)}/></Tooltip>
                  <Tooltip title={adapter.desired.enabled ? 'Disable endpoint' : 'Enable endpoint'}>
                    <Switch
                      aria-label={`${adapter.desired.enabled ? 'Disable' : 'Enable'} ${adapter.desired.name}`}
                      checked={adapter.desired.enabled}
                      onChange={(enabled) => void mutate(
                        () => audioApi.updateAdapter(adapter.id, adapter.desired.updateVersion, {enabled}),
                        enabled ? 'Endpoint adapter enabled.' : 'Endpoint adapter disabled.',
                      )}
                    />
                  </Tooltip>
                  <Tooltip title="Restart process"><Button aria-label={`Restart ${adapter.desired.name}`} disabled={!adapter.desired.enabled} icon={<RetweetOutlined/>} onClick={() => void mutate(() => audioApi.restartAdapter(adapter.id, adapter.desired.updateVersion), 'Endpoint adapter restart requested.')}/></Tooltip>
                  <Tooltip title={adapter.desired.enabled ? 'Disable before deleting' : 'Delete definition'}><Button aria-label={`Delete ${adapter.desired.name}`} danger disabled={adapter.desired.enabled} icon={<DeleteOutlined/>} onClick={() => remove(adapter)}/></Tooltip>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? `Edit ${editing.desired.name}` : 'Create endpoint adapter'}
        open={dialogOpen}
        okText={editing ? 'Save' : 'Create'}
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={closeDialog}
        forceRender
        width={620}
        styles={{body: {maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 8}}}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{required: true, whitespace: true}]}><Input autoFocus/></Form.Item>
          <Form.Item name="kind" label="Adapter type" rules={[{required: true}]}>
            <Select
              disabled={Boolean(editing)}
              options={types.map((type) => ({value: type.kind, label: `${type.title} (${type.direction})`}))}
              onChange={(kind: AudioAdapterKind) => {
                const type = types.find((item) => item.kind === kind)
                form.setFieldValue('configuration', defaultsFor(type))
              }}
            />
          </Form.Item>
          {selectedType && <Alert type="info" showIcon message={selectedType.title} description={selectedType.description} style={{marginBottom: 16}}/>}
          {schemaProperties(selectedType).map(([name, property]) => {
            const required = Array.isArray(selectedType?.configurationSchema.required)
              && selectedType.configurationSchema.required.includes(name)
            return (
              <Form.Item
                key={name}
                name={['configuration', name]}
                label={labelFor(name, property)}
                valuePropName={property.type === 'boolean' ? 'checked' : 'value'}
                extra={typeof property.description === 'string' ? property.description : undefined}
                rules={[{required, message: `${labelFor(name, property)} is required.`}]}
              >
                {fieldFor(name, property)}
              </Form.Item>
            )
          })}
          <Form.Item name="enabled" label="Start after saving" valuePropName="checked"><Switch/></Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
