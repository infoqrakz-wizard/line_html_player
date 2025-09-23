import React from 'react';
import styles from './HamburgerMenu.module.scss';

interface HamburgerMenuProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
    isOpen,
    onToggle
}) => {
    return (
        <button
            className={`${styles.hamburger} ${isOpen ? styles.open : ''}`}
            onClick={onToggle}
            aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={isOpen}
        >
            <span className={styles.line}></span>
            <span className={styles.line}></span>
            <span className={styles.line}></span>
        </button>
    );
};
