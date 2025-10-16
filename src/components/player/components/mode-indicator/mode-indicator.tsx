import React from 'react';
import styles from './mode-indicator.module.scss';
import type {PlaybackStatus} from '../player-interface';

interface ModeIndicatorProps {
    mode: 'live' | 'record';
    playbackStatus: PlaybackStatus;
}

export const ModeIndicator: React.FC<ModeIndicatorProps> = ({mode, playbackStatus}) => {
    const label = mode === 'live' ? 'LIVE' : 'PLAYBACK';

    const isActuallyPlaying = playbackStatus === 'playing';

    const statusClassName = `${styles.statusDot} ${
        isActuallyPlaying ? (mode === 'live' ? styles.blinkGreen : styles.blinkRed) : styles.paused
    }`;

    return (
        <div className={styles.modeIndicator}>
            <span className={styles.label}>{label}</span>
            <span className={statusClassName}></span>
        </div>
    );
};
