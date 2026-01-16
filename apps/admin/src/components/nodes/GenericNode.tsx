import {Divider, Typography, message} from 'antd'
import BaseNode, {BaseNodeProps} from "@/components/nodes/BaseNode.tsx";
import {UnifiedNodeData, Slot, SlotDirection} from "@/types/node.ts";
import {useEffect, useState} from "react";
import {FieldEditor} from "@/components/nodes/fields/FieldEditor.tsx";
import {NodeToolbarAction} from "@/components/nodes/NodeToolbarActions.tsx";
import {Handle, Position} from 'reactflow';

const {Text} = Typography;

interface GenericNodeProps extends BaseNodeProps<UnifiedNodeData> {

}

function stringToColor(str: string): string {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;

    return `hsl(${hue}, 45%, 55%)`;
}

interface SlotItemProps {
    slot: Slot;
    nodeId: string;
}

function SlotItem({slot, nodeId}: SlotItemProps) {
    const showLeftHandle = slot.direction === SlotDirection.INPUT || slot.direction === SlotDirection.ALL;
    const showRightHandle = slot.direction === SlotDirection.OUTPUT || slot.direction === SlotDirection.ALL;

    return (
        <div style={{
            position: 'relative',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
        }}>
            {/* Left handle (input) */}
            {showLeftHandle && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id={`${nodeId}-${slot.name}-input`}
                    style={{
                        left: -20,
                        width: 14,
                        height: 14,
                        background: slot.type === 'AUDIO' ? '#52c41a' : '#1890ff',
                        border: '2px solid #141414',
                    }}
                />
            )}

            {/* Slot label */}
            <Text style={{
                color: '#d9d9d9',
                fontSize: 13,
                fontWeight: 500,
            }}>
                {slot.name}
            </Text>

            {/* Connection type */}
            <Text style={{
                color: '#8c8c8c',
                fontSize: 12,
                fontWeight: 500,
                minWidth: 'fit-content',
                flexShrink: 0,
            }}>
                ({slot.type})
            </Text>

            {/* Right handle (output) */}
            {showRightHandle && (
                <Handle
                    type="source"
                    position={Position.Right}
                    id={`${nodeId}-${slot.name}-output`}
                    style={{
                        right: -20,
                        width: 14,
                        height: 14,
                        background: slot.type === 'AUDIO' ? '#52c41a' : '#1890ff',
                        border: '2px solid #141414',
                    }}
                />
            )}
        </div>
    );
}

export default function GenericNode(props: GenericNodeProps) {
    const {
        data: nodeData,
        selected = false,
        id,
    } = props;

    const [fieldValues, setFieldValues] = useState<Record<string, any>>(nodeData.fieldValues || {});
    const [isDirty, setIsDirty] = useState(nodeData.isDirty || false);
    const [isSaving, setIsSaving] = useState(false);

    // Sync field values from parent when they change (but only if not dirty)
    useEffect(() => {
        if (!isDirty && nodeData.fieldValues) {
            setFieldValues(nodeData.fieldValues);
        }
    }, [nodeData.fieldValues, isDirty]);

    // Update isDirty when data changes from parent
    useEffect(() => {
        setIsDirty(nodeData.isDirty || false);
    }, [nodeData.isDirty]);

    const handleFieldChange = (fieldName: string, value: any) => {
        const newFieldValues = {
            ...fieldValues,
            [fieldName]: value
        };
        setFieldValues(newFieldValues);
        setIsDirty(true);

        // Notify parent of field value changes
        if (nodeData.onFieldValuesChange) {
            nodeData.onFieldValuesChange(id, newFieldValues);
        }
    };

    const handleSave = async () => {
        if (!nodeData.onSave) {
            message.error('Save function not configured');
            return;
        }

        setIsSaving(true);
        try {
            await nodeData.onSave(id);
            setIsDirty(false);
        } catch (error) {
            console.error('Save error:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = () => {
        setFieldValues({});
        setIsDirty(true);
        if (nodeData.onFieldValuesChange) {
            nodeData.onFieldValuesChange(id, {});
        }
    };

    const handleDelete = async () => {
        if (!nodeData.onDelete) {
            message.error('Delete function not configured');
            return;
        }

        try {
            await nodeData.onDelete(id);
        } catch (error) {
            message.error('Failed to delete node');
            console.error('Delete error:', error);
        }
    };

    const handleReload = async () => {
        if (!nodeData.onReload) {
            message.error('Reload function not configured');
            return;
        }

        try {
            await nodeData.onReload(id);
        } catch (error) {
            message.error('Failed to reload node');
            console.error('Reload error:', error);
        }
    };

    const toolbarActions: NodeToolbarAction[] = [
        {label: 'Clear', onClick: handleClear},
        {label: 'Save', onClick: handleSave, disabled: !isDirty || isSaving},
        {label: 'Reload', onClick: handleReload, disabled: nodeData.resource.isNew},
    ];

    const hasFields = nodeData.fieldDefinitions && nodeData.fieldDefinitions.length > 0;
    const allSlots = [
        ...(nodeData.slotDefinitions || []),
        ...(nodeData.dynamicSlots || [])
    ];
    const hasSlots = allSlots.length > 0;

    return (
        <>
            <BaseNode
                {...props}
                nodeLabel={nodeData.name}
                color={stringToColor(nodeData.name)}
                toolbar={{actions: toolbarActions}}
                onDelete={handleDelete}
                isDirty={isDirty}
                isSaving={isSaving}
            >
                <div style={{width: '100%'}}>
                    {/* Fields section */}
                    {hasFields && (
                        <>
                            {nodeData.fieldDefinitions.map((field, index) => (
                                <div key={field.name}>
                                    <FieldEditor
                                        field={field}
                                        isSelected={selected}
                                        value={fieldValues[field.name]}
                                        onChange={(value) => handleFieldChange(field.name, value)}
                                        nodeKind={nodeData.resource.kind}
                                    />
                                    {index < nodeData.fieldDefinitions.length - 1 && (
                                        <Divider style={{
                                            margin: '8px 0',
                                            borderColor: '#303030',
                                        }} />
                                    )}
                                </div>
                            ))}
                        </>
                    )}

                    {/* Darker separator between fields and slots */}
                    {hasFields && hasSlots && (
                        <Divider style={{
                            margin: '12px 0',
                            borderColor: '#1a1a1a',
                            borderWidth: 2,
                        }} />
                    )}

                    {/* Slots section */}
                    {hasSlots && (
                        <>
                            {allSlots.map((slot, index) => (
                                <div key={slot.name}>
                                    <SlotItem slot={slot} nodeId={id} />
                                    {index < allSlots.length - 1 && (
                                        <Divider style={{
                                            margin: '4px 0',
                                            borderColor: '#262626',
                                        }} />
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </BaseNode>
        </>
    )
}
