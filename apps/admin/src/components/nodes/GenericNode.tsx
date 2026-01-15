import {Divider} from 'antd'
import BaseNode, {BaseNodeProps} from "@/components/nodes/BaseNode.tsx";
import {PipelineSchematic} from "@/pages/pipelines/edit.tsx";
import {useState} from "react";
import {FieldEditor} from "@/components/nodes/fields/FieldEditor.tsx";
import {NodeToolbarAction} from "@/components/nodes/NodeToolbarActions.tsx";

interface GenericNodeProps extends BaseNodeProps<PipelineSchematic> {

}

function stringToColor(str: string): string {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash) % 360;

    return `hsl(${hue}, 45%, 55%)`;
}

export default function GenericNode(props: GenericNodeProps) {
    const {
        data: schematic,
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

    const toolbarActions: NodeToolbarAction[] = [
        {label: 'Clear', onClick: () => setFieldValues({})},
        {label: 'Save', onClick: () => setFieldValues({})},
    ]

    return (
        <>
            <BaseNode {...props} nodeLabel={schematic.name} color={stringToColor(schematic.name)} toolbar={{actions: toolbarActions}}>
                <div style={{width: '100%'}}>
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
                </div>
            </BaseNode>
        </>
    )
}
