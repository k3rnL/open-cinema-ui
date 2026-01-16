import {useRef, useEffect} from "react";
import {Switch} from 'antd';
import {FieldDefinition} from "@/types/node.ts";
import {FieldInput} from "./FieldInput.tsx";

interface EditableFieldProps {
    field: FieldDefinition;
    isSelected: boolean;
    value: any;
    onChange: (value: any) => void;
    nodeKind?: string;
}

export function EditableField({field, isSelected, value, onChange, nodeKind}: EditableFieldProps) {
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
        if (field.is_relation) return value ? `ID: ${value}` : 'Not set';
        if (field.type === 'JSONField') return '{ ... }';
        return value || 'Not set';
    };

    const displayValue = getDisplayValue();
    const isRelation = field.is_relation;

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
                pointerEvents: isSelected ? 'none' : 'auto',
            }}>
                {displayValue}
            </span>

            {/* Editor appears on top without moving anything */}
            {isSelected && (
                <span style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    zIndex: 10,
                    pointerEvents: 'auto',
                }}>
                    <FieldInput
                        field={field}
                        value={value}
                        onChange={onChange}
                        inputRef={inputRef}
                        nodeKind={nodeKind}
                    />
                </span>
            )}
        </span>
    );
}
