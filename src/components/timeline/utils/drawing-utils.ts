/**
 * Утилиты для отрисовки временной шкалы
 */
import {TimeRange} from '../types';

// Импортируем функции из новых файлов
import {drawDayAndHourMarkers} from './day-hour-markers';
import {drawIntervalMarkers, drawSubMarkers} from './interval-markers';

// Экспортируем функции для обратной совместимости
export {drawDayAndHourMarkers, drawIntervalMarkers, drawSubMarkers};

/**
 * Отрисовывает фон временной шкалы
 * @param ctx Контекст canvas
 * @param width Ширина canvas
 * @param height Высота canvas
 */
export const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);
};

/**
 * Отрисовывает фрагменты видео
 * @param ctx Контекст canvas
 * @param fragments Массив с наличием фрагментов
 * @param visibleTimeRange Видимый диапазон времени
 * @param fragmentsBufferRange Буферизованный диапазон фрагментов
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param unitLengthMs Длина единицы времени в миллисекундах
 * @param currentTime Текущее время (опционально)
 * @param progress Прогресс воспроизведения в секундах (опционально)
 */
export const drawFragments = (
    ctx: CanvasRenderingContext2D,
    fragments: number[],
    visibleTimeRange: TimeRange,
    fragmentsBufferRange: TimeRange,
    width: number,
    height: number,
    unitLengthMs: number,
    currentTime?: Date,
    progress: number = 0 // eslint-disable-line @typescript-eslint/no-unused-vars
): void => {
    const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();

    const fragmentHeight = 4;
    const fragmentY = 4;

    // Сначала рисуем серую полосу на всю длину таймлайна
    ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.fillRect(0, fragmentY, width, fragmentHeight);

    // Если нет фрагментов, выходим после отрисовки серой полосы
    if (fragments.length === 0) return;

    // Рисуем зеленые фрагменты поверх серой полосы только там, где есть данные
    ctx.fillStyle = '#4CAF50';

    fragments.forEach((hasFrame, index) => {
        if (hasFrame) {
            const fragmentStartTime = fragmentsBufferRange.start.getTime() + index * unitLengthMs;
            const fragmentEndTime = fragmentStartTime + unitLengthMs;
            const xStart = ((fragmentStartTime - visibleTimeRange.start.getTime()) / screenDuration) * width;
            const xEnd = ((fragmentEndTime - visibleTimeRange.start.getTime()) / screenDuration) * width;

            if (xEnd >= 0 && xStart <= width) {
                const visibleXStart = Math.max(0, xStart);
                const visibleXEnd = Math.min(width, xEnd);
                const visibleWidth = visibleXEnd - visibleXStart;

                ctx.fillRect(visibleXStart, fragmentY, visibleWidth, fragmentHeight);
            }
        }
    });
};

/**
 * Отрисовывает индикатор текущего времени
 * @param ctx Контекст canvas
 * @param currentTime Текущее время
 * @param progress Прогресс воспроизведения в секундах
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 */
export const drawCurrentTimeIndicator = (
    ctx: CanvasRenderingContext2D,
    currentTime: Date,
    progress: number,
    visibleTimeRange: TimeRange,
    width: number,
    height: number
): void => {
    const pixelsPerMilli = width / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime());
    const currentX = (currentTime.getTime() + progress * 1000 - visibleTimeRange.start.getTime()) * pixelsPerMilli;

    if (currentX >= 0 && currentX <= width) {
        // Рисуем вертикальную линию от верха до нижней границы
        ctx.beginPath();
        ctx.moveTo(currentX, 4);
        ctx.lineTo(currentX, height);
        ctx.strokeStyle = '#00CC66';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
};

/**
 * Отрисовывает индикатор позиции курсора
 * @param ctx Контекст canvas
 * @param cursorPosition Позиция курсора
 * @param height Высота canvas
 */
export const drawCursorPositionIndicator = (
    ctx: CanvasRenderingContext2D,
    cursorPosition: {x: number; time: Date},
    canvasHeight: number
) => {
    // Проверяем, что cursorPosition определен и содержит необходимые свойства
    if (!cursorPosition || !cursorPosition.time) {
        return; // Если нет данных о позиции курсора или времени, не рисуем индикатор
    }

    // Отрисовываем вертикальную линию курсора от верха до нижней границы
    ctx.beginPath();
    ctx.moveTo(cursorPosition.x, 4);
    ctx.lineTo(cursorPosition.x, canvasHeight);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]); // Штриховая линия
    ctx.stroke();
    ctx.setLineDash([]); // Сбрасываем штриховку

    // Отрисовываем метку с датой и временем
    const timeString = cursorPosition.time.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const dateString = cursorPosition.time.toLocaleDateString([], {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const dateTimeString = `${dateString} ${timeString}`;

    // Фон для метки
    ctx.fillStyle = 'rgb(246, 244, 244)';
    ctx.font = '12px Arial';

    const labelWidth = ctx.measureText(dateTimeString).width + 10;
    const labelHeight = 24; // Высота для одной строки текста

    // Позиционируем метку так, чтобы она не выходила за пределы экрана
    let labelX = cursorPosition.x + 5;
    if (labelX + labelWidth > ctx.canvas.width) {
        labelX = cursorPosition.x - labelWidth - 5;
    }

    // Рисуем фон и рамку
    ctx.fillRect(labelX, 9, labelWidth, labelHeight);
    ctx.strokeStyle = 'rgb(55, 55, 55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX, 9, labelWidth, labelHeight);

    // Рисуем текст с датой и временем
    ctx.fillStyle = 'rgb(55, 55, 55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dateTimeString, labelX + labelWidth / 2, 21);
};
