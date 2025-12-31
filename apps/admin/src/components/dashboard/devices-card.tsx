import {Card, Table} from "antd";
import {List, useTable} from "@refinedev/antd";

export const DevicesCard = () => {
    const { tableProps: deviceTableProps, tableQuery: deviceQuery } = useTable({
        resource: "devices",
    })

    const {isFetching} = deviceQuery

    return <Card title="Devices">
        <List>
            <Table {...deviceTableProps} rowKey="id" loading={isFetching}>
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
            </Table>
        </List>
    </Card>;
};