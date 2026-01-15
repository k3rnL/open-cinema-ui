import {Divider, Typography} from 'antd'
import BaseNode, {BaseNodeProps} from "@/components/nodes/BaseNode.tsx";
import {PipelineSchematic, Slot, SlotDirection} from "@/pages/pipelines/edit.tsx";
import {useState} from "react";
import {FieldEditor} from "@/components/nodes/fields/FieldEditor.tsx";
import {NodeToolbarAction} from "@/components/nodes/NodeToolbarActions.tsx";
import {Handle, Position} from 'reactflow';

const {Text} = Typography;

interface GenericNodeProps extends BaseNodeProps<PipelineSchematic> {
    dynamicSlotsSchematics?: Slot[]
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
        data: schematic,
        dynamicSlotsSchematics,
        selected = false,
        id,
    } = props;

    const [fieldValues, setFieldValues] = useState<Record<string, any>>(schematic.fieldValues || {});

    const handleFieldChange = (fieldName: string, value: any) => {
        const newFieldValues = {
            ...fieldValues,
            [fieldName]: value
        };
        setFieldValues(newFieldValues);

        // Update the node data in React Flow
        if (props.data.onFieldValuesChange) {
            props.data.onFieldValuesChange(id, newFieldValues);
        }
    };

    const slots = [...schematic.slots, ...(dynamicSlotsSchematics || [])]

    const toolbarActions: NodeToolbarAction[] = [
        {label: 'Clear', onClick: () => setFieldValues({})},
        {label: 'Save', onClick: () => setFieldValues({})},
    ]

    const hasFields = schematic.fields && schematic.fields.length > 0;
    const hasSlots = slots && slots.length > 0;

    return (
        <>
            <BaseNode {...props} nodeLabel={schematic.name} color={stringToColor(schematic.name)} toolbar={{actions: toolbarActions}}>
                <div style={{width: '100%'}}>
                    {/* Fields section */}
                    {hasFields && (
                        <>
                            {schematic.fields.map((field, index) => (
                                <div key={field.name}>
                                    <FieldEditor
                                        field={field}
                                        isSelected={selected}
                                        value={fieldValues[field.name]}
                                        onChange={(value) => handleFieldChange(field.name, value)}
                                    />
                                    {index < schematic.fields.length - 1 && (
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
                            {slots.map((slot, index) => (
                                <div key={slot.name}>
                                    <SlotItem slot={slot} nodeId={id} />
                                    {index < slots.length - 1 && (
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
