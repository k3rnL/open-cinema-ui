import { Handle, Position, NodeProps } from 'reactflow'
import { Badge, Card, Space, Typography } from 'antd'
import { AudioDevice } from '@open-cinema/shared'
import { ReactNode } from 'react'

const { Text } = Typography

interface BaseAudioNodeProps extends NodeProps<AudioDevice> {
    icon: ReactNode
    color: string
    handleType: 'source' | 'target'
    handlePosition: Position
    nodeLabel: string
}

export default function BaseAudioNode({
    data: device,
    selected,
    icon,
    color,
    handleType,
    handlePosition,
    nodeLabel
}: BaseAudioNodeProps) {
    return (
        <Card
            size="small"
            title={
                <Space>
                    {icon}
                    <Text strong style={{ color: '#fff', fontSize: 14 }}>
                        {device.name || nodeLabel}
                    </Text>
                    <Badge status={device.active ? 'success' : 'error'} />
                </Space>
            }
            style={{
                minWidth: 220,
                background: '#1f1f1f',
                border: '2px solid',
                borderColor: selected ? color : '#434343',
                borderRadius: '8px',
                boxShadow: selected ? `0 0 0 2px ${color}33` : 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
            }}
            styles={{
                header: {
                    background: '#2a2a2a',
                    border: 'none',
                    padding: '8px 12px',
                    minHeight: 'auto',
                },
                body: {
                    padding: '8px 12px',
                }
            }}
        >
            <Handle
                type={handleType}
                position={handlePosition}
                style={{
                    background: color,
                    width: 10,
                    height: 10,
                }}
            />
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {device.format && (
                    <Text style={{ color: '#8c8c8c', fontSize: 12 }}>
                        Format: <Text style={{ color: '#bfbfbf' }}>{device.format}</Text>
                    </Text>
                )}
                {device.sample_rate && (
                    <Text style={{ color: '#8c8c8c', fontSize: 12 }}>
                        Sample Rate: <Text style={{ color: '#bfbfbf' }}>{device.sample_rate} Hz</Text>
                    </Text>
                )}
                {device.channels && (
                    <Text style={{ color: '#8c8c8c', fontSize: 12 }}>
                        Channels: <Text style={{ color: '#bfbfbf' }}>{device.channels}</Text>
                    </Text>
                )}
            </Space>
        </Card>
    )
}
