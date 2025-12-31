import {List, useTable} from '@refinedev/antd'
import {Table, Button, Badge, Space, Modal, Switch, message, Popconfirm, Select} from 'antd'
import {EyeOutlined, FileTextOutlined, DeleteOutlined, EditOutlined} from '@ant-design/icons'
import {useState, useEffect} from 'react'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism'

interface Device {
    id: number
    name: string
    active: boolean
}

interface Pipeline {
    id: number
    name: string
    description: string
    input_device: Device
    output_device: Device
    enabled: boolean
    active: boolean
    created_at: string
    updated_at: string
}

export default function PipelineList() {
    const [yamlVisible, setYamlVisible] = useState<number | null>(null)
    const [yamlContent, setYamlContent] = useState<string>('')
    const [currentConfigVisible, setCurrentConfigVisible] = useState(false)
    const [currentConfigContent, setCurrentConfigContent] = useState<string>('')
    const [activating, setActivating] = useState<number | null>(null)
    const [devices, setDevices] = useState<Device[]>([])
    const [updatingDevice, setUpdatingDevice] = useState<number | null>(null)

    const {tableProps, tableQueryResult} = useTable<Pipeline>({
        syncWithLocation: true,
    })

    const {isFetching, refetch} = tableQueryResult

    // Fetch available devices
    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
                const response = await fetch(`${apiUrl}/devices`)
                const data = await response.json()
                setDevices(data)
            } catch (error) {
                console.error('Failed to fetch devices:', error)
            }
        }
        fetchDevices()
    }, [])

    const handleViewYaml = async (id: number) => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const response = await fetch(`${apiUrl}/camilladsp/pipelines/${id}/yaml`)
            const data = await response.json()
            setYamlContent(data.yaml)
            setYamlVisible(id)
        } catch (error) {
            console.error('Failed to fetch YAML:', error)
        }
    }

    const handleViewCurrentConfig = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const response = await fetch(`${apiUrl}/camilladsp/config/yaml`)
            const data = await response.json()
            setCurrentConfigContent(data.yaml)
            setCurrentConfigVisible(true)
        } catch (error) {
            console.error('Failed to fetch current config:', error)
        }
    }

    const handleActivateToggle = async (id: number, currentActive: boolean) => {
        setActivating(id)
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const endpoint = currentActive ? 'deactivate' : 'activate'
            const response = await fetch(`${apiUrl}/camilladsp/pipelines/${id}/${endpoint}`, {
                method: 'POST',
            })
            const json = await response.json()

            if (!response.ok) {
                throw new Error(json.error || 'Unknown error')
            }

            message.success(`Pipeline ${currentActive ? 'deactivated' : 'activated'} successfully`)
            await refetch()
        } catch (error) {
            message.error(`Failed to ${currentActive ? 'deactivate' : 'activate'} pipeline: ${(error as Error).message}`)
            console.error('Failed to toggle pipeline:', error)
        } finally {
            setActivating(null)
        }
    }

    const handleDelete = async (id: number) => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const response = await fetch(`${apiUrl}/camilladsp/pipelines/${id}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('Failed to delete pipeline')
            }

            message.success('Pipeline deleted successfully')
            await refetch()
        } catch (error) {
            message.error('Failed to delete pipeline')
            console.error('Failed to delete pipeline:', error)
        }
    }

    const handleDeviceChange = async (pipelineId: number, deviceType: 'input' | 'output', deviceId: number) => {
        setUpdatingDevice(pipelineId)
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
            const response = await fetch(`${apiUrl}/camilladsp/pipelines/${pipelineId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    [deviceType === 'input' ? 'input_device_id' : 'output_device_id']: deviceId,
                }),
            })

            if (!response.ok) {
                throw new Error('Failed to update pipeline')
            }

            message.success(`${deviceType === 'input' ? 'Input' : 'Output'} device updated successfully`)
            await refetch()
        } catch (error) {
            message.error(`Failed to update ${deviceType} device`)
            console.error('Failed to update device:', error)
        } finally {
            setUpdatingDevice(null)
        }
    }

    return (
        <>
            <List
                headerButtons={({defaultButtons}) => (
                    <>
                        {defaultButtons}
                        <Button
                            type="primary"
                            icon={<FileTextOutlined/>}
                            onClick={handleViewCurrentConfig}
                        >
                            View Current Config
                        </Button>
                    </>
                )}
            >
                <Table {...tableProps} rowKey="id" loading={isFetching}>
                    <Table.Column dataIndex="name" title="Name"/>
                    <Table.Column dataIndex="description" title="Description"/>

                    <Table.Column
                        title="Input Device"
                        render={(_, record: Pipeline) => (
                            <Space>
                                <Select
                                    value={record.input_device.id}
                                    onChange={(deviceId) => handleDeviceChange(record.id, 'input', deviceId)}
                                    loading={updatingDevice === record.id}
                                    disabled={updatingDevice === record.id}
                                    style={{width: 200}}
                                >
                                    {devices.map((device) => (
                                        <Select.Option key={device.id} value={device.id}>
                                            <Space>
                                                <Badge status={device.active ? 'success' : 'error'}/>
                                                {device.name}
                                            </Space>
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Space>
                        )}
                    />

                    <Table.Column
                        title="Output Device"
                        render={(_, record: Pipeline) => (
                            <Space>
                                <Select
                                    value={record.output_device.id}
                                    onChange={(deviceId) => handleDeviceChange(record.id, 'output', deviceId)}
                                    loading={updatingDevice === record.id}
                                    disabled={updatingDevice === record.id}
                                    style={{width: 200}}
                                >
                                    {devices.map((device) => (
                                        <Select.Option key={device.id} value={device.id}>
                                            <Space>
                                                <Badge status={device.active ? 'success' : 'error'}/>
                                                {device.name}
                                            </Space>
                                        </Select.Option>
                                    ))}
                                </Select>
                            </Space>
                        )}
                    />

                    <Table.Column
                        dataIndex="enabled"
                        title="Enabled"
                        render={(enabled: boolean) => (
                            <Badge status={enabled ? 'success' : 'default'} text={enabled ? 'Yes' : 'No'}/>
                        )}
                    />

                    <Table.Column
                        dataIndex="active"
                        title="Active"
                        render={(active: boolean, record: Pipeline) => (
                            <Switch
                                checked={active}
                                loading={activating === record.id}
                                onChange={() => handleActivateToggle(record.id, active)}
                                checkedChildren="Running"
                                unCheckedChildren="Stopped"
                            />
                        )}
                    />

                    <Table.Column
                        dataIndex="created_at"
                        title="Created"
                        render={(date: string) => new Date(date).toLocaleString()}
                    />

                    <Table.Column
                        title="Actions"
                        render={(_, record: Pipeline) => (
                            <Space>
                                <Button
                                    type="link"
                                    icon={<EyeOutlined/>}
                                    onClick={() => handleViewYaml(record.id)}
                                >
                                    View YAML
                                </Button>
                                <Button
                                    type="link"
                                    icon={<EditOutlined/>}
                                    href={`/camilladsp/pipelines/${record.id}/update`}
                                >
                                    Edit
                                </Button>
                                <Popconfirm
                                    title="Delete pipeline"
                                    description="Are you sure you want to delete this pipeline?"
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

            <Modal
                title="Pipeline YAML Configuration"
                open={yamlVisible !== null}
                onCancel={() => setYamlVisible(null)}
                footer={null}
                width={900}
                styles={{
                    body: {
                        maxHeight: '70vh',
                        overflow: 'auto',
                    },
                }}
            >
                <SyntaxHighlighter
                    language="yaml"
                    style={vscDarkPlus}
                    customStyle={{
                        borderRadius: '4px',
                        fontSize: '14px',
                    }}
                >
                    {yamlContent}
                </SyntaxHighlighter>
            </Modal>

            <Modal
                title="Current CamillaDSP Configuration"
                open={currentConfigVisible}
                onCancel={() => setCurrentConfigVisible(false)}
                footer={null}
                width={900}
                styles={{
                    body: {
                        maxHeight: '70vh',
                        overflow: 'auto',
                    },
                }}
            >
                <SyntaxHighlighter
                    language="yaml"
                    style={vscDarkPlus}
                    customStyle={{
                        borderRadius: '4px',
                        fontSize: '14px',
                    }}
                >
                    {currentConfigContent}
                </SyntaxHighlighter>
            </Modal>
        </>
    )
}
