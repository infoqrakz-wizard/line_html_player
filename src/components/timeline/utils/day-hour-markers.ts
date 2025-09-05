/**
 * Утилиты для отрисовки маркеров дней и часов
 */
import {TimeRange} from '../types';
import {formatDay, formatTime, isStartOfDay, isStartOfHour, shouldShowHourText} from './time-utils';

/**
 * Отрисовывает маркеры дней и часов
 * @param ctx Контекст canvas
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param pixelsPerMilli Количество пикселей на миллисекунду
 */
export const drawDayAndHourMarkers = (
    ctx: CanvasRenderingContext2D,
    visibleTimeRange: TimeRange,
    width: number,
    height: number,
    pixelsPerMilli: number
): void => {
    // Начинаем с начала часа
    let markerTime = new Date(visibleTimeRange.start);
    markerTime.setMinutes(0);
    markerTime.setSeconds(0);
    markerTime.setMilliseconds(0);

    // Отрисовываем горизонтальную линию под фрагментами толщиной 4px
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(width, 6);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Отрисовываем маркеры дней и часов
    while (markerTime <= visibleTimeRange.end) {
        const x = (markerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

        if (x >= 0 && x <= width) {
            if (isStartOfDay(markerTime)) {
                // Маркер дня (короткий штрих)
                ctx.beginPath();
                ctx.moveTo(x, 6);
                ctx.lineTo(x, 16);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка дня под маркером с отступом 10px от линии
                ctx.fillStyle = '#4CAF50';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(formatDay(markerTime), x, 20);
            } else if (isStartOfHour(markerTime)) {
                // Маркер часа (короткий штрих)
                ctx.beginPath();
                ctx.moveTo(x, 6);
                ctx.lineTo(x, 14);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка часа под маркером с отступом 10px от линии
                const timeInterval = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                if (shouldShowHourText(markerTime, timeInterval)) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatTime(markerTime), x, 20);
                }
            }
        }

        // Переходим к следующему часу
        markerTime = new Date(markerTime.getTime() + 60 * 60 * 1000);
    }
};
