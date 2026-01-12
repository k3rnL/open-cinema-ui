import {List, useTable, EditButton} from '@refinedev/antd'
import {Table, Button, Modal, Form, Input, message} from 'antd'
import {useState} from 'react'
import {useCreate, useNavigation} from '@refinedev/core'

interface Pipeline {
    id: number
    name: string
    active: boolean
}

export default function PipelineList() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [form] = Form.useForm()
    const { mutate: createPipeline } = useCreate()
    const { edit } = useNavigation()

    const { tableProps, tableQuery } = useTable<Pipeline>({
        syncWithLocation: true,
    })

    const { isFetching } = tableQuery

    const handleCreate = () => {
        form.validateFields().then(values => {
            createPipeline(
                {
                    resource: 'pipelines',
                    values: { name: values.name, nodes: [], edges: [] },
                },
                {
                    onSuccess: (data) => {
                        message.success('Pipeline created successfully')
                        setIsModalOpen(false)
                        form.resetFields()
                        // Navigate to edit page
                        if (data.data.id)
                            edit('pipelines', data.data.id)
                    },
                    onError: () => {
                        message.error('Failed to create pipeline')
                    },
                }
            )
        })
    }

    return (
        <>
            <List
                headerButtons={() => (
                    <Button type="primary" onClick={() => setIsModalOpen(true)}>
                        Create Pipeline
                    </Button>
                )}
            >
                <Table {...tableProps} rowKey="id" loading={isFetching}>
                    <Table.Column dataIndex="name" title="Name"/>
                    <Table.Column
                        dataIndex="active"
                        title="Active"
                        render={(active: boolean) => (
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: active ? 'green' : 'red',
                                }}
                            />
                        )}
                    />
                    <Table.Column
                        title="Actions"
                        dataIndex="actions"
                        render={(_, record: Pipeline) => (
                            <EditButton hideText size="small" recordItemId={record.id} />
                        )}
                    />
                </Table>
            </List>

            <Modal
                title="Create New Pipeline"
                open={isModalOpen}
                onOk={handleCreate}
                onCancel={() => {
                    setIsModalOpen(false)
                    form.resetFields()
                }}
                // confirmLoading={isLoading}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Pipeline Name"
                        name="name"
                        rules={[{ required: true, message: 'Please enter pipeline name' }]}
                    >
                        <Input placeholder="e.g., My Audio Pipeline" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    )
}
