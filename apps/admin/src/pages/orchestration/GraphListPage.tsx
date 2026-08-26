import {useCallback, useEffect, useState} from 'react'
import {Alert, Button, Form, Input, Modal, Select, Space, Spin, Table, Tag, Typography, message} from 'antd'
import {CheckCircleOutlined, EditOutlined, PlusOutlined, PoweroffOutlined, ReloadOutlined} from '@ant-design/icons'
import {Link, useNavigate} from 'react-router'
import {
  selectorRulesFromDocument,
  type DesiredGraphDocumentDto,
  type GraphDefinitionDto,
  type GraphRevisionDto,
  type OrchestrationReadinessDto,
} from '@open-cinema/shared'
import {audioApi} from './client'

const {Paragraph, Title} = Typography

function emptyDocument(graph: GraphDefinitionDto): DesiredGraphDocumentDto {
  return {
    schemaVersion: 1,
    id: `${graph.kind}:${graph.id}`,
    kind: graph.kind,
    metadata: {name: graph.name, labels: graph.labels},
    parameters: [],
    publicPorts: [],
    conditions: [],
    nodes: [],
    edges: [],
    layout: {viewport: {x: 0, y: 0, zoom: 1}},
  }
}

export function GraphListPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [definitions, setDefinitions] = useState<GraphDefinitionDto[]>([])
  const [publishedRevisions, setPublishedRevisions] = useState<Record<string, GraphRevisionDto>>({})
  const [readiness, setReadiness] = useState<OrchestrationReadinessDto>()
  const [applyingId, setApplyingId] = useState<string>()
  const [deactivatingId, setDeactivatingId] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm<{name: string; kind: 'graph' | 'subgraph'}>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [definitionPage, currentReadiness] = await Promise.all([
        audioApi.definitions(),
        audioApi.readiness(),
      ])
      const items = definitionPage.items
      const revisions = await Promise.all(items
        .filter((definition) => definition.kind === 'graph')
        .map(async (definition) => {
          const published = (await audioApi.revisions(definition.id)).items
            .filter((revision) => revision.state === 'published')
            .sort((left, right) => right.revisionNumber - left.revisionNumber)[0]
          return [definition.id, published] as const
        }))
      setDefinitions(items)
      setReadiness(currentReadiness)
      setPublishedRevisions(Object.fromEntries(
        revisions.filter((entry): entry is readonly [string, GraphRevisionDto] => entry[1] !== undefined),
      ))
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const create = async () => {
    const values = await form.validateFields()
    const definition = await audioApi.createDefinition({...values, labels: {}})
    await audioApi.createRevision(definition.id, emptyDocument(definition))
    setCreateOpen(false)
    form.resetFields()
    navigate(`/graphs/edit/${definition.id}`)
  }

  const deactivate = (definition: GraphDefinitionDto) => {
    Modal.confirm({
      title: `Deactivate ${definition.name}?`,
      content: 'Its managed audio routes will be removed. The graph, drafts, published revisions, and layout remain saved.',
      okText: 'Deactivate graph',
      okButtonProps: {danger: true},
      onOk: async () => {
        setDeactivatingId(definition.id)
        try {
          await audioApi.deactivateGraph(definition.id, definition.desiredStateVersion)
          message.success(`${definition.name} is being deactivated.`)
          await load()
        } catch (caught) {
          message.error(caught instanceof Error ? caught.message : String(caught))
          await load()
          throw caught
        } finally {
          setDeactivatingId(undefined)
        }
      },
    })
  }

  const applyPublished = (definition: GraphDefinitionDto, revision: GraphRevisionDto) => {
    Modal.confirm({
      title: `Apply ${definition.name}?`,
      content: `Published revision ${revision.revisionNumber} will become active. Any independent draft remains unchanged.`,
      okText: 'Apply graph',
      onOk: async () => {
        setApplyingId(definition.id)
        try {
          const [activation, selected] = await Promise.all([
            audioApi.activation(definition.id),
            audioApi.revision(revision.id),
          ])
          const rules = selected.value.content
            ? selectorRulesFromDocument(selected.value.content)
            : undefined
          await audioApi.activateRevision(
            revision.id,
            activation.value.desiredStateVersion,
            {},
            rules?.scene ? {active: rules.scene} : {},
          )
          message.success(`${definition.name} revision ${revision.revisionNumber} is being applied.`)
          await load()
        } catch (caught) {
          message.error(caught instanceof Error ? caught.message : String(caught))
          await load()
          throw caught
        } finally {
          setApplyingId(undefined)
        }
      },
    })
  }

  if (loading) return <Spin fullscreen tip="Loading desired graphs…"/>

  const liveReason = readiness?.blockers.join(', ') || 'audio runtime unavailable'

  return (
    <Space direction="vertical" style={{width: '100%'}} size="large">
      <Space style={{width: '100%', justifyContent: 'space-between'}} align="start" wrap>
        <div>
          <Title level={2}>Audio graphs</Title>
          <Paragraph>Desired behavior is revisioned independently of live PipeWire objects.</Paragraph>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateOpen(true)}>Create Graph</Button>
          <Button icon={<ReloadOutlined/>} onClick={() => void load()}>Refresh</Button>
        </Space>
      </Space>
      {!readiness?.liveControlsAvailable && (
        <Alert
          type="warning"
          showIcon
          message="Desired audio can still be edited; live changes are paused"
          description={liveReason}
        />
      )}
      <Table
        rowKey="id"
        dataSource={definitions}
        columns={[
          {title: 'Name', dataIndex: 'name'},
          {title: 'Kind', dataIndex: 'kind', render: (value: string) => <Tag color={value === 'subgraph' ? 'purple' : 'blue'}>{value}</Tag>},
          {
            title: 'Active',
            render: (_, definition) => definition.activeRevisionId ? <Tag color="green">revision active</Tag> : <Tag>not active</Tag>,
          },
          {title: 'Desired version', dataIndex: 'desiredStateVersion'},
          {title: 'Updated', dataIndex: 'updatedAt'},
          {
            title: 'Actions',
            render: (_, definition) => {
              const published = publishedRevisions[definition.id]
              return <Space size="small">
                <Link to={`/graphs/edit/${definition.id}`} aria-label={`Edit ${definition.name}`}>
                  <Button size="small" icon={<EditOutlined/>}/>
                </Link>
                {definition.kind === 'graph' && published && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckCircleOutlined/>}
                    loading={applyingId === definition.id}
                    disabled={!readiness?.liveControlsAvailable}
                    title={!readiness?.liveControlsAvailable ? liveReason : undefined}
                    aria-label={`Apply ${definition.name}`}
                    onClick={() => applyPublished(definition, published)}
                  />
                )}
                {definition.kind === 'graph' && definition.activeRevisionId && (
                  <Button
                    size="small"
                    danger
                    icon={<PoweroffOutlined/>}
                    loading={deactivatingId === definition.id}
                    disabled={!readiness?.liveControlsAvailable}
                    title={!readiness?.liveControlsAvailable ? liveReason : undefined}
                    aria-label={`Deactivate ${definition.name}`}
                    onClick={() => deactivate(definition)}
                  />
                )}
              </Space>
            },
          },
        ]}
      />
      <Modal title="Create desired graph" open={createOpen} onOk={() => void create()} onCancel={() => setCreateOpen(false)}>
        <Form form={form} layout="vertical" initialValues={{kind: 'graph'}}>
          <Form.Item name="name" label="Name" rules={[{required: true}]}><Input/></Form.Item>
          <Form.Item name="kind" label="Kind" rules={[{required: true}]}>
            <Select options={[
              {value: 'graph', label: 'Top-level audio graph'},
              {value: 'subgraph', label: 'Reusable parameterized subgraph'},
            ]}/>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
