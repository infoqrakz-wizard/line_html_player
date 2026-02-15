/**
 * Основной компонент временной шкалы
 */
import React, {useRef, useEffect, useCallback, useMemo, useState} from 'react';
import {TimelineCanvas} from './timeline-canvas';
import {TimelineProps, TimelineRef} from './types';
import {useTimelineState} from './hooks/use-timeline-state';
import {useTimelineFragments} from './hooks/use-timeline-fragments';
import {useTimelineInteractions} from './hooks/use-timeline-interactions';
import {useOrientation} from './hooks/use-orientation';
import {Mode} from '../../utils/types';
import {createMotionFilterSignature} from '../../types/motion-filter';

/**
 * Компонент временной шкалы
 */
export const Timeline = React.forwardRef<TimelineRef, TimelineProps>(
    (
        {url, port, credentials, onTimeClick, progress = 0, camera, mode, protocol, proxy, motionFilter, serverVersion},
        ref
    ) => {
        // Создаем ссылки на DOM-элементы
        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

        // Определяем ориентацию и тип устройства
        const {orientation, isMobile} = useOrientation();

        // Определяем, нужно ли показывать вертикальный таймлайн
        const isVerticalTimeline = isMobile && orientation === 'landscape';

        // Состояние для хранения времени начала прямой трансляции
        // Это время устанавливается при первом открытии плеера в режиме Live
        // и не изменяется при переключении режимов
        const [liveStreamStartTime, setLiveStreamStartTime] = useState<Date | null>(null);

        // Используем хук для управления состоянием временной шкалы
        const {
            serverTime,
            isLoading,
            visibleTimeRange,
            setVisibleTimeRange,
            intervalIndex,
            setIntervalIndex,
            centerOnCurrentTime,
            centerOnTime,
            cursorPosition,
            updateCursorPosition,
            updateCursorPositionByTime,
            resetCursorPosition,
            serverTimeError
        } = useTimelineState(progress, url, port, credentials, protocol, proxy);

        // Инициализируем время начала прямой трансляции при первом получении serverTime в режиме Live
        // или при переключении на режим Live, если время еще не установлено
        useEffect(() => {
            if (serverTime && mode === Mode.Live && liveStreamStartTime === null) {
                setLiveStreamStartTime(new Date(serverTime));
            }
        }, [serverTime, mode, liveStreamStartTime]);

        // Используем хук для управления фрагментами
        const motionFilterSignature = useMemo(() => createMotionFilterSignature(motionFilter), [motionFilter]);

        const {
            fragments,
            fragmentsBufferRange,
            fragmentRanges,
            loadFragments,
            resetFragments,
            clearFramesCache,
            handleTimelineChange,
            checkAndLoadDaysForRange
        } = useTimelineFragments({
            url,
            port,
            credentials,
            camera,
            protocol,
            proxy,
            motionFilter: motionFilter ?? null,
            motionFilterSignature,
            visibleTimeRange,
            serverTime,
            zoomIndex: intervalIndex
        });

        // Используем хук для обработки взаимодействий пользователя
        const {
            handleMouseDown,
            handleMouseUp,
            handleMouseMove,
            handleClick,
            handleTouchStart,
            handleTouchMove,
            handleTouchEnd,
            setupWheelHandler,
            isDragging
        } = useTimelineInteractions({
            canvasRef,
            containerRef,
            visibleTimeRange: visibleTimeRange || {start: new Date(), end: new Date()},
            setVisibleTimeRange,
            intervalIndex,
            setIntervalIndex,
            fragments,
            fragmentsBufferRange,
            loadFragments,
            handleTimelineChange,
            currentTime: serverTime || new Date(),
            onTimeClick,
            progress,
            isVertical: isVerticalTimeline,
            motionFilter: motionFilter ?? null
        });

        // Обработчик движения мыши для отслеживания позиции курсора
        const handleMouseMoveWithCursor = useCallback(
            (e: React.MouseEvent) => {
                // Вызываем оригинальный обработчик
                handleMouseMove(e);

                // Обновляем позицию курсора
                if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    updateCursorPosition(x, rect.width);
                }
            },
            [handleMouseMove, containerRef, updateCursorPosition]
        );

        // Обработчик ухода мыши с контейнера
        const handleMouseLeave = useCallback(() => {
            // Вызываем оригинальный обработчик
            handleMouseUp();

            // Сбрасываем позицию курсора
            resetCursorPosition();
        }, [handleMouseUp, resetCursorPosition]);

        // Используем ref для хранения актуальных функций, чтобы избежать перезапуска эффектов
        const loadFragmentsRef = useRef(loadFragments);
        const resetFragmentsRef = useRef(resetFragments);
        useEffect(() => {
            loadFragmentsRef.current = loadFragments;
            resetFragmentsRef.current = resetFragments;
        }, [loadFragments, resetFragments]);

        // Функция для перезагрузки фрагментов для текущего видимого диапазона
        const reloadFragments = useCallback(() => {
            if (!visibleTimeRange) return;
            resetFragmentsRef.current();
            loadFragmentsRef.current(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
        }, [visibleTimeRange, intervalIndex]);

        // Экспортируем методы через ref
        useEffect(() => {
            if (ref) {
                (ref as React.MutableRefObject<TimelineRef>).current = {
                    setVisibleTimeRange: (start: Date, end: Date) => setVisibleTimeRange({start, end}),
                    centerOnCurrentTime,
                    centerOnTime,
                    getCurrentTime: () => serverTime,
                    getVisibleTimeRange: () => visibleTimeRange,
                    getFragmentsData: () => {
                        if (!fragments || fragments.length === 0) {
                            return null;
                        }
                        return {
                            fragments,
                            fragmentsBufferRange,
                            intervalIndex,
                            fragmentRanges
                        };
                    },
                    updateCursorPositionByTime: (time: Date) => {
                        if (containerRef.current) {
                            const rect = containerRef.current.getBoundingClientRect();
                            const containerWidth = rect.width;
                            updateCursorPositionByTime(time, containerWidth);
                        }
                    },
                    clearFramesCache,
                    reloadFragments,
                    checkAndLoadDaysForRange
                };
            }
        }, [
            ref,
            setVisibleTimeRange,
            centerOnCurrentTime,
            centerOnTime,
            serverTime,
            visibleTimeRange,
            fragments,
            fragmentsBufferRange,
            intervalIndex,
            fragmentRanges,
            updateCursorPositionByTime,
            clearFramesCache,
            reloadFragments,
            checkAndLoadDaysForRange
        ]);

        // Устанавливаем обработчик колесика мыши
        useEffect(() => {
            return setupWheelHandler();
        }, [setupWheelHandler]);

        // Мемоизируем ключевые параметры для загрузки фрагментов
        const fragmentsLoadKey = useMemo(() => {
            if (!visibleTimeRange || isLoading) return null;
            return {
                startTime: visibleTimeRange.start.getTime(),
                endTime: visibleTimeRange.end.getTime(),
                intervalIndex
            };
        }, [visibleTimeRange, isLoading, intervalIndex]);

        // Загрузка фрагментов при изменении видимого диапазона времени
        useEffect(() => {
            if (fragmentsLoadKey) {
                const startDate = new Date(fragmentsLoadKey.startTime);
                const endDate = new Date(fragmentsLoadKey.endTime);
                loadFragmentsRef.current(startDate, endDate, fragmentsLoadKey.intervalIndex);
            }
        }, [fragmentsLoadKey]);

        const previousFilterSignatureRef = useRef<string | null>(null);
        useEffect(() => {
            if (!visibleTimeRange) return;
            // Если фильтр не изменился, не вызываем resetFragments
            // Это предотвращает прерывание активных запросов при изменении зума или visibleTimeRange
            // resetFragments должен вызываться ТОЛЬКО при изменении фильтра
            if (previousFilterSignatureRef.current === motionFilterSignature) return;

            const isFilterBeingEnabled =
                previousFilterSignatureRef.current === 'null' && motionFilterSignature !== 'null';
            const isFilterBeingDisabled =
                previousFilterSignatureRef.current !== 'null' && motionFilterSignature === 'null';
            const isFilterChanging =
                previousFilterSignatureRef.current !== null &&
                previousFilterSignatureRef.current !== 'null' &&
                motionFilterSignature !== 'null';

            // При включении фильтра или изменении фильтра вызываем resetFragments
            if (isFilterBeingEnabled || isFilterChanging) {
                resetFragmentsRef.current();
            }
            // При выключении фильтра не вызываем resetFragments - используем данные из кэша

            previousFilterSignatureRef.current = motionFilterSignature;

            // Вызываем loadFragments только если фильтр включен или изменяется
            // При выключении фильтра переключение на обычные фреймы происходит в use-timeline-fragments через useEffect
            if (!isFilterBeingDisabled) {
                loadFragmentsRef.current(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
            }
        }, [motionFilterSignature, visibleTimeRange, intervalIndex]);

        // При смене режима Live → Record сбрасываем и перезагружаем фрагменты один раз
        // НО: если включен motion filter, не очищаем кэш - используем уже загруженные данные
        const previousModeRef = useRef<Mode | undefined>(mode);
        useEffect(() => {
            const previousMode = previousModeRef.current;
            if (previousMode !== mode) {
                if (mode === Mode.Record && visibleTimeRange) {
                    // Если включен motion filter, не вызываем resetFragments - сохраняем кэш
                    // Просто обновляем отображение для текущего диапазона
                    if (!motionFilter) {
                        resetFragmentsRef.current();
                    }
                    loadFragmentsRef.current(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
                }
                previousModeRef.current = mode;
            }
        }, [mode, visibleTimeRange, intervalIndex, motionFilter]);

        if (serverTimeError) {
            return null;
        }

        // Если время сервера еще не загружено, показываем загрузку
        if (!serverTime || !visibleTimeRange) {
            return (
                <div className="timeline-loading">
                    <span>Загрузка временной шкалы...</span>
                </div>
            );
        }

        return (
            <>
                <TimelineCanvas
                    visibleTimeRange={visibleTimeRange || {start: new Date(), end: new Date()}}
                    setVisibleTimeRange={setVisibleTimeRange}
                    intervalIndex={intervalIndex}
                    fragments={fragments}
                    fragmentsBufferRange={fragmentsBufferRange}
                    loadFragments={loadFragments}
                    currentTime={serverTime || new Date()}
                    serverTime={serverTime}
                    liveStreamStartTime={liveStreamStartTime}
                    progress={progress}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMoveWithCursor}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    containerRef={containerRef}
                    canvasRef={canvasRef}
                    cursorPosition={cursorPosition}
                    isVertical={isVerticalTimeline}
                    isMobile={isMobile}
                    isDragging={isDragging}
                    mode={mode}
                    serverVersion={serverVersion}
                    url={url}
                    port={port}
                    credentials={credentials}
                    camera={camera}
                    protocol={protocol}
                    proxy={proxy}
                />
            </>
        );
    }
);

Timeline.displayName = 'Timeline';
