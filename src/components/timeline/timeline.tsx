/**
 * Основной компонент временной шкалы
 */
import React, {useRef, useEffect, useCallback, useMemo} from 'react';
import {TimelineCanvas} from './timeline-canvas';
import {TimelineProps, TimelineRef} from './types';
import {useTimelineState} from './hooks/use-timeline-state';
import {useTimelineFragments} from './hooks/use-timeline-fragments';
import {useTimelineInteractions} from './hooks/use-timeline-interactions';
import {Mode} from '../../utils/types';

/**
 * Компонент временной шкалы
 */
export const Timeline = React.forwardRef<TimelineRef, TimelineProps>(
    ({url, port, credentials, onTimeClick, progress = 0, camera, mode, protocol}, ref) => {
        // Создаем ссылки на DOM-элементы
        const containerRef = useRef<HTMLDivElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);

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
            resetCursorPosition,
            serverTimeError
        } = useTimelineState(progress, url, port, credentials, protocol);

        // Используем хук для управления фрагментами
        const {fragments, fragmentsBufferRange, fragmentRanges, loadFragments, resetFragments} = useTimelineFragments({
            url,
            port,
            credentials,
            camera,
            protocol
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
            handleTouch,
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
            currentTime: serverTime || new Date(),
            onTimeClick,
            progress
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
                    }
                };
            }
        }, [ref, setVisibleTimeRange, centerOnCurrentTime, serverTime, fragments, fragmentsBufferRange, intervalIndex]);

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
                console.log(
                    'Загружаем фрагменты для диапазона:',
                    new Date(fragmentsLoadKey.startTime),
                    'до',
                    new Date(fragmentsLoadKey.endTime)
                );
                loadFragments(
                    new Date(fragmentsLoadKey.startTime),
                    new Date(fragmentsLoadKey.endTime),
                    fragmentsLoadKey.intervalIndex
                );
            }
        }, [fragmentsLoadKey, loadFragments]);

        // При смене режима Live → Record сбрасываем и перезагружаем фрагменты один раз
        const previousModeRef = useRef<Mode | undefined>(mode);
        useEffect(() => {
            const previousMode = previousModeRef.current;
            if (previousMode !== mode) {
                if (mode === Mode.Record && visibleTimeRange) {
                    resetFragments();
                    loadFragments(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
                }
                previousModeRef.current = mode;
            }
        }, [mode, visibleTimeRange, intervalIndex, loadFragments, resetFragments]);

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
                    onTouch={handleTouch}
                    containerRef={containerRef}
                    canvasRef={canvasRef}
                    cursorPosition={cursorPosition}
                />
            </>
        );
    }
);

Timeline.displayName = 'Timeline';
