import React, {useMemo, useRef, useState, useEffect, useCallback} from 'react';
import {shift, flip} from '@floating-ui/dom';
import DatePicker, {registerLocale} from 'react-datepicker';
import type ReactDatePicker from 'react-datepicker';
import {ru} from 'date-fns/locale/ru';
import {addMonths, format, startOfMonth, getDaysInMonth} from 'date-fns';

import {Mode, Protocol} from '../../utils/types';
import {useTimelineAuth} from '../../context/timeline-auth-context';
import {buildRequestUrl} from '../../utils/url-builder';
import {getAuthToken} from '../../utils/getAuthToken';
import {getProtocol} from '../../utils/url-params';

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
    const filterPanelRef = useRef<HTMLDivElement>(null);
    const filterControlsRef = useRef<HTMLDivElement>(null);
    const [arrowOffset, setArrowOffset] = useState<number>(0);
    const [serverVersion, setServerVersion] = useState<number | null>(null);

    const [highlightedDates, setHighlightedDates] = useState<Date[]>([]);
    const loadedMonths = useRef<Set<string>>(new Set());

    const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
    const monthKey = (d: Date) => format(d, 'yyyy-MM');

    const {isMobile, orientation} = useOrientation();
    const isMobileLandscape = isMobile && orientation === 'landscape';

    const allowedDayKeys = useMemo(() => new Set(highlightedDates.map(dayKey)), [highlightedDates]);

    const fetchServerVersion = useCallback(
        async (preferredProtocol: Protocol): Promise<number | null> => {
            if (!url || !port || !credentials) {
                return null;
            }

            const rpcUrl = buildRequestUrl({
                host: url,
                port,
                protocol: preferredProtocol,
                proxy,
                path: proxy
                    ? '/rpc'
                    : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
            });

            const headers: HeadersInit = {};
            if (proxy) {
                headers['Content-Type'] = 'application/json';
                headers['Authorization'] = `Basic ${getAuthToken(credentials)}`;
            }

            try {
                const response = await fetch(rpcUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({method: 'get_version'})
                });

                if (!response.ok) {
                    return null;
                }

                const data = await response.json();
                if (data.result && data.result.version && typeof data.result.version.value === 'number') {
                    return data.result.version.value;
                }
                return null;
            } catch (error) {
                return null;
            }
        },
        [url, port, credentials, proxy]
    );

    const fetchMonthTimeline = async (
        startTime: Date,
        endTime: Date,
        preferredProtocol: Protocol
    ): Promise<{timeline: number[]}> => {
        if (!url || !port || !credentials) {
            throw new Error('Missing required parameters');
        }

        const requestParams = {
            start_time: [
                startTime.getFullYear(),
                startTime.getMonth() + 1,
                startTime.getDate(),
                startTime.getHours(),
                startTime.getMinutes(),
                startTime.getSeconds()
            ],
            end_time: [
                endTime.getFullYear(),
                endTime.getMonth() + 1,
                endTime.getDate(),
                endTime.getHours(),
                endTime.getMinutes(),
                endTime.getSeconds()
            ],
            unit_len: 86400,
            ...(camera !== undefined && {channel: camera})
        };

        const rpcUrl = buildRequestUrl({
            host: url,
            port,
            protocol: preferredProtocol,
            proxy,
            path: proxy ? '/rpc' : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
        });

        const headers: HeadersInit = {};
        if (proxy) {
            headers['Content-Type'] = 'application/json';
            headers['Authorization'] = `Basic ${getAuthToken(credentials)}`;
        }

        return fetch(rpcUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({method: 'archive.get_frames_timeline', params: requestParams, version: 13})
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch timeline data');
                }
                return response.json();
            })
            .then(data => {
                if (data.error && data.error.type === 'auth' && data.error.message === 'forbidden') {
                    throw new Error('FORBIDDEN');
                }
                return data.result;
            })
            .catch(error => {
                if (error instanceof Error && error.message === 'FORBIDDEN') {
                    throw error;
                }
                throw new Error('Failed to fetch timeline data');
            });
    };
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

        const preferredProtocol = protocol ?? getProtocol();

        for (const month of monthsToLoad) {
            try {
                const result = await fetchMonthTimeline(month.start, month.end, preferredProtocol);

                const daysInMonth = getDaysInMonth(month.start);
                const timeline = result.timeline.slice(0, daysInMonth);

                const days: Date[] = [];
                for (let i = 0; i < timeline.length; i += 1) {
                    if (timeline[i] > 0) {
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

    useEffect(() => {
        if (!isFilterPanelOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                filterPanelRef.current &&
                filterControlsRef.current &&
                !filterPanelRef.current.contains(target) &&
                !filterControlsRef.current.contains(target)
            ) {
                onToggleFilterPanel?.();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isFilterPanelOpen, onToggleFilterPanel]);

    useEffect(() => {
        const loadServerVersion = async () => {
            const preferredProtocol = protocol ?? getProtocol();
            const version = await fetchServerVersion(preferredProtocol);
            setServerVersion(version);
        };

        void loadServerVersion();
    }, [protocol, fetchServerVersion]);

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
                {hasTimelineAccess && serverVersion !== null && serverVersion >= 89 && (
                    <div
                        className={styles.filterControls}
                        ref={filterControlsRef}
                    >
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
                                ref={filterPanelRef}
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
                                {activeFilterType !== null && (
                                    <button
                                        className={styles.filterResetButton}
                                        onClick={onClearFilter}
                                        aria-label="Сброс фильтра"
                                    >
                                        Сброс
                                    </button>
                                )}
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
