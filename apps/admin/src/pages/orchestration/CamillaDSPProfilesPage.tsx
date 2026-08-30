import {useCallback, useEffect, useState} from 'react'
import {Alert, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography, message} from 'antd'
import {EditOutlined, PlusOutlined, ReloadOutlined} from '@ant-design/icons'
import type {CamillaDSPProfileDto, JsonObject} from '@open-cinema/shared'
import {audioApi} from './client'
import {PageHeading, SectionSkeleton, StableStatusRegion} from '@/components/admin'

const {Text} = Typography

interface ProfileFormValue {
  name: string
  description: string
  parameters: string
  signalContracts: string
  processing: string
}

function initialContent(): JsonObject {
  const contract = {
    mediaKind: 'audio',
    content: 'pcm',
    rates: [48000],
    layouts: [{channels: 2, positions: ['FL', 'FR']}],
  }
  return {
    schemaVersion: 1,
    title: 'New CamillaDSP profile',
    parameters: [],
    signalContracts: {input: contract, output: contract},
    processing: {chunksize: 1024, samplerate: 48000, filters: {}, mixers: {}, pipeline: []},
  }
}

function valuesFor(profile?: CamillaDSPProfileDto): ProfileFormValue {
  const content = profile?.content ?? initialContent()
  return {
    name: profile?.name ?? 'New CamillaDSP profile',
    description: profile?.description ?? '',
    parameters: JSON.stringify(content.parameters ?? [], null, 2),
    signalContracts: JSON.stringify(content.signalContracts ?? {}, null, 2),
    processing: JSON.stringify(content.processing ?? {}, null, 2),
  }
}

export function CamillaDSPProfilesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [profiles, setProfiles] = useState<CamillaDSPProfileDto[]>([])
  const [editing, setEditing] = useState<CamillaDSPProfileDto>()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<ProfileFormValue>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles((await audioApi.camilladspProfiles({allVersions: true})).items)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const showEditor = (profile?: CamillaDSPProfileDto) => {
    setEditing(profile)
    form.setFieldsValue(valuesFor(profile))
    setOpen(true)
  }

  const save = async () => {
    const values = await form.validateFields()
    try {
      const content: JsonObject = {
        schemaVersion: 1,
        title: values.name,
        description: values.description,
        parameters: JSON.parse(values.parameters),
        signalContracts: JSON.parse(values.signalContracts),
        processing: JSON.parse(values.processing),
      }
      await audioApi.createCamillaDSPProfile({
        profileId: editing?.profileId,
        name: values.name,
        description: values.description,
        content,
      })
      message.success(editing ? 'New immutable profile version created.' : 'CamillaDSP profile created.')
      setOpen(false)
      setEditing(undefined)
      await load()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const latest = new Map<string, number>()
  profiles.forEach((profile) => latest.set(profile.profileId, Math.max(latest.get(profile.profileId) ?? 0, profile.version)))

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <PageHeading
        title="CamillaDSP profiles"
        description="Reusable device-independent processing profiles selected by graph processor nodes."
        actions={(
          <>
          <Button type="primary" icon={<PlusOutlined/>} onClick={() => showEditor()}>Create Profile</Button>
          <Button icon={<ReloadOutlined/>} loading={loading} onClick={() => void load()}>Refresh</Button>
          </>
        )}
      />
      <StableStatusRegion
        loading={loading && profiles.length === 0}
        status={error ? {type: 'error', message: 'CamillaDSP profiles could not be loaded', description: error, action: <Button onClick={() => void load()}>Retry</Button>} : null}
      />
      <Alert
        type="info"
        showIcon
        message="Profiles are immutable"
        description="Editing creates the next version. Existing published graphs remain pinned until explicitly changed and applied."
      />
      {loading && profiles.length === 0 ? <SectionSkeleton rows={5}/> : <Table
        rowKey="id"
        dataSource={profiles}
        columns={[
          {title: 'Name', dataIndex: 'name'},
          {title: 'Version', dataIndex: 'version', render: (version: number, profile) => <Tag color={version === latest.get(profile.profileId) ? 'green' : undefined}>v{version}{version === latest.get(profile.profileId) ? ' latest' : ''}</Tag>},
          {title: 'Description', dataIndex: 'description'},
          {title: 'Validation', render: (_, profile) => profile.validation.valid === false ? <Tag color="red">invalid</Tag> : <Tag color="green">valid</Tag>},
          {title: 'Created', dataIndex: 'createdAt'},
          {
            title: 'Actions',
            render: (_, profile) => (
              <Button size="small" icon={<EditOutlined/>} onClick={() => showEditor(profile)}>
                New version
              </Button>
            ),
          },
        ]}
        expandable={{
          expandedRowRender: (profile) => (
            <Card size="small">
              <Text strong>Signal contracts and processing</Text>
              <pre style={{whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto'}}>{JSON.stringify(profile.content, null, 2)}</pre>
            </Card>
          ),
        }}
      />}
      <Modal
        title={editing ? `Create ${editing.name} v${editing.version + 1}` : 'Create CamillaDSP profile'}
        open={open}
        width={860}
        okText={editing ? 'Create immutable version' : 'Create profile'}
        onOk={() => void save()}
        onCancel={() => setOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Profile name" rules={[{required: true}]}><Input/></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item>
          <Alert type="info" showIcon message="Advanced profile document" description="CamillaDSP filters, mixers, and pipelines are intentionally edited as lossless JSON because their schemas are open-ended and profile-specific." style={{marginBottom: 16}}/>
          <Form.Item name="parameters" label="Reusable parameter definitions (JSON)" rules={[{required: true}]}>
            <Input.TextArea rows={7}/>
          </Form.Item>
          <Form.Item name="signalContracts" label="Input and output signal contracts (JSON)" rules={[{required: true}]}>
            <Input.TextArea rows={9}/>
          </Form.Item>
          <Form.Item name="processing" label="Filters, mixers, channel mapping, rate, chunks, and pipeline (JSON)" rules={[{required: true}]}>
            <Input.TextArea rows={14}/>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
