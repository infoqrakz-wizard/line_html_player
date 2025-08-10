/**
 * Хук для отрисовки временной шкалы
 */
import { useCallback, useEffect, useRef } from 'react';
import { TimelineDrawingParams } from '../types';
import { INTERVALS, UNIT_LENGTHS } from '../utils/constants';
import {
    drawBackground,
    drawCurrentTimeIndicator,
    drawCursorPositionIndicator,
    drawDayAndHourMarkers,
    drawFragments,
    drawIntervalMarkers
} from '../utils/drawing-utils';

/**
 * Хук для отрисовки временной шкалы
 * @param params Параметры для отрисовки
 * @returns Функция для отрисовки временной шкалы
 */
export const useTimelineDrawing = ({
    canvasRef,
    containerRef,
    visibleTimeRange,
    setVisibleTimeRange,
    intervalIndex,
    fragments,
    fragmentsBufferRange,
    loadFragments,
    currentTime,
    progress,
    cursorPosition
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
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx || !container) return;

            // Получаем размеры контейнера
            const containerRect = container.getBoundingClientRect();

            // Обновляем размеры canvas в соответствии с контейнером
            canvas.style.width = `${containerRect.width}px`;
            canvas.style.height = `${containerRect.height}px`;

            // Устанавливаем размеры canvas с учетом плотности пикселей
            const dpr = window.devicePixelRatio || 1;
            canvas.width = containerRect.width * dpr;
            canvas.height = containerRect.height * dpr;

            // Масштабируем все операции отрисовки
            ctx.scale(dpr, dpr);

            // Очищаем canvas
            ctx.clearRect(0, 0, containerRect.width, containerRect.height);

            // Отрисовываем фон
            drawBackground(ctx, containerRect.width, containerRect.height);

            // Вычисляем количество пикселей на миллисекунду
            const pixelsPerMilli =
                containerRect.width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());

            // Используем интерполированный прогресс, если он передан
            const actualProgress = interpolatedProgress !== undefined ? interpolatedProgress : progress;

            // Отрисовываем маркеры дней и часов
            drawDayAndHourMarkers(ctx, visibleTimeRange, containerRect.width, containerRect.height, pixelsPerMilli);

            // Отрисовываем маркеры интервалов
            drawIntervalMarkers(
                ctx,
                visibleTimeRange,
                containerRect.width,
                containerRect.height,
                pixelsPerMilli,
                INTERVALS[intervalIndex]
            );

            // Отрисовываем фрагменты
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

            // Отрисовываем индикатор текущего времени только если он находится в видимой области
            const currentTimeMs = currentTime.getTime() + actualProgress * 1000;
            const isCurrentTimeVisible =
                currentTimeMs >= visibleTimeRange.start.getTime() && currentTimeMs <= visibleTimeRange.end.getTime();

            if (isCurrentTimeVisible) {
                drawCurrentTimeIndicator(
                    ctx,
                    currentTime,
                    actualProgress,
                    visibleTimeRange,
                    containerRect.width,
                    containerRect.height
                );
            }

            // Отрисовываем индикатор позиции курсора, если он есть
            if (cursorPosition) {
                drawCursorPositionIndicator(ctx, cursorPosition, containerRect.height);
            }
        },
        [
            canvasRef,
            containerRef,
            visibleTimeRange,
            intervalIndex,
            fragments,
            fragmentsBufferRange,
            currentTime,
            progress,
            cursorPosition
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
        if (!containerRef.current) return;

        // Проверяем, нужно ли загрузить новые фрагменты
        const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
        const distanceToStartBuffer = visibleTimeRange.start.getTime() - fragmentsBufferRange.start.getTime();

        // Загружаем новые фрагменты если до границы буфера остается один экран или меньше
        if (distanceToStartBuffer < visibleDuration) {
            loadFragments(visibleTimeRange.start, visibleTimeRange.end, intervalIndex);
        }
    }, [visibleTimeRange, containerRef, loadFragments, fragmentsBufferRange, intervalIndex]);

    // Авто-центрирование: если индикатор текущего времени достигает края видимого диапазона,
    // центрируем таймлайн по индикатору
    useEffect(() => {
        if (!visibleTimeRange) return;

        const currentTimeMs = currentTime.getTime() + progress * 1000;
        const startMs = visibleTimeRange.start.getTime();
        const endMs = visibleTimeRange.end.getTime();

        if (currentTimeMs <= startMs || currentTimeMs >= endMs) {
            const intervalMs = INTERVALS[intervalIndex];
            const halfInterval = intervalMs / 2;
            const newStart = new Date(currentTimeMs - halfInterval);
            const newEnd = new Date(currentTimeMs + halfInterval);
            setVisibleTimeRange({start: newStart, end: newEnd});
        }
    }, [visibleTimeRange, currentTime, progress, intervalIndex, setVisibleTimeRange]);

    // Возвращаем функцию отрисовки
    return drawTimeline;
};
