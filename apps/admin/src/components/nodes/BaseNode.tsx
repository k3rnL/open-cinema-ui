import {ReactNode} from "react";
import NodeToolbarActions, {NodeToolbarActionsProps} from "@/components/nodes/NodeToolbarActions.tsx";
import {Card, Space, Typography} from "antd";
import {NodeProps} from "reactflow";

const {Text} = Typography

export type BaseNodeProps<T> = NodeProps<T> & {
    children?: ReactNode,
    toolbar: NodeToolbarActionsProps,
    nodeLabel: string | ReactNode,
    onDelete?: () => void,
    icon?: ReactNode,
    color: string,
    isDirty?: boolean,
    isSaving?: boolean
}

export default function BaseNode<T>({children, nodeLabel, onDelete, selected, icon, color, toolbar, isDirty = false, isSaving = false}: BaseNodeProps<T>) {
    // Determine border color based on state
    const getBorderColor = () => {
        if (selected) return color;
        if (isDirty && !selected) return '#ffffff'; // White border for stale/dirty nodes
        return '#434343'; // Default border
    };

    return (
        <>
            <NodeToolbarActions
                {...toolbar}
                onDelete={onDelete}
                isVisible={selected}
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
                                {isSaving && (
                                    <Text style={{ color: "#8c8c8c", fontSize: 12, fontStyle: 'italic' }}>
                                        (saving...)
                                    </Text>
                                )}
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
                    borderColor: getBorderColor(),
                    borderRadius: '8px',
                    boxShadow: selected ? `0 0 0 2px ${color}33` : (isDirty ? '0 0 0 2px rgba(255, 255, 255, 0.2)' : 'none'),
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box',
                    opacity: isSaving ? 0.7 : 1,
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