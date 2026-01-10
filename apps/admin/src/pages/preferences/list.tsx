import {List, useTable} from '@refinedev/antd'
import {Switch, Table} from 'antd'

interface AudioBackendPreference {
    id: number
    name: string
    enabled: boolean
}

import {useUpdate} from "@refinedev/core";

export default function AudioBackendPreferenceList() {

    const { tableProps, tableQuery } = useTable<AudioBackendPreference>({
        syncWithLocation: true,
    })

    const { mutate: updateBackend } = useUpdate<AudioBackendPreference>()

    const { isFetching } = tableQuery

    return (
        <List
            headerButtons={({defaultButtons}) => (
                <>
                    {defaultButtons}
                </>
            )}
        >
            <Table {...tableProps} rowKey="id" loading={isFetching}>
                <Table.Column dataIndex="name" title="Name"/>
                <Table.Column
                    dataIndex="enabled"
                    title="Enabled"
                    render={(enabled: boolean, record: AudioBackendPreference) => (
                        <Switch
                            checked={enabled}
                            onChange={(checked) => {
                                updateBackend({
                                    resource: 'preferences/audio-backends',
                                    id: record.name,
                                    values: { enabled: checked }
                                })
                            }}
                        />
                    )}/>
            </Table>
        </List>
    )
}
