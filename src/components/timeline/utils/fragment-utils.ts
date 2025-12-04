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

/**
 * Находит ближайший отображаемый фрагмент для указанного времени (используется при включенном фильтре)
 * @param clickedTime Время клика
 * @param fragments Массив с наличием фрагментов
 * @param fragmentsBufferRange Диапазон буферизованных фрагментов
 * @param unitLengthSeconds Длина единицы времени в секундах
 * @returns Время ближайшего отображаемого фрагмента или null, если не найден
 */
export const findNearestVisibleFragment = (
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

    // Если фрагмент для clicked time отображается (fragments[i] > 0), возвращаем clicked time
    if (fragments[clickedFragmentIndex] > 0) {
        return clickedTime;
    }

    // Ищем ближайший отображаемый фрагмент в будущем
    for (let i = clickedFragmentIndex + 1; i < fragments.length; i++) {
        if (fragments[i] > 0) {
            // Вычисляем время начала найденного фрагмента
            const fragmentStartTime = bufferStartTime + i * unitLengthMs;
            return new Date(fragmentStartTime);
        }
    }

    // Если не нашли отображаемый фрагмент в будущем, возвращаем null
    return null;
};

/**
 * Проверяет, есть ли отображаемые фреймы в ближайшие N секунд от указанного времени
 * @param time Время для проверки
 * @param fragments Массив с наличием фрагментов
 * @param fragmentsBufferRange Диапазон буферизованных фрагментов
 * @param unitLengthSeconds Длина единицы времени в секундах
 * @param lookAheadSeconds Количество секунд для проверки вперед (по умолчанию 5)
 * @returns true, если есть отображаемые фреймы в ближайшие N секунд
 */
export const hasVisibleFramesInNextSeconds = (
    time: Date,
    fragments: number[],
    fragmentsBufferRange: TimeRange,
    unitLengthSeconds: number,
    lookAheadSeconds: number = 5
): boolean => {
    if (fragments.length === 0) {
        return false;
    }

    const unitLengthMs = unitLengthSeconds * 1000;
    const bufferStartTime = fragmentsBufferRange.start.getTime();
    const timeMs = time.getTime();
    const lookAheadMs = lookAheadSeconds * 1000;
    const checkEndTime = timeMs + lookAheadMs;

    // Проверяем, что время находится в диапазоне буферизованных фрагментов
    if (timeMs < bufferStartTime) {
        return false;
    }

    // Вычисляем индексы фрагментов для проверки
    // Важно: проверяем до конца буфера, даже если checkEndTime выходит за его пределы
    // Это позволяет находить фреймы в расширенном буфере
    const startFragmentIndex = Math.floor((timeMs - bufferStartTime) / unitLengthMs);
    const endFragmentIndex = Math.min(
        fragments.length - 1,
        Math.floor((checkEndTime - bufferStartTime) / unitLengthMs)
    );

    // Проверяем границы массива
    if (startFragmentIndex < 0 || startFragmentIndex >= fragments.length) {
        return false;
    }

    // Проверяем наличие отображаемых фреймов в диапазоне
    // Если checkEndTime выходит за пределы буфера, проверяем до конца массива фрагментов
    const maxIndexToCheck = Math.min(endFragmentIndex, fragments.length - 1);
    for (let i = startFragmentIndex; i <= maxIndexToCheck; i++) {
        if (fragments[i] > 0) {
            return true;
        }
    }

    return false;
};

/**
 * Находит следующий отображаемый фрейм после указанного времени
 * @param time Время для поиска
 * @param fragments Массив с наличием фрагментов
 * @param fragmentsBufferRange Диапазон буферизованных фрагментов
 * @param unitLengthSeconds Длина единицы времени в секундах
 * @returns Время следующего отображаемого фрейма или null, если не найден
 */
export const findNextVisibleFrame = (
    time: Date,
    fragments: number[],
    fragmentsBufferRange: TimeRange,
    unitLengthSeconds: number
): Date | null => {
    if (fragments.length === 0) {
        return null;
    }

    const unitLengthMs = unitLengthSeconds * 1000;
    const bufferStartTime = fragmentsBufferRange.start.getTime();
    const bufferEndTime = fragmentsBufferRange.end.getTime();
    const timeMs = time.getTime();

    // Вычисляем индекс фрагмента для указанного времени
    // Если время до начала буфера, начинаем с начала массива
    // Если время после конца буфера, возвращаем null (нет данных дальше)
    let fragmentIndex: number;
    if (timeMs < bufferStartTime) {
        // Если время до начала буфера, ищем первый отображаемый фрейм в массиве
        for (let i = 0; i < fragments.length; i++) {
            if (fragments[i] > 0) {
                const fragmentStartTime = bufferStartTime + i * unitLengthMs;
                return new Date(fragmentStartTime);
            }
        }
        return null;
    }

    if (timeMs > bufferEndTime) {
        // Время после конца буфера - проверяем, есть ли данные в массиве дальше
        // Это может произойти, если fragmentsBufferRange не включает все загруженные данные
        // В этом случае ищем в конце массива
        const lastPossibleIndex = fragments.length - 1;
        if (lastPossibleIndex >= 0 && fragments[lastPossibleIndex] > 0) {
            const fragmentStartTime = bufferStartTime + lastPossibleIndex * unitLengthMs;
            // Проверяем, что найденный фрейм действительно после указанного времени
            if (fragmentStartTime > timeMs) {
                return new Date(fragmentStartTime);
            }
        }
        return null;
    }

    // Вычисляем индекс фрагмента для указанного времени
    fragmentIndex = Math.floor((timeMs - bufferStartTime) / unitLengthMs);

    // Проверяем границы массива
    if (fragmentIndex < 0) {
        fragmentIndex = 0;
    }
    if (fragmentIndex >= fragments.length) {
        return null;
    }

    // Ищем следующий отображаемый фрейм после указанного времени
    // Ищем во всем массиве fragments, чтобы найти все доступные фреймы
    // Начинаем со следующего индекса, так как нужно найти следующий фрейм после текущего времени
    for (let i = fragmentIndex + 1; i < fragments.length; i++) {
        if (fragments[i] > 0) {
            const fragmentStartTime = bufferStartTime + i * unitLengthMs;
            return new Date(fragmentStartTime);
        }
    }

    return null;
};
