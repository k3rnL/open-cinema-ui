import {List, useTable} from '@refinedev/antd'
import {Table, Button, message} from 'antd'
import {ReloadOutlined} from '@ant-design/icons'
import {type Device, devicesApi} from '@open-cinema/shared'
import {useState} from 'react'

export default function DeviceList() {
    const [refreshing, setUpdating] = useState(false)

    // useTable handles pagination, sorting, filtering automatically
    const {tableProps, tableQueryResult} = useTable<Device>({
        syncWithLocation: true,
    })

    const {refetch, isFetching} = tableQueryResult

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
