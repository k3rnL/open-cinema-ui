import {List, useTable} from '@refinedev/antd'
import {Table, Button, message} from 'antd'
import {ReloadOutlined, CloseOutlined} from '@ant-design/icons'
import {type Device, devicesApi} from '@open-cinema/shared'
import {useState} from 'react'
import {useDeleteMany} from '@refinedev/core'

export default function DeviceList() {
    const [refreshing, setUpdating] = useState(false)

    // useTable handles pagination, sorting, filtering automatically
    const {tableProps, tableQuery} = useTable<Device>({
        syncWithLocation: true,
    })

    const {refetch, isFetching} = tableQuery
    const {mutate: deleteMany} = useDeleteMany<Device>()

    const handleUpdate = async () => {
        setUpdating(true)
        try {
            // Call backend API to trigger device refresh/discovery
            await devicesApi.update()

            // Then refresh the table data
            await refetch()
            message.success('Devices refreshed successfully')
        } catch (error) {
            message.error('Failed to refresh devices')
        } finally {
            setUpdating(false)
        }
    }

    const handleForgetInactives = () => {
        // Get inactive devices from current table data
        const inactiveDevices = (tableProps.dataSource || []).filter(
            (device: Device) => !device.active
        )

        if (inactiveDevices.length === 0) {
            message.info('No inactive devices to delete')
            return
        }

        // Delete all inactive devices using Refine's useDeleteMany
        deleteMany({
            resource: 'devices',
            ids: inactiveDevices.map((device: Device) => device.id),
            successNotification: () => ({
                message: `Deleted ${inactiveDevices.length} inactive device(s)`,
                type: 'success',
            }),
            errorNotification: (error: any) => {
                const errorData = error?.response?.data || error?.data
                if (errorData?.error && errorData?.references) {
                    const refList = errorData.references.map((ref: string) => `• ${ref}`).join('\n')
                    return {
                        message: refList,
                        description: errorData.error,
                        type: 'error',
                    }
                }
                return {
                    message: 'Failed to delete inactive devices',
                    type: 'error',
                }
            },
        })
    }

    return (
        <List
            headerButtons={({defaultButtons}) => (
                <>
                    {defaultButtons}
                    <Button
                        type="primary"
                        icon={<ReloadOutlined/>}
                        onClick={handleUpdate}
                        loading={refreshing || isFetching}
                    >
                        Refresh Devices
                    </Button>
                    <Button
                        type="primary"
                        danger={true}
                        icon={<CloseOutlined/>}
                        onClick={handleForgetInactives}
                        loading={refreshing || isFetching}
                    >
                        Forget inactives
                    </Button>
                </>
            )}
        >
            <Table {...tableProps} rowKey="id" loading={isFetching}>
                <Table.Column dataIndex="id" title="ID"/>
                <Table.Column dataIndex="backend" title="Backend"/>
                <Table.Column dataIndex="name" title="Name"/>
                <Table.Column dataIndex="device_type" title="Type"/>
                <Table.Column dataIndex="format" title="Format"/>
                <Table.Column dataIndex="sample_rate" title="Sample Rate (Hz)"/>
                <Table.Column dataIndex="channels" title="Channels"/>
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
                    dataIndex="last_seen"
                    title="Last Seen"
                    render={(date: string) =>
                        date ? new Date(date).toLocaleString() : 'Never'
                    }
                />
            </Table>
        </List>
    )
}
