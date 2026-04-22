import React, { useEffect, useMemo, useRef } from 'react';

type Props = {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    loading?: boolean;
    storageFocusedKey?: string; // localStorage flag to restore focus after unmount/remount
    inputClassName?: string;
};

/**
 * Search input designed to keep keyboard focus while the parent triggers data refetches.
 * It relies on a localStorage "focus flag" to restore focus after unmount (e.g. when the page shows a spinner).
 */
export default function SearchInputWithFocus({
    value,
    onChange,
    placeholder,
    loading,
    storageFocusedKey,
    inputClassName,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Tracks whether the user is currently typing into this input.
    // Used to decide if we should keep the "focused" flag on blur.
    const shouldMaintainFocusRef = useRef<boolean>(false);

    const focusFlagKey = useMemo(() => storageFocusedKey || '', [storageFocusedKey]);

    const focusToEnd = () => {
        const el = inputRef.current;
        if (!el) return;

        try {
            el.focus();
            const end = value?.length ?? 0;
            el.setSelectionRange(end, end);
        } catch {
            // Ignore focus failures (e.g. element not in DOM yet).
        }
    };

    useEffect(() => {
        if (!focusFlagKey) return;

        const wasFocused = window.localStorage.getItem(focusFlagKey) === 'true';
        if (!wasFocused) return;

        focusToEnd();
        window.localStorage.removeItem(focusFlagKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusFlagKey]);

    useEffect(() => {
        if (!focusFlagKey) return;
        if (loading) return;

        if (shouldMaintainFocusRef.current) {
            // Only refocus if we lost focus during the refetch.
            // This avoids expensive focus/selection churn while the user is typing.
            if (document.activeElement !== inputRef.current) {
                focusToEnd();
            }
            shouldMaintainFocusRef.current = false;
        }
    }, [loading, focusFlagKey]);

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

