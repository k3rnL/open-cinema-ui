import {List, useTable} from '@refinedev/antd'
import {Table, Button, Tag, Space, Popconfirm, message} from 'antd'
import {EyeOutlined, DeleteOutlined, EditOutlined} from '@ant-design/icons'
import {useState} from 'react'
import {useNavigate} from 'react-router'

interface MixerSource {
    channel: number
    gain: number
    inverted: boolean
}

interface MixerMapping {
    dest: number
    sources: MixerSource[]
}

interface Mixer {
    id: number
    name: string
    description: string
    input_channels: number
    output_channels: number
    mapping: MixerMapping[]
    created_at: string
    updated_at: string
}

export default function MixerList() {
    const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([])
    const navigate = useNavigate()

    const {tableProps, tableQuery} = useTable<Mixer>({
        syncWithLocation: true,
    })

    const {isFetching, refetch} = tableQuery

    const handleDelete = async (id: number) => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const response = await fetch(`${apiUrl}/camilladsp/mixers/${id}/delete`, {
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error('Failed to delete mixer')
            }

            message.success('Mixer deleted successfully')
            await refetch()
        } catch (error) {
            message.error('Failed to delete mixer')
            console.error('Failed to delete mixer:', error)
        }
    }

    const expandedRowRender = (record: Mixer) => {
        const columns = [
            {
                title: 'Source Channels',
                key: 'sources',
                render: (_: unknown, mapping: MixerMapping) => (
                    <Space size="small">
                        {mapping.sources.map((source, idx) => (
                            <div key={idx}>
                                <Tag color="blue">Ch {source.channel}</Tag>
                                <Tag color={source.gain === 0 ? 'green' : 'orange'}>
                                    {source.gain > 0 ? '+' : ''}{source.gain} dB
                                </Tag>
                                {source.inverted && <Tag color="red">Inverted</Tag>}
                            </div>
                        ))}
                    </Space>
                ),
            },
            {
                title: 'Destination Channel',
                dataIndex: 'dest',
                key: 'dest',
                render: (dest: number) => <Tag color="purple">Ch {dest}</Tag>,
            },
        ]

        return (
            <Table
                columns={columns}
                dataSource={record.mapping}
                rowKey="dest"
                pagination={false}
                size="small"
            />
        )
    }

    return (
        <List>
            <Table
                {...tableProps}
                rowKey="id"
                loading={isFetching}
                expandable={{
                    expandedRowRender,
                    expandedRowKeys,
                    onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as number[]),
                }}
            >
                <Table.Column dataIndex="name" title="Name"/>
                <Table.Column dataIndex="description" title="Description"/>

                <Table.Column
                    dataIndex="input_channels"
                    title="Input Channels"
                    render={(channels: number) => (
                        <Tag color="blue">{channels} ch</Tag>
                    )}
                />

                <Table.Column
                    dataIndex="output_channels"
                    title="Output Channels"
                    render={(channels: number) => (
                        <Tag color="purple">{channels} ch</Tag>
                    )}
                />

                <Table.Column
                    dataIndex="mapping"
                    title="Mappings"
                    render={(mapping: MixerMapping[]) => (
                        <div>{mapping.length} mappings</div>
                    )}
                />

                <Table.Column
                    dataIndex="created_at"
                    title="Created"
                    render={(date: string) => new Date(date).toLocaleString()}
                />

                <Table.Column
                    title="Actions"
                    render={(_, record: Mixer) => (
                        <Space>
                            <Button
                                type="link"
                                icon={<EyeOutlined/>}
                                onClick={() => {
                                    if (expandedRowKeys.includes(record.id)) {
                                        setExpandedRowKeys(expandedRowKeys.filter(k => k !== record.id))
                                    } else {
                                        setExpandedRowKeys([...expandedRowKeys, record.id])
                                    }
                                }}
                            >
                                {expandedRowKeys.includes(record.id) ? 'Hide' : 'View'} Details
                            </Button>
                            <Button
                                type="link"
                                icon={<EditOutlined/>}
                                onClick={() => navigate(`/camilladsp/mixers/edit/${record.id}`)}
                            >
                                Edit
                            </Button>
                            <Popconfirm
                                title="Delete mixer"
                                description="Are you sure you want to delete this mixer?"
                                onConfirm={() => handleDelete(record.id)}
                                okText="Yes"
                                cancelText="No"
                                okButtonProps={{danger: true}}
                            >
                                <Button
                                    type="link"
                                    danger
                                    icon={<DeleteOutlined/>}
                                >
                                    Delete
                                </Button>
                            </Popconfirm>
                        </Space>
                    )}
                />
            </Table>
        </List>
    )
}
