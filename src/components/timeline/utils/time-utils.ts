/**
 * Утилиты для работы с временем в компоненте Timeline
 */

/**
 * Проверяет, является ли дата началом дня (00:00:00)
 * @param date Дата для проверки
 * @returns true, если дата является началом дня
 */
export const isStartOfDay = (date: Date): boolean => {
    return date.getHours() === 0 && date.getMinutes() === 0;
};

/**
 * Проверяет, является ли дата началом часа (XX:00:00)
 * @param date Дата для проверки
 * @returns true, если дата является началом часа
 */
export const isStartOfHour = (date: Date): boolean => {
    return date.getMinutes() === 0;
};

/**
 * Проверяет, нужно ли отображать текст часа в зависимости от интервала
 * @param date Дата для проверки
 * @param timeInterval Текущий интервал в миллисекундах
 * @returns true, если нужно отображать текст часа
 */
export const shouldShowHourText = (date: Date, timeInterval: number): boolean => {
    const hours = date.getHours();

    // Маппинг: интервал (часы) → шаг между подписями (часы)
    const stepMap: Record<number, number> = {
        1: 1, // показывать каждый час
        4: 1, // каждые 2 часа
        6: 1, // каждые 3 часа
        12: 3, // каждые 4 часа
        24: 3 // каждые 3 часа
    };

    const intervalHours = timeInterval / (60 * 60 * 1000);
    const step = stepMap[intervalHours] ?? 1; // если нет в маппинге, fallback на каждый час

    return hours % step === 0;
};
/**
 * Округляет дату до ближайшего интервала
 * @param date Дата для округления
 * @param interval Интервал в миллисекундах
 * @returns Округленная дата
 */
export const roundToInterval = (date: Date, interval: number): Date => {
    const msToInterval = date.getTime() % interval;
    return new Date(date.getTime() - msToInterval + (msToInterval > interval / 2 ? interval : 0));
};

/**
 * Форматирует дату в строку дня (ДД.ММ)
 * @param date Дата для форматирования
 * @returns Строка с датой в формате ДД.ММ
 */
export const formatDay = (date: Date): string => {
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

/**
 * Форматирует время в строку (ЧЧ:ММ)
 * @param date Дата для форматирования
 * @returns Строка с временем в формате ЧЧ:ММ
 */
export const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

/**
 * Проверяет, является ли дата началом 6-часового интервала (00:00, 06:00, 12:00, 18:00)
 * @param date Дата для проверки
 * @returns true, если дата является началом 6-часового интервала
 */
export const isStartOfSixHours = (date: Date): boolean => {
    return date.getHours() % 6 === 0 && date.getMinutes() === 0;
};

/**
 * Проверяет, является ли дата началом 30-минутного интервала (XX:00, XX:30)
 * @param date Дата для проверки
 * @returns true, если дата является началом 30-минутного интервала
 */
export const isStartOfHalfHour = (date: Date): boolean => {
    return date.getMinutes() % 30 === 0;
};

/**
 * Проверяет, является ли дата началом 15-минутного интервала (XX:00, XX:15, XX:30, XX:45)
 * @param date Дата для проверки
 * @returns true, если дата является началом 15-минутного интервала
 */
export const isStartOfQuarterHour = (date: Date): boolean => {
    return date.getMinutes() % 15 === 0;
};

/**
 * Проверяет, является ли дата началом 5-минутного интервала (XX:00, XX:05, XX:10, ...)
 * @param date Дата для проверки
 * @returns true, если дата является началом 5-минутного интервала
 */
export const isStartOfFiveMinutes = (date: Date): boolean => {
    return date.getMinutes() % 5 === 0;
};

/**
 * Проверяет, является ли дата началом минуты (XX:XX:00)
 * @param date Дата для проверки
 * @returns true, если дата является началом минуты
 */
export const isStartOfMinute = (date: Date): boolean => {
    return date.getSeconds() === 0;
};
