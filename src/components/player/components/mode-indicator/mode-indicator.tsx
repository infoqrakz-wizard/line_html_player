import React from 'react';
import styles from './mode-indicator.module.scss';

interface ModeIndicatorProps {
    mode: 'live' | 'record';
    isPlaying: boolean;
}

export const ModeIndicator: React.FC<ModeIndicatorProps> = ({ mode, isPlaying }) => {
    const label = mode === 'live' ? 'LIVE' : 'PLAYBACK';
    const statusClassName = `${styles.statusDot} ${
        isPlaying ? (mode === 'live' ? styles.blinkGreen : styles.blinkRed) : styles.paused
    }`;

    return (
        <div className={styles.modeIndicator}>
            <span className={styles.label}>{label}</span>
            <span className={statusClassName}></span>
        </div>
    );
};
