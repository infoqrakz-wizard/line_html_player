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
    resetFragments,
    currentTime, // eslint-disable-line @typescript-eslint/no-unused-vars
    onTimeClick,
    progress // eslint-disable-line @typescript-eslint/no-unused-vars
}: TimelineInteractionsParams) => {
    // Состояние для отслеживания перетаскивания
    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const [startX, setStartX] = useState(0);
    const [startY, setStartY] = useState(0);

    // Состояние для отслеживания типа свайпа
    const [swipeType, setSwipeType] = useState<'horizontal' | 'vertical' | null>(null);

    // Ref для накопления дистанции вертикального свайпа
    const verticalSwipeDistanceRef = useRef(0);
    const lastVerticalDirectionRef = useRef<'up' | 'down' | null>(null);

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
    }, []);

    /**
     * Обработчик движения мыши
     */
    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const deltaX = e.clientX - startX;
            const containerRect = containerRef.current.getBoundingClientRect();
            const pixelsPerMilli =
                containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
            const timeDelta = deltaX / pixelsPerMilli;

            const newStart = new Date(visibleTimeRange.start.getTime() - timeDelta);
            const newEnd = new Date(visibleTimeRange.end.getTime() - timeDelta);

            // Проверяем, нужно ли загрузить новые фрагменты
            const screenDuration = newEnd.getTime() - newStart.getTime();

            // Проверяем расстояние от видимых границ до границ буфера
            const distanceToStartBuffer = newStart.getTime() - fragmentsBufferRange.start.getTime();
            const distanceToEndBuffer = fragmentsBufferRange.end.getTime() - newEnd.getTime();

            // Загружаем новые фрагменты если до границы буфера остается один экран или меньше
            if (distanceToStartBuffer < screenDuration || distanceToEndBuffer < screenDuration) {
                loadFragments(newStart, newEnd, intervalIndex);
            }

            setStartX(e.clientX);
            setVisibleTimeRange({start: newStart, end: newEnd});
            setHasDragged(true);
        },
        [
            isDragging,
            startX,
            containerRef,
            visibleTimeRange,
            fragmentsBufferRange,
            loadFragments,
            setVisibleTimeRange,
            intervalIndex
        ]
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

                // Проверяем необходимость загрузки новых фрагментов
                const screenDuration = newEnd.getTime() - newStart.getTime();
                const distanceToStartBuffer = newStart.getTime() - fragmentsBufferRange.start.getTime();
                const distanceToEndBuffer = fragmentsBufferRange.end.getTime() - newEnd.getTime();

                if (distanceToStartBuffer < screenDuration || distanceToEndBuffer < screenDuration) {
                    loadFragments(newStart, newEnd, intervalIndex);
                }

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

                        // Сбрасываем и перезагружаем фрагменты при изменении масштаба
                        resetFragments();
                        setIntervalIndex(newIndex);
                        loadFragments(newStart, newEnd, newIndex);

                        setVisibleTimeRange({start: newStart, end: newEnd});
                    }
                }
            }
        },
        [
            visibleTimeRange,
            intervalIndex,
            wheelDeltaAccumulator,
            canvasRef,
            fragmentsBufferRange,
            loadFragments,
            resetFragments,
            setIntervalIndex,
            setVisibleTimeRange
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
                const x = e.clientX - rect.left;
                const timeOffset =
                    (x / rect.width) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
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
        [hasDragged, onTimeClick, visibleTimeRange, canvasRef, fragments, fragmentsBufferRange, intervalIndex]
    );

    /**
     * Обработчик начала касания
     */
    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            // e.preventDefault();
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                setIsDragging(true);
                setHasDragged(false);
                setStartX(touch.pageX - containerRef.current!.offsetLeft);
                setStartY(touch.pageY - containerRef.current!.offsetTop);
                setSwipeType(null);
                verticalSwipeDistanceRef.current = 0;
                lastVerticalDirectionRef.current = null;
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
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            if (!swipeType) {
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);

                if (absDeltaY > VERTICAL_SWIPE_THRESHOLD && absDeltaY > absDeltaX) {
                    console.log('vertical');
                    setSwipeType('vertical');
                } else if (absDeltaX > HORIZONTAL_SWIPE_THRESHOLD && absDeltaX > absDeltaY) {
                    console.log('horizontal');
                    setSwipeType('horizontal');
                }
            }

            if (swipeType === 'vertical') {
                const containerRect = containerRef.current.getBoundingClientRect();
                const mouseX = touch.clientX - containerRect.left;

                const currentDirection = deltaY < 0 ? 'up' : 'down';

                if (lastVerticalDirectionRef.current && lastVerticalDirectionRef.current !== currentDirection) {
                    verticalSwipeDistanceRef.current = 0;
                }

                lastVerticalDirectionRef.current = currentDirection;

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

                        resetFragments();
                        setIntervalIndex(newIndex);
                        loadFragments(newStart, newEnd, newIndex);

                        setVisibleTimeRange({start: newStart, end: newEnd});

                        verticalSwipeDistanceRef.current = 0;
                    }
                }

                setHasDragged(true);
                return;
            }

            if (swipeType === 'horizontal') {
                const containerRect = containerRef.current.getBoundingClientRect();
                const pixelsPerMilli =
                    containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
                const timeDelta = deltaX / pixelsPerMilli;

                const newStart = new Date(visibleTimeRange.start.getTime() - timeDelta);
                const newEnd = new Date(visibleTimeRange.end.getTime() - timeDelta);

                const screenDuration = newEnd.getTime() - newStart.getTime();

                const distanceToStartBuffer = newStart.getTime() - fragmentsBufferRange.start.getTime();
                const distanceToEndBuffer = fragmentsBufferRange.end.getTime() - newEnd.getTime();

                if (distanceToStartBuffer < screenDuration || distanceToEndBuffer < screenDuration) {
                    loadFragments(newStart, newEnd, intervalIndex);
                }

                setStartX(touch.clientX);
                setVisibleTimeRange({start: newStart, end: newEnd});
                setHasDragged(true);
            }
        },
        [
            isDragging,
            startX,
            startY,
            swipeType,
            containerRef,
            visibleTimeRange,
            fragmentsBufferRange,
            loadFragments,
            setVisibleTimeRange,
            intervalIndex,
            resetFragments,
            setIntervalIndex
        ]
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (
                !hasDragged &&
                swipeType !== 'vertical' &&
                onTimeClick &&
                canvasRef.current &&
                e.changedTouches.length === 1
            ) {
                const touch = e.changedTouches[0];
                const rect = canvasRef.current.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const timeOffset =
                    (x / rect.width) * (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
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
            setSwipeType(null);
            verticalSwipeDistanceRef.current = 0;
            lastVerticalDirectionRef.current = null;
        },
        [
            hasDragged,
            swipeType,
            onTimeClick,
            canvasRef,
            visibleTimeRange,
            fragments,
            fragmentsBufferRange,
            intervalIndex
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
        setupWheelHandler
    };
};
