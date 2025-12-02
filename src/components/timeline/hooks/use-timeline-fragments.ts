/**
 * Хук для управления фрагментами временной шкалы
 */
import {useState, useRef, useCallback, useMemo, useEffect} from 'react';
import {getFramesTimeline} from '../../../utils/api';
import {TimeRange, LoadQueueItem, TimelineFragmentsParams, FragmentTimeRange} from '../types';
import {BUFFER_SCREENS, UNIT_LENGTHS} from '../utils/constants';
import {useTimelineAuth} from '../../../context/timeline-auth-context';
import {Protocol} from '../../../utils/types';
import {TimelineMotionFilter} from '../../../types/motion-filter';
import {buildRequestUrl} from '../../../utils/url-builder';
import {getAuthToken} from '../../../utils/getAuthToken';
import {startOfDay, endOfDay, addDays, format} from 'date-fns';

interface MotionTimelineRequest {
    start: Date;
    end: Date;
    zoomIndex: number;
    xhr?: XMLHttpRequest;
}

/**
 * Хук для управления фрагментами временной шкалы
 * @param params Параметры для загрузки фрагментов
 * @returns Состояние фрагментов и методы для управления ими
 */
export const useTimelineFragments = (
    params: TimelineFragmentsParams & {
        protocol?: Protocol;
        motionFilter?: TimelineMotionFilter | null;
        visibleTimeRange?: TimeRange | null;
        serverTime?: Date | null;
    }
) => {
    const {
        url,
        port,
        credentials,
        camera,
        protocol,
        proxy,
        motionFilter,
        motionFilterSignature,
        visibleTimeRange,
        serverTime
    } = params;
    const {setTimelineAccess} = useTimelineAuth();

    // Массив с наличием фрагментов
    const [fragments, setFragments] = useState<number[]>([]);

    // Буферизованный диапазон фрагментов
    const [fragmentsBufferRange, setFragmentsBufferRange] = useState<TimeRange>(() => ({
        start: new Date(0), // Устанавливаем невалидный диапазон, чтобы гарантировать загрузку
        end: new Date(0)
    }));

    // Состояние загрузки фрагментов
    const [isLoadingFragments, setIsLoadingFragments] = useState(false);
    // Очередь загрузки фрагментов
    const loadQueue = useRef<LoadQueueItem | null>(null);
    const lastAppliedFilterSignatureRef = useRef<string | null>(null);
    const activeRequestRef = useRef<(LoadQueueItem & {filterSignature: string | null}) | null>(null);

    // Старые refs для motion timeline (больше не используются, но оставлены для совместимости с resetFragments)
    const motionTimelineQueueRef = useRef<MotionTimelineRequest[]>([]);
    const isProcessingMotionQueueRef = useRef<boolean>(false);
    const motionTimelineResultsRef = useRef<Map<string, number[]>>(new Map());
    const loadedRangeRef = useRef<{start: Date; end: Date} | null>(null);

    // Хранилище загруженных данных по дням для обычных фреймов (без фильтров)
    // Ключ: строка с датой начала дня в формате 'YYYY-MM-DD', значение: массив фреймов (unit_len=1, посекундно)
    const framesDataByDayRef = useRef<Map<string, number[]>>(new Map());
    // Set для отслеживания дней, которые уже запрашиваются
    const loadingDaysRef = useRef<Set<string>>(new Set());
    // Хранилище загруженных данных по дням для motion filter (посекундно)
    const motionDataByDayRef = useRef<Map<string, number[]>>(new Map());
    // Set для отслеживания дней motion filter, которые уже запрашиваются
    const loadingMotionDaysRef = useRef<Set<string>>(new Set());
    // Ref для отслеживания диапазона запросов в очереди
    const queuedRangeRef = useRef<{start: Date; end: Date} | null>(null);
    // Ref для debounce таймера
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Ref для текущего диапазона буфера motion timeline (для обновления fragments) - больше не используется
    const currentMotionBufferRef = useRef<{start: Date; end: Date; zoomIndex: number} | null>(null);
    // Ref для debounce таймера loadFragments (для motion filter)
    const loadFragmentsDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Задержка для debounce (мс) - после окончания взаимодействия
    const DEBOUNCE_DELAY = 1000;
    // Флаг инициализации - используется для предотвращения множественных загрузок при старте
    const isInitialLoadCompletedRef = useRef(false);

    /**
     * Получает ключ дня из даты (строка в формате 'YYYY-MM-DD')
     */
    const getDayKey = useCallback((date: Date): string => {
        return format(startOfDay(date), 'yyyy-MM-dd');
    }, []);

    /**
     * Преобразует данные из секундных (unit_len=1) в нужный масштаб
     * @param secondData Данные посекундно (unit_len=1)
     * @param targetUnitLength Целевая длина единицы времени в секундах
     * @param dayStart Начало дня
     * @param rangeStart Начало нужного диапазона
     * @param rangeEnd Конец нужного диапазона
     * @returns Преобразованные данные для нужного диапазона
     */
    const convertSecondDataToScale = useCallback(
        (
            secondData: number[],
            targetUnitLength: number,
            dayStart: Date,
            rangeStart: Date,
            rangeEnd: Date
        ): number[] => {
            const dayStartTime = dayStart.getTime();
            const rangeStartTime = rangeStart.getTime();
            const rangeEndTime = rangeEnd.getTime();

            // Вычисляем индексы в секундных данных
            const startIndex = Math.max(0, Math.floor((rangeStartTime - dayStartTime) / 1000));
            const endIndex = Math.min(secondData.length, Math.ceil((rangeEndTime - dayStartTime) / 1000));

            // Если нужен масштаб 1 секунда, просто возвращаем нужный диапазон
            if (targetUnitLength === 1) {
                return secondData.slice(startIndex, endIndex);
            }

            // Преобразуем в нужный масштаб: группируем секунды в единицы нужной длины
            const result: number[] = [];
            const unitsInDay = Math.floor((endIndex - startIndex) / targetUnitLength);
            const remainder = (endIndex - startIndex) % targetUnitLength;

            for (let i = 0; i < unitsInDay; i++) {
                const unitStart = startIndex + i * targetUnitLength;
                const unitEnd = unitStart + targetUnitLength;
                // Если хотя бы одна секунда в единице имеет фрейм, то единица имеет фрейм
                let hasFrame = false;
                for (let j = unitStart; j < unitEnd && j < endIndex; j++) {
                    if (secondData[j] === 1 || secondData[j] > 0) {
                        hasFrame = true;
                        break;
                    }
                }
                result.push(hasFrame ? 1 : 0);
            }

            // Обрабатываем остаток, если есть
            if (remainder > 0) {
                const unitStart = startIndex + unitsInDay * targetUnitLength;
                let hasFrame = false;
                for (let j = unitStart; j < endIndex; j++) {
                    if (secondData[j] === 1 || secondData[j] > 0) {
                        hasFrame = true;
                        break;
                    }
                }
                result.push(hasFrame ? 1 : 0);
            }

            return result;
        },
        []
    );

    /**
     * Объединяет данные по дням для видимого диапазона и преобразует в нужный масштаб
     */
    const mergeDaysDataForRange = useCallback(
        (rangeStart: Date, rangeEnd: Date, zoomIndex: number): {timeline: number[]; bufferRange: TimeRange} => {
            const targetUnitLength = UNIT_LENGTHS[zoomIndex];
            const result: number[] = [];
            let bufferRangeStart: Date | null = null;
            let bufferRangeEnd: Date | null = null;

            // Проходим по всем дням в диапазоне
            let currentDay = startOfDay(rangeStart);
            const endDay = startOfDay(rangeEnd);

            while (currentDay.getTime() <= endDay.getTime()) {
                const dayKey = getDayKey(currentDay);
                const dayData = framesDataByDayRef.current.get(dayKey);

                if (dayData) {
                    const dayStart = startOfDay(currentDay);
                    const dayEnd = endOfDay(currentDay);
                    const dayRangeStart = currentDay.getTime() === dayStart.getTime() ? rangeStart : dayStart;
                    const dayRangeEnd =
                        endDay.getTime() === currentDay.getTime() && rangeEnd.getTime() <= dayEnd.getTime()
                            ? rangeEnd
                            : dayEnd;

                    const convertedData = convertSecondDataToScale(
                        dayData,
                        targetUnitLength,
                        dayStart,
                        dayRangeStart,
                        dayRangeEnd
                    );

                    result.push(...convertedData);

                    if (bufferRangeStart === null) {
                        bufferRangeStart = dayRangeStart;
                    }
                    bufferRangeEnd = dayRangeEnd;
                } else {
                    // Если данных нет для дня, заполняем нулями
                    const dayStart = startOfDay(currentDay);
                    const dayEnd = endOfDay(currentDay);
                    const dayRangeStart = currentDay.getTime() === dayStart.getTime() ? rangeStart : dayStart;
                    const dayRangeEnd =
                        endDay.getTime() === currentDay.getTime() && rangeEnd.getTime() <= dayEnd.getTime()
                            ? rangeEnd
                            : dayEnd;

                    const duration = dayRangeEnd.getTime() - dayRangeStart.getTime();
                    const units = Math.ceil(duration / (targetUnitLength * 1000));
                    // Используем более безопасный способ добавления элементов для больших массивов
                    for (let i = 0; i < units; i++) {
                        result.push(0);
                    }

                    if (bufferRangeStart === null) {
                        bufferRangeStart = dayRangeStart;
                    }
                    bufferRangeEnd = dayRangeEnd;
                }

                currentDay = addDays(currentDay, 1);
            }

            return {
                timeline: result,
                bufferRange: {
                    start: bufferRangeStart || rangeStart,
                    end: bufferRangeEnd || rangeEnd
                }
            };
        },
        [getDayKey, convertSecondDataToScale]
    );

    /**
     * Определяет, какие дни нужно загрузить для видимого диапазона
     */
    const getDaysToLoad = useCallback(
        (rangeStart: Date, rangeEnd: Date): Date[] => {
            const daysToLoad: Date[] = [];
            let currentDay = startOfDay(rangeStart);
            const endDay = startOfDay(rangeEnd);

            while (currentDay.getTime() <= endDay.getTime()) {
                const dayKey = getDayKey(currentDay);
                const hasData = framesDataByDayRef.current.has(dayKey);
                const isLoading = loadingDaysRef.current.has(dayKey);

                if (!hasData && !isLoading) {
                    daysToLoad.push(currentDay);
                }

                currentDay = addDays(currentDay, 1);
            }

            return daysToLoad;
        },
        [getDayKey]
    );

    /**
     * Определяет, какие дни нужно загрузить для motion filter
     */
    const getMotionDaysToLoad = useCallback(
        (rangeStart: Date, rangeEnd: Date): Date[] => {
            const daysToLoad: Date[] = [];
            let currentDay = startOfDay(rangeStart);
            const endDay = startOfDay(rangeEnd);

            while (currentDay.getTime() <= endDay.getTime()) {
                const dayKey = getDayKey(currentDay);
                const hasData = motionDataByDayRef.current.has(dayKey);
                const isLoading = loadingMotionDaysRef.current.has(dayKey);

                if (!hasData && !isLoading) {
                    daysToLoad.push(currentDay);
                }

                currentDay = addDays(currentDay, 1);
            }

            return daysToLoad;
        },
        [getDayKey]
    );

    /**
     * Объединяет данные motion filter по дням для видимого диапазона и преобразует в нужный масштаб
     */
    const mergeMotionDaysDataForRange = useCallback(
        (rangeStart: Date, rangeEnd: Date, zoomIndex: number): {timeline: number[]; bufferRange: TimeRange} => {
            const targetUnitLength = UNIT_LENGTHS[zoomIndex];
            const result: number[] = [];
            let bufferRangeStart: Date | null = null;
            let bufferRangeEnd: Date | null = null;

            // Проходим по всем дням в диапазоне
            let currentDay = startOfDay(rangeStart);
            const endDay = startOfDay(rangeEnd);

            while (currentDay.getTime() <= endDay.getTime()) {
                const dayKey = getDayKey(currentDay);
                const dayData = motionDataByDayRef.current.get(dayKey);

                if (dayData) {
                    const dayStart = startOfDay(currentDay);
                    const dayEnd = endOfDay(currentDay);
                    const dayRangeStart = currentDay.getTime() === dayStart.getTime() ? rangeStart : dayStart;
                    const dayRangeEnd =
                        endDay.getTime() === currentDay.getTime() && rangeEnd.getTime() <= dayEnd.getTime()
                            ? rangeEnd
                            : dayEnd;

                    const convertedData = convertSecondDataToScale(
                        dayData,
                        targetUnitLength,
                        dayStart,
                        dayRangeStart,
                        dayRangeEnd
                    );

                    result.push(...convertedData);

                    if (bufferRangeStart === null) {
                        bufferRangeStart = dayRangeStart;
                    }
                    bufferRangeEnd = dayRangeEnd;
                } else {
                    // Если данных нет для дня, заполняем нулями
                    const dayStart = startOfDay(currentDay);
                    const dayEnd = endOfDay(currentDay);
                    const dayRangeStart = currentDay.getTime() === dayStart.getTime() ? rangeStart : dayStart;
                    const dayRangeEnd =
                        endDay.getTime() === currentDay.getTime() && rangeEnd.getTime() <= dayEnd.getTime()
                            ? rangeEnd
                            : dayEnd;

                    const duration = dayRangeEnd.getTime() - dayRangeStart.getTime();
                    const units = Math.ceil(duration / (targetUnitLength * 1000));
                    // Используем более безопасный способ добавления элементов для больших массивов
                    for (let i = 0; i < units; i++) {
                        result.push(0);
                    }

                    if (bufferRangeStart === null) {
                        bufferRangeStart = dayRangeStart;
                    }
                    bufferRangeEnd = dayRangeEnd;
                }

                currentDay = addDays(currentDay, 1);
            }

            return {
                timeline: result,
                bufferRange: {
                    start: bufferRangeStart || rangeStart,
                    end: bufferRangeEnd || rangeEnd
                }
            };
        },
        [getDayKey, convertSecondDataToScale]
    );

    // Вычисляем диапазоны времени для каждого фрагмента
    const fragmentRanges = useMemo((): FragmentTimeRange[] => {
        if (!fragments || fragments.length === 0 || fragmentsBufferRange.start.getTime() === 0) {
            return [];
        }

        const ranges: FragmentTimeRange[] = [];
        // Получаем текущий intervalIndex из loadQueue или используем 0 по умолчанию
        const currentIntervalIndex = loadQueue.current?.zoomIndex ?? 0;
        const unitLength = UNIT_LENGTHS[currentIntervalIndex];

        let currentFragmentStart: number | null = null;

        for (let i = 0; i < fragments.length; i++) {
            if (fragments[i] === 1) {
                // Начало фрагмента
                if (currentFragmentStart === null) {
                    currentFragmentStart = i;
                }
            } else if (fragments[i] === 0 && currentFragmentStart !== null) {
                // Конец фрагмента
                const fragmentStartTime = new Date(
                    fragmentsBufferRange.start.getTime() + currentFragmentStart * unitLength * 1000
                );
                const fragmentEndTime = new Date(fragmentsBufferRange.start.getTime() + i * unitLength * 1000);

                ranges.push({
                    start: fragmentStartTime,
                    end: fragmentEndTime
                });

                currentFragmentStart = null;
            }
        }

        // Обрабатываем случай, когда фрагмент заканчивается в конце массива
        if (currentFragmentStart !== null) {
            const fragmentStartTime = new Date(
                fragmentsBufferRange.start.getTime() + currentFragmentStart * unitLength * 1000
            );
            const fragmentEndTime = new Date(
                fragmentsBufferRange.start.getTime() + fragments.length * unitLength * 1000
            );

            ranges.push({
                start: fragmentStartTime,
                end: fragmentEndTime
            });
        }

        return ranges;
    }, [fragments, fragmentsBufferRange]);

    // Старая функция разбиения на блоки (больше не используется)
    // const splitIntoTimeBlocks = ...

    // Старые функции motion timeline queue processing (больше не используются)
    // Удалены: mergeMotionTimelineResults, stopProcessingQueue, cleanQueueOutOfRange,
    // getMissingIntervals, getMissingIntervalsFromQueue, updateQueuedRange,
    // isBlockLoaded, processMotionTimelineQueue

    /**
     * Останавливает выполнение запросов из очереди (упрощенная версия для совместимости)
     */
    const stopProcessingQueue = useCallback(() => {
        // Очищаем debounce таймеры
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (loadFragmentsDebounceTimerRef.current) {
            clearTimeout(loadFragmentsDebounceTimerRef.current);
            loadFragmentsDebounceTimerRef.current = null;
        }
    }, []);

    /**
     * Загружает данные для одного дня (unit_len=1, посекундно)
     */
    const loadDayData = useCallback(
        async (day: Date, endTime?: Date): Promise<void> => {
            const dayKey = getDayKey(day);

            // Проверяем, не загружается ли уже этот день
            if (loadingDaysRef.current.has(dayKey)) {
                console.log('loadDayData: день уже загружается, пропускаем', dayKey);
                return;
            }

            // Проверяем, не загружен ли уже этот день
            if (framesDataByDayRef.current.has(dayKey)) {
                console.log('loadDayData: день уже загружен, пропускаем', dayKey);
                return;
            }

            // Сразу добавляем в loadingDays ДО любых async операций
            loadingDaysRef.current.add(dayKey);
            console.log('loadDayData: начинаем загрузку дня', dayKey);

            try {
                const dayStart = startOfDay(day);
                const nextDayStart = startOfDay(addDays(day, 1));
                // Используем endOfDay для получения конца текущего дня (23:59:59.999)
                // Если передан endTime и он меньше начала следующего дня, используем его
                const dayEnd = endTime && endTime.getTime() < nextDayStart.getTime() ? endTime : endOfDay(day);

                // Дополнительная проверка: если диапазон пустой или некорректный, пропускаем
                if (dayEnd.getTime() <= dayStart.getTime()) {
                    console.warn('loadDayData: некорректный диапазон, пропускаем', {
                        dayKey,
                        dayStart: dayStart.toISOString(),
                        dayEnd: dayEnd.toISOString()
                    });
                    return;
                }

                console.log('loadDayData: отправляем запрос', {
                    dayKey,
                    dayStart: dayStart.toISOString(),
                    dayEnd: dayEnd.toISOString()
                });

                const response = await getFramesTimeline({
                    startTime: dayStart,
                    endTime: dayEnd,
                    url,
                    port,
                    credentials,
                    unitLength: 1, // Всегда unit_len=1
                    stream: 'video',
                    channel: camera,
                    protocol,
                    proxy
                });

                // Сохраняем данные по дню
                framesDataByDayRef.current.set(dayKey, response.timeline);
                console.log('loadDayData: загружены данные для дня', {
                    day: dayKey,
                    timelineLength: response.timeline.length,
                    start: dayStart.toISOString(),
                    end: dayEnd.toISOString()
                });
            } catch (error) {
                console.error('loadDayData: ошибка при загрузке дня', error);
                if (error instanceof Error && error.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                }
            } finally {
                loadingDaysRef.current.delete(dayKey);
            }
        },
        [url, port, credentials, camera, protocol, proxy, getDayKey, setTimelineAccess]
    );

    /**
     * Загружает данные motion filter для одного дня (unit_len=1, посекундно)
     */
    const loadMotionDayData = useCallback(
        async (day: Date): Promise<void> => {
            const dayKey = getDayKey(day);

            // Проверяем, не загружается ли уже этот день
            if (loadingMotionDaysRef.current.has(dayKey)) {
                console.log('loadMotionDayData: день уже загружается, пропускаем', dayKey);
                return;
            }

            // Проверяем, не загружен ли уже этот день
            if (motionDataByDayRef.current.has(dayKey)) {
                console.log('loadMotionDayData: день уже загружен, пропускаем', dayKey);
                return;
            }

            // Сразу добавляем в loadingMotionDays ДО любых async операций
            loadingMotionDaysRef.current.add(dayKey);
            console.log('loadMotionDayData: начинаем загрузку дня', dayKey);

            try {
                const dayStart = startOfDay(day);
                const dayEnd = endOfDay(day);
                const now = Date.now();

                // Ограничиваем конец дня текущим временем, если день - сегодня
                const actualDayEnd = dayEnd.getTime() > now ? new Date(now) : dayEnd;

                // Дополнительная проверка: если диапазон пустой или некорректный, пропускаем
                if (actualDayEnd.getTime() <= dayStart.getTime()) {
                    console.warn('loadMotionDayData: некорректный диапазон, пропускаем', {
                        dayKey,
                        dayStart: dayStart.toISOString(),
                        dayEnd: actualDayEnd.toISOString()
                    });
                    return;
                }

                console.log('loadMotionDayData: отправляем запрос', {
                    dayKey,
                    dayStart: dayStart.toISOString(),
                    dayEnd: actualDayEnd.toISOString()
                });

                // Создаем XHR для motion timeline request
                const xhr = new XMLHttpRequest();
                const response = await new Promise<{timeline: number[]}>((resolve, reject) => {
                    const rpcUrl = buildRequestUrl({
                        host: url,
                        port,
                        protocol: protocol ?? 'http',
                        proxy,
                        path: proxy
                            ? '/rpc'
                            : `/rpc?authorization=Basic ${getAuthToken(credentials)}&content-type=application/json`
                    });

                    xhr.open('POST', rpcUrl, true);

                    if (proxy) {
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.setRequestHeader('Authorization', `Basic ${getAuthToken(credentials)}`);
                    }

                    xhr.onload = function () {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const data = JSON.parse(xhr.responseText);
                                if (data.error && data.error.type === 'auth' && data.error.message === 'forbidden') {
                                    reject(new Error('FORBIDDEN'));
                                    return;
                                }
                                resolve(data.result);
                            } catch (parseError) {
                                reject(new Error('Failed to parse motion timeline data'));
                            }
                        } else {
                            reject(new Error('Failed to fetch motion timeline data'));
                        }
                    };

                    xhr.onerror = function () {
                        reject(new Error('Failed to fetch motion timeline data'));
                    };

                    xhr.onabort = function () {
                        reject(new Error('Request aborted'));
                    };

                    // Определяем метод API и параметры фильтра в зависимости от типа фильтра
                    const hasTypes = motionFilter?.types && motionFilter.types.length > 0;
                    const apiMethod = hasTypes ? 'archive.get_objects_timeline' : 'archive.get_motions_timeline';

                    // Формируем параметры фильтра: для объектов передаем types и mask, для движения - весь фильтр
                    const filterParam = hasTypes
                        ? {
                              types: motionFilter.types,
                              ...(motionFilter.mask && {mask: motionFilter.mask})
                          }
                        : motionFilter;

                    const version = hasTypes ? 71 : 13;

                    xhr.send(
                        JSON.stringify({
                            method: apiMethod,
                            params: {
                                start_time: [
                                    dayStart.getFullYear(),
                                    dayStart.getMonth() + 1,
                                    dayStart.getDate(),
                                    dayStart.getHours(),
                                    dayStart.getMinutes(),
                                    dayStart.getSeconds()
                                ],
                                end_time: [
                                    actualDayEnd.getFullYear(),
                                    actualDayEnd.getMonth() + 1,
                                    actualDayEnd.getDate(),
                                    actualDayEnd.getHours(),
                                    actualDayEnd.getMinutes(),
                                    actualDayEnd.getSeconds()
                                ],
                                unit_len: 1, // Всегда загружаем посекундно
                                channel: camera,
                                stream: 'video',
                                filter: filterParam
                            },
                            version
                        })
                    );
                });

                // Сохраняем данные по дню
                motionDataByDayRef.current.set(dayKey, response.timeline);
                console.log('loadMotionDayData: загружены данные для дня', {
                    day: dayKey,
                    timelineLength: response.timeline.length,
                    start: dayStart.toISOString(),
                    end: actualDayEnd.toISOString()
                });
            } catch (error) {
                console.error('loadMotionDayData: ошибка при загрузке дня', error);
                if (error instanceof Error && error.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                }
            } finally {
                loadingMotionDaysRef.current.delete(dayKey);
            }
        },
        [url, port, credentials, camera, protocol, proxy, getDayKey, setTimelineAccess, motionFilter]
    );

    /**
     * Функция для запуска загрузки из очереди
     */
    const processLoadQueue = useCallback(async (): Promise<void> => {
        if (isLoadingFragments || !loadQueue.current) {
            return;
        }

        const {start, end, zoomIndex} = loadQueue.current;
        loadQueue.current = null;
        setIsLoadingFragments(true);
        try {
            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            activeRequestRef.current = {
                start,
                end,
                zoomIndex,
                filterSignature: motionFilterSignature ?? null
            };

            if (motionFilter) {
                // Новая логика для motion filter: используем per-day per-second подход
                if (!visibleTimeRange) {
                    console.warn('use-timeline-fragments: visibleTimeRange не определен для motion timeline');
                    setIsLoadingFragments(false);
                    activeRequestRef.current = null;
                    return;
                }

                // Ограничиваем максимальную границу реальным текущим временем
                const now = Date.now();
                let actualBufferEnd = bufferEnd;
                if (actualBufferEnd.getTime() > now) {
                    actualBufferEnd = new Date(now);
                }

                console.log('processLoadQueue (motion): загружаем для диапазона', {
                    bufferStart: bufferStart.toISOString(),
                    actualBufferEnd: actualBufferEnd.toISOString(),
                    zoomIndex
                });

                // Проверяем, какие дни нужно загрузить
                const daysToLoad = getMotionDaysToLoad(bufferStart, actualBufferEnd);

                console.log('processLoadQueue (motion): days to load', {
                    bufferStart: bufferStart.toISOString(),
                    actualBufferEnd: actualBufferEnd.toISOString(),
                    daysToLoad: daysToLoad.map(d => d.toISOString()),
                    loadedDays: Array.from(motionDataByDayRef.current.keys()),
                    loadingDays: Array.from(loadingMotionDaysRef.current)
                });

                // Всегда обновляем отображение с текущими данными (даже если не все дни загружены)
                const mergedData = mergeMotionDaysDataForRange(bufferStart, actualBufferEnd, zoomIndex);
                setFragments(mergedData.timeline);
                setFragmentsBufferRange(mergedData.bufferRange);
                lastAppliedFilterSignatureRef.current = motionFilterSignature ?? null;

                // Если есть дни для загрузки, запускаем загрузку
                if (daysToLoad.length > 0) {
                    console.log(
                        'processLoadQueue (motion): starting to load days',
                        daysToLoad.map(d => d.toISOString())
                    );

                    Promise.all(daysToLoad.map(day => loadMotionDayData(day))).then(() => {
                        // После загрузки обновляем отображение
                        console.log('processLoadQueue (motion): days loaded, updating display');
                        const updatedData = mergeMotionDaysDataForRange(bufferStart, actualBufferEnd, zoomIndex);
                        setFragments(updatedData.timeline);
                        setFragmentsBufferRange(updatedData.bufferRange);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load fragments:', error);

            if (error instanceof Error && error.message === 'FORBIDDEN') {
                setTimelineAccess(false);
                return;
            }
        } finally {
            setIsLoadingFragments(false);
            activeRequestRef.current = null;
            // Если в очереди появился новый запрос, обрабатываем его
            if (loadQueue.current) {
                processLoadQueue();
            }
        }
    }, [
        isLoadingFragments,
        motionFilter,
        motionFilterSignature,
        setTimelineAccess,
        visibleTimeRange,
        getMotionDaysToLoad,
        mergeMotionDaysDataForRange,
        loadMotionDayData
    ]);

    /**
     * Функция для добавления запроса в очередь
     */
    const loadFragments = useCallback(
        (start: Date, end: Date, zoomIndex: number = 0) => {
            console.log('loadFragments called:', {
                start: start.toISOString(),
                end: end.toISOString(),
                zoomIndex,
                motionFilter: !!motionFilter,
                isInitialLoadCompleted: isInitialLoadCompletedRef.current
            });

            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            if (motionFilter) {
                // Для motion filter используем новую логику с per-day загрузкой
                const currentBufferStart = fragmentsBufferRange.start.getTime();
                const currentBufferEnd = fragmentsBufferRange.end.getTime();

                // Проверяем только базовые условия
                const isSameRange =
                    currentBufferStart === bufferStart.getTime() &&
                    currentBufferEnd === bufferEnd.getTime() &&
                    currentBufferStart !== 0 &&
                    lastAppliedFilterSignatureRef.current === (motionFilterSignature ?? null);

                if (isSameRange && !isLoadingFragments) {
                    console.log('loadFragments (motion): same range, skipping');
                    return;
                }

                const activeRequest = activeRequestRef.current;
                if (
                    activeRequest &&
                    activeRequest.start.getTime() === start.getTime() &&
                    activeRequest.end.getTime() === end.getTime() &&
                    activeRequest.zoomIndex === zoomIndex &&
                    activeRequest.filterSignature === (motionFilterSignature ?? null)
                ) {
                    console.log('loadFragments (motion): same active request, skipping');
                    return;
                }

                // Добавляем запрос в очередь
                loadQueue.current = {start, end, zoomIndex};

                // Запускаем обработку очереди с debounce
                if (loadFragmentsDebounceTimerRef.current) {
                    clearTimeout(loadFragmentsDebounceTimerRef.current);
                }
                loadFragmentsDebounceTimerRef.current = setTimeout(() => {
                    loadFragmentsDebounceTimerRef.current = null;
                    processLoadQueue();
                }, DEBOUNCE_DELAY);
            } else {
                // Для обычных фреймов (без motion filter) используем per-day загрузку

                // Если начальная загрузка еще не завершена, не обрабатываем запрос
                if (!isInitialLoadCompletedRef.current) {
                    console.log('loadFragments: начальная загрузка не завершена, пропускаем');
                    return;
                }

                // Проверяем, есть ли данные для всех дней в буферном диапазоне
                const daysToLoad = getDaysToLoad(bufferStart, bufferEnd);

                console.log('loadFragments: days to load', {
                    bufferStart: bufferStart.toISOString(),
                    bufferEnd: bufferEnd.toISOString(),
                    daysToLoad: daysToLoad.map(d => d.toISOString()),
                    loadedDays: Array.from(framesDataByDayRef.current.keys()),
                    loadingDays: Array.from(loadingDaysRef.current)
                });

                // Всегда обновляем отображение с текущими данными
                const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, zoomIndex);
                setFragments(mergedData.timeline);
                setFragmentsBufferRange(mergedData.bufferRange);

                // Если все дни уже загружены или загружаются, просто возвращаемся
                if (daysToLoad.length === 0) {
                    console.log('loadFragments: no days to load, returning');
                    return;
                }

                // Запускаем загрузку дней параллельно
                console.log(
                    'loadFragments: starting to load days',
                    daysToLoad.map(d => d.toISOString())
                );
                Promise.all(daysToLoad.map(day => loadDayData(day))).then(() => {
                    // После загрузки обновляем отображение
                    console.log('loadFragments: days loaded, updating display');
                    const updatedData = mergeDaysDataForRange(bufferStart, bufferEnd, zoomIndex);
                    setFragments(updatedData.timeline);
                    setFragmentsBufferRange(updatedData.bufferRange);
                });
            }
        },
        [
            processLoadQueue,
            fragmentsBufferRange,
            motionFilterSignature,
            isLoadingFragments,
            motionFilter,
            getDaysToLoad,
            mergeDaysDataForRange,
            loadDayData
        ]
    );

    /**
     * Функция для сброса фрагментов
     */
    const resetFragments = useCallback(() => {
        setFragments([]);
        setFragmentsBufferRange({
            start: new Date(0), // Устанавливаем невалидный диапазон, чтобы гарантировать перезагрузку
            end: new Date(0)
        });
        lastAppliedFilterSignatureRef.current = null;
        motionTimelineQueueRef.current = [];
        motionTimelineResultsRef.current.clear();
        isProcessingMotionQueueRef.current = false;
        loadedRangeRef.current = null; // Очищаем загруженный диапазон
        queuedRangeRef.current = null; // Очищаем диапазон очереди
        currentMotionBufferRef.current = null; // Очищаем текущий буфер
        // НЕ очищаем framesDataByDayRef - данные по дням сохраняем для переиспользования
        // Очищаем только set загрузки дней
        loadingDaysRef.current.clear();
        // Очищаем данные motion filter при сбросе
        motionDataByDayRef.current.clear();
        loadingMotionDaysRef.current.clear();
        // Очищаем debounce таймеры
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (loadFragmentsDebounceTimerRef.current) {
            clearTimeout(loadFragmentsDebounceTimerRef.current);
            loadFragmentsDebounceTimerRef.current = null;
        }
        // Останавливаем активные запросы
        stopProcessingQueue();
    }, [stopProcessingQueue]);

    /**
     * Функция для очистки кэша скачанных фреймов
     * Используется при переключении камеры, чтобы очистить данные предыдущей камеры
     */
    const clearFramesCache = useCallback(() => {
        framesDataByDayRef.current.clear();
        loadingDaysRef.current.clear();
        motionDataByDayRef.current.clear();
        loadingMotionDaysRef.current.clear();
    }, []);

    /**
     * Загружает данные при инициализации плеера: сегодняшний день полностью и предыдущий день полностью
     */
    useEffect(() => {
        // Загружаем только для обычных фреймов (без фильтров)
        if (motionFilter || !serverTime) {
            return;
        }

        const currentDay = startOfDay(serverTime);
        const previousDay = startOfDay(addDays(serverTime, -1));
        const currentDayKey = getDayKey(currentDay);
        const previousDayKey = getDayKey(previousDay);

        // Проверяем, не загружены ли уже эти дни
        const needsCurrentDay =
            !framesDataByDayRef.current.has(currentDayKey) && !loadingDaysRef.current.has(currentDayKey);
        const needsPreviousDay =
            !framesDataByDayRef.current.has(previousDayKey) && !loadingDaysRef.current.has(previousDayKey);

        if (needsCurrentDay || needsPreviousDay) {
            console.log('use-timeline-fragments: загружаем данные при инициализации', {
                currentDay: currentDayKey,
                previousDay: previousDayKey,
                needsCurrentDay,
                needsPreviousDay
            });

            // Загружаем параллельно только недостающие дни
            const loadPromises: Promise<void>[] = [];
            if (needsCurrentDay) {
                loadPromises.push(loadDayData(currentDay));
            }
            if (needsPreviousDay) {
                loadPromises.push(loadDayData(previousDay));
            }

            // После завершения начальной загрузки устанавливаем флаг и обновляем отображение
            Promise.all(loadPromises).then(() => {
                console.log('use-timeline-fragments: начальная загрузка завершена');
                isInitialLoadCompletedRef.current = true;

                // Обновляем отображение фрагментов для текущего видимого диапазона, если он есть
                // Используем setTimeout, чтобы избежать обновления во время рендера
                if (visibleTimeRange) {
                    setTimeout(() => {
                        const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                        const bufferStart = new Date(
                            visibleTimeRange.start.getTime() - screenDuration * BUFFER_SCREENS
                        );
                        const bufferEnd = new Date(visibleTimeRange.end.getTime() + screenDuration * BUFFER_SCREENS);

                        // Получаем текущий zoomIndex из loadQueue или используем 0 по умолчанию
                        const currentZoomIndex = loadQueue.current?.zoomIndex ?? 0;

                        // Обновляем fragments с загруженными данными
                        const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, currentZoomIndex);
                        setFragments([...mergedData.timeline]);
                        setFragmentsBufferRange(mergedData.bufferRange);
                    }, 0);
                }
            });
        } else {
            // Если дни уже загружены, сразу устанавливаем флаг и обновляем отображение
            isInitialLoadCompletedRef.current = true;

            // Обновляем отображение фрагментов для текущего видимого диапазона, если он есть
            // Используем setTimeout, чтобы избежать обновления во время рендера
            if (visibleTimeRange) {
                setTimeout(() => {
                    const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                    const bufferStart = new Date(visibleTimeRange.start.getTime() - screenDuration * BUFFER_SCREENS);
                    const bufferEnd = new Date(visibleTimeRange.end.getTime() + screenDuration * BUFFER_SCREENS);

                    // Получаем текущий zoomIndex из loadQueue или используем 0 по умолчанию
                    const currentZoomIndex = loadQueue.current?.zoomIndex ?? 0;

                    // Обновляем fragments с загруженными данными
                    const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, currentZoomIndex);
                    setFragments(mergedData.timeline);
                    setFragmentsBufferRange(mergedData.bufferRange);
                }, 0);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motionFilter, serverTime]);

    /**
     * Обновляет отображение фрагментов, когда visibleTimeRange становится доступным после загрузки данных
     */
    useEffect(() => {
        // Обновляем только для обычных фреймов (без фильтров) и только если начальная загрузка завершена
        if (motionFilter || !visibleTimeRange || !isInitialLoadCompletedRef.current) {
            return;
        }

        // Проверяем, есть ли загруженные данные для видимого диапазона
        // Используем setTimeout, чтобы избежать обновления во время рендера
        setTimeout(() => {
            const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
            const bufferStart = new Date(visibleTimeRange.start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(visibleTimeRange.end.getTime() + screenDuration * BUFFER_SCREENS);

            // Получаем текущий zoomIndex из loadQueue или используем 0 по умолчанию
            const currentZoomIndex = loadQueue.current?.zoomIndex ?? 0;

            // Обновляем fragments с загруженными данными
            const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, currentZoomIndex);
            setFragments(mergedData.timeline);
            setFragmentsBufferRange(mergedData.bufferRange);
            console.log('use-timeline-fragments: обновлено отображение при появлении visibleTimeRange');
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleTimeRange, motionFilter]);

    // Старый useEffect для очистки motion timeline queue (больше не нужен)

    /**
     * Обрабатывает изменения timeline/zoom - вызывается после окончания взаимодействия
     */
    const handleTimelineChange = useCallback(
        (visibleStart: Date, visibleEnd: Date, zoomIndex?: number) => {
            // Очищаем активный запрос, чтобы не блокировать новые запросы
            activeRequestRef.current = null;

            // Очищаем loadQueue, если старый запрос больше не актуален
            if (loadQueue.current) {
                const queueStart = loadQueue.current.start.getTime();
                const queueEnd = loadQueue.current.end.getTime();
                const screenDuration = visibleEnd.getTime() - visibleStart.getTime();
                const bufferStart = visibleStart.getTime() - screenDuration * BUFFER_SCREENS;
                const bufferEnd = visibleEnd.getTime() + screenDuration * BUFFER_SCREENS;

                // Если старый запрос не пересекается с новым видимым диапазоном (с буфером), очищаем его
                if (
                    queueEnd < bufferStart ||
                    queueStart > bufferEnd ||
                    loadQueue.current.zoomIndex !== (zoomIndex ?? loadQueue.current.zoomIndex)
                ) {
                    loadQueue.current = null;
                }
            }

            // Очищаем таймер loadFragments ДО вызова loadFragments
            const hadTimer = !!loadFragmentsDebounceTimerRef.current;
            if (loadFragmentsDebounceTimerRef.current) {
                clearTimeout(loadFragmentsDebounceTimerRef.current);
                loadFragmentsDebounceTimerRef.current = null;
            }

            // Получаем zoomIndex из параметра или из очереди
            const currentZoomIndex = zoomIndex ?? loadQueue.current?.zoomIndex ?? 0;

            // Вызываем loadFragments для добавления новых запросов
            loadFragments(visibleStart, visibleEnd, currentZoomIndex);

            // Если таймер был очищен, но loadFragments пропустил запрос (уже в очереди),
            // нужно принудительно создать новый таймер для motion filter
            if (
                motionFilter &&
                hadTimer &&
                loadQueue.current &&
                !loadFragmentsDebounceTimerRef.current &&
                !isLoadingFragments
            ) {
                loadFragmentsDebounceTimerRef.current = setTimeout(() => {
                    loadFragmentsDebounceTimerRef.current = null;
                    processLoadQueue();
                }, DEBOUNCE_DELAY);
            }
        },
        [motionFilter, loadFragments, processLoadQueue, isLoadingFragments]
    );

    /**
     * Очистка debounce таймеров при размонтировании
     */
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            if (loadFragmentsDebounceTimerRef.current) {
                clearTimeout(loadFragmentsDebounceTimerRef.current);
                loadFragmentsDebounceTimerRef.current = null;
            }
        };
    }, []);

    return {
        fragments,
        fragmentsBufferRange,
        fragmentRanges,
        isLoadingFragments,
        loadFragments,
        resetFragments,
        clearFramesCache,
        handleTimelineChange
    };
};
