import {Input, InputNumber, Select} from 'antd';
import {FieldDefinition} from "@/types/node.ts";
import {RefObject, useEffect, useState} from "react";
import {useApiUrl} from "@refinedev/core";

interface FieldInputProps {
    field: FieldDefinition;
    value: any;
    onChange: (value: any) => void;
    inputRef: RefObject<any>;
    nodeKind?: string;
}

interface RelationSelectProps {
    field: FieldDefinition;
    value: any;
    onChange: (value: any) => void;
    inputRef: RefObject<any>;
    nodeKind: string;
}

function RelationSelect({field, value, onChange, inputRef, nodeKind}: RelationSelectProps) {
    const apiUrl = useApiUrl();
    const [options, setOptions] = useState<{label: string; value: number}[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchOptions = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${apiUrl}/pipelines/schematics/${nodeKind}/${field.name}`);
                const data = await response.json();

                // Convert data to options - prefer 'name' field, fallback to 'id'
                const opts = data.map((item: any) => ({
                    label: item.name || `ID: ${item.id}`,
                    value: item.id,
                }));
                setOptions(opts);
            } catch (error) {
                console.error('Failed to fetch relation options:', error);
                setOptions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchOptions();
    }, [apiUrl, nodeKind, field.name]);

    return (
        <div className="nodrag nopan" style={{width: '100%'}}>
            <Select
                ref={inputRef}
                size="small"
                style={{width: '100%'}}
                value={value}
                onChange={onChange}
                options={options}
                placeholder={loading ? "Loading..." : "Select..."}
                loading={loading}
                allowClear={field.nullable}
            />
        </div>
    );
}

export function FieldInput({field, value, onChange, inputRef, nodeKind}: FieldInputProps) {
    // Choice fields (Select dropdown)
    if (field.choices && field.choices.length > 0) {
        return (
            <div className="nodrag nopan" style={{width: '100%'}}>
                <Select
                    ref={inputRef}
                    size="small"
                    style={{width: '100%'}}
                    value={value}
                    onChange={onChange}
                    options={field.choices}
                    placeholder="Select..."
                />
            </div>
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

    // Relation types - fetch options from API
    if (field.is_relation && nodeKind) {
        return <RelationSelect field={field} value={value} onChange={onChange} inputRef={inputRef} nodeKind={nodeKind} />;
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
