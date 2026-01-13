import {NodeToolbar, NodeToolbarProps} from "reactflow"
import {Button, Space} from "antd"
import {ButtonProps} from "antd/lib/button"
import {DeleteOutlined} from "@ant-design/icons";

export type NodeToolbarAction = ButtonProps & {
    label: string
}
export type NodeToolbarActionsProps = NodeToolbarProps & {
    actions: NodeToolbarAction[] | undefined
    onDelete?: () => void
}

export default function NodeToolbarActions({actions, onDelete, ...toolbarProps}: NodeToolbarActionsProps) {
    const allActions = [...actions ?? []]
    if (onDelete) {
        allActions.push({
            label: 'Delete',
            onClick: onDelete,
            icon: <DeleteOutlined/>,
            danger: true
        })
    }

    return (
        <NodeToolbar
            {...toolbarProps}
        >
            <Space size={30}>
                {allActions?.map((action, index) => (
                    (<>
                            <Button
                                {...action}
                                key={index}
                                type="primary"
                                size="middle"
                            >
                                {action.label}
                            </Button>
                        </>
                    )
                ))}
            </Space>
        </NodeToolbar>
    )
}