import {ReactNode} from "react";
import NodeToolbarActions from "@/components/nodes/NodeToolbarActions.tsx";
import {Card, Space, Typography} from "antd";
import {NodeProps} from "reactflow";

const {Text} = Typography

export type BaseNodeProps<T> = NodeProps<T> & {
    children?: ReactNode,
    nodeLabel: string | ReactNode,
    onDelete?: () => void,
    icon: ReactNode,
    color: string
}

export default function BaseNode<T>({children, nodeLabel, onDelete, selected, icon, color}: BaseNodeProps<T>) {

    return (
        <>
            <NodeToolbarActions
                onDelete={onDelete}
                isVisible={selected}
                actions={[]}
            />
            <Card
                size="small"
                title={
                    <>
                        {typeof nodeLabel === "string" ? (
                            <Space>
                                {icon}
                                <Text strong style={{ color: "#fff", fontSize: 14 }}>
                                    {nodeLabel}
                                </Text>
                            </Space>

                        ) : (
                            nodeLabel
                        )}
                    </>
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
                {children}
            </Card>
        </>
    )
}