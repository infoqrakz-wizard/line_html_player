/* eslint-disable jsx-a11y/interactive-supports-focus */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, {useState, useRef, useEffect, useCallback} from 'react';
import classes from './select.module.scss';

export type SelectOption<T = string> = {
    value: T;
    label: string;
    disabled?: boolean;
};

export type SelectProps<T = string> = {
    options: SelectOption<T>[];
    value?: T;
    onChange: (value: T) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    'aria-label'?: string;
    width?: string | number;
};

const Select = <T extends string | number>({
    options,
    value,
    onChange,
    placeholder = '',
    disabled = false,
    className = '',
    'aria-label': ariaLabel = '',
    width = 'auto'
}: SelectProps<T>) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const selectedOption = options.find(option => option.value === value);

    const handleToggle = useCallback(() => {
        if (!disabled) {
            setIsOpen(prev => !prev);
            setHighlightedIndex(-1);
        }
    }, [disabled]);

    const handleOptionSelect = useCallback(
        (option: SelectOption<T>) => {
            if (option.disabled) return;

            onChange(option.value);
            setIsOpen(false);
            setHighlightedIndex(-1);
        },
        [onChange]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;

            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (isOpen && highlightedIndex >= 0) {
                        const option = options[highlightedIndex];
                        if (option && !option.disabled) {
                            handleOptionSelect(option);
                        }
                    } else {
                        handleToggle();
                    }
                    break;
                case 'Escape':
                    setIsOpen(false);
                    setHighlightedIndex(-1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (!isOpen) {
                        setIsOpen(true);
                        setHighlightedIndex(0);
                    } else {
                        setHighlightedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!isOpen) {
                        setIsOpen(true);
                        setHighlightedIndex(options.length - 1);
                    } else {
                        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
                    }
                    break;
                case 'Tab':
                    setIsOpen(false);
                    setHighlightedIndex(-1);
                    break;
            }
        },
        [disabled, isOpen, highlightedIndex, options, handleOptionSelect, handleToggle]
    );

    const handleOutsideClick = useCallback((event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            setIsOpen(false);
            setHighlightedIndex(-1);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
            return () => document.removeEventListener('mousedown', handleOutsideClick);
        }
    }, [isOpen, handleOutsideClick]);

    const containerClassName = `${classes.container} ${isOpen ? classes.containerOpen : ''} ${className}`.trim();
    const triggerClassName = `${classes.trigger} ${disabled ? classes.disabled : ''}`.trim();
    const dropdownClassName = `${classes.dropdown} ${isOpen ? classes.open : ''}`.trim();

    return (
        <div
            className={containerClassName}
            ref={containerRef}
            style={{width}}
        >
            <button
                ref={triggerRef}
                type="button"
                className={triggerClassName}
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-labelledby={`${ariaLabel}-label`}
            >
                <span className={`${classes.arrow} ${isOpen ? classes.arrowUp : ''}`}>
                    <svg
                        width="10"
                        height="5"
                        viewBox="0 0 10 5"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M4.52599 0.228689L0.754657 4.00002L1.69732 4.94269L4.99732 1.64269L8.29732 4.94269L9.23999 4.00002L5.46866 0.228689C5.34364 0.103708 5.1741 0.0334973 4.99732 0.0334973C4.82055 0.0334973 4.65101 0.103708 4.52599 0.228689Z"
                            fill="white"
                        />
                    </svg>
                </span>
                <span className={classes.value}>{selectedOption ? selectedOption.label : placeholder}</span>
            </button>

            {isOpen && (
                <div
                    className={dropdownClassName}
                    role="listbox"
                >
                    {options.map((option, index) => (
                        <div
                            key={String(option.value)}
                            className={`${classes.option} ${option.value === value ? classes.selected : ''} ${
                                index === highlightedIndex ? classes.highlighted : ''
                            } ${option.disabled ? classes.disabled : ''}`}
                            onClick={() => handleOptionSelect(option)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            role="option"
                            aria-selected={option.value === value}
                            aria-disabled={option.disabled}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Select;
