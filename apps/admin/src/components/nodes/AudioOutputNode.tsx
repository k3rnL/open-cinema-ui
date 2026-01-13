import { Position, NodeProps } from 'reactflow'
import { SoundOutlined } from '@ant-design/icons'
import { AudioDevice } from '@open-cinema/shared'
import BaseAudioNode from './BaseAudioNode'

export default function AudioOutputNode(props: NodeProps<AudioDevice & { onDelete?: () => void }>) {
    return (
        <BaseAudioNode
            {...props}
            icon={<SoundOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
            color="#52c41a"
            handleType="target"
            handlePosition={Position.Left}
            nodeLabel="Audio Output"
            onDelete={props.data.onDelete}
        />
    )
}
