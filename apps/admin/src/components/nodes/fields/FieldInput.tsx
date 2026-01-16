import {Input, InputNumber, Select} from 'antd';
import {FieldDefinition} from "@/types/node.ts";
import {RefObject} from "react";

interface FieldInputProps {
    field: FieldDefinition;
    value: any;
    onChange: (value: any) => void;
    inputRef: RefObject<any>;
}

export function FieldInput({field, value, onChange, inputRef}: FieldInputProps) {
    // Choice fields (Select dropdown)
    if (field.choices && field.choices.length > 0) {
        return (
            <Select
                ref={inputRef}
                size="small"
                style={{width: '100%', position: 'relative', zIndex: 1}}
                value={value}
                onChange={onChange}
                options={field.choices}
                placeholder="Select..."
                dropdownStyle={{zIndex: 9999}}
                getPopupContainer={() => document.body}
            />
        );
    }

    // Integer types
    if (field.type.includes('Integer') || field.type.includes('BigAuto') || field.type === 'IntegerField') {
        return (
            <InputNumber
                ref={inputRef}
                size="small"
                style={{width: '100%'}}
                value={value}
                onChange={onChange}
                placeholder="Enter number..."
                controls={false}
            />
        );
    }

    // Float/Decimal types
    if (field.type.includes('Float') || field.type.includes('Decimal')) {
        return (
            <InputNumber
                ref={inputRef}
                size="small"
                style={{width: '100%'}}
                value={value}
                onChange={onChange}
                step={0.1}
                placeholder="Enter number..."
                controls={false}
            />
        );
    }

    // DateTime types (read-only)
    if (field.type.includes('DateTime') || field.type.includes('Date')) {
        return <span style={{color: '#d9d9d9', fontSize: 13}}>{value || 'Auto'}</span>;
    }

    // Relation types (read-only)
    if (field.type.includes('ForeignKey') || field.type.includes('OneToOne') || field.type.includes('ManyToOne')) {
        return <span style={{color: '#8c8c8c', fontSize: 13, fontStyle: 'italic'}}>Relation</span>;
    }

    // JSON Field
    if (field.type === 'JSONField') {
        return (
            <Input.TextArea
                ref={inputRef}
                size="small"
                style={{width: '100%', fontFamily: 'monospace', fontSize: 12}}
                value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                onChange={(e) => {
                    try {
                        onChange(JSON.parse(e.target.value));
                    } catch {
                        onChange(e.target.value);
                    }
                }}
                rows={3}
                placeholder="Enter JSON..."
            />
        );
    }

    // String types (CharField, TextField, etc.) - default
    return (
        <Input
            ref={inputRef}
            size="small"
            style={{width: '100%'}}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text..."
        />
    );
}
