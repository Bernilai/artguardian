import React, { useCallback, useEffect, useMemo, useRef } from 'react';

type Props = {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    loading?: boolean;
    storageFocusedKey?: string;
    inputClassName?: string;
};

export default function SearchInputWithFocus({
    value,
    onChange,
    placeholder,
    loading,
    storageFocusedKey,
    inputClassName,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const shouldMaintainFocusRef = useRef<boolean>(false);

    const focusFlagKey = useMemo(() => storageFocusedKey || '', [storageFocusedKey]);

    const focusToEnd = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;

        try {
            el.focus();
            const end = value?.length ?? 0;
            el.setSelectionRange(end, end);
        } catch {
        }
    }, [value]);

    useEffect(() => {
        if (!focusFlagKey) return;

        const wasFocused = window.localStorage.getItem(focusFlagKey) === 'true';
        if (!wasFocused) return;

        focusToEnd();
        window.localStorage.removeItem(focusFlagKey);
    }, [focusFlagKey, focusToEnd]);

    useEffect(() => {
        if (!focusFlagKey) return;
        if (loading) return;

        if (shouldMaintainFocusRef.current) {
            if (document.activeElement !== inputRef.current) {
                focusToEnd();
            }
            shouldMaintainFocusRef.current = false;
        }
    }, [loading, focusFlagKey, focusToEnd]);

    return (
        <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
                shouldMaintainFocusRef.current = document.activeElement === inputRef.current;
                onChange(e.target.value);
            }}
            onFocus={() => {
                if (focusFlagKey) window.localStorage.setItem(focusFlagKey, 'true');
            }}
            onBlur={() => {
                if (!focusFlagKey) return;
                if (!shouldMaintainFocusRef.current) {
                    window.localStorage.removeItem(focusFlagKey);
                }
            }}
            className={inputClassName}
        />
    );
}

