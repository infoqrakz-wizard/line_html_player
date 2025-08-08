/**
 * Утилиты для отрисовки маркеров интервалов
 */
import { TimeRange } from '../types';
import {
    formatTime,
    isStartOfDay,
    isStartOfHour,
    isStartOfHalfHour,
    isStartOfQuarterHour,
    isStartOfFiveMinutes,
    isStartOfMinute
} from './time-utils';
import { TIMELINE_POSITIONS } from './constants';

/**
 * Отрисовывает маркеры интервалов
 * @param ctx Контекст canvas
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param pixelsPerMilli Количество пикселей на миллисекунду
 * @param timeIntervalForMarkers Интервал между маркерами в миллисекундах
 */
export const drawIntervalMarkers = (
    ctx: CanvasRenderingContext2D,
    visibleTimeRange: TimeRange,
    width: number,
    height: number,
    pixelsPerMilli: number,
    timeIntervalForMarkers: number
): void => {
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Рассчитываем минимальное расстояние между маркерами в пикселях
    // Для временных меток примерная ширина текста "00:00" - около 40 пикселей
    // Добавляем небольшой отступ для читабельности
    const minPixelsBetweenMarkers = 50;

    // Рассчитываем видимый временной диапазон в миллисекундах
    const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();

    // Рассчитываем максимальное количество маркеров, которые могут поместиться без наложения
    const maxMarkers = Math.floor(width / minPixelsBetweenMarkers);

    // Выбираем интервал для маркеров в зависимости от масштаба
    let intervalForMarkers = timeIntervalForMarkers;

    // Базовые интервалы для разных масштабов
    if (timeIntervalForMarkers >= 4 * 60 * 60 * 1000) {
        // 4 часа или больше
        intervalForMarkers = 60 * 60 * 1000; // Используем часовые маркеры
    } else if (timeIntervalForMarkers >= 60 * 60 * 1000) {
        // 1 час
        intervalForMarkers = 30 * 60 * 1000; // Используем 30-минутные маркеры
    } else if (timeIntervalForMarkers >= 30 * 60 * 1000) {
        // 30 минут
        intervalForMarkers = 10 * 60 * 1000; // Используем 10-минутные маркеры
    } else if (timeIntervalForMarkers >= 15 * 60 * 1000) {
        // 15 минут
        intervalForMarkers = 5 * 60 * 1000; // Используем 5-минутные маркеры
    } else if (timeIntervalForMarkers >= 5 * 60 * 1000) {
        // 5-10 минут
        intervalForMarkers = 60 * 1000; // Используем минутные маркеры
    }

    // Проверяем, сколько маркеров получится с выбранным интервалом
    const estimatedMarkers = Math.ceil(visibleDuration / intervalForMarkers);

    // Если маркеров слишком много, увеличиваем интервал
    if (estimatedMarkers > maxMarkers) {
        // Увеличиваем интервал в зависимости от того, насколько много маркеров
        const multiplier = Math.ceil(estimatedMarkers / maxMarkers);

        // Выбираем новый интервал в зависимости от текущего
        if (intervalForMarkers === 60 * 1000) {
            // Минутные маркеры
            intervalForMarkers = 5 * 60 * 1000; // Переходим к 5-минутным
        } else if (intervalForMarkers === 5 * 60 * 1000) {
            // 5-минутные маркеры
            intervalForMarkers = 10 * 60 * 1000; // Переходим к 10-минутным
        } else if (intervalForMarkers === 10 * 60 * 1000) {
            // 10-минутные маркеры
            intervalForMarkers = 30 * 60 * 1000; // Переходим к 30-минутным
        } else if (intervalForMarkers === 30 * 60 * 1000) {
            // 30-минутные маркеры
            intervalForMarkers = 60 * 60 * 1000; // Переходим к часовым
        } else if (intervalForMarkers === 60 * 60 * 1000) {
            // Часовые маркеры
            intervalForMarkers = 3 * 60 * 60 * 1000; // Переходим к 3-часовым
        } else {
            // Если уже используем большие интервалы, просто умножаем на множитель
            intervalForMarkers *= multiplier;
        }
    }

    // Округляем начальное время до ближайшего интервала
    let currentMarkerTime = new Date(visibleTimeRange.start);

    // В зависимости от интервала устанавливаем начальное время
    if (intervalForMarkers === 60 * 60 * 1000) {
        // Часовые маркеры
        currentMarkerTime.setMinutes(0);
        currentMarkerTime.setSeconds(0);
        currentMarkerTime.setMilliseconds(0);
    } else if (intervalForMarkers === 30 * 60 * 1000) {
        // 30-минутные маркеры
        const minutes = currentMarkerTime.getMinutes();
        currentMarkerTime.setMinutes(minutes - (minutes % 30));
        currentMarkerTime.setSeconds(0);
        currentMarkerTime.setMilliseconds(0);
    } else if (intervalForMarkers === 10 * 60 * 1000) {
        // 10-минутные маркеры
        const minutes = currentMarkerTime.getMinutes();
        currentMarkerTime.setMinutes(minutes - (minutes % 10));
        currentMarkerTime.setSeconds(0);
        currentMarkerTime.setMilliseconds(0);
    } else if (intervalForMarkers === 5 * 60 * 1000) {
        // 5-минутные маркеры
        const minutes = currentMarkerTime.getMinutes();
        currentMarkerTime.setMinutes(minutes - (minutes % 5));
        currentMarkerTime.setSeconds(0);
        currentMarkerTime.setMilliseconds(0);
    } else if (intervalForMarkers === 60 * 1000) {
        // Минутные маркеры
        currentMarkerTime.setSeconds(0);
        currentMarkerTime.setMilliseconds(0);
    } else {
        // Общий случай - округляем до ближайшего интервала
        const msToInterval = currentMarkerTime.getTime() % intervalForMarkers;
        currentMarkerTime = new Date(
            currentMarkerTime.getTime() -
            msToInterval +
            (msToInterval > intervalForMarkers / 2 ? intervalForMarkers : 0)
        );
    }

    // Отрисовываем маркеры интервалов
    while (currentMarkerTime < visibleTimeRange.end) {
        const x = (currentMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

        if (x >= 0 && x <= width) {
            // Пропускаем маркеры, которые уже отрисованы в drawDayAndHourMarkers
            if (isStartOfDay(currentMarkerTime) || isStartOfHour(currentMarkerTime)) {
                // Эти маркеры уже отрисованы в drawDayAndHourMarkers
            } else if (isStartOfHalfHour(currentMarkerTime)) {
                // Маркер 30 минут
                ctx.beginPath();
                ctx.moveTo(x, height - 4);
                ctx.lineTo(x, height);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 30 минут под маркером
                ctx.fillText(formatTime(currentMarkerTime), x, 20);
            } else if (isStartOfQuarterHour(currentMarkerTime)) {
                // Маркер 15 минут
                ctx.beginPath();
                ctx.moveTo(x, height - 3);
                ctx.lineTo(x, height);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 15 минут под маркером
                ctx.fillText(formatTime(currentMarkerTime), x, 20);
            } else if (isStartOfFiveMinutes(currentMarkerTime)) {
                // Маркер 5 минут
                ctx.beginPath();
                ctx.moveTo(x, height - 2);
                ctx.lineTo(x, height);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 5 минут под маркером (только для некоторых масштабов)
                if (timeIntervalForMarkers <= 10 * 60 * 1000) {
                    ctx.fillText(formatTime(currentMarkerTime), x, 20);
                }
            } else if (isStartOfMinute(currentMarkerTime)) {
                // Маркер минуты
                ctx.beginPath();
                ctx.moveTo(x, height - 2);
                ctx.lineTo(x, height);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 0.5;
                ctx.stroke();

                // Метка минуты под маркером (только для некоторых масштабов)
                if (timeIntervalForMarkers <= 5 * 60 * 1000) {
                    ctx.fillText(formatTime(currentMarkerTime), x, 20);
                }
            }
        }

        // Переходим к следующему интервалу
        currentMarkerTime = new Date(currentMarkerTime.getTime() + intervalForMarkers);
    }
};

/**
 * Отрисовывает субмаркеры для детального представления
 * @param ctx Контекст canvas
 * @param currentMarkerTime Текущее время маркера
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param pixelsPerMilli Количество пикселей на миллисекунду
 * @param timeIntervalForMarkers Интервал между маркерами в миллисекундах
 */
export const drawSubMarkers = (
    ctx: CanvasRenderingContext2D,
    currentMarkerTime: Date,
    visibleTimeRange: TimeRange,
    width: number,
    height: number,
    pixelsPerMilli: number,
    timeIntervalForMarkers: number
): void => {
    if (timeIntervalForMarkers <= 30 * 60 * 1000) {
        // 30 минут или меньше
        // Для 30-минутного масштаба, отрисовываем только 5 и 15 минутные маркеры
        if (timeIntervalForMarkers === 30 * 60 * 1000) {
            // Отрисовываем 5-минутные маркеры
            const fiveMinMarkerCount = 5; // 5 маркеров (5, 10, 15, 20, 25 минут)
            for (let i = 1; i <= fiveMinMarkerCount; i++) {
                const fiveMinMarkerTime = new Date(currentMarkerTime.getTime() + 5 * 60 * 1000 * i);
                const fiveMinX = (fiveMinMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

                if (fiveMinX >= 0 && fiveMinX <= width) {
                    // Маркер 5 минут
                    ctx.beginPath();
                    ctx.moveTo(fiveMinX, height - TIMELINE_POSITIONS.FIVE_MIN_MARKER_HEIGHT);
                    ctx.lineTo(fiveMinX, height);
                    ctx.strokeStyle = '#999999';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Метка 5 минут над маркером
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatTime(fiveMinMarkerTime), fiveMinX, height - 35);
                }
            }

            // Отрисовываем 15-минутные маркеры (выше)
            const fifteenMinMarkerCount = 1; // 1 маркер (на 15 минуте)
            for (let i = 1; i <= fifteenMinMarkerCount; i++) {
                const fifteenMinMarkerTime = new Date(currentMarkerTime.getTime() + 15 * 60 * 1000 * i);
                const fifteenMinX =
                    (fifteenMinMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

                if (fifteenMinX >= 0 && fifteenMinX <= width) {
                    // Маркер 15 минут
                    ctx.beginPath();
                    ctx.moveTo(fifteenMinX, height - TIMELINE_POSITIONS.QUARTER_HOUR_MARKER_HEIGHT);
                    ctx.lineTo(fifteenMinX, height);
                    ctx.strokeStyle = '#aaaaaa';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Метка 15 минут над маркером
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatTime(fifteenMinMarkerTime), fifteenMinX, height - 35);
                }
            }
        } else {
            // Отрисовываем минутные маркеры (для масштабов <= 15 минут)
            const minuteMarkersCount = timeIntervalForMarkers / (60 * 1000) - 1;
            for (let i = 1; i <= minuteMarkersCount; i++) {
                const minuteMarkerTime = new Date(currentMarkerTime.getTime() + 60 * 1000 * i);
                const minuteX = (minuteMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

                if (minuteX >= 0 && minuteX <= width) {
                    // Маркер минуты
                    ctx.beginPath();
                    ctx.moveTo(minuteX, height - TIMELINE_POSITIONS.MINUTE_MARKER_HEIGHT);
                    ctx.lineTo(minuteX, height);
                    ctx.strokeStyle = '#888888';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();

                    // Метка минуты над маркером
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatTime(minuteMarkerTime), minuteX, height - 35);
                }
            }

            // Отрисовываем 5-минутные маркеры для 10 и 15 минутных масштабов
            if (timeIntervalForMarkers >= 10 * 60 * 1000) {
                const fiveMinMarkerCount = Math.floor(timeIntervalForMarkers / (5 * 60 * 1000)) - 1;
                for (let i = 1; i <= fiveMinMarkerCount; i++) {
                    const fiveMinMarkerTime = new Date(currentMarkerTime.getTime() + 5 * 60 * 1000 * i);
                    const fiveMinX = (fiveMinMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

                    if (fiveMinX >= 0 && fiveMinX <= width) {
                        // Маркер 5 минут
                        ctx.beginPath();
                        ctx.moveTo(fiveMinX, height - TIMELINE_POSITIONS.FIVE_MIN_MARKER_HEIGHT);
                        ctx.lineTo(fiveMinX, height);
                        ctx.strokeStyle = '#999999';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Метка 5 минут над маркером
                        ctx.fillStyle = '#ffffff';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillText(formatTime(fiveMinMarkerTime), fiveMinX, height - 35);
                    }
                }
            }
        }
    }
};
