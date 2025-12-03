/**
 * Хук для обработки взаимодействий пользователя с временной шкалой
 */
import {useState, useCallback, useRef} from 'react';
import {TimelineInteractionsParams} from '../types';
import {
    INTERVALS,
    WHEEL_DELTA_THRESHOLD,
    UNIT_LENGTHS,
    VERTICAL_SWIPE_THRESHOLD,
    HORIZONTAL_SWIPE_THRESHOLD,
    ZOOM_SWIPE_DISTANCE
} from '../utils/constants';
import {findNearestAvailableFragment} from '../utils/fragment-utils';

/**
 * Хук для обработки взаимодействий пользователя с временной шкалой
 * @param params Параметры для обработки взаимодействий
 * @returns Обработчики событий и функции для взаимодействия
 */
export const useTimelineInteractions = ({
    canvasRef,
    containerRef,
    visibleTimeRange,
    setVisibleTimeRange,
    intervalIndex,
    setIntervalIndex,
    fragments,
    fragmentsBufferRange,
    loadFragments,
    handleTimelineChange,
    currentTime, // eslint-disable-line @typescript-eslint/no-unused-vars
    onTimeClick,
    progress, // eslint-disable-line @typescript-eslint/no-unused-vars
    isVertical = false
}: TimelineInteractionsParams) => {
    // Состояние для отслеживания перетаскивания
    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const [startX, setStartX] = useState(0);
    const [startY, setStartY] = useState(0);

    // Ref для отслеживания типа свайпа (чтобы избежать проблем с асинхронным state)
    const swipeTypeRef = useRef<'horizontal' | 'vertical' | null>(null);

    // Ref для накопления дистанции свайпа
    const verticalSwipeDistanceRef = useRef(0);
    const lastSwipeDirectionRef = useRef<'up' | 'down' | 'left' | 'right' | null>(null);

    // Аккумулятор для дельты колесика мыши
    const [wheelDeltaAccumulator, setWheelDeltaAccumulator] = useState(0);

    /**
     * Обработчик нажатия кнопки мыши
     */
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            setIsDragging(true);
            setHasDragged(false);
            setStartX(e.pageX - containerRef.current!.offsetLeft);
        },
        [containerRef]
    );

    /**
     * Обработчик отпускания кнопки мыши
     */
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        // Вызываем handleTimelineChange после окончания перетаскивания
        if (handleTimelineChange && visibleTimeRange) {
            handleTimelineChange(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
        }
    }, [handleTimelineChange, visibleTimeRange, intervalIndex]);

    /**
     * Обработчик движения мыши
     */
    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const deltaX = e.clientX - startX;
            const containerRect = containerRef.current.getBoundingClientRect();

            let timeDelta: number;
            if (isVertical) {
                // Для вертикального таймлайна используем высоту
                const pixelsPerMilli =
                    containerRect.height / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                timeDelta = deltaX / pixelsPerMilli;
            } else {
                // Для горизонтального таймлайна используем ширину
                const pixelsPerMilli =
                    containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                timeDelta = deltaX / pixelsPerMilli;
            }

            const newStart = new Date(visibleTimeRange.start.getTime() - timeDelta);
            const newEnd = new Date(visibleTimeRange.end.getTime() - timeDelta);

            // Не загружаем фрагменты во время перетаскивания - загрузка произойдет после окончания перетаскивания
            // через handleTimelineChange или через debounce

            setStartX(e.clientX);
            setVisibleTimeRange({start: newStart, end: newEnd});
            setHasDragged(true);
        },
        [isDragging, startX, isVertical, containerRef, visibleTimeRange, setVisibleTimeRange]
    );

    /**
     * Обработчик колесика мыши
     */
    const handleWheel = useCallback(
        (e: WheelEvent) => {
            e.preventDefault();

            // Используем Shift+wheel для прокрутки, обычное wheel для масштабирования
            if (e.shiftKey) {
                // Обработка горизонтальной прокрутки
                const deltaX = e.deltaY;
                const timeRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                const scrollAmount = (deltaX / canvasRef.current!.width) * timeRange;

                const newStart = new Date(visibleTimeRange.start.getTime() + scrollAmount);
                const newEnd = new Date(visibleTimeRange.end.getTime() + scrollAmount);

                // Используем debounce для загрузки фрагментов при прокрутке
                loadFragments(newStart, newEnd, intervalIndex);

                setVisibleTimeRange({start: newStart, end: newEnd});
            } else {
                // Накапливаем дельту колесика
                const newAccumulator = wheelDeltaAccumulator + Math.abs(e.deltaY);
                setWheelDeltaAccumulator(newAccumulator);

                // Изменяем интервал только когда накопленная дельта превышает порог
                if (newAccumulator >= WHEEL_DELTA_THRESHOLD) {
                    setWheelDeltaAccumulator(0);

                    const zoomIn = e.deltaY < 0;
                    const newIndex = Math.min(Math.max(intervalIndex + (zoomIn ? -1 : 1), 0), INTERVALS.length - 1);

                    if (newIndex !== intervalIndex) {
                        const rect = canvasRef.current!.getBoundingClientRect();

                        // Получаем позицию курсора относительно canvas
                        const mouseX = e.clientX - rect.left;

                        // Вычисляем время под курсором
                        const timeRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                        const timeOffset = (mouseX / rect.width) * timeRange;
                        const timeUnderCursor = new Date(visibleTimeRange.start.getTime() + timeOffset);

                        // Вычисляем новый временной диапазон на основе нового интервала
                        const currentRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                        const zoomFactor = INTERVALS[newIndex] / INTERVALS[intervalIndex];
                        const newRange = currentRange * zoomFactor;

                        // Вычисляем новые начало и конец, сохраняя позицию времени под курсором
                        // Вычисляем коэффициент позиции курсора в видимом диапазоне
                        const cursorRatio = mouseX / rect.width;

                        // Вычисляем новые начало и конец так, чтобы время под курсором осталось на том же месте
                        const newStart = new Date(timeUnderCursor.getTime() - cursorRatio * newRange);
                        const newEnd = new Date(newStart.getTime() + newRange);

                        // При изменении масштаба переиспользуем уже загруженные данные без сброса
                        // loadFragments преобразует данные в нужный масштаб без повторных запросов
                        setIntervalIndex(newIndex);
                        loadFragments(newStart, newEnd, newIndex, true);

                        setVisibleTimeRange({start: newStart, end: newEnd});

                        // Вызываем handleTimelineChange после изменения зума
                        if (handleTimelineChange) {
                            handleTimelineChange(newStart, newEnd, newIndex);
                        }
                    }
                }
            }
        },
        [
            visibleTimeRange,
            intervalIndex,
            wheelDeltaAccumulator,
            canvasRef,
            loadFragments,
            setIntervalIndex,
            setVisibleTimeRange,
            handleTimelineChange
        ]
    );

    /**
     * Устанавливаем обработчик колесика мыши
     */
    const setupWheelHandler = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('wheel', handleWheel, {passive: false});
            return () => {
                canvas.removeEventListener('wheel', handleWheel);
            };
        }
        return () => {};
    }, [canvasRef, handleWheel]);

    /**
     * Обработчик клика
     */
    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            if (!hasDragged && onTimeClick && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                let timeOffset: number;

                if (isVertical) {
                    // Для вертикального таймлайна используем Y-координату
                    const y = e.clientY - rect.top;
                    timeOffset =
                        (y / rect.height) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                } else {
                    // Для горизонтального таймлайна используем X-координату
                    const x = e.clientX - rect.left;
                    timeOffset = (x / rect.width) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                }

                const clickedTime = new Date(visibleTimeRange.start.getTime() + timeOffset);

                // Ищем ближайший доступный фрагмент
                const nearestFragmentTime = findNearestAvailableFragment(
                    clickedTime,
                    fragments,
                    fragmentsBufferRange,
                    UNIT_LENGTHS[intervalIndex]
                );

                // Если найден ближайший фрагмент, используем его время, иначе используем clicked time
                const finalTime = nearestFragmentTime || clickedTime;
                onTimeClick(finalTime);
            }
        },
        [
            hasDragged,
            onTimeClick,
            visibleTimeRange,
            canvasRef,
            fragments,
            fragmentsBufferRange,
            intervalIndex,
            isVertical
        ]
    );

    /**
     * Обработчик начала касания
     */
    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            // e.preventDefault();
            if (e.touches.length === 1) {
                console.log('touch start');
                const touch = e.touches[0];
                setIsDragging(true);
                setHasDragged(false);
                setStartX(touch.clientX - containerRef.current!.getBoundingClientRect().left);
                setStartY(touch.clientY - containerRef.current!.getBoundingClientRect().top);
                swipeTypeRef.current = null;
                verticalSwipeDistanceRef.current = 0;
                lastSwipeDirectionRef.current = null;
            }
        },
        [containerRef]
    );

    /**
     * Обработчик движения касания
     */
    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isDragging || !containerRef.current || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const currentX = touch.clientX - containerRef.current!.getBoundingClientRect().left;
            const currentY = touch.clientY - containerRef.current!.getBoundingClientRect().top;
            const deltaX = currentX - startX;
            const deltaY = currentY - startY;

            if (!swipeTypeRef.current) {
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);

                if (isVertical) {
                    // Для вертикального таймлайна: вертикальный свайп = движение, горизонтальный = зум
                    // Используем более низкий порог для вертикального свайпа, так как это основное действие
                    if (absDeltaY > 15 && absDeltaY > absDeltaX) {
                        console.log('vertical - move timeline');
                        swipeTypeRef.current = 'vertical';
                    } else if (absDeltaX > 20 && absDeltaX > absDeltaY) {
                        console.log('horizontal - zoom');
                        swipeTypeRef.current = 'horizontal';
                    }
                } else {
                    // Для горизонтального таймлайна: горизонтальный свайп = движение, вертикальный = зум
                    if (absDeltaY > VERTICAL_SWIPE_THRESHOLD && absDeltaY > absDeltaX) {
                        console.log('vertical - zoom');
                        swipeTypeRef.current = 'vertical';
                    } else if (absDeltaX > HORIZONTAL_SWIPE_THRESHOLD && absDeltaX > absDeltaY) {
                        console.log('horizontal - move timeline');
                        swipeTypeRef.current = 'horizontal';
                    }
                }
            }

            console.log('swipeType', swipeTypeRef.current);
            if (swipeTypeRef.current === 'vertical') {
                if (isVertical) {
                    // Для вертикального таймлайна: вертикальный свайп = движение таймлайна
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const pixelsPerMilli =
                        containerRect.height / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                    const timeDelta = deltaY / pixelsPerMilli;

                    const newStart = new Date(visibleTimeRange.start.getTime() - timeDelta);
                    const newEnd = new Date(visibleTimeRange.end.getTime() - timeDelta);

                    // Не загружаем фрагменты во время перетаскивания - загрузка произойдет после окончания перетаскивания

                    setStartY(currentY);
                    setVisibleTimeRange({start: newStart, end: newEnd});
                    setHasDragged(true);
                } else {
                    console.log('horizontal - zoom process');
                    // Для горизонтального таймлайна: вертикальный свайп = зум
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const mouseX = touch.clientX - containerRect.left;

                    const currentDirection = deltaY < 0 ? 'up' : 'down';

                    if (lastSwipeDirectionRef.current && lastSwipeDirectionRef.current !== currentDirection) {
                        verticalSwipeDistanceRef.current = 0;
                    }

                    lastSwipeDirectionRef.current = currentDirection;

                    const newDistance = verticalSwipeDistanceRef.current + Math.abs(deltaY);
                    verticalSwipeDistanceRef.current = newDistance;

                    if (newDistance >= ZOOM_SWIPE_DISTANCE) {
                        const timeRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                        const timeOffset = (mouseX / containerRect.width) * timeRange;
                        const timeUnderFinger = new Date(visibleTimeRange.start.getTime() + timeOffset);

                        const zoomIn = currentDirection === 'up';
                        const newIndex = Math.min(Math.max(intervalIndex + (zoomIn ? -1 : 1), 0), INTERVALS.length - 1);

                        if (newIndex !== intervalIndex) {
                            const currentRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                            const zoomFactor = INTERVALS[newIndex] / INTERVALS[intervalIndex];
                            const newRange = currentRange * zoomFactor;

                            const fingerRatio = mouseX / containerRect.width;

                            const newStart = new Date(timeUnderFinger.getTime() - fingerRatio * newRange);
                            const newEnd = new Date(newStart.getTime() + newRange);

                            // При изменении масштаба переиспользуем уже загруженные данные без сброса
                            // loadFragments преобразует данные в нужный масштаб без повторных запросов
                            setIntervalIndex(newIndex);
                            loadFragments(newStart, newEnd, newIndex, true);

                            setVisibleTimeRange({start: newStart, end: newEnd});

                            // Вызываем handleTimelineChange после изменения зума
                            if (handleTimelineChange) {
                                handleTimelineChange(newStart, newEnd, newIndex);
                            }

                            verticalSwipeDistanceRef.current = 0;
                        }
                    }

                    setHasDragged(true);
                }
                return;
            }

            if (swipeTypeRef.current === 'horizontal') {
                if (isVertical) {
                    // Для вертикального таймлайна: горизонтальный свайп = зум
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const mouseY = touch.clientY - containerRect.top;
                    const currentDirection = deltaX < 0 ? 'left' : 'right';

                    if (lastSwipeDirectionRef.current && lastSwipeDirectionRef.current !== currentDirection) {
                        verticalSwipeDistanceRef.current = 0;
                    }

                    lastSwipeDirectionRef.current = currentDirection;

                    const newDistance = verticalSwipeDistanceRef.current + Math.abs(deltaX);
                    verticalSwipeDistanceRef.current = newDistance;

                    if (newDistance >= ZOOM_SWIPE_DISTANCE) {
                        const timeRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                        const timeOffset = (mouseY / containerRect.height) * timeRange;
                        const timeUnderFinger = new Date(visibleTimeRange.start.getTime() + timeOffset);

                        console.log('timeUnderFinger', timeUnderFinger);
                        const zoomIn = currentDirection === 'left';
                        const newIndex = Math.min(Math.max(intervalIndex + (zoomIn ? -1 : 1), 0), INTERVALS.length - 1);

                        console.log('newIndex', newIndex);
                        if (newIndex !== intervalIndex) {
                            const currentRange = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                            const zoomFactor = INTERVALS[newIndex] / INTERVALS[intervalIndex];
                            const newRange = currentRange * zoomFactor;

                            const fingerRatio = mouseY / containerRect.height;

                            const newStart = new Date(timeUnderFinger.getTime() - fingerRatio * newRange);
                            const newEnd = new Date(newStart.getTime() + newRange);

                            // При изменении масштаба переиспользуем уже загруженные данные без сброса
                            // loadFragments преобразует данные в нужный масштаб без повторных запросов
                            setIntervalIndex(newIndex);
                            loadFragments(newStart, newEnd, newIndex, true);

                            setVisibleTimeRange({start: newStart, end: newEnd});

                            // Вызываем handleTimelineChange после изменения зума
                            if (handleTimelineChange) {
                                handleTimelineChange(newStart, newEnd, newIndex);
                            }

                            verticalSwipeDistanceRef.current = 0;
                        }
                    }

                    setHasDragged(true);
                } else {
                    // Для горизонтального таймлайна: горизонтальный свайп = движение таймлайна
                    const containerRect = containerRef.current.getBoundingClientRect();
                    const pixelsPerMilli =
                        containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                    const timeDelta = deltaX / pixelsPerMilli;

                    const newStart = new Date(visibleTimeRange.start.getTime() - timeDelta);
                    const newEnd = new Date(visibleTimeRange.end.getTime() - timeDelta);

                    // Не загружаем фрагменты во время перетаскивания - загрузка произойдет после окончания перетаскивания

                    setStartX(currentX);
                    setVisibleTimeRange({start: newStart, end: newEnd});
                    setHasDragged(true);
                }
            }
        },
        [
            isDragging,
            startX,
            startY,
            isVertical,
            containerRef,
            visibleTimeRange,
            loadFragments,
            setVisibleTimeRange,
            intervalIndex,
            setIntervalIndex,
            handleTimelineChange
        ]
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            setIsDragging(false);
            // Вызываем handleTimelineChange после окончания перетаскивания
            if (handleTimelineChange && visibleTimeRange && hasDragged) {
                handleTimelineChange(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
            }

            if (
                !hasDragged &&
                swipeTypeRef.current !== 'vertical' &&
                onTimeClick &&
                canvasRef.current &&
                e.changedTouches.length === 1
            ) {
                const touch = e.changedTouches[0];
                const rect = canvasRef.current.getBoundingClientRect();
                let timeOffset: number;

                if (isVertical) {
                    // Для вертикального таймлайна используем Y-координату
                    const y = touch.clientY - rect.top;
                    timeOffset =
                        (y / rect.height) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                } else {
                    // Для горизонтального таймлайна используем X-координату
                    const x = touch.clientX - rect.left;
                    timeOffset = (x / rect.width) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                }

                const clickedTime = new Date(visibleTimeRange.start.getTime() + timeOffset);

                const nearestFragmentTime = findNearestAvailableFragment(
                    clickedTime,
                    fragments,
                    fragmentsBufferRange,
                    UNIT_LENGTHS[intervalIndex]
                );

                const finalTime = nearestFragmentTime || clickedTime;
                onTimeClick(finalTime);
            }

            setIsDragging(false);
            swipeTypeRef.current = null;
            verticalSwipeDistanceRef.current = 0;
            lastSwipeDirectionRef.current = null;
        },
        [
            hasDragged,
            onTimeClick,
            canvasRef,
            visibleTimeRange,
            fragments,
            fragmentsBufferRange,
            intervalIndex,
            isVertical,
            handleTimelineChange
        ]
    );

    return {
        handleMouseDown,
        handleMouseUp,
        handleMouseMove,
        handleClick,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        setupWheelHandler,
        isDragging
    };
};
