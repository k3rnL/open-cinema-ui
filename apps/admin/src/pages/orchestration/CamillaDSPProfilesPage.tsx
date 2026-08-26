import {useCallback, useEffect, useState} from 'react'
import {Alert, Button, Card, Form, Input, Modal, Space, Spin, Table, Tag, Typography, message} from 'antd'
import {EditOutlined, PlusOutlined, ReloadOutlined} from '@ant-design/icons'
import type {CamillaDSPProfileDto, JsonObject} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Text, Title} = Typography

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
  const [profiles, setProfiles] = useState<CamillaDSPProfileDto[]>([])
  const [editing, setEditing] = useState<CamillaDSPProfileDto>()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<ProfileFormValue>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles((await audioApi.camilladspProfiles({allVersions: true})).items)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
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

  if (loading) return <Spin fullscreen tip="Loading CamillaDSP profiles…"/>

  const latest = new Map<string, number>()
  profiles.forEach((profile) => latest.set(profile.profileId, Math.max(latest.get(profile.profileId) ?? 0, profile.version)))

  return (
    <Space direction="vertical" size="large" style={{width: '100%'}}>
      <Space style={{width: '100%', justifyContent: 'space-between'}} align="start" wrap>
        <div>
          <Title level={2}>CamillaDSP profiles</Title>
          <Paragraph>Reusable device-independent processing profiles selected by graph processor nodes.</Paragraph>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined/>} onClick={() => showEditor()}>Create Profile</Button>
          <Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh</Button>
        </Space>
      </Space>
      <Alert
        type="info"
        showIcon
        message="Profiles are immutable"
        description="Editing creates the next version. Existing published graphs remain pinned until explicitly changed and applied."
      />
      <Table
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
      />
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
          <Form.Item name="parameters" label="Reusable parameter definitions" rules={[{required: true}]}>
            <Input.TextArea rows={7}/>
          </Form.Item>
          <Form.Item name="signalContracts" label="Input and output signal contracts" rules={[{required: true}]}>
            <Input.TextArea rows={9}/>
          </Form.Item>
          <Form.Item name="processing" label="Filters, mixers, channel mapping, rate, chunks, and pipeline" rules={[{required: true}]}>
            <Input.TextArea rows={14}/>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
