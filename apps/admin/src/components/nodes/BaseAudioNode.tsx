import {Handle, Position} from 'reactflow'
import {Badge, Space, Typography} from 'antd'
import {AudioDevice} from '@open-cinema/shared'
import BaseNode, {BaseNodeProps} from "@/components/nodes/BaseNode.tsx";

const {Text} = Typography

export interface BaseAudioNodeProps extends BaseNodeProps<AudioDevice> {
    handleType: 'source' | 'target'
    handlePosition: Position
}

export default function BaseAudioNode(props: BaseAudioNodeProps) {
    const {
        data: device,
        handleType,
        handlePosition,
        color,
        icon
    } = props;

    return (
        <>
            <BaseNode {...props} nodeLabel={(
                <Space>
                    {icon}
                    <Text strong style={{ color: '#fff', fontSize: 14 }}>
                        {device.name}
                    </Text>
                    <Badge status={device.active ? 'success' : 'error'} />
                </Space>
            )}>
                <Handle
                    type={handleType}
                    position={handlePosition}
                    id={'h-1'}
                    style={{
                        background: color,
                        width: 10,
                        height: 10,
                    }}
                />
                <Handle
                    type={handleType}
                    position={handlePosition}
                    id={'h-2'}
                    style={{
                        background: color,
                        width: 10,
                        height: 10,
                    }}
                />
                <Space direction="vertical" size={4} style={{width: '100%'}}>
                    {device.format && (
                        <Text style={{color: '#8c8c8c', fontSize: 12}}>
                            Format: <Text style={{color: '#bfbfbf'}}>{device.format}</Text>
                        </Text>
                    )}
                    {device.sample_rate && (
                        <Text style={{color: '#8c8c8c', fontSize: 12}}>
                            Sample Rate: <Text style={{color: '#bfbfbf'}}>{device.sample_rate} Hz</Text>
                        </Text>
                    )}
                    {device.channels && (
                        <Text style={{color: '#8c8c8c', fontSize: 12}}>
                            Channels: <Text style={{color: '#bfbfbf'}}>{device.channels}</Text>
                        </Text>
                    )}
                </Space>
            </BaseNode>
        </>
    )
}
