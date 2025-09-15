import React, {useState, useRef, useEffect} from 'react';
import {createPortal} from 'react-dom';
import {Icons} from '../icons';
import styles from './speed-selector.module.scss';

interface SpeedSelectorProps {
    playbackSpeed: number;
    onSpeedChange: (speed: number) => void;
    disabled?: boolean;
    isFullscreen?: boolean;
    isMobileLandscape?: boolean;
}

const speedOptions = [
    {value: 1, label: 'Обычная', controlLabel: '1x'},
    {value: 1.25, label: '1.25x'},
    {value: 1.5, label: '1.5x'},
    {value: 1.75, label: '1.75x'},
    {value: 2, label: '2x'},
    {value: 4, label: '4x'}
];

export const SpeedSelector: React.FC<SpeedSelectorProps> = ({
    playbackSpeed,
    onSpeedChange,
    disabled = false,
    isFullscreen = false,
    isMobileLandscape = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({top: 0, left: 0, width: 0});

    const handleToggle = () => {
        if (!disabled) {
            if (!isOpen && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();

                if (isMobileLandscape) {
                    setDropdownPosition({
                        top: rect.top - 230,
                        left: rect.left,
                        width: rect.width
                    });
                } else {
                    setDropdownPosition({
                        top: rect.top - 253,
                        left: rect.right - 165,
                        width: rect.width
                    });
                }
            }
            setIsOpen(!isOpen);
        }
    };

    const handleSpeedSelect = (speed: number) => {
        onSpeedChange(speed);
        setIsOpen(false);
    };

    const handleBackClick = () => {
        setIsOpen(false);
    };

    const handleOutsideClick = (event: MouseEvent) => {
        if (
            containerRef.current &&
            !containerRef.current.contains(event.target as Node) &&
            !dropdownRef.current?.contains(event.target as Node)
        ) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
        }
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isOpen]);

    const getCurrentSpeedLabel = () => {
        const option = speedOptions.find(opt => opt.value === playbackSpeed);
        let label;

        if (option?.controlLabel) {
            label = option.controlLabel;
        } else if (option?.label) {
            label = option.label;
        } else {
            label = `${playbackSpeed}x`;
        }

        return label;
    };

    const getCurrentSpeedValue = () => {
        return speedOptions.find(opt => opt.value === playbackSpeed)?.value || playbackSpeed;
    };

    return (
        <div style={{position: 'relative'}}>
            <div
                className={styles.container}
                ref={containerRef}
            >
                <button
                    className={`${styles.trigger} ${isMobileLandscape ? styles.mobileLandscapeTrigger : ''} ${disabled ? styles.disabled : ''}`}
                    onClick={handleToggle}
                    disabled={disabled}
                    aria-label="Выбрать скорость воспроизведения"
                >
                    {getCurrentSpeedLabel()}
                </button>
            </div>

            {isOpen &&
                (isFullscreen ? (
                    // В полноэкранном режиме отображаем без портала
                    <div
                        className={`${styles.dropdown} ${styles.fullscreenDropdown} ${isMobileLandscape ? styles.mobileLandscapeDropdown : ''}`}
                        ref={dropdownRef}
                    >
                        <div className={styles.header}>
                            <button
                                className={styles.backButton}
                                onClick={handleBackClick}
                                aria-label="Назад"
                            >
                                <Icons.ArrowBack />
                            </button>
                            <span className={styles.title}>Скорость</span>
                        </div>

                        <div className={styles.divider} />

                        <div className={styles.options}>
                            {speedOptions.map(option => (
                                <button
                                    key={option.value}
                                    className={`${styles.option} ${getCurrentSpeedValue() === option.value ? styles.selected : ''}`}
                                    onClick={() => handleSpeedSelect(option.value)}
                                    aria-label={`Скорость ${option.label}`}
                                >
                                    {getCurrentSpeedValue() === option.value && <Icons.Check />}
                                    <span className={styles.optionLabel}>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    // В обычном режиме используем портал
                    createPortal(
                        <div
                            className={`${styles.dropdown} ${styles.portalDropdown} ${isMobileLandscape ? styles.mobileLandscapePortalDropdown : ''}`}
                            ref={dropdownRef}
                            style={{
                                top: `${dropdownPosition.top}px`,
                                left: `${dropdownPosition.left}px`,
                            }}
                        >
                            <div className={styles.header}>
                                <button
                                    className={styles.backButton}
                                    onClick={handleBackClick}
                                    aria-label="Назад"
                                >
                                    <Icons.ArrowBack />
                                </button>
                                <span className={styles.title}>Скорость</span>
                            </div>

                            <div className={styles.divider} />

                            <div className={styles.options}>
                                {speedOptions.map(option => (
                                    <button
                                        key={option.value}
                                        className={`${styles.option} ${getCurrentSpeedValue() === option.value ? styles.selected : ''}`}
                                        onClick={() => handleSpeedSelect(option.value)}
                                        aria-label={`Скорость ${option.label}`}
                                    >
                                        {getCurrentSpeedValue() === option.value && <Icons.Check />}
                                        <span className={styles.optionLabel}>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>,
                        document.body
                    )
                ))}
        </div>
    );
};
