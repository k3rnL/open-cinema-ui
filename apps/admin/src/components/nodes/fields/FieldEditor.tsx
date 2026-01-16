import {Typography} from 'antd';
import {FieldDefinition} from "@/types/node.ts";
import {EditableField} from "./EditableField.tsx";

const {Text} = Typography;

export interface FieldEditorProps {
    field: FieldDefinition;
    isSelected: boolean;
    value: any;
    onChange: (value: any) => void;
    nodeKind?: string;
}

export function FieldEditor({field, isSelected, value, onChange, nodeKind}: FieldEditorProps) {
    return (
        <div style={{width: '100%'}}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 24,
            }}>
                <Text style={{
                    color: '#8c8c8c',
                    fontSize: 12,
                    fontWeight: 500,
                    minWidth: 'fit-content',
                    flexShrink: 0,
                }}>
                    {field.name}:
                </Text>
                <div style={{
                    flex: 1,
                    minWidth: 0,
                }}>
                    <EditableField
                        field={field}
                        isSelected={isSelected}
                        value={value}
                        onChange={onChange}
                        nodeKind={nodeKind}
                    />
                </div>
            </div>
            {field.help_text && (
                <Text style={{
                    color: '#595959',
                    fontSize: 11,
                    fontStyle: 'italic',
                    display: 'block',
                    marginTop: 4,
                    lineHeight: '1.3',
                }}>
                    {field.help_text}
                </Text>
            )}
        </div>
    );
}
