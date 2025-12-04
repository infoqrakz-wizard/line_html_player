/**
 * Хук для управления фрагментами временной шкалы
 */
import {useState, useRef, useCallback, useMemo, useEffect} from 'react';
import {getFramesTimeline} from '../../../utils/api';
import {TimeRange, TimelineFragmentsParams, FragmentTimeRange} from '../types';
import {BUFFER_SCREENS, UNIT_LENGTHS} from '../utils/constants';
import {useTimelineAuth} from '../../../context/timeline-auth-context';
import {Protocol} from '../../../utils/types';
import {TimelineMotionFilter} from '../../../types/motion-filter';
import {buildRequestUrl} from '../../../utils/url-builder';
import {getAuthToken} from '../../../utils/getAuthToken';
import {startOfDay, endOfDay, addDays, format} from 'date-fns';

// Константа для 30 минут в миллисекундах
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

// Глобальное хранилище данных по камерам (чтобы сохранять данные между размонтированием и монтированием компонента)
// Ключ: `${camera}-${url}-${port}`, значение: Map<dayKey, framesData>
const globalFramesDataByCamera = new Map<string, Map<string, number[]>>();
// Глобальное хранилище для отслеживания загрузки по камерам
const globalLoadingDaysByCamera = new Map<string, Set<string>>();

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
        zoomIndex?: number;
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
        serverTime,
        zoomIndex = 8
    } = params;
    const {setTimelineAccess} = useTimelineAuth();

    // Ref для хранения актуального zoomIndex, чтобы использовать его в асинхронных операциях
    const zoomIndexRef = useRef<number>(zoomIndex);
    useEffect(() => {
        zoomIndexRef.current = zoomIndex;
    }, [zoomIndex]);

    // Массив с наличием фрагментов
    const [fragments, _setFragments] = useState<number[]>([]);

    const setFragments = (data: number[]) => {
        _setFragments(data);
    };
    // Буферизованный диапазон фрагментов
    const [fragmentsBufferRange, setFragmentsBufferRange] = useState<TimeRange>(() => ({
        start: new Date(0), // Устанавливаем невалидный диапазон, чтобы гарантировать загрузку
        end: new Date(0)
    }));

    // Состояние загрузки фрагментов
    const [isLoadingFragments, setIsLoadingFragments] = useState(false);
    const lastAppliedFilterSignatureRef = useRef<string | null>(null);
    const activeRequestRef = useRef<{
        start: Date;
        end: Date;
        zoomIndex: number;
        filterSignature: string | null;
    } | null>(null);

    // Старые refs для motion timeline (больше не используются, но оставлены для совместимости с resetFragments)
    const motionTimelineQueueRef = useRef<MotionTimelineRequest[]>([]);
    const isProcessingMotionQueueRef = useRef<boolean>(false);
    const motionTimelineResultsRef = useRef<Map<string, number[]>>(new Map());
    const loadedRangeRef = useRef<{start: Date; end: Date} | null>(null);

    // Получаем ключ для глобального хранилища данных по камере
    const cameraKey = `${camera}-${url}-${port}`;

    // Получаем или создаем хранилище данных для текущей камеры
    if (!globalFramesDataByCamera.has(cameraKey)) {
        globalFramesDataByCamera.set(cameraKey, new Map());
    }
    if (!globalLoadingDaysByCamera.has(cameraKey)) {
        globalLoadingDaysByCamera.set(cameraKey, new Set());
    }

    // Используем глобальное хранилище вместо локального ref
    const framesDataByDayRef = useRef(globalFramesDataByCamera.get(cameraKey)!);
    const loadingDaysRef = useRef(globalLoadingDaysByCamera.get(cameraKey)!);

    // Обновляем ссылки на глобальное хранилище при изменении камеры
    useEffect(() => {
        framesDataByDayRef.current = globalFramesDataByCamera.get(cameraKey)!;
        loadingDaysRef.current = globalLoadingDaysByCamera.get(cameraKey)!;
    }, [cameraKey]);
    // Хранилище загруженных данных по 30-минутным интервалам для motion filter (посекундно, unit_len=1)
    // Ключ: timestamp начала 30-минутного интервала в миллисекундах, значение: массив фреймов (unit_len=1, посекундно)
    const motionDataByIntervalRef = useRef<Map<number, number[]>>(new Map());
    // Set для отслеживания 30-минутных интервалов motion filter, которые уже запрашиваются
    // Ключ: timestamp начала 30-минутного интервала в миллисекундах
    const loadingMotionIntervalsRef = useRef<Set<number>>(new Set());
    // Map для хранения активных XHR запросов фильтров (для возможности отмены)
    // Ключ: timestamp начала 30-минутного интервала в миллисекундах, значение: XMLHttpRequest
    const activeMotionXhrRef = useRef<Map<number, XMLHttpRequest>>(new Map());
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
     * Получает ключ 30-минутного интервала из даты (timestamp начала интервала в миллисекундах)
     */
    const getIntervalKey = useCallback((date: Date): number => {
        // Округляем до начала 30-минутного интервала
        const minutes = date.getMinutes();
        const roundedMinutes = Math.floor(minutes / 30) * 30;
        const intervalStart = new Date(date);
        intervalStart.setMinutes(roundedMinutes, 0, 0);
        return intervalStart.getTime();
    }, []);

    /**
     * Определяет, какие 30-минутные интервалы нужно загрузить для motion filter
     */
    const getMotionIntervalsToLoad = useCallback(
        (rangeStart: Date, rangeEnd: Date): number[] => {
            const intervalsToLoad: number[] = [];
            let currentIntervalStart = getIntervalKey(rangeStart);
            const endTime = rangeEnd.getTime();

            while (currentIntervalStart < endTime) {
                const hasData = motionDataByIntervalRef.current.has(currentIntervalStart);
                const isLoading = loadingMotionIntervalsRef.current.has(currentIntervalStart);

                if (!hasData && !isLoading) {
                    intervalsToLoad.push(currentIntervalStart);
                }

                currentIntervalStart += THIRTY_MINUTES_MS;
            }

            return intervalsToLoad;
        },
        [getIntervalKey]
    );

    /**
     * Объединяет данные motion filter по 30-минутным интервалам для видимого диапазона и преобразует в нужный масштаб
     */
    const mergeMotionIntervalsDataForRange = useCallback(
        (rangeStart: Date, rangeEnd: Date, zoomIndex: number): {timeline: number[]; bufferRange: TimeRange} => {
            const targetUnitLength = UNIT_LENGTHS[zoomIndex];
            const result: number[] = [];
            let bufferRangeStart: Date | null = null;
            let bufferRangeEnd: Date | null = null;

            // Проходим по всем 30-минутным интервалам в диапазоне
            let currentIntervalStart = getIntervalKey(rangeStart);
            const endTime = rangeEnd.getTime();

            while (currentIntervalStart < endTime) {
                const intervalData = motionDataByIntervalRef.current.get(currentIntervalStart);

                if (intervalData) {
                    const intervalStartDate = new Date(currentIntervalStart);
                    const intervalEndDate = new Date(currentIntervalStart + THIRTY_MINUTES_MS);
                    const intervalRangeStart =
                        currentIntervalStart === getIntervalKey(rangeStart) ? rangeStart : intervalStartDate;
                    const intervalRangeEnd =
                        currentIntervalStart + THIRTY_MINUTES_MS > endTime ? rangeEnd : intervalEndDate;

                    const convertedData = convertSecondDataToScale(
                        intervalData,
                        targetUnitLength,
                        intervalStartDate,
                        intervalRangeStart,
                        intervalRangeEnd
                    );

                    result.push(...convertedData);

                    if (bufferRangeStart === null) {
                        bufferRangeStart = intervalRangeStart;
                    }
                    bufferRangeEnd = intervalRangeEnd;
                } else {
                    // Если данных нет для интервала, заполняем нулями
                    const intervalStartDate = new Date(currentIntervalStart);
                    const intervalEndDate = new Date(currentIntervalStart + THIRTY_MINUTES_MS);
                    const intervalRangeStart =
                        currentIntervalStart === getIntervalKey(rangeStart) ? rangeStart : intervalStartDate;
                    const intervalRangeEnd =
                        currentIntervalStart + THIRTY_MINUTES_MS > endTime ? rangeEnd : intervalEndDate;

                    const duration = intervalRangeEnd.getTime() - intervalRangeStart.getTime();
                    const units = Math.ceil(duration / (targetUnitLength * 1000));
                    // Используем более безопасный способ добавления элементов для больших массивов
                    for (let i = 0; i < units; i++) {
                        result.push(0);
                    }

                    if (bufferRangeStart === null) {
                        bufferRangeStart = intervalRangeStart;
                    }
                    bufferRangeEnd = intervalRangeEnd;
                }

                currentIntervalStart += THIRTY_MINUTES_MS;
            }

            return {
                timeline: result,
                bufferRange: {
                    start: bufferRangeStart || rangeStart,
                    end: bufferRangeEnd || rangeEnd
                }
            };
        },
        [getIntervalKey, convertSecondDataToScale]
    );

    // Вычисляем диапазоны времени для каждого фрагмента
    const fragmentRanges = useMemo((): FragmentTimeRange[] => {
        if (!fragments || fragments.length === 0 || fragmentsBufferRange.start.getTime() === 0) {
            return [];
        }

        const ranges: FragmentTimeRange[] = [];
        // Получаем текущий intervalIndex из loadQueue или используем 0 по умолчанию
        const currentIntervalIndex = zoomIndex;
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
    }, [fragments, fragmentsBufferRange, zoomIndex]);

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
                return;
            }

            // Проверяем, не загружен ли уже этот день
            if (framesDataByDayRef.current.has(dayKey)) {
                return;
            }

            // Сразу добавляем в loadingDays ДО любых async операций
            loadingDaysRef.current.add(dayKey);

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
     * Загружает данные motion filter для одного 30-минутного интервала (unit_len=1, посекундно)
     */
    const loadMotionIntervalData = useCallback(
        async (intervalStartTimestamp: number): Promise<void> => {
            // Проверяем, что активный запрос не был отменен (очищается в clearMotionFilterCache)
            if (activeRequestRef.current === null) {
                return;
            }

            // Проверяем, не загружается ли уже этот интервал
            if (loadingMotionIntervalsRef.current.has(intervalStartTimestamp)) {
                return;
            }

            // Проверяем, не загружен ли уже этот интервал
            if (motionDataByIntervalRef.current.has(intervalStartTimestamp)) {
                return;
            }

            // Сразу добавляем в loadingMotionIntervals ДО любых async операций
            loadingMotionIntervalsRef.current.add(intervalStartTimestamp);

            try {
                const intervalStart = new Date(intervalStartTimestamp);
                const intervalEnd = new Date(intervalStartTimestamp + THIRTY_MINUTES_MS);
                const now = Date.now();

                // Ограничиваем конец интервала текущим временем, если интервал в будущем
                const actualIntervalEnd = intervalEnd.getTime() > now ? new Date(now) : intervalEnd;

                // Дополнительная проверка: если диапазон пустой или некорректный, пропускаем
                if (actualIntervalEnd.getTime() <= intervalStart.getTime()) {
                    console.warn('loadMotionIntervalData: некорректный диапазон, пропускаем', {
                        intervalStartTimestamp,
                        intervalStart: intervalStart.toISOString(),
                        intervalEnd: actualIntervalEnd.toISOString()
                    });
                    return;
                }

                // Создаем XHR для motion timeline request
                const xhr = new XMLHttpRequest();
                // Сохраняем XHR в ref для возможности отмены
                activeMotionXhrRef.current.set(intervalStartTimestamp, xhr);

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
                                    intervalStart.getFullYear(),
                                    intervalStart.getMonth() + 1,
                                    intervalStart.getDate(),
                                    intervalStart.getHours(),
                                    intervalStart.getMinutes(),
                                    intervalStart.getSeconds()
                                ],
                                end_time: [
                                    actualIntervalEnd.getFullYear(),
                                    actualIntervalEnd.getMonth() + 1,
                                    actualIntervalEnd.getDate(),
                                    actualIntervalEnd.getHours(),
                                    actualIntervalEnd.getMinutes(),
                                    actualIntervalEnd.getSeconds()
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

                // Проверяем, что активный запрос не был отменен перед сохранением данных
                if (activeRequestRef.current === null) {
                    return;
                }

                // Проверяем, что запрос не был отменен (XHR все еще в ref)
                if (!activeMotionXhrRef.current.has(intervalStartTimestamp)) {
                    return;
                }

                // Сохраняем данные по интервалу
                motionDataByIntervalRef.current.set(intervalStartTimestamp, response.timeline);
            } catch (error) {
                // Игнорируем ошибку, если запрос был отменен
                if (error instanceof Error && error.message === 'Request aborted') {
                    return;
                }
                console.error('loadMotionIntervalData: ошибка при загрузке интервала', error);
                if (error instanceof Error && error.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                }
            } finally {
                loadingMotionIntervalsRef.current.delete(intervalStartTimestamp);
                // Удаляем XHR из ref после завершения запроса
                activeMotionXhrRef.current.delete(intervalStartTimestamp);
            }
        },
        [url, port, credentials, camera, protocol, proxy, setTimelineAccess, motionFilter]
    );

    // Ref для debounce таймера обычных фреймов
    const regularFramesDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Функция для добавления запроса в очередь
     */
    const loadFragments = useCallback(
        (start: Date, end: Date, zoomIndex: number = 0, immediate: boolean = false) => {
            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            if (motionFilter) {
                // Для motion filter используем новую логику с per-day загрузкой
                if (!visibleTimeRange) {
                    console.warn('use-timeline-fragments: visibleTimeRange не определен для motion timeline');
                    return;
                }

                const currentBufferStart = fragmentsBufferRange.start.getTime();
                const currentBufferEnd = fragmentsBufferRange.end.getTime();

                // Проверяем, есть ли уже загруженные данные для нужного диапазона
                // Ограничиваем максимальную границу реальным текущим временем
                const now = Date.now();
                let actualBufferEnd = bufferEnd;
                if (actualBufferEnd.getTime() > now) {
                    actualBufferEnd = new Date(now);
                }
                const intervalsToLoad = getMotionIntervalsToLoad(bufferStart, actualBufferEnd);
                const hasAllDataForRange = intervalsToLoad.length === 0;

                // Если данные уже загружены для нужного диапазона и фильтр не изменился,
                // просто преобразуем их в нужный масштаб без запросов
                // Используем расширенный диапазон, чтобы сохранить все загруженные данные
                if (hasAllDataForRange && lastAppliedFilterSignatureRef.current === (motionFilterSignature ?? null)) {
                    // Используем расширенный диапазон, чтобы включить все уже загруженные данные из кэша
                    const expandedBufferStart = Math.min(
                        bufferStart.getTime(),
                        currentBufferStart !== 0 ? currentBufferStart : bufferStart.getTime()
                    );
                    const expandedBufferEnd = Math.max(
                        actualBufferEnd.getTime(),
                        currentBufferEnd !== 0 ? currentBufferEnd : actualBufferEnd.getTime()
                    );

                    const mergedData = mergeMotionIntervalsDataForRange(
                        new Date(expandedBufferStart),
                        new Date(expandedBufferEnd),
                        zoomIndex
                    );
                    setFragments(mergedData.timeline);
                    setFragmentsBufferRange(mergedData.bufferRange);
                    return;
                }

                // Проверяем точное совпадение диапазона
                const isSameRange =
                    currentBufferStart === bufferStart.getTime() &&
                    currentBufferEnd === bufferEnd.getTime() &&
                    currentBufferStart !== 0 &&
                    lastAppliedFilterSignatureRef.current === (motionFilterSignature ?? null);

                if (isSameRange && !isLoadingFragments) {
                    return;
                }

                const activeRequest = activeRequestRef.current;
                // Если есть активный запрос для того же фильтра, не прерываем его
                // Позволяем ему продолжить загрузку, даже если zoomIndex изменился
                // Данные можно преобразовать в новый масштаб без повторной загрузки
                if (
                    activeRequest &&
                    activeRequest.filterSignature === (motionFilterSignature ?? null) &&
                    isLoadingFragments
                ) {
                    // Проверяем, пересекается ли новый диапазон с активным запросом
                    // Если да, то не прерываем запрос, так как данные могут быть полезны
                    const activeRequestStart = activeRequest.start.getTime();
                    const activeRequestEnd = activeRequest.end.getTime();
                    const newRequestStart = bufferStart.getTime();
                    const newRequestEnd = bufferEnd.getTime();

                    // Если новый диапазон полностью внутри активного запроса или пересекается с ним,
                    // не прерываем запрос - он продолжит загружать нужные данные
                    // При изменении зума просто преобразуем уже загруженные данные в новый масштаб
                    const rangesOverlap =
                        (newRequestStart >= activeRequestStart && newRequestStart <= activeRequestEnd) ||
                        (newRequestEnd >= activeRequestStart && newRequestEnd <= activeRequestEnd) ||
                        (newRequestStart <= activeRequestStart && newRequestEnd >= activeRequestEnd);

                    if (rangesOverlap) {
                        // Если zoomIndex изменился, но диапазоны пересекаются, обновляем отображение
                        // с уже загруженными данными в новом масштабе, не прерывая загрузку
                        if (activeRequest.zoomIndex !== zoomIndex) {
                            // Ограничиваем максимальную границу реальным текущим временем
                            const now = Date.now();
                            let actualBufferEnd = bufferEnd;
                            if (actualBufferEnd.getTime() > now) {
                                actualBufferEnd = new Date(now);
                            }

                            // Определяем реальный диапазон загруженных данных на основе motionDataByIntervalRef
                            // Это важно, так как fragmentsBufferRange может быть неполным во время загрузки
                            let actualLoadedStart: number | null = null;
                            let actualLoadedEnd: number | null = null;
                            const loadedIntervals: number[] = [];
                            motionDataByIntervalRef.current.forEach((_, intervalTimestamp) => {
                                loadedIntervals.push(intervalTimestamp);
                                if (actualLoadedStart === null || intervalTimestamp < actualLoadedStart) {
                                    actualLoadedStart = intervalTimestamp;
                                }
                                const intervalEnd = intervalTimestamp + THIRTY_MINUTES_MS;
                                if (actualLoadedEnd === null || intervalEnd > actualLoadedEnd) {
                                    actualLoadedEnd = intervalEnd;
                                }
                            });

                            // Используем реально загруженный диапазон или fallback на fragmentsBufferRange
                            const expandedBufferStart = Math.min(
                                bufferStart.getTime(),
                                actualLoadedStart !== null
                                    ? actualLoadedStart
                                    : currentBufferStart !== 0
                                      ? currentBufferStart
                                      : bufferStart.getTime()
                            );
                            const expandedBufferEnd = Math.max(
                                actualBufferEnd.getTime(),
                                actualLoadedEnd !== null
                                    ? actualLoadedEnd
                                    : currentBufferEnd !== 0
                                      ? currentBufferEnd
                                      : actualBufferEnd.getTime()
                            );

                            // ВАЖНО: Используем актуальный zoomIndex из ref, а не из замыкания
                            // Это гарантирует, что данные всегда пересчитываются для текущего зума
                            const currentZoomIndex = zoomIndexRef.current;

                            const mergedData = mergeMotionIntervalsDataForRange(
                                new Date(expandedBufferStart),
                                new Date(expandedBufferEnd),
                                currentZoomIndex
                            );

                            setFragments(mergedData.timeline);
                            setFragmentsBufferRange(mergedData.bufferRange);
                            // Принудительно обновляем компонент после изменения зума
                            // Используем двойной requestAnimationFrame для гарантии, что React перерисует компонент
                            // после того, как браузер будет готов к обновлению и React обработает первое обновление
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    // Дополнительное обновление для гарантии перерисовки
                                    // Используем функцию-обновление, чтобы гарантировать, что React увидит изменение
                                    _setFragments(prev => {
                                        // Создаем новый массив, чтобы гарантировать изменение ссылки
                                        const newArray = [...prev];
                                        return newArray;
                                    });
                                });
                            });
                        }
                        // Не прерываем запрос, если диапазоны пересекаются и запрос еще выполняется
                        return;
                    }
                }

                // Функция для выполнения обновления motion filter
                const executeMotionUpdate = () => {
                    if (isLoadingFragments) {
                        return;
                    }

                    setIsLoadingFragments(true);
                    activeRequestRef.current = {
                        start,
                        end,
                        zoomIndex,
                        filterSignature: motionFilterSignature ?? null
                    };

                    // Ограничиваем максимальную границу реальным текущим временем
                    const now = Date.now();
                    let actualBufferEnd = bufferEnd;
                    if (actualBufferEnd.getTime() > now) {
                        actualBufferEnd = new Date(now);
                    }

                    // Проверяем, какие 30-минутные интервалы нужно загрузить
                    const intervalsToLoad = getMotionIntervalsToLoad(bufferStart, actualBufferEnd);

                    // Всегда обновляем отображение с текущими данными (даже если не все интервалы загружены)
                    // Используем расширенный диапазон, чтобы включить все уже загруженные данные из кэша
                    // Это предотвращает "пропадание" фреймов при изменении visibleTimeRange
                    const expandedBufferStart = Math.min(
                        bufferStart.getTime(),
                        currentBufferStart !== 0 ? currentBufferStart : bufferStart.getTime()
                    );
                    const expandedBufferEnd = Math.max(
                        actualBufferEnd.getTime(),
                        currentBufferEnd !== 0 ? currentBufferEnd : actualBufferEnd.getTime()
                    );

                    const mergedData = mergeMotionIntervalsDataForRange(
                        new Date(expandedBufferStart),
                        new Date(expandedBufferEnd),
                        zoomIndex
                    );
                    setFragments(mergedData.timeline);
                    setFragmentsBufferRange(mergedData.bufferRange);
                    lastAppliedFilterSignatureRef.current = motionFilterSignature ?? null;

                    // Если есть интервалы для загрузки, запускаем загрузку последовательно по 30 минут
                    // Загружаем от большего времени к меньшему (от конца к началу)
                    if (intervalsToLoad.length > 0) {
                        // Загружаем интервалы последовательно в обратном порядке (от конца к началу)
                        const loadIntervalsSequentially = async () => {
                            // Переворачиваем массив, чтобы загружать от большего времени к меньшему
                            const intervalsToLoadReversed = [...intervalsToLoad].reverse();
                            for (const intervalTimestamp of intervalsToLoadReversed) {
                                // Проверяем, что активный запрос не был отменен (очищается в clearMotionFilterCache)
                                if (activeRequestRef.current === null) {
                                    break;
                                }

                                await loadMotionIntervalData(intervalTimestamp);

                                // Проверяем еще раз после загрузки, что активный запрос не был отменен
                                if (activeRequestRef.current === null) {
                                    break;
                                }

                                // После загрузки каждого интервала обновляем отображение
                                // Используем расширенный диапазон, чтобы сохранить все загруженные данные
                                // ВАЖНО: Используем актуальный zoomIndex из ref, а не из замыкания,
                                // чтобы данные всегда пересчитывались для текущего зума
                                const currentZoomIndex = zoomIndexRef.current;
                                const currentFragmentsBufferStart = fragmentsBufferRange.start.getTime();
                                const currentFragmentsBufferEnd = fragmentsBufferRange.end.getTime();
                                const expandedBufferStart = Math.min(
                                    bufferStart.getTime(),
                                    currentFragmentsBufferStart !== 0
                                        ? currentFragmentsBufferStart
                                        : bufferStart.getTime()
                                );
                                const expandedBufferEnd = Math.max(
                                    actualBufferEnd.getTime(),
                                    currentFragmentsBufferEnd !== 0
                                        ? currentFragmentsBufferEnd
                                        : actualBufferEnd.getTime()
                                );

                                const updatedData = mergeMotionIntervalsDataForRange(
                                    new Date(expandedBufferStart),
                                    new Date(expandedBufferEnd),
                                    currentZoomIndex
                                );
                                setFragments(updatedData.timeline);
                                setFragmentsBufferRange(updatedData.bufferRange);
                            }
                        };

                        loadIntervalsSequentially()
                            .catch(error => {
                                console.error('loadFragments (motion): ошибка при загрузке интервалов', error);
                                if (error instanceof Error && error.message === 'FORBIDDEN') {
                                    setTimelineAccess(false);
                                }
                            })
                            .finally(() => {
                                setIsLoadingFragments(false);
                                activeRequestRef.current = null;
                            });
                    } else {
                        setIsLoadingFragments(false);
                        activeRequestRef.current = null;
                    }
                };

                // Если требуется немедленное обновление (после отпускания), выполняем сразу
                if (immediate) {
                    // Очищаем debounce таймер если он был установлен
                    if (loadFragmentsDebounceTimerRef.current) {
                        clearTimeout(loadFragmentsDebounceTimerRef.current);
                        loadFragmentsDebounceTimerRef.current = null;
                    }
                    executeMotionUpdate();
                } else {
                    // Во время перетаскивания используем debounce для предотвращения частых обновлений
                    if (loadFragmentsDebounceTimerRef.current) {
                        clearTimeout(loadFragmentsDebounceTimerRef.current);
                    }
                    loadFragmentsDebounceTimerRef.current = setTimeout(() => {
                        loadFragmentsDebounceTimerRef.current = null;
                        executeMotionUpdate();
                    }, DEBOUNCE_DELAY);
                }
            } else {
                // Для обычных фреймов (без motion filter) используем per-day загрузку

                // Если начальная загрузка еще не завершена, не обрабатываем запрос
                if (!isInitialLoadCompletedRef.current) {
                    return;
                }

                // Функция для выполнения обновления фреймов
                const executeUpdate = () => {
                    // Проверяем, нужно ли загружать новые дни
                    const daysToLoad = getDaysToLoad(bufferStart, bufferEnd);

                    // Всегда обновляем отображение для нового видимого диапазона
                    const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, zoomIndex);
                    setFragments(mergedData.timeline);
                    setFragmentsBufferRange(mergedData.bufferRange);

                    // Если все дни уже загружены, просто возвращаемся
                    if (daysToLoad.length === 0) {
                        return;
                    }

                    // Запускаем загрузку дней параллельно
                    Promise.all(daysToLoad.map(day => loadDayData(day))).then(() => {
                        // После загрузки обновляем отображение
                        const updatedData = mergeDaysDataForRange(bufferStart, bufferEnd, zoomIndex);
                        setFragments(updatedData.timeline);
                        setFragmentsBufferRange(updatedData.bufferRange);
                    });
                };

                // Если требуется немедленное обновление (после отпускания), выполняем сразу
                if (immediate) {
                    // Очищаем debounce таймер если он был установлен
                    if (regularFramesDebounceTimerRef.current) {
                        clearTimeout(regularFramesDebounceTimerRef.current);
                        regularFramesDebounceTimerRef.current = null;
                    }
                    executeUpdate();
                } else {
                    // Во время перетаскивания используем debounce для предотвращения частых обновлений
                    if (regularFramesDebounceTimerRef.current) {
                        clearTimeout(regularFramesDebounceTimerRef.current);
                    }
                    regularFramesDebounceTimerRef.current = setTimeout(() => {
                        regularFramesDebounceTimerRef.current = null;
                        executeUpdate();
                    }, DEBOUNCE_DELAY);
                }
            }
        },
        [
            fragmentsBufferRange,
            motionFilterSignature,
            isLoadingFragments,
            motionFilter,
            visibleTimeRange,
            getDaysToLoad,
            mergeDaysDataForRange,
            loadDayData,
            getMotionIntervalsToLoad,
            mergeMotionIntervalsDataForRange,
            loadMotionIntervalData,
            setTimelineAccess
        ]
    );

    /**
     * Функция для сброса фрагментов
     * ВНИМАНИЕ: Эта функция прерывает все активные запросы фильтров!
     * Должна вызываться ТОЛЬКО при изменении фильтра (включение/изменение параметров)
     * НЕ должна вызываться при изменении зума или visibleTimeRange
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
        // Отменяем все активные XHR запросы фильтров
        activeMotionXhrRef.current.forEach(xhr => {
            xhr.abort();
        });
        activeMotionXhrRef.current.clear();
        motionDataByIntervalRef.current.clear();
        loadingMotionIntervalsRef.current.clear();
        // Очищаем активный запрос - это прерывает загрузку фильтров
        activeRequestRef.current = null;
        // Очищаем debounce таймеры
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        if (loadFragmentsDebounceTimerRef.current) {
            clearTimeout(loadFragmentsDebounceTimerRef.current);
            loadFragmentsDebounceTimerRef.current = null;
        }
        if (regularFramesDebounceTimerRef.current) {
            clearTimeout(regularFramesDebounceTimerRef.current);
            regularFramesDebounceTimerRef.current = null;
        }
        // Останавливаем активные запросы
        stopProcessingQueue();
    }, [stopProcessingQueue]);

    /**
     * Функция для очистки кэша данных фильтров (motion/objects)
     * Используется ТОЛЬКО при выключении фильтров
     * ВНИМАНИЕ: Эта функция прерывает все активные запросы фильтров!
     */
    const clearMotionFilterCache = useCallback(() => {
        // Отменяем все активные XHR запросы фильтров
        activeMotionXhrRef.current.forEach((xhr, intervalTimestamp) => {
            xhr.abort();
            activeMotionXhrRef.current.delete(intervalTimestamp);
        });

        // Очищаем данные и очередь загрузки
        motionDataByIntervalRef.current.clear();
        loadingMotionIntervalsRef.current.clear();

        // Очищаем активный запрос - это прерывает загрузку фильтров
        activeRequestRef.current = null;

        // Останавливаем загрузку фрагментов
        setIsLoadingFragments(false);
    }, []);

    /**
     * Функция для очистки кэша скачанных фреймов
     * Используется при переключении камеры, чтобы очистить данные предыдущей камеры
     */
    const clearFramesCache = useCallback(() => {
        // Отменяем все активные XHR запросы фильтров
        activeMotionXhrRef.current.forEach(xhr => {
            xhr.abort();
        });
        activeMotionXhrRef.current.clear();
        // Очищаем данные для текущей камеры в глобальном хранилище
        framesDataByDayRef.current.clear();
        loadingDaysRef.current.clear();
        motionDataByIntervalRef.current.clear();
        loadingMotionIntervalsRef.current.clear();
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
                        const currentZoomIndex = zoomIndex;

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
                    const currentZoomIndex = zoomIndex;

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
            const currentZoomIndex = zoomIndex;

            // Обновляем fragments с загруженными данными
            const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, currentZoomIndex);
            setFragments(mergedData.timeline);
            setFragmentsBufferRange(mergedData.bufferRange);
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleTimeRange, motionFilter]);

    // Старый useEffect для очистки motion timeline queue (больше не нужен)

    /**
     * Обрабатывает изменения timeline/zoom - вызывается после окончания взаимодействия
     */
    const handleTimelineChange = useCallback(
        (visibleStart: Date, visibleEnd: Date, zoomIndex?: number) => {
            // НЕ очищаем активный запрос для motion filter, чтобы не прерывать загрузку
            // loadFragments сам проверит, нужно ли прерывать запрос или можно продолжить
            // Очищаем activeRequestRef только если это действительно новый запрос с другими параметрами

            // Очищаем таймеры loadFragments ДО вызова loadFragments
            if (loadFragmentsDebounceTimerRef.current) {
                clearTimeout(loadFragmentsDebounceTimerRef.current);
                loadFragmentsDebounceTimerRef.current = null;
            }
            // Очищаем таймер для обычных фреймов
            if (regularFramesDebounceTimerRef.current) {
                clearTimeout(regularFramesDebounceTimerRef.current);
                regularFramesDebounceTimerRef.current = null;
            }

            // Получаем zoomIndex из параметра или используем значение по умолчанию
            const currentZoomIndex = zoomIndex ?? 0;

            // Вызываем loadFragments с immediate=true для немедленного обновления после отпускания
            // loadFragments сам решит, нужно ли прерывать текущие запросы или можно продолжить
            loadFragments(visibleStart, visibleEnd, currentZoomIndex, true);
        },
        [loadFragments]
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
            if (regularFramesDebounceTimerRef.current) {
                clearTimeout(regularFramesDebounceTimerRef.current);
                regularFramesDebounceTimerRef.current = null;
            }
        };
    }, []);

    /**
     * Очистка данных фильтров при выключении фильтров
     */
    useEffect(() => {
        // Если фильтр выключен (motionFilter === null), очищаем данные фильтров
        if (!motionFilter && motionDataByIntervalRef.current.size > 0) {
            clearMotionFilterCache();
            // Переключаемся на отображение обычных фреймов, если есть видимый диапазон
            if (visibleTimeRange && isInitialLoadCompletedRef.current) {
                const screenDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
                const bufferStart = new Date(visibleTimeRange.start.getTime() - screenDuration * BUFFER_SCREENS);
                const bufferEnd = new Date(visibleTimeRange.end.getTime() + screenDuration * BUFFER_SCREENS);
                const mergedData = mergeDaysDataForRange(bufferStart, bufferEnd, zoomIndex);
                setFragments(mergedData.timeline);
                setFragmentsBufferRange(mergedData.bufferRange);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motionFilter]);

    return {
        fragments,
        fragmentsBufferRange,
        fragmentRanges,
        isLoadingFragments,
        loadFragments,
        resetFragments,
        clearFramesCache,
        clearMotionFilterCache,
        handleTimelineChange
    };
};
