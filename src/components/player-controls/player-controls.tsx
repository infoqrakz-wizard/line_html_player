import React, { useState, useRef } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ru } from 'date-fns/locale/ru';

import { Mode } from '@/utils/types';

import { Icons } from '../icons';
// import { SpeedSelector } from '../speed-selector';

import '@/styles/datepicker-custom.scss';
import styles from './player-controls.module.scss';
import { SpeedSelector } from '../speed-selector';

registerLocale('ru', ru);

interface PlayerControlsProps {
    mode: Mode;
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    playbackSpeed: number;
    onPlayPause: () => void;
    onMuteToggle: () => void;
    onSpeedChange: (speed: number) => void;
    onCenterTimeline: () => void;
    onSaveStream?: () => void;
    onChangeStartDate?: (date: Date) => void;
    onToggleFullscreen?: () => void;
    disableSpeedChange?: boolean;
    disableCenterTimeline?: boolean;
    onChangeMode?: (mode: Mode) => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
    mode,
    isPlaying,
    isMuted,
    isFullscreen,
    playbackSpeed,
    onPlayPause,
    onMuteToggle,
    onSpeedChange,
    onCenterTimeline,
    onChangeStartDate,
    onSaveStream,
    onToggleFullscreen,
    onChangeMode,
    disableSpeedChange = false,
    disableCenterTimeline = false
}) => {
    const [startDate, setStartDate] = useState(new Date());
    const datePickerRef = useRef<any>(null);
    const onChangeDatepickerDate = (date: Date | null) => {
        if (!date) return;
        setStartDate(date);
        if (onChangeStartDate) onChangeStartDate(date);
        datePickerRef.current?.setOpen(false);
    };

    return (
        <div className={styles.controls}>
            <div className={styles.leftControls}>
                <button
                    className={styles.controlButton}
                    onClick={onPlayPause}
                >
                    {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                </button>
                <button
                    className={styles.controlButton}
                    onClick={onMuteToggle}
                >
                    {isMuted ? <Icons.Mute /> : <Icons.Unmute />}
                </button>
                {mode === Mode.Record && (
                    <button
                        className={styles.recordButton}
                        onClick={() => onChangeMode?.(Mode.Live)}
                    >
                        <span className={styles.liveButton}>live</span>
                    </button>
                )}
            </div>

            <div className={styles.rightControls}>
                <DatePicker
                    ref={datePickerRef}
                    selected={startDate}
                    customInput={
                        <button className={styles.controlButton}>
                            <Icons.Datepicker />
                        </button>
                    }
                    locale={ru}
                    showTimeSelect
                    timeIntervals={10}
                    timeFormat="HH:mm"
                    showTimeCaption={false}
                    shouldCloseOnSelect={true}
                    onChange={date => onChangeDatepickerDate(date)}
                />
                <button
                    className={styles.controlButton}
                    onClick={onSaveStream}
                >
                    <Icons.Export />
                </button>
                <SpeedSelector
                    playbackSpeed={playbackSpeed}
                    onSpeedChange={onSpeedChange}
                    disabled={disableSpeedChange}
                    isFullscreen={isFullscreen}
                />
                <button
                    className={styles.controlButton}
                    onClick={onToggleFullscreen}
                >
                    {isFullscreen ? <Icons.FullscreenExit /> : <Icons.Fullscreen />}
                </button>
            </div>
        </div>
    );
};
