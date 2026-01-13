import { Position, NodeProps } from 'reactflow'
import { AudioOutlined } from '@ant-design/icons'
import { AudioDevice } from '@open-cinema/shared'
import BaseAudioNode from './BaseAudioNode'

export default function AudioInputNode(props: NodeProps<AudioDevice & { onDelete?: () => void }>) {
    return (
        <BaseAudioNode
            {...props}
            icon={<AudioOutlined style={{ color: '#1890ff', fontSize: 16 }} />}
            color="#1890ff"
            handleType="source"
            handlePosition={Position.Right}
            nodeLabel="Audio Input"
            onDelete={props.data.onDelete}
        />
    )
}
