import React, {useMemo, useRef, useState} from 'react';
import DatePicker, {registerLocale} from 'react-datepicker';
import type ReactDatePicker from 'react-datepicker';
import {ru} from 'date-fns/locale/ru';
import {endOfMonth, format, startOfDay, startOfMonth} from 'date-fns';

import {Mode} from '../../utils/types';
import {getFramesTimeline} from '../../utils/api';

import {Icons} from '../icons';

import styles from './player-controls.module.scss';
import {SpeedSelector} from '../speed-selector';

import '../../styles/datepicker-custom.scss';

registerLocale('ru', ru);

interface PlayerControlsProps {
    mode: Mode;
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    playbackSpeed: number;
    // for fetching month availability
    url?: string;
    port?: number;
    credentials?: string;
    camera?: number;
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
    url,
    port,
    credentials,
    camera,
    onPlayPause,
    onMuteToggle,
    onSpeedChange,
    onChangeStartDate,
    onSaveStream,
    onToggleFullscreen,
    onChangeMode,
    disableSpeedChange = false
}) => {
    const [startDate, setStartDate] = useState(new Date());
    const datePickerRef = useRef<ReactDatePicker | null>(null);

    const [highlightedDates, setHighlightedDates] = useState<Date[]>([]);
    const loadedMonths = useRef<Set<string>>(new Set());

    const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
    const monthKey = (d: Date) => format(d, 'yyyy-MM');

    const allowedDayKeys = useMemo(() => new Set(highlightedDates.map(dayKey)), [highlightedDates]);
    const onChangeDatepickerDate = (date: Date | null) => {
        if (!date) return;
        setStartDate(date);
        if (onChangeStartDate) onChangeStartDate(date);
        datePickerRef.current?.setOpen(false);
    };

    const fetchMonthAvailability = async (viewDate: Date) => {
        if (!url || !port || !credentials) return;
        const key = monthKey(viewDate);
        if (loadedMonths.current.has(key)) return;

        const start = startOfMonth(viewDate);
        const end = endOfMonth(viewDate);

        try {
            const result = await getFramesTimeline({
                url,
                port,
                credentials,
                startTime: startOfDay(start),
                endTime: end,
                unitLength: 86400,
                channel: camera
            });

            const days: Date[] = [];
            const totalDays = result.timeline.length;
            for (let i = 0; i < totalDays; i += 1) {
                if (result.timeline[i] > 0) {
                    const d = new Date(start);
                    d.setDate(start.getDate() + i);
                    days.push(d);
                }
            }

            setHighlightedDates(prev => {
                const map = new Map<string, Date>();
                for (const d of prev) map.set(dayKey(d), d);
                for (const d of days) map.set(dayKey(d), d);
                return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime());
            });
            loadedMonths.current.add(key);
        } catch (e) {
            // ignore errors to not break UI
        }
    };

    const handleCalendarOpen = () => {
        void fetchMonthAvailability(startDate);
    };

    const handleMonthChange = (date: Date) => {
        void fetchMonthAvailability(date);
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
                    onCalendarOpen={handleCalendarOpen}
                    onMonthChange={handleMonthChange}
                    highlightDates={highlightedDates.length ? [{'highlighted-date': highlightedDates}] : undefined}
                    filterDate={date => allowedDayKeys.size === 0 || allowedDayKeys.has(dayKey(date))}
                />
                <button
                    className={styles.controlButton}
                    onClick={onSaveStream}
                >
                    <Icons.Export />
                </button>
                {mode !== Mode.Live && (
                    <SpeedSelector
                        playbackSpeed={playbackSpeed}
                        onSpeedChange={onSpeedChange}
                        disabled={disableSpeedChange}
                        isFullscreen={isFullscreen}
                    />
                )}
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
