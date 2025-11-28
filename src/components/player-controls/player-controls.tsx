import React, {useMemo, useRef, useState, useEffect, useCallback} from 'react';
import {shift, flip} from '@floating-ui/dom';
import DatePicker, {registerLocale} from 'react-datepicker';
import type ReactDatePicker from 'react-datepicker';
import {ru} from 'date-fns/locale/ru';
import {addMonths, format, startOfDay, startOfMonth} from 'date-fns';

import {Mode, Protocol} from '../../utils/types';
import {getFramesTimeline} from '../../utils/api';
import {useTimelineAuth} from '../../context/timeline-auth-context';

import {Icons} from '../icons';
import {MotionFilterOption} from '../../types/motion-filter';

import styles from './player-controls.module.scss';
import {SpeedSelector} from '../speed-selector';
import {useOrientation} from '../timeline/hooks/use-orientation';

import '../../styles/datepicker-custom.scss';

registerLocale('ru', ru);

interface PlayerControlsProps {
    mode: Mode;
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    isNoSound: boolean;
    isDownloadAccess: boolean;
    playbackSpeed: number;
    // for fetching month availability
    url?: string;
    port?: number;
    credentials?: string;
    camera?: number;
    protocol?: Protocol;
    proxy?: string;
    popperBoundaryElement?: HTMLElement | null;
    popperPortalId?: string;
    onPlayPause: () => void;
    onMuteToggle: () => void;
    onSpeedChange: (speed: number) => void;
    onCenterTimeline?: () => void;
    onSaveStream?: () => void;
    onChangeStartDate?: (date: Date) => void;
    onToggleFullscreen?: () => void;
    disableSpeedChange?: boolean;
    disableCenterTimeline?: boolean;
    onChangeMode?: (mode: Mode) => void;
    isFilterPanelOpen?: boolean;
    activeFilterType?: MotionFilterOption | null;
    onToggleFilterPanel?: () => void;
    onSelectFilterOption?: (option: MotionFilterOption) => void;
    onClearFilter?: () => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
    mode,
    isPlaying,
    isMuted,
    isFullscreen,
    isNoSound,
    isDownloadAccess,
    playbackSpeed,
    url,
    port,
    credentials,
    camera,
    protocol,
    proxy,
    popperBoundaryElement,
    popperPortalId,
    onPlayPause,
    onMuteToggle,
    onSpeedChange,
    onChangeStartDate,
    onSaveStream,
    onToggleFullscreen,
    onChangeMode,
    disableSpeedChange = false,
    isFilterPanelOpen = false,
    activeFilterType = null,
    onToggleFilterPanel,
    onSelectFilterOption,
    onClearFilter
}) => {
    const {hasTimelineAccess, setTimelineAccess} = useTimelineAuth();
    const [startDate, setStartDate] = useState(new Date());
    const datePickerRef = useRef<ReactDatePicker | null>(null);
    const rightControlsRef = useRef<HTMLDivElement>(null);
    const [arrowOffset, setArrowOffset] = useState<number>(0);

    const [highlightedDates, setHighlightedDates] = useState<Date[]>([]);
    const loadedMonths = useRef<Set<string>>(new Set());

    const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
    const monthKey = (d: Date) => format(d, 'yyyy-MM');

    const {isMobile, orientation} = useOrientation();
    const isMobileLandscape = isMobile && orientation === 'landscape';

    const allowedDayKeys = useMemo(() => new Set(highlightedDates.map(dayKey)), [highlightedDates]);
    const onChangeDatepickerDate = (date: Date | null) => {
        if (!date) return;
        setStartDate(date);
        if (onChangeStartDate) onChangeStartDate(date);
        datePickerRef.current?.setOpen(false);
    };

    const fetchMonthAvailability = async (viewDate: Date) => {
        if (!url || !port || !credentials || !hasTimelineAccess) return;

        const currentMonthKey = monthKey(viewDate);
        const previousMonthKey = monthKey(addMonths(viewDate, -1));

        if (loadedMonths.current.has(currentMonthKey) && loadedMonths.current.has(previousMonthKey)) return;

        const monthsToLoad: Array<{key: string; start: Date; end: Date}> = [];

        if (!loadedMonths.current.has(currentMonthKey)) {
            monthsToLoad.push({
                key: currentMonthKey,
                start: startOfMonth(viewDate),
                end: startOfMonth(addMonths(viewDate, 1))
            });
        }

        if (!loadedMonths.current.has(previousMonthKey)) {
            monthsToLoad.push({
                key: previousMonthKey,
                start: startOfMonth(addMonths(viewDate, -1)),
                end: startOfMonth(viewDate)
            });
        }

        for (const month of monthsToLoad) {
            try {
                const result = await getFramesTimeline({
                    url,
                    port,
                    credentials,
                    startTime: startOfDay(month.start),
                    endTime: startOfDay(month.end),
                    unitLength: 86400,
                    channel: camera,
                    protocol,
                    proxy
                });

                const days: Date[] = [];
                const totalDays = result.timeline.length;
                for (let i = 0; i < totalDays; i += 1) {
                    if (result.timeline[i] > 0) {
                        const d = new Date(month.start);
                        d.setDate(month.start.getDate() + i);
                        days.push(d);
                    }
                }

                setHighlightedDates(prev => {
                    const map = new Map<string, Date>();
                    for (const d of prev) map.set(dayKey(d), d);
                    for (const d of days) map.set(dayKey(d), d);
                    return Array.from(map.values()).sort((a, b) => a.getTime() - b.getTime());
                });

                loadedMonths.current.add(month.key);
            } catch (e) {
                if (e instanceof Error && e.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                    return;
                }
            }
        }
    };

    const handleCalendarOpen = () => {
        void fetchMonthAvailability(startDate);
    };

    const handleMonthChange = (date: Date) => {
        void fetchMonthAvailability(date);
    };

    const calculateArrowPosition = useCallback(() => {
        // ref и id для customInput почему-то не передаются. ищем кнопку по классу
        const datePickerButton = document.querySelector('.datepicker-button');

        if (!datePickerButton || !rightControlsRef.current) return;

        const buttonRect = datePickerButton.getBoundingClientRect();
        const containerRect = rightControlsRef.current.getBoundingClientRect();

        // Вычисляем позицию кнопки календаря относительно правого края контейнера
        const offsetFromRight = containerRect.right - (buttonRect.left + buttonRect.width * 0.75);
        setArrowOffset(offsetFromRight);
    }, []);

    useEffect(() => {
        calculateArrowPosition();

        // Пересчитываем при изменении размера окна
        const handleResize = () => calculateArrowPosition();
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, [calculateArrowPosition, hasTimelineAccess, isDownloadAccess, mode]);

    // Обновляем стили стрелки через CSS переменную
    useEffect(() => {
        if (arrowOffset > 0) {
            document.documentElement.style.setProperty('--datepicker-arrow-offset', `${arrowOffset}px`);
        }
    }, [arrowOffset]);

    const datepickerPopperModifiers = useMemo(() => {
        const boundary = popperBoundaryElement ?? 'clippingAncestors';
        return [
            shift({boundary, crossAxis: true}),
            flip({boundary, fallbackPlacements: ['top', 'bottom', 'right', 'left']})
        ];
    }, [popperBoundaryElement]);

    const filterOptions: Array<{type: MotionFilterOption; label: string; icon: React.ReactNode}> = useMemo(
        () => [
            {type: 'motion', label: 'Движение', icon: <Icons.Arrow />},
            {type: 'transport', label: 'Машины', icon: <Icons.Car />},
            {type: 'human', label: 'Люди', icon: <Icons.Cursor />}
        ],
        []
    );

    const handleFilterToggle = () => {
        onToggleFilterPanel?.();
    };

    const handleFilterSelect = (option: MotionFilterOption) => {
        onSelectFilterOption?.(option);
    };

    return (
        <div className={`${styles.controls} ${isMobileLandscape ? styles.mobileLandscape : ''}`}>
            <div className={styles.leftControls}>
                <button
                    className={styles.controlButton}
                    onClick={onPlayPause}
                >
                    {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                </button>
                {!isNoSound && (
                    <button
                        className={styles.controlButton}
                        onClick={onMuteToggle}
                    >
                        {isMuted ? <Icons.Mute /> : <Icons.Unmute />}
                    </button>
                )}
                {mode === Mode.Record && (
                    <button
                        className={styles.recordButton}
                        onClick={() => onChangeMode?.(Mode.Live)}
                    >
                        <span className={styles.liveButton}>live</span>
                    </button>
                )}
            </div>

            <div
                className={styles.rightControls}
                ref={rightControlsRef}
            >
                {hasTimelineAccess && (
                    <div className={styles.filterControls}>
                        <button
                            className={`${styles.controlButton} ${activeFilterType ? styles.filterActive : ''}`}
                            onClick={handleFilterToggle}
                            aria-label="Фильтр движений"
                            aria-expanded={isFilterPanelOpen}
                            aria-pressed={activeFilterType !== null}
                        >
                            <Icons.Filter />
                        </button>
                        {isFilterPanelOpen && (
                            <div
                                className={styles.filterPanel}
                                role="menu"
                            >
                                {filterOptions.map(option => (
                                    <button
                                        key={option.type}
                                        className={`${styles.filterOption} ${
                                            activeFilterType === option.type ? styles.filterOptionActive : ''
                                        }`}
                                        onClick={() => handleFilterSelect(option.type)}
                                        aria-pressed={activeFilterType === option.type}
                                    >
                                        <span className={styles.filterIcon}>{option.icon}</span>
                                        <span>{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {hasTimelineAccess && (
                    <DatePicker
                        ref={datePickerRef}
                        selected={startDate}
                        customInput={
                            <button className={`${styles.controlButton} datepicker-button`}>
                                <Icons.Datepicker />
                            </button>
                        }
                        locale={ru}
                        showTimeSelect
                        timeIntervals={10}
                        timeFormat="HH:mm"
                        showTimeCaption={false}
                        shouldCloseOnSelect={true}
                        popperPlacement="top"
                        portalId={popperPortalId}
                        popperModifiers={datepickerPopperModifiers}
                        calendarClassName="custom-datepicker"
                        highlightDates={highlightedDates.length ? [{'highlighted-date': highlightedDates}] : undefined}
                        filterDate={date => allowedDayKeys.size === 0 || allowedDayKeys.has(dayKey(date))}
                        onChange={date => onChangeDatepickerDate(date)}
                        onCalendarOpen={handleCalendarOpen}
                        onMonthChange={handleMonthChange}
                    />
                )}
                {isDownloadAccess && (
                    <button
                        className={styles.controlButton}
                        onClick={onSaveStream}
                    >
                        <Icons.Export />
                    </button>
                )}
                {mode === Mode.Record && (
                    <SpeedSelector
                        playbackSpeed={playbackSpeed}
                        onSpeedChange={onSpeedChange}
                        disabled={disableSpeedChange}
                        isFullscreen={isFullscreen}
                        isMobileLandscape={isMobileLandscape}
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
