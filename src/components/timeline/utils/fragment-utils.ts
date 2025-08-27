/**
 * Утилиты для работы с фрагментами временной шкалы
 */
import {TimeRange} from '../types';

/**
 * Находит ближайший доступный фрагмент для указанного времени
 * @param clickedTime Время клика
 * @param fragments Массив с наличием фрагментов
 * @param fragmentsBufferRange Диапазон буферизованных фрагментов
 * @param unitLengthSeconds Длина единицы времени в секундах
 * @param currentTime Текущее серверное время
 * @returns Время ближайшего доступного фрагмента или null, если не найден
 */
export const findNearestAvailableFragment = (
    clickedTime: Date,
    fragments: number[],
    fragmentsBufferRange: TimeRange,
    unitLengthSeconds: number
): Date | null => {
    // Если нет фрагментов, возвращаем null
    if (fragments.length === 0) {
        return null;
    }

    const unitLengthMs = unitLengthSeconds * 1000;
    const bufferStartTime = fragmentsBufferRange.start.getTime();
    const bufferEndTime = fragmentsBufferRange.end.getTime();

    // Проверяем, что clicked time находится в диапазоне буферизованных фрагментов
    const clickedTimeMs = clickedTime.getTime();
    if (clickedTimeMs < bufferStartTime || clickedTimeMs > bufferEndTime) {
        return null; // Клик вне диапазона загруженных фрагментов
    }

    // Вычисляем индекс фрагмента для clicked time
    const clickedFragmentIndex = Math.floor((clickedTimeMs - bufferStartTime) / unitLengthMs);

    // Проверяем границы массива
    if (clickedFragmentIndex < 0 || clickedFragmentIndex >= fragments.length) {
        return null;
    }

    // Если фрагмент для clicked time доступен, возвращаем clicked time
    if (fragments[clickedFragmentIndex] > 0) {
        return clickedTime;
    }

    // Ищем ближайший доступный фрагмент в будущем
    for (let i = clickedFragmentIndex + 1; i < fragments.length; i++) {
        if (fragments[i] > 0) {
            // Вычисляем время начала найденного фрагмента
            const fragmentStartTime = bufferStartTime + i * unitLengthMs;
            return new Date(fragmentStartTime);
        }
    }

    // Если не нашли доступный фрагмент в будущем, возвращаем null
    return null;
};

/**
 * Проверяет, доступен ли фрагмент для указанного времени
 * @param time Время для проверки
 * @param fragments Массив с наличием фрагментов
 * @param fragmentsBufferRange Диапазон буферизованных фрагментов
 * @param unitLengthSeconds Длина единицы времени в секундах
 * @returns true, если фрагмент доступен
 */
export const isFragmentAvailable = (
    time: Date,
    fragments: number[],
    fragmentsBufferRange: TimeRange,
    unitLengthSeconds: number
): boolean => {
    if (fragments.length === 0) {
        return false;
    }

    const unitLengthMs = unitLengthSeconds * 1000;
    const bufferStartTime = fragmentsBufferRange.start.getTime();
    const bufferEndTime = fragmentsBufferRange.end.getTime();
    const timeMs = time.getTime();

    // Проверяем, что время находится в диапазоне буферизованных фрагментов
    if (timeMs < bufferStartTime || timeMs > bufferEndTime) {
        return false;
    }

    // Вычисляем индекс фрагмента
    const fragmentIndex = Math.floor((timeMs - bufferStartTime) / unitLengthMs);

    // Проверяем границы массива
    if (fragmentIndex < 0 || fragmentIndex >= fragments.length) {
        return false;
    }

    return fragments[fragmentIndex] > 0;
};
