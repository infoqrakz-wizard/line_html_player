/**
 * Утилиты для отрисовки вертикального таймлайна
 */
import {TimeRange} from '../types';
import {
    formatDay,
    formatTime,
    isStartOfDay,
    isStartOfHour,
    isStartOfSixHours,
    shouldShowHourText,
    isStartOfHalfHour,
    isStartOfQuarterHour,
    isStartOfFiveMinutes,
    isStartOfMinute
} from './time-utils';

/**
 * Отрисовывает маркеры дней и часов для вертикального таймлайна
 * @param ctx Контекст canvas
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param pixelsPerMilli Количество пикселей на миллисекунду
 */
export const drawVerticalDayAndHourMarkers = (
    ctx: CanvasRenderingContext2D,
    visibleTimeRange: TimeRange,
    width: number,
    height: number,
    pixelsPerMilli: number
): void => {
    // Начинаем с начала часа
    const markerTime = new Date(visibleTimeRange.start);
    markerTime.setMinutes(0);
    markerTime.setSeconds(0);
    markerTime.setMilliseconds(0);

    // Отрисовываем вертикальную линию слева от фрагментов толщиной 4px
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(6, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Отрисовываем маркеры дней и часов
    while (markerTime <= visibleTimeRange.end) {
        const y = (markerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

        if (y >= 0 && y <= height) {
            if (isStartOfDay(markerTime)) {
                // Маркер дня (короткий штрих)
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(16, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка дня справа от маркера с отступом 10px от линии
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '10px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(formatDay(markerTime), 20, y);
            } else if (isStartOfSixHours(markerTime)) {
                // Маркер 6 часов (средний штрих)
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(12, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else if (isStartOfHour(markerTime)) {
                // Маркер часа (короткий штрих)
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(10, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Показываем текст времени только для определенных часов
                if (shouldShowHourText(markerTime, 3600000)) {
                    // 1 час в миллисекундах
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.font = '8px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(formatTime(markerTime), 20, y);
                }
            }
        }

        // Переходим к следующему часу
        markerTime.setHours(markerTime.getHours() + 1);
    }
};

/**
 * Отрисовывает маркеры интервалов для вертикального таймлайна
 * @param ctx Контекст canvas
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param pixelsPerMilli Количество пикселей на миллисекунду
 * @param timeIntervalForMarkers Интервал времени для маркеров
 */
export const drawVerticalIntervalMarkers = (
    ctx: CanvasRenderingContext2D,
    visibleTimeRange: TimeRange,
    width: number,
    height: number,
    pixelsPerMilli: number,
    timeIntervalForMarkers: number,
    isMobile: boolean = false
): void => {
    ctx.fillStyle = '#ffffff';

    // Адаптивный размер шрифта в зависимости от интервала и устройства
    let fontSize = 12;
    if (isMobile) {
        // Для мобильных устройств используем более крупные шрифты
        if (timeIntervalForMarkers <= 5 * 60 * 1000) {
            // 5 минут - средний шрифт для мобильных
            fontSize = 10;
        } else if (timeIntervalForMarkers <= 15 * 60 * 1000) {
            // 10-15 минут - стандартный шрифт для мобильных
            fontSize = 12;
        } else if (timeIntervalForMarkers <= 60 * 60 * 1000) {
            // 30 минут - 1 час - большой шрифт для мобильных
            fontSize = 14;
        } else if (timeIntervalForMarkers <= 6 * 60 * 60 * 1000) {
            // 4-6 часов - очень большой шрифт для мобильных
            fontSize = 16;
        } else {
            // 12+ часов - максимальный шрифт для мобильных
            fontSize = 18;
        }
    } else {
        // Для десктопных устройств используем стандартные размеры
        if (timeIntervalForMarkers <= 5 * 60 * 1000) {
            // 5 минут - маленький шрифт
            fontSize = 8;
        } else if (timeIntervalForMarkers <= 15 * 60 * 1000) {
            // 10-15 минут - средний шрифт
            fontSize = 10;
        } else if (timeIntervalForMarkers <= 60 * 60 * 1000) {
            // 30 минут - 1 час - стандартный шрифт
            fontSize = 12;
        } else if (timeIntervalForMarkers <= 6 * 60 * 60 * 1000) {
            // 4-6 часов - большой шрифт
            fontSize = 14;
        } else {
            // 12+ часов - очень большой шрифт
            fontSize = 16;
        }
    }

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Рассчитываем минимальное расстояние между маркерами в пикселях
    // Для вертикального таймлайна используем высоту вместо ширины
    const minPixelsBetweenMarkers = 50;

    // Рассчитываем видимый временной диапазон в миллисекундах
    const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();

    // Рассчитываем максимальное количество маркеров, которые могут поместиться без наложения
    const maxMarkers = Math.floor(height / minPixelsBetweenMarkers);

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
        const y = (currentMarkerTime.getTime() - visibleTimeRange.start.getTime()) * pixelsPerMilli;

        if (y >= 0 && y <= height) {
            // Пропускаем маркеры, которые уже отрисованы в drawVerticalDayAndHourMarkers
            if (isStartOfDay(currentMarkerTime) || isStartOfHour(currentMarkerTime)) {
                // Эти маркеры уже отрисованы в drawVerticalDayAndHourMarkers
            } else if (isStartOfHalfHour(currentMarkerTime)) {
                // Маркер 30 минут
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(10, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 30 минут справа от маркера
                ctx.fillText(formatTime(currentMarkerTime), 20, y);
            } else if (isStartOfQuarterHour(currentMarkerTime)) {
                // Маркер 15 минут
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(9, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 15 минут справа от маркера
                ctx.fillText(formatTime(currentMarkerTime), 20, y);
            } else if (isStartOfFiveMinutes(currentMarkerTime)) {
                // Маркер 5 минут
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(8, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Метка 5 минут справа от маркера (только для некоторых масштабов)
                if (timeIntervalForMarkers <= 10 * 60 * 1000) {
                    ctx.fillText(formatTime(currentMarkerTime), 20, y);
                }
            } else if (isStartOfMinute(currentMarkerTime)) {
                // Маркер минуты
                ctx.beginPath();
                ctx.moveTo(6, y);
                ctx.lineTo(8, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 0.5;
                ctx.stroke();

                // Метка минуты справа от маркера (только для некоторых масштабов)
                if (timeIntervalForMarkers <= 5 * 60 * 1000) {
                    ctx.fillText(formatTime(currentMarkerTime), 20, y);
                }
            }
        }

        // Переходим к следующему интервалу
        currentMarkerTime = new Date(currentMarkerTime.getTime() + intervalForMarkers);
    }
};

/**
 * Отрисовывает фрагменты для вертикального таймлайна
 * @param ctx Контекст canvas
 * @param fragments Массив с наличием фрагментов
 * @param visibleTimeRange Видимый диапазон времени
 * @param fragmentsBufferRange Буферизованный диапазон фрагментов
 * @param width Ширина canvas
 * @param height Высота canvas
 * @param unitLengthMs Длина единицы времени в миллисекундах
 * @param currentTime Текущее время
 * @param progress Прогресс воспроизведения в секундах
 */
export const drawVerticalFragments = (
    ctx: CanvasRenderingContext2D,
    fragments: number[],
    visibleTimeRange: TimeRange,
    fragmentsBufferRange: TimeRange,
    width: number,
    height: number,
    unitLengthMs: number,
    currentTime: Date,
    progress: number = 0
): void => {
    const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();

    const fragmentWidth = 4;
    const fragmentX = 4;

    // Вычисляем текущее время с учетом прогресса
    const currentTimeMs = currentTime.getTime() + progress * 1000;

    // Отрисовываем фрагменты только там, где есть данные
    for (let i = 0; i < fragments.length; i++) {
        if (fragments[i] === 1) {
            const fragmentStartTime = fragmentsBufferRange.start.getTime() + i * unitLengthMs;
            const fragmentEndTime = fragmentStartTime + unitLengthMs;

            // Проверяем, пересекается ли фрагмент с видимой областью
            if (
                fragmentEndTime > visibleTimeRange.start.getTime() &&
                fragmentStartTime < visibleTimeRange.end.getTime()
            ) {
                const fragmentStartY = Math.max(
                    0,
                    (fragmentStartTime - visibleTimeRange.start.getTime()) * (height / screenDuration)
                );
                const fragmentEndY = Math.min(
                    height,
                    (fragmentEndTime - visibleTimeRange.start.getTime()) * (height / screenDuration)
                );

                // Определяем цвет фрагмента
                let fragmentColor = 'rgba(100, 200, 100, 0.8)'; // Зеленый по умолчанию

                // Если фрагмент содержит текущее время, делаем его ярче
                if (currentTimeMs >= fragmentStartTime && currentTimeMs < fragmentEndTime) {
                    fragmentColor = 'rgba(150, 255, 150, 1.0)'; // Ярко-зеленый
                }

                // Отрисовываем фрагмент
                ctx.fillStyle = fragmentColor;
                ctx.fillRect(fragmentX, fragmentStartY, fragmentWidth, fragmentEndY - fragmentStartY);
            }
        }
    }
};

/**
 * Отрисовывает индикатор текущего времени для вертикального таймлайна
 * @param ctx Контекст canvas
 * @param currentTime Текущее время
 * @param progress Прогресс воспроизведения в секундах
 * @param visibleTimeRange Видимый диапазон времени
 * @param width Ширина canvas
 * @param height Высота canvas
 */
export const drawVerticalCurrentTimeIndicator = (
    ctx: CanvasRenderingContext2D,
    currentTime: Date,
    progress: number,
    visibleTimeRange: TimeRange,
    width: number,
    height: number
): void => {
    const currentTimeMs = currentTime.getTime() + progress * 1000;
    const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
    const y = ((currentTimeMs - visibleTimeRange.start.getTime()) / screenDuration) * height;

    // Отрисовываем вертикальную линию текущего времени
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
};

/**
 * Отрисовывает индикатор позиции курсора для вертикального таймлайна
 * @param ctx Контекст canvas
 * @param cursorPosition Позиция курсора
 * @param width Ширина canvas
 */
export const drawVerticalCursorPositionIndicator = (
    ctx: CanvasRenderingContext2D,
    cursorPosition: {x: number; time: Date},
    width: number
): void => {
    // Для вертикального таймлайна используем Y-координату курсора
    const y = cursorPosition.x; // В вертикальном режиме x содержит Y-координату

    // Отрисовываем вертикальную линию позиции курсора
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
};
