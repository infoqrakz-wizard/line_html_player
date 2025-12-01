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

// Максимальный диапазон для одного запроса motion timeline (30 минут)
const MAX_MOTION_TIMELINE_RANGE_MS = 30 * 60 * 1000;

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
    const {url, port, credentials, camera, protocol, proxy, motionFilter, motionFilterSignature, visibleTimeRange} =
        params;
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

    // Очередь запросов для motion timeline (30-минутные блоки)
    const motionTimelineQueueRef = useRef<MotionTimelineRequest[]>([]);
    const isProcessingMotionQueueRef = useRef<boolean>(false);
    const motionTimelineResultsRef = useRef<Map<string, number[]>>(new Map());
    // Ref для отслеживания загруженного интервала
    const loadedRangeRef = useRef<{start: Date; end: Date} | null>(null);
    // Ref для отслеживания диапазона запросов в очереди
    const queuedRangeRef = useRef<{start: Date; end: Date} | null>(null);
    // Ref для debounce таймера
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Ref для активного запроса (для возможности отмены)
    const activeRequestXhrRef = useRef<XMLHttpRequest | null>(null);
    // Ref для текущего диапазона буфера motion timeline (для обновления fragments)
    const currentMotionBufferRef = useRef<{start: Date; end: Date; zoomIndex: number} | null>(null);
    // Ref для debounce таймера loadFragments (для motion filter)
    const loadFragmentsDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Задержка для debounce (мс) - после окончания взаимодействия
    const DEBOUNCE_DELAY = 1000;

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

    /**
     * Разбивает диапазон времени на 30-минутные блоки для motion timeline
     */
    const splitIntoTimeBlocks = useCallback((start: Date, end: Date): Array<{start: Date; end: Date}> => {
        const blocks: Array<{start: Date; end: Date}> = [];
        let currentStart = new Date(start);

        while (currentStart.getTime() < end.getTime()) {
            const currentEnd = new Date(Math.min(currentStart.getTime() + MAX_MOTION_TIMELINE_RANGE_MS, end.getTime()));
            blocks.push({start: new Date(currentStart), end: new Date(currentEnd)});
            currentStart = currentEnd;
        }

        return blocks;
    }, []);

    /**
     * Объединяет результаты запросов motion timeline в единый массив
     * Учитывает все сохраненные интервалы, которые пересекаются с запрашиваемым диапазоном
     */
    const mergeMotionTimelineResults = useCallback(
        (bufferStart: Date, bufferEnd: Date, zoomIndex: number): number[] => {
            const unitLength = UNIT_LENGTHS[zoomIndex];

            // Находим все сохраненные результаты, которые пересекаются с запрашиваемым диапазоном
            const intersectingResults: Array<{start: Date; end: Date; timeline: number[]}> = [];
            let extendedStart = bufferStart.getTime();
            let extendedEnd = bufferEnd.getTime();

            for (const [key, timeline] of Array.from(motionTimelineResultsRef.current.entries())) {
                const [blockStartTime, blockEndTime] = key.split('-').map((t: string) => Number.parseInt(t, 10));
                const blockStart = new Date(blockStartTime);
                const blockEnd = new Date(blockEndTime);

                // Проверяем пересечение с запрашиваемым диапазоном
                if (blockEnd.getTime() >= bufferStart.getTime() && blockStart.getTime() <= bufferEnd.getTime()) {
                    intersectingResults.push({start: blockStart, end: blockEnd, timeline});
                    // Расширяем диапазон, чтобы включить все пересекающиеся результаты
                    extendedStart = Math.min(extendedStart, blockStart.getTime());
                    extendedEnd = Math.max(extendedEnd, blockEnd.getTime());
                }
            }

            // Если нет пересекающихся результатов, возвращаем пустой массив для запрашиваемого диапазона
            if (intersectingResults.length === 0) {
                const totalDuration = bufferEnd.getTime() - bufferStart.getTime();
                const totalUnits = Math.ceil(totalDuration / (unitLength * 1000));
                return new Array(totalUnits).fill(0);
            }

            // Создаем массив для расширенного диапазона
            const totalDuration = extendedEnd - extendedStart;
            const totalUnits = Math.ceil(totalDuration / (unitLength * 1000));
            const merged = new Array(totalUnits).fill(0);

            // Сортируем результаты по времени начала
            intersectingResults.sort((a, b) => a.start.getTime() - b.start.getTime());

            // Объединяем все пересекающиеся результаты
            for (const {start: blockStart, end: blockEnd, timeline} of intersectingResults) {
                // Вычисляем смещение относительно расширенного диапазона
                const offset = Math.floor((blockStart.getTime() - extendedStart) / (unitLength * 1000));
                const blockUnits = Math.floor((blockEnd.getTime() - blockStart.getTime()) / (unitLength * 1000));

                // Копируем данные из блока в общий массив
                for (let i = 0; i < Math.min(timeline.length, blockUnits); i++) {
                    const targetIndex = offset + i;
                    if (targetIndex >= 0 && targetIndex < merged.length) {
                        merged[targetIndex] = timeline[i];
                    }
                }
            }

            // Обрезаем массив до запрашиваемого диапазона, если расширенный диапазон больше
            if (extendedStart < bufferStart.getTime() || extendedEnd > bufferEnd.getTime()) {
                const trimStart = Math.floor((bufferStart.getTime() - extendedStart) / (unitLength * 1000));
                const requestedUnits = Math.ceil((bufferEnd.getTime() - bufferStart.getTime()) / (unitLength * 1000));
                return merged.slice(trimStart, trimStart + requestedUnits);
            }

            return merged;
        },
        []
    );

    /**
     * Останавливает выполнение запросов из очереди
     */
    const stopProcessingQueue = useCallback(() => {
        // Останавливаем обработку очереди
        isProcessingMotionQueueRef.current = false;
        // Очищаем debounce таймер
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    /**
     * Очищает из очереди интервалы, которые уже за пределами отображаемого timeline
     */
    const cleanQueueOutOfRange = useCallback((visibleStart: Date, visibleEnd: Date) => {
        const screenDuration = visibleEnd.getTime() - visibleStart.getTime();
        const bufferStart = new Date(visibleStart.getTime() - screenDuration * BUFFER_SCREENS);
        const bufferEnd = new Date(visibleEnd.getTime() + screenDuration * BUFFER_SCREENS);

        motionTimelineQueueRef.current = motionTimelineQueueRef.current.filter(request => {
            // Оставляем только запросы, которые пересекаются с буферизованным диапазоном
            const intersects =
                request.end.getTime() >= bufferStart.getTime() && request.start.getTime() <= bufferEnd.getTime();
            if (!intersects) {
                console.log('cleanQueueOutOfRange: удаляем запрос вне диапазона', {
                    start: request.start.toISOString(),
                    end: request.end.toISOString(),
                    bufferStart: bufferStart.toISOString(),
                    bufferEnd: bufferEnd.toISOString()
                });
            }
            return intersects;
        });

        // Пересчитываем диапазон очереди после очистки
        if (motionTimelineQueueRef.current.length > 0) {
            const queueStarts = motionTimelineQueueRef.current.map(req => req.start.getTime());
            const queueEnds = motionTimelineQueueRef.current.map(req => req.end.getTime());
            queuedRangeRef.current = {
                start: new Date(Math.min(...queueStarts)),
                end: new Date(Math.max(...queueEnds))
            };
        } else {
            queuedRangeRef.current = null;
        }
    }, []);

    /**
     * Вычисляет недостающие части интервала, которые не входят в загруженный диапазон
     */
    const getMissingIntervals = useCallback((requestStart: Date, requestEnd: Date): Array<{start: Date; end: Date}> => {
        if (!loadedRangeRef.current) {
            // Если нет загруженного диапазона, возвращаем весь запрос
            return [{start: requestStart, end: requestEnd}];
        }

        const loadedStart = loadedRangeRef.current.start.getTime();
        const loadedEnd = loadedRangeRef.current.end.getTime();
        const reqStart = requestStart.getTime();
        const reqEnd = requestEnd.getTime();

        // Если запрос полностью входит в загруженный диапазон
        if (reqStart >= loadedStart && reqEnd <= loadedEnd) {
            return [];
        }

        const missing: Array<{start: Date; end: Date}> = [];

        // Если есть часть до загруженного диапазона
        if (reqStart < loadedStart) {
            missing.push({
                start: requestStart,
                end: new Date(Math.min(loadedStart, reqEnd))
            });
        }

        // Если есть часть после загруженного диапазона
        if (reqEnd > loadedEnd) {
            missing.push({
                start: new Date(Math.max(loadedEnd, reqStart)),
                end: requestEnd
            });
        }

        return missing;
    }, []);

    /**
     * Вычисляет недостающие части интервала, которые не входят в диапазон запросов в очереди
     */
    const getMissingIntervalsFromQueue = useCallback(
        (requestStart: Date, requestEnd: Date): Array<{start: Date; end: Date}> => {
            if (!queuedRangeRef.current) {
                // Если нет диапазона очереди, возвращаем весь запрос
                return [{start: requestStart, end: requestEnd}];
            }

            const queuedStart = queuedRangeRef.current.start.getTime();
            const queuedEnd = queuedRangeRef.current.end.getTime();
            const reqStart = requestStart.getTime();
            const reqEnd = requestEnd.getTime();

            // Если запрос полностью входит в диапазон очереди
            if (reqStart >= queuedStart && reqEnd <= queuedEnd) {
                return [];
            }

            const missing: Array<{start: Date; end: Date}> = [];

            // Если есть часть до диапазона очереди
            if (reqStart < queuedStart) {
                missing.push({
                    start: requestStart,
                    end: new Date(Math.min(queuedStart, reqEnd))
                });
            }

            // Если есть часть после диапазона очереди
            if (reqEnd > queuedEnd) {
                missing.push({
                    start: new Date(Math.max(queuedEnd, reqStart)),
                    end: requestEnd
                });
            }

            return missing;
        },
        []
    );

    /**
     * Обновляет диапазон запросов в очереди
     */
    const updateQueuedRange = useCallback((requestStart: Date, requestEnd: Date) => {
        if (!queuedRangeRef.current) {
            queuedRangeRef.current = {start: requestStart, end: requestEnd};
        } else {
            const queuedStart = queuedRangeRef.current.start.getTime();
            const queuedEnd = queuedRangeRef.current.end.getTime();
            queuedRangeRef.current = {
                start: new Date(Math.min(queuedStart, requestStart.getTime())),
                end: new Date(Math.max(queuedEnd, requestEnd.getTime()))
            };
        }
    }, []);

    /**
     * Проверяет, загружен ли блок полностью
     */
    const isBlockLoaded = useCallback((blockStart: Date, blockEnd: Date): boolean => {
        const key = `${blockStart.getTime()}-${blockEnd.getTime()}`;
        // Проверяем точное совпадение
        if (motionTimelineResultsRef.current.has(key)) {
            return true;
        }
        // Проверяем, покрывается ли блок уже загруженными блоками
        const existingKeys = Array.from(motionTimelineResultsRef.current.keys());
        for (const existingKey of existingKeys) {
            const [existingStartTime, existingEndTime] = existingKey
                .split('-')
                .map((t: string) => Number.parseInt(t, 10));
            const existingStart = new Date(existingStartTime);
            const existingEnd = new Date(existingEndTime);
            // Если существующий блок полностью покрывает запрашиваемый блок
            if (existingStart.getTime() <= blockStart.getTime() && existingEnd.getTime() >= blockEnd.getTime()) {
                return true;
            }
        }
        return false;
    }, []);

    /**
     * Обрабатывает очередь запросов motion timeline последовательно
     */
    const processMotionTimelineQueue = useCallback(async (): Promise<void> => {
        // Проверяем, не обрабатывается ли уже очередь
        if (isProcessingMotionQueueRef.current) {
            console.log('processMotionTimelineQueue: очередь уже обрабатывается, пропускаем');
            return;
        }

        if (motionTimelineQueueRef.current.length === 0) {
            return;
        }

        isProcessingMotionQueueRef.current = true;

        while (motionTimelineQueueRef.current.length > 0) {
            // Проверяем, не была ли обработка остановлена
            if (!isProcessingMotionQueueRef.current) {
                console.log('processMotionTimelineQueue: обработка остановлена, прерываем цикл');
                break;
            }
            const request = motionTimelineQueueRef.current.shift();
            if (!request) break;

            // Проверяем, не выходит ли запрос за пределы видимого диапазона (без буфера)
            if (visibleTimeRange) {
                // Если запрос полностью вне видимого диапазона, пропускаем его
                if (
                    request.end.getTime() < visibleTimeRange.start.getTime() ||
                    request.start.getTime() > visibleTimeRange.end.getTime()
                ) {
                    console.log('processMotionTimelineQueue: пропускаем запрос вне видимого диапазона', {
                        requestStart: request.start.toISOString(),
                        requestEnd: request.end.toISOString(),
                        visibleStart: visibleTimeRange.start.toISOString(),
                        visibleEnd: visibleTimeRange.end.toISOString()
                    });
                    continue;
                }
            }

            try {
                // Проверяем, не загружен ли уже этот блок
                if (isBlockLoaded(request.start, request.end)) {
                    console.log('processMotionTimelineQueue: блок уже загружен, пропускаем', {
                        start: request.start.toISOString(),
                        end: request.end.toISOString()
                    });
                    continue;
                }

                // Проверяем, не выходит ли запрос в будущее (используем реальное текущее время)
                const now = Date.now();
                let requestEnd = request.end;
                if (requestEnd.getTime() > now) {
                    requestEnd = new Date(now);
                    // Если весь запрос в будущем, пропускаем его
                    if (request.start.getTime() >= now) {
                        console.log('processMotionTimelineQueue: пропускаем запрос из будущего', {
                            requestStart: request.start.toISOString(),
                            requestEnd: request.end.toISOString(),
                            now: new Date(now).toISOString()
                        });
                        continue;
                    }
                }

                console.log('processMotionTimelineQueue: обрабатываем запрос', {
                    start: request.start.toISOString(),
                    end: requestEnd.toISOString(),
                    originalEnd: request.end.toISOString(),
                    zoomIndex: request.zoomIndex,
                    now: new Date(now).toISOString()
                });

                // Создаем XHR для возможности отмены
                const xhr = new XMLHttpRequest();
                activeRequestXhrRef.current = xhr;

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
                        activeRequestXhrRef.current = null;
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
                        activeRequestXhrRef.current = null;
                        reject(new Error('Failed to fetch motion timeline data'));
                    };

                    xhr.onabort = function () {
                        activeRequestXhrRef.current = null;
                        reject(new Error('Request aborted'));
                    };

                    // Определяем метод API и параметры фильтра в зависимости от типа фильтра
                    const hasTypes = motionFilter?.types && motionFilter.types.length > 0;
                    const apiMethod = hasTypes ? 'archive.get_objects_timeline' : 'archive.get_motions_timeline';

                    // Для объектов передаем только types в filter, для движения - весь фильтр
                    const filterParam = hasTypes ? {types: motionFilter.types} : motionFilter;

                    const version = hasTypes ? 71 : 13;

                    xhr.send(
                        JSON.stringify({
                            method: apiMethod,
                            params: {
                                start_time: [
                                    request.start.getFullYear(),
                                    request.start.getMonth() + 1,
                                    request.start.getDate(),
                                    request.start.getHours(),
                                    request.start.getMinutes(),
                                    request.start.getSeconds()
                                ],
                                end_time: [
                                    requestEnd.getFullYear(),
                                    requestEnd.getMonth() + 1,
                                    requestEnd.getDate(),
                                    requestEnd.getHours(),
                                    requestEnd.getMinutes(),
                                    requestEnd.getSeconds()
                                ],
                                unit_len: UNIT_LENGTHS[request.zoomIndex],
                                channel: camera,
                                stream: 'video',
                                filter: filterParam
                            },
                            version
                        })
                    );
                });

                // Сохраняем результат (используем скорректированный requestEnd)
                const key = `${request.start.getTime()}-${requestEnd.getTime()}`;
                motionTimelineResultsRef.current.set(key, response.timeline);

                // Обновляем загруженный диапазон
                if (!loadedRangeRef.current) {
                    loadedRangeRef.current = {start: request.start, end: requestEnd};
                } else {
                    const loadedStart = loadedRangeRef.current.start.getTime();
                    const loadedEnd = loadedRangeRef.current.end.getTime();
                    loadedRangeRef.current = {
                        start: new Date(Math.min(loadedStart, request.start.getTime())),
                        end: new Date(Math.max(loadedEnd, requestEnd.getTime()))
                    };
                }

                // Обновляем диапазон очереди - удаляем обработанный запрос из диапазона
                // (на самом деле, мы не удаляем, а просто обновляем, так как запрос уже обработан)
                // Диапазон очереди будет обновляться при добавлении новых запросов

                console.log('processMotionTimelineQueue: получен результат для блока', {
                    start: request.start.toISOString(),
                    end: requestEnd.toISOString(),
                    originalEnd: request.end.toISOString(),
                    timelineLength: response.timeline.length
                });

                // НЕ обновляем fragments сразу - накапливаем результаты и применим все вместе после завершения
            } catch (error) {
                // Игнорируем ошибку отмены запроса
                if (error instanceof Error && error.message === 'Request aborted') {
                    console.log('processMotionTimelineQueue: запрос отменен');
                    break;
                }
                console.error('processMotionTimelineQueue: ошибка при загрузке блока', error);
                if (error instanceof Error && error.message === 'FORBIDDEN') {
                    setTimelineAccess(false);
                    break;
                }
            }
        }

        // После завершения всех запросов (или остановки) применяем все результаты одним разом
        if (currentMotionBufferRef.current) {
            const {start: bufferStart, end: bufferEnd, zoomIndex: bufferZoomIndex} = currentMotionBufferRef.current;
            const mergedTimeline = mergeMotionTimelineResults(bufferStart, bufferEnd, bufferZoomIndex);
            setFragments(mergedTimeline);
            setFragmentsBufferRange({start: bufferStart, end: bufferEnd});
            console.log('processMotionTimelineQueue: применены все результаты', {
                bufferStart: bufferStart.toISOString(),
                bufferEnd: bufferEnd.toISOString(),
                mergedTimelineLength: mergedTimeline.length
            });
        }

        // Пересчитываем диапазон очереди после обработки
        if (motionTimelineQueueRef.current.length > 0) {
            const queueStarts = motionTimelineQueueRef.current.map(req => req.start.getTime());
            const queueEnds = motionTimelineQueueRef.current.map(req => req.end.getTime());
            queuedRangeRef.current = {
                start: new Date(Math.min(...queueStarts)),
                end: new Date(Math.max(...queueEnds))
            };
        } else {
            queuedRangeRef.current = null;
        }

        isProcessingMotionQueueRef.current = false;
    }, [
        url,
        port,
        credentials,
        camera,
        protocol,
        proxy,
        motionFilter,
        visibleTimeRange,
        setTimelineAccess,
        isBlockLoaded,
        mergeMotionTimelineResults
    ]);

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

            const requestBase = {
                startTime: bufferStart,
                url,
                port,
                credentials,
                endTime: bufferEnd,
                unitLength: UNIT_LENGTHS[zoomIndex],
                stream: 'video' as const,
                channel: camera,
                protocol,
                proxy
            };

            activeRequestRef.current = {
                start,
                end,
                zoomIndex,
                filterSignature: motionFilterSignature ?? null
            };

            let response;

            if (motionFilter) {
                // Для motion timeline используем только видимый диапазон без буфера
                // Не используем расширенный bufferStart/bufferEnd, чтобы не запрашивать слишком большой диапазон
                if (!visibleTimeRange) {
                    console.warn('use-timeline-fragments: visibleTimeRange не определен для motion timeline');
                    setIsLoadingFragments(false);
                    activeRequestRef.current = null;
                    return;
                }

                // Для motion timeline используем весь отображаемый диапазон (с буфером для плавности)
                const screenDuration = end.getTime() - start.getTime();
                const motionBufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
                let motionBufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

                // Ограничиваем максимальную границу реальным текущим временем (не делаем запросы из будущего)
                const now = Date.now();
                if (motionBufferEnd.getTime() > now) {
                    motionBufferEnd = new Date(now);
                }

                // Сохраняем текущий диапазон буфера для обновления fragments по мере получения результатов
                currentMotionBufferRef.current = {
                    start: motionBufferStart,
                    end: motionBufferEnd,
                    zoomIndex
                };

                // Сразу обновляем fragments с уже загруженными результатами (если есть)
                const initialMergedTimeline = mergeMotionTimelineResults(motionBufferStart, motionBufferEnd, zoomIndex);
                setFragments(initialMergedTimeline);
                setFragmentsBufferRange({start: motionBufferStart, end: motionBufferEnd});

                // Для motion timeline разбиваем на блоки и добавляем в очередь
                // Ограничиваем блоки реальным текущим временем
                const blocks = splitIntoTimeBlocks(motionBufferStart, motionBufferEnd).map(block => {
                    // Если блок выходит в будущее, ограничиваем его текущим временем
                    if (block.end.getTime() > now) {
                        return {
                            start: block.start,
                            end: new Date(Math.min(block.end.getTime(), now))
                        };
                    }
                    return block;
                });

                // НЕ удаляем старые результаты - сохраняем все запрошенные интервалы для отображения пользователю
                // Это позволяет показывать уже загруженные данные даже при изменении видимого диапазона

                // Добавляем новые блоки в очередь, используя логику частичного вхождения
                for (const block of blocks) {
                    // Получаем недостающие части блока (которые не загружены)
                    const missingFromLoaded = getMissingIntervals(block.start, block.end);
                    for (const missing of missingFromLoaded) {
                        // Проверяем, не загружен ли уже этот интервал
                        if (isBlockLoaded(missing.start, missing.end)) {
                            continue;
                        }

                        // Получаем недостающие части, которые не входят в диапазон очереди
                        const missingFromQueue = getMissingIntervalsFromQueue(missing.start, missing.end);
                        for (const queueMissing of missingFromQueue) {
                            // Проверяем, нет ли уже такого блока в очереди (точное совпадение)
                            const existsInQueue = motionTimelineQueueRef.current.some(
                                req =>
                                    req.start.getTime() === queueMissing.start.getTime() &&
                                    req.end.getTime() === queueMissing.end.getTime() &&
                                    req.zoomIndex === zoomIndex
                            );
                            if (!existsInQueue) {
                                motionTimelineQueueRef.current.push({
                                    start: queueMissing.start,
                                    end: queueMissing.end,
                                    zoomIndex
                                });
                                // Обновляем диапазон очереди
                                updateQueuedRange(queueMissing.start, queueMissing.end);
                            }
                        }
                    }
                }

                // Запускаем обработку очереди
                // При первом включении фильтра запускаем сразу, иначе через debounce
                const isFirstLoad = !loadedRangeRef.current;
                if (isFirstLoad) {
                    // Первый запрос - запускаем сразу
                    processMotionTimelineQueue();
                } else {
                    // Последующие запросы - через debounce
                    if (debounceTimerRef.current) {
                        clearTimeout(debounceTimerRef.current);
                    }
                    debounceTimerRef.current = setTimeout(() => {
                        debounceTimerRef.current = null;
                        processMotionTimelineQueue();
                    }, DEBOUNCE_DELAY);
                }

                // Не ждем завершения всех запросов - результаты будут обновляться по мере получения
                // Объединяем уже имеющиеся результаты для немедленного отображения
                const mergedTimeline = mergeMotionTimelineResults(motionBufferStart, motionBufferEnd, zoomIndex);
                response = {timeline: mergedTimeline};

                // Обновляем fragmentsBufferRange для motion timeline
                bufferStart.setTime(motionBufferStart.getTime());
                bufferEnd.setTime(motionBufferEnd.getTime());
            } else {
                response = await getFramesTimeline(requestBase);
            }

            // Проверяем, не появился ли новый запрос в очереди
            if (!loadQueue.current) {
                setFragments(response.timeline);
                setFragmentsBufferRange({start: bufferStart, end: bufferEnd});
                lastAppliedFilterSignatureRef.current = motionFilterSignature ?? null;
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
        url,
        port,
        credentials,
        camera,
        proxy,
        protocol,
        motionFilter,
        motionFilterSignature,
        setTimelineAccess,
        splitIntoTimeBlocks,
        mergeMotionTimelineResults,
        processMotionTimelineQueue,
        visibleTimeRange,
        isBlockLoaded,
        getMissingIntervals,
        getMissingIntervalsFromQueue,
        updateQueuedRange
    ]);

    /**
     * Функция для добавления запроса в очередь
     */
    const loadFragments = useCallback(
        (start: Date, end: Date, zoomIndex: number = 0) => {
            // Очищаем loadQueue, если запрос уже обработан (isLoadingFragments = true)
            // Это важно, чтобы избежать ситуации, когда старый запрос блокирует новые запросы
            if (loadQueue.current && isLoadingFragments) {
                loadQueue.current = null;
            }

            // Проверяем, не загружается ли уже этот диапазон
            // Важно: проверяем только если запрос еще не обработан (isLoadingFragments = false)
            // Если запрос уже обрабатывается, то loadQueue.current будет null
            if (
                loadQueue.current &&
                !isLoadingFragments &&
                loadQueue.current.start.getTime() === start.getTime() &&
                loadQueue.current.end.getTime() === end.getTime() &&
                loadQueue.current.zoomIndex === zoomIndex
            ) {
                return;
            }

            // Проверяем, не покрывает ли текущий буферизованный диапазон запрашиваемый диапазон
            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            const currentBufferStart = fragmentsBufferRange.start.getTime();
            const currentBufferEnd = fragmentsBufferRange.end.getTime();

            // Для motion filter используем более мягкую проверку
            // Проверяем только базовое покрытие буфером, но всегда добавляем запросы при изменении видимого диапазона
            if (motionFilter) {
                // Для motion filter проверяем только базовые условия
                // Всегда добавляем запросы в очередь, если видимый диапазон изменился
                // Это гарантирует обновление данных при перемещении таймлайна
                const isSameRange =
                    currentBufferStart === bufferStart.getTime() &&
                    currentBufferEnd === bufferEnd.getTime() &&
                    currentBufferStart !== 0 &&
                    lastAppliedFilterSignatureRef.current === (motionFilterSignature ?? null);

                if (isSameRange && !isLoadingFragments) {
                    return;
                }
            } else {
                // Для обычных запросов (без motion filter) используем старую логику
                // Если запрашиваемый диапазон уже покрыт текущим буфером и масштаб не изменился
                if (
                    currentBufferStart <= bufferStart.getTime() &&
                    currentBufferEnd >= bufferEnd.getTime() &&
                    currentBufferStart !== 0 && // Проверяем, что это не начальное состояние
                    !isLoadingFragments &&
                    lastAppliedFilterSignatureRef.current === (motionFilterSignature ?? null)
                ) {
                    return;
                }
            }

            const activeRequest = activeRequestRef.current;
            if (
                activeRequest &&
                activeRequest.start.getTime() === start.getTime() &&
                activeRequest.end.getTime() === end.getTime() &&
                activeRequest.zoomIndex === zoomIndex &&
                activeRequest.filterSignature === (motionFilterSignature ?? null)
            ) {
                return;
            }

            loadQueue.current = {start, end, zoomIndex};

            // Для motion filter используем debounce, чтобы не отправлять запросы при каждом движении
            if (motionFilter) {
                // При первом включении фильтра запускаем сразу, иначе через debounce
                const isFirstLoad = !loadedRangeRef.current;
                if (isFirstLoad) {
                    // Первый запрос - запускаем сразу
                    // Очищаем предыдущий таймер, если он есть
                    if (loadFragmentsDebounceTimerRef.current) {
                        clearTimeout(loadFragmentsDebounceTimerRef.current);
                        loadFragmentsDebounceTimerRef.current = null;
                    }
                    processLoadQueue();
                } else {
                    // Последующие запросы - через debounce
                    // Если таймер уже установлен, просто обновляем данные в очереди
                    // и не очищаем таймер, чтобы он выполнился с новыми данными
                    if (!loadFragmentsDebounceTimerRef.current) {
                        // Таймер не установлен - создаем новый
                        loadFragmentsDebounceTimerRef.current = setTimeout(() => {
                            loadFragmentsDebounceTimerRef.current = null;
                            processLoadQueue();
                        }, DEBOUNCE_DELAY);
                    }
                    // Таймер уже установлен - просто обновляем данные в очереди
                    // Таймер выполнится с новыми данными
                }
            } else {
                // Для обычных запросов (без motion filter) вызываем сразу
                // Очищаем предыдущий таймер, если он есть
                if (loadFragmentsDebounceTimerRef.current) {
                    clearTimeout(loadFragmentsDebounceTimerRef.current);
                    loadFragmentsDebounceTimerRef.current = null;
                }
                processLoadQueue();
            }
        },
        [processLoadQueue, fragmentsBufferRange, motionFilterSignature, isLoadingFragments, motionFilter]
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
     * Очищает только запросы из очереди, которые выходят в будущее (но сохраняет результаты)
     */
    useEffect(() => {
        if (!motionFilter) {
            return;
        }

        const now = Date.now();

        // Удаляем только запросы из очереди, которые полностью в будущем
        motionTimelineQueueRef.current = motionTimelineQueueRef.current.filter(request => {
            const isInFuture = request.start.getTime() >= now;
            if (isInFuture) {
                console.log('Удаляем запрос из очереди (в будущем)', {
                    start: request.start.toISOString(),
                    end: request.end.toISOString(),
                    now: new Date(now).toISOString()
                });
            }
            return !isInFuture;
        });

        // НЕ удаляем результаты - сохраняем все запрошенные интервалы для отображения пользователю
    }, [motionFilter]);

    /**
     * Обрабатывает изменения timeline/zoom - вызывается после окончания взаимодействия
     */
    const handleTimelineChange = useCallback(
        (visibleStart: Date, visibleEnd: Date, zoomIndex?: number) => {
            // 1) Останавливаем выполнение запросов из очереди
            // Отменяем только активный запрос (если он есть)
            // Запросы идут последовательно, поэтому должен быть только один активный запрос
            if (activeRequestXhrRef.current) {
                activeRequestXhrRef.current.abort();
                activeRequestXhrRef.current = null;
            }
            // Останавливаем обработку очереди
            isProcessingMotionQueueRef.current = false;
            // Очищаем активный запрос, чтобы не блокировать новые запросы
            activeRequestRef.current = null;

            // 2) Чистим из очереди интервалы, которые уже за пределами отображаемого timeline
            cleanQueueOutOfRange(visibleStart, visibleEnd);

            // 2.5) Очищаем loadQueue, если старый запрос больше не актуален
            // Это важно, чтобы избежать ситуации, когда старый запрос блокирует новые запросы
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

            // 3) Очищаем таймер loadFragments ДО вызова loadFragments, чтобы избежать конфликтов
            // Это важно, чтобы старый таймер не выполнился после того, как мы добавим новый запрос
            const hadTimer = !!loadFragmentsDebounceTimerRef.current;
            if (loadFragmentsDebounceTimerRef.current) {
                clearTimeout(loadFragmentsDebounceTimerRef.current);
                loadFragmentsDebounceTimerRef.current = null;
            }

            // 4) Добавляем новые запросы в очередь через loadFragments
            // Для motion filter это критично, чтобы добавить запросы для нового видимого диапазона
            if (motionFilter) {
                // Получаем zoomIndex из параметра или из очереди
                const currentZoomIndex = zoomIndex ?? loadQueue.current?.zoomIndex ?? 0;
                // Вызываем loadFragments для добавления новых запросов в очередь
                // Это обойдет проверку на покрытие буфером, так как мы явно хотим обновить данные
                loadFragments(visibleStart, visibleEnd, currentZoomIndex);

                // Если таймер был очищен, но loadFragments пропустил запрос (уже в очереди),
                // нужно принудительно создать новый таймер
                // eslint-disable-next-line max-len
                if (hadTimer && loadQueue.current && !loadFragmentsDebounceTimerRef.current && !isLoadingFragments) {
                    loadFragmentsDebounceTimerRef.current = setTimeout(() => {
                        loadFragmentsDebounceTimerRef.current = null;
                        processLoadQueue();
                    }, DEBOUNCE_DELAY);
                }
            }
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                processMotionTimelineQueue();
            }, DEBOUNCE_DELAY);
        },
        [
            cleanQueueOutOfRange,
            processMotionTimelineQueue,
            motionFilter,
            loadFragments,
            processLoadQueue,
            isLoadingFragments
        ]
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
        handleTimelineChange
    };
};
