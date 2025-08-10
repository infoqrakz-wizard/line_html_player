/**
 * Основной компонент временной шкалы
 */
import React, {useRef, useEffect, useCallback, useMemo} from 'react';
import {TimelineCanvas} from './timeline-canvas';
import {TimelineProps, TimelineRef} from './types';
import {useTimelineState} from './hooks/use-timeline-state';
import {useTimelineFragments} from './hooks/use-timeline-fragments';
import {useTimelineInteractions} from './hooks/use-timeline-interactions';
import {UNIT_LENGTHS} from './utils/constants';
import {createPortal} from 'react-dom';
import {Mode} from '../../utils/types';

import styles from './timeline.module.scss';

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
            resetCursorPosition
        } = useTimelineState(progress, url, port, credentials, protocol);

        // Используем хук для управления фрагментами
        const {fragments, fragmentsBufferRange, loadFragments, resetFragments} = useTimelineFragments({
            url,
            port,
            credentials,
            camera,
            protocol
        });

        // Используем хук для обработки взаимодействий пользователя
        const {handleMouseDown, handleMouseUp, handleMouseMove, handleClick, setupWheelHandler} =
            useTimelineInteractions({
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
                    getCurrentTime: () => serverTime
                };
            }
        }, [ref, setVisibleTimeRange, centerOnCurrentTime, serverTime]);

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

        // Рассчитать интервалы, где есть данные, по возвращенному массиву fragments
        const availableDataIntervals = useMemo(() => {
            if (!fragments || fragments.length === 0) {
                return [] as Array<{
                    start: Date;
                    end: Date;
                    startIndex: number;
                    endIndex: number;
                }>;
            }
            const unitSeconds = UNIT_LENGTHS[intervalIndex] ?? UNIT_LENGTHS[0];
            const baseStartMs = fragmentsBufferRange.start.getTime();

            const intervals: Array<{start: Date; end: Date; startIndex: number; endIndex: number}> = [];
            let index = 0;
            while (index < fragments.length) {
                // Пропускаем нули
                while (index < fragments.length && !fragments[index]) index += 1;
                if (index >= fragments.length) break;
                const runStart = index;
                // Идем до конца последовательности единиц
                while (index < fragments.length && !!fragments[index]) index += 1;
                const runEnd = index - 1;

                const startMs = baseStartMs + runStart * unitSeconds * 1000;
                const endMs = baseStartMs + (runEnd + 1) * unitSeconds * 1000; // конец не включительно
                intervals.push({
                    start: new Date(startMs),
                    end: new Date(endMs),
                    startIndex: runStart,
                    endIndex: runEnd
                });
            }

            return intervals;
        }, [fragments, intervalIndex, fragmentsBufferRange.start]);

        const formatDateTime = useCallback((date: Date) => {
            return date.toLocaleString([], {
                year: '2-digit',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        }, []);

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
                    containerRef={containerRef}
                    canvasRef={canvasRef}
                    cursorPosition={cursorPosition}
                />
                {/* Debug: интервалы, где есть данные */}
                {/** FIXME: убрать после завершения разработки */}
                {createPortal(
                    <div
                        className={styles.timelineDebug}
                        style={{marginTop: 8}}
                    >
                        <div style={{fontSize: 12, opacity: 0.8}}>
                            <div>
                                <span>Буфер фрагментов:</span>
                                <span style={{marginLeft: 4}}>{formatDateTime(fragmentsBufferRange.start)}</span>
                                <span style={{margin: '0 4px'}}>—</span>
                                <span>{formatDateTime(fragmentsBufferRange.end)}</span>
                            </div>
                            <div>
                                Единица: <span>{UNIT_LENGTHS[intervalIndex] ?? UNIT_LENGTHS[0]}s</span>
                            </div>
                            <div>
                                Кол-во элементов: <span>{fragments.length}</span>
                            </div>
                        </div>
                        {availableDataIntervals.length > 0 ? (
                            <ul style={{fontSize: 12, marginTop: 4, paddingLeft: 18}}>
                                {availableDataIntervals.map((rng, i) => (
                                    <li key={`${rng.start.getTime()}-${i}`}>
                                        <span>
                                            [{rng.startIndex}..{rng.endIndex}]
                                        </span>
                                        <span style={{marginLeft: 4}}>{formatDateTime(rng.start)}</span>
                                        <span style={{margin: '0 4px'}}>—</span>
                                        <span>{formatDateTime(rng.end)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div style={{fontSize: 12, opacity: 0.7, marginTop: 4}}>
                                Нет доступных данных в текущем буфере
                            </div>
                        )}
                    </div>,
                    document.body
                )}
            </>
        );
    }
);

Timeline.displayName = 'Timeline';
