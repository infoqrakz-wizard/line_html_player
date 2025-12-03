/**
 * Хук для отрисовки временной шкалы
 */
import {useCallback, useEffect, useRef} from 'react';
import {TimelineDrawingParams} from '../types';
import {INTERVALS, UNIT_LENGTHS} from '../utils/constants';
import {
    drawBackground,
    drawCurrentTimeIndicator,
    drawCursorPositionIndicator,
    drawDayAndHourMarkers,
    drawFragments,
    drawIntervalMarkers,
    drawProgressFragments
} from '../utils/drawing-utils';
import {
    drawVerticalDayAndHourMarkers,
    drawVerticalIntervalMarkers,
    drawVerticalFragments,
    drawVerticalCurrentTimeIndicator,
    drawVerticalCursorPositionIndicator,
    drawVerticalProgressFragments
} from '../utils/vertical-drawing-utils';

/**
 * Хук для отрисовки временной шкалы
 * @param params Параметры для отрисовки
 * @returns Функция для отрисовки временной шкалы
 */
export const useTimelineDrawing = ({
    canvasRef,
    containerRef,
    visibleTimeRange,
    setVisibleTimeRange, // eslint-disable-line @typescript-eslint/no-unused-vars
    intervalIndex,
    fragments,
    fragmentsBufferRange,
    loadFragments,
    currentTime,
    serverTime,
    progress,
    cursorPosition,
    isVertical = false,
    isMobile = false,
    isDragging = false
}: TimelineDrawingParams) => {
    // Сохраняем последнее известное время и прогресс
    const lastTimeRef = useRef<Date>(new Date(currentTime));
    const lastProgressRef = useRef<number>(progress);
    const animationFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    /**
     * Функция для отрисовки временной шкалы с интерполированным прогрессом
     */
    const drawTimeline = useCallback(
        (interpolatedProgress?: number) => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            // Получаем размеры контейнера
            const containerRect = container.getBoundingClientRect();

            // Устанавливаем размеры canvas с учетом плотности пикселей
            const dpr = window.devicePixelRatio || 1;

            // Сначала устанавливаем физические размеры (пиксели устройства)
            canvas.width = containerRect.width * dpr;
            canvas.height = containerRect.height * dpr;

            // Затем устанавливаем CSS размеры (логические пиксели)
            canvas.style.width = `${containerRect.width}px`;
            canvas.style.height = `${containerRect.height}px`;

            const ctx = canvas?.getContext('2d');

            // Получаем контекст ПОСЛЕ установки размеров
            if (!ctx) return;

            // Масштабируем все операции отрисовки
            ctx.scale(dpr, dpr);

            // Очищаем canvas в логических координатах
            ctx.clearRect(0, 0, containerRect.width, containerRect.height);

            // Отрисовываем фон
            drawBackground(ctx, containerRect.width, containerRect.height);
            // Вычисляем количество пикселей на миллисекунду
            const pixelsPerMilli = isVertical
                ? containerRect.height / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime())
                : containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());

            // Используем интерполированный прогресс, если он передан
            const actualProgress = interpolatedProgress !== undefined ? interpolatedProgress : progress;

            // Отрисовываем маркеры дней и часов
            if (isVertical) {
                drawVerticalDayAndHourMarkers(
                    ctx,
                    visibleTimeRange,
                    containerRect.width,
                    containerRect.height,
                    pixelsPerMilli
                );
            } else {
                drawDayAndHourMarkers(ctx, visibleTimeRange, containerRect.width, containerRect.height, pixelsPerMilli);
            }

            // Отрисовываем маркеры интервалов
            if (isVertical) {
                drawVerticalIntervalMarkers(
                    ctx,
                    visibleTimeRange,
                    containerRect.width,
                    containerRect.height,
                    pixelsPerMilli,
                    INTERVALS[intervalIndex],
                    isMobile
                );
            } else {
                drawIntervalMarkers(
                    ctx,
                    visibleTimeRange,
                    containerRect.width,
                    containerRect.height,
                    pixelsPerMilli,
                    INTERVALS[intervalIndex],
                    isMobile
                );
            }

            // Отрисовываем фрагменты
            if (isVertical) {
                drawVerticalFragments(
                    ctx,
                    fragments,
                    visibleTimeRange,
                    fragmentsBufferRange,
                    containerRect.width,
                    containerRect.height,
                    UNIT_LENGTHS[intervalIndex] * 1000,
                    currentTime,
                    actualProgress
                );
            } else {
                drawFragments(
                    ctx,
                    fragments,
                    visibleTimeRange,
                    fragmentsBufferRange,
                    containerRect.width,
                    containerRect.height,
                    UNIT_LENGTHS[intervalIndex] * 1000,
                    currentTime,
                    actualProgress
                );
            }

            // Отрисовываем фреймы от serverTime до текущего индикатора времени
            // Это отдельная отрисовка, не зависящая от данных в fragments
            if (serverTime) {
                if (isVertical) {
                    drawVerticalProgressFragments(
                        ctx,
                        serverTime,
                        currentTime,
                        actualProgress,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height,
                        UNIT_LENGTHS[intervalIndex] * 1000
                    );
                } else {
                    drawProgressFragments(
                        ctx,
                        serverTime,
                        currentTime,
                        actualProgress,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height,
                        UNIT_LENGTHS[intervalIndex] * 1000
                    );
                }
            }

            // Отрисовываем индикатор текущего времени только если он находится в видимой области
            const currentTimeMs = currentTime.getTime() + actualProgress * 1000;
            const isCurrentTimeVisible =
                currentTimeMs >= visibleTimeRange.start.getTime() && currentTimeMs <= visibleTimeRange.end.getTime();

            if (isCurrentTimeVisible) {
                if (isVertical) {
                    drawVerticalCurrentTimeIndicator(
                        ctx,
                        currentTime,
                        actualProgress,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height
                    );
                } else {
                    drawCurrentTimeIndicator(
                        ctx,
                        currentTime,
                        actualProgress,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height
                    );
                }
            }

            // Отрисовываем индикатор позиции курсора, если он есть
            if (cursorPosition && !isMobile) {
                if (isVertical) {
                    drawVerticalCursorPositionIndicator(
                        ctx,
                        cursorPosition,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height
                    );
                } else {
                    drawCursorPositionIndicator(
                        ctx,
                        cursorPosition,
                        visibleTimeRange,
                        containerRect.width,
                        containerRect.height
                    );
                }
            }
        },
        [
            canvasRef,
            containerRef,
            isVertical,
            visibleTimeRange,
            progress,
            currentTime,
            serverTime,
            cursorPosition,
            isMobile,
            intervalIndex,
            fragments,
            fragmentsBufferRange
        ]
    );

    // Функция анимации для плавного движения индикатора
    const animate = useCallback(
        (timestamp: number) => {
            if (lastTimestampRef.current === null) {
                lastTimestampRef.current = timestamp;
            }

            const deltaTime = timestamp - lastTimestampRef.current;
            lastTimestampRef.current = timestamp;

            // Вычисляем интерполированный прогресс
            // Добавляем время, прошедшее с момента последнего кадра
            const secondsElapsed = deltaTime / 1000;
            const interpolatedProgress = lastProgressRef.current + secondsElapsed;

            // Отрисовываем таймлайн с интерполированным прогрессом
            drawTimeline(interpolatedProgress);

            // Продолжаем анимацию
            animationFrameRef.current = requestAnimationFrame(animate);
        },
        [drawTimeline]
    );

    // Перерисовываем при изменении зависимостей
    useEffect(() => {
        // Обновляем сохраненные значения
        lastTimeRef.current = new Date(currentTime);
        lastProgressRef.current = progress;
        lastTimestampRef.current = null;

        // Начинаем анимацию, если она еще не запущена
        if (!animationFrameRef.current) {
            animationFrameRef.current = requestAnimationFrame(animate);
        }

        // Очищаем анимацию при размонтировании
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [animate, currentTime, progress]);

    // Эффект для проверки необходимости загрузки новых фрагментов
    // Автоматический скроллинг удален
    useEffect(() => {
        if (!containerRef.current || isDragging) return; // Пропускаем обновления во время перетаскивания

        // Проверяем, нужно ли загрузить новые фрагменты
        const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
        const distanceToStartBuffer = visibleTimeRange.start.getTime() - fragmentsBufferRange.start.getTime();

        // Загружаем новые фрагменты если до границы буфера остается один экран или меньше
        if (distanceToStartBuffer < visibleDuration) {
            loadFragments(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
        }
    }, [visibleTimeRange, containerRef, loadFragments, fragmentsBufferRange, intervalIndex, isDragging]);

    // Возвращаем функцию отрисовки
    return drawTimeline;
};
