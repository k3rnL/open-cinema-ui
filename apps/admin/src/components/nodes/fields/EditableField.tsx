import {useRef, useEffect} from "react";
import {Switch} from 'antd';
import {PipelineSchematicsField} from "@/pages/pipelines/edit.tsx";
import {FieldInput} from "./FieldInput.tsx";

interface EditableFieldProps {
    field: PipelineSchematicsField;
    isSelected: boolean;
    value: any;
    onChange: (value: any) => void;
}

export function EditableField({field, isSelected, value, onChange}: EditableFieldProps) {
    const inputRef = useRef<any>(null);

    useEffect(() => {
        if (isSelected && inputRef.current) {
            requestAnimationFrame(() => {
                if (inputRef.current?.focus) {
                    inputRef.current.focus();
                } else if (inputRef.current?.input?.focus) {
                    inputRef.current.input.focus();
                }
            });
        }
    }, [isSelected]);

    // Boolean types - always visible switch
    if (field.type === 'BooleanField') {
        return (
            <Switch
                size="small"
                checked={value}
                onChange={onChange}
                disabled={!isSelected}
            />
        );
    }

    const getDisplayValue = () => {
        if (field.choices && field.choices.length > 0) return value || 'Not set';
        if (field.type.includes('Integer') || field.type.includes('BigAuto') || field.type === 'IntegerField') return value ?? 'Not set';
        if (field.type.includes('Float') || field.type.includes('Decimal')) return value ?? 'Not set';
        if (field.type.includes('DateTime') || field.type.includes('Date')) return value || 'Auto';
        if (field.type.includes('ForeignKey') || field.type.includes('OneToOne') || field.type.includes('ManyToOne')) return 'Relation';
        if (field.type === 'JSONField') return '{ ... }';
        return value || 'Not set';
    };

    const displayValue = getDisplayValue();
    const isRelation = field.type.includes('ForeignKey') || field.type.includes('OneToOne') || field.type.includes('ManyToOne');

    return (
        <span style={{
            position: 'relative',
            display: 'inline-block',
            width: '100%',
        }}>
            {/* Invisible placeholder that maintains layout */}
            <span style={{
                visibility: isSelected ? 'hidden' : 'visible',
                color: isRelation ? '#8c8c8c' : '#d9d9d9',
                fontSize: 13,
                fontStyle: isRelation ? 'italic' : 'normal',
            }}>
                {displayValue}
            </span>

            {/* Editor appears on top without moving anything */}
            {isSelected && (
                <span style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                }}>
                    <FieldInput
                        field={field}
                        value={value}
                        onChange={onChange}
                        inputRef={inputRef}
                    />
                </span>
            )}
        </span>
    );
}
