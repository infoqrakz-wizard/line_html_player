/**
 * Основной компонент временной шкалы
 */
import React, {useRef, useEffect, useCallback, useMemo} from 'react';
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
    ({url, port, credentials, onTimeClick, progress = 0, camera, mode, protocol, proxy, motionFilter}, ref) => {
        // Создаем ссылки на DOM-элементы
        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

        // Определяем ориентацию и тип устройства
        const {orientation, isMobile} = useOrientation();

        // Определяем, нужно ли показывать вертикальный таймлайн
        const isVerticalTimeline = isMobile && orientation === 'landscape';

        // Используем хук для управления состоянием временной шкалы
        const {
            serverTime,
            isLoading,
            visibleTimeRange,
            setVisibleTimeRange,
            intervalIndex,
            setIntervalIndex,
            centerOnCurrentTime,
            cursorPosition,
            updateCursorPosition,
            updateCursorPositionByTime,
            resetCursorPosition,
            serverTimeError
        } = useTimelineState(progress, url, port, credentials, protocol, proxy);

        // Используем хук для управления фрагментами
        const motionFilterSignature = useMemo(() => createMotionFilterSignature(motionFilter), [motionFilter]);

        const {fragments, fragmentsBufferRange, fragmentRanges, loadFragments, resetFragments, handleTimelineChange} =
            useTimelineFragments({
                url,
                port,
                credentials,
                camera,
                protocol,
                proxy,
                motionFilter: motionFilter ?? null,
                motionFilterSignature,
                visibleTimeRange,
                serverTime
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
            setupWheelHandler
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
            resetFragments,
            handleTimelineChange,
            currentTime: serverTime || new Date(),
            onTimeClick,
            progress,
            isVertical: isVerticalTimeline
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

        // Экспортируем методы через ref
        useEffect(() => {
            if (ref) {
                (ref as React.MutableRefObject<TimelineRef>).current = {
                    setVisibleTimeRange: (start: Date, end: Date) => setVisibleTimeRange({start, end}),
                    centerOnCurrentTime,
                    getCurrentTime: () => serverTime,
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
                    }
                };
            }
        }, [
            ref,
            setVisibleTimeRange,
            centerOnCurrentTime,
            serverTime,
            fragments,
            fragmentsBufferRange,
            intervalIndex,
            fragmentRanges,
            updateCursorPositionByTime
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

        // Используем ref для хранения актуальных функций, чтобы избежать перезапуска эффектов
        const loadFragmentsRef = useRef(loadFragments);
        const resetFragmentsRef = useRef(resetFragments);
        useEffect(() => {
            loadFragmentsRef.current = loadFragments;
            resetFragmentsRef.current = resetFragments;
        }, [loadFragments, resetFragments]);

        // Загрузка фрагментов при изменении видимого диапазона времени
        useEffect(() => {
            if (fragmentsLoadKey) {
                const startDate = new Date(fragmentsLoadKey.startTime);
                const endDate = new Date(fragmentsLoadKey.endTime);
                const durationHours = (fragmentsLoadKey.endTime - fragmentsLoadKey.startTime) / (1000 * 60 * 60);
                console.log('Timeline: Загружаем фрагменты для диапазона:', {
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                    durationHours: durationHours.toFixed(2),
                    intervalIndex: fragmentsLoadKey.intervalIndex
                });
                loadFragmentsRef.current(startDate, endDate, fragmentsLoadKey.intervalIndex);
            }
        }, [fragmentsLoadKey]);

        const previousFilterSignatureRef = useRef<string | null>(null);
        useEffect(() => {
            if (!visibleTimeRange) return;
            if (previousFilterSignatureRef.current === motionFilterSignature) return;

            if (previousFilterSignatureRef.current !== null) {
                resetFragmentsRef.current();
            }

            previousFilterSignatureRef.current = motionFilterSignature;
            loadFragmentsRef.current(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
        }, [motionFilterSignature, visibleTimeRange, intervalIndex]);

        // При смене режима Live → Record сбрасываем и перезагружаем фрагменты один раз
        const previousModeRef = useRef<Mode | undefined>(mode);
        useEffect(() => {
            const previousMode = previousModeRef.current;
            if (previousMode !== mode) {
                if (mode === Mode.Record && visibleTimeRange) {
                    resetFragmentsRef.current();
                    loadFragmentsRef.current(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
                }
                previousModeRef.current = mode;
            }
        }, [mode, visibleTimeRange, intervalIndex]);

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
                />
            </>
        );
    }
);

Timeline.displayName = 'Timeline';
