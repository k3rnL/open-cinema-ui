import { Position } from 'reactflow'
import { AudioOutlined } from '@ant-design/icons'
import BaseAudioNode, {BaseAudioNodeProps} from './BaseAudioNode'

export default function AudioInputNode(props: BaseAudioNodeProps) {
    return (
        <BaseAudioNode
            {...props}
            icon={<AudioOutlined style={{ color: '#1890ff', fontSize: 16 }} />}
            color="#1890ff"
            handleType="source"
            handlePosition={Position.Right}
            nodeLabel="Audio Input"
        />
    )
}
