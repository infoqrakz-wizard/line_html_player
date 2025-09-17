import React from 'react';
import styles from './h265-error.module.scss';

export const H265Error: React.FC = () => {
    return (
        <div className={styles.h265Error}>
            <div className={styles.errorIcon}>⚠️</div>
            <div className={styles.errorTitle}>Неподдерживаемый кодек</div>
            <div className={styles.errorMessage}>Ваш браузер не поддерживает кодек H.265 (HEVC).</div>
        </div>
    );
};
