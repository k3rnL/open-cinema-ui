import { Position } from 'reactflow'
import { SoundOutlined } from '@ant-design/icons'
import BaseAudioNode, {BaseAudioNodeProps} from './BaseAudioNode'

export default function AudioOutputNode(props: BaseAudioNodeProps) {
    return (
        <BaseAudioNode
            {...props}
            icon={<SoundOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
            color="#52c41a"
            handleType="target"
            handlePosition={Position.Left}
            nodeLabel="Audio Output"
        />
    )
}
