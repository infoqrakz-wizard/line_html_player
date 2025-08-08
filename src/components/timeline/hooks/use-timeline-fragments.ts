/**
 * Хук для управления фрагментами временной шкалы
 */
import { useState, useRef, useCallback } from 'react';
import { getFramesTimeline } from '../../../utils/api';
import { TimeRange, LoadQueueItem, TimelineFragmentsParams } from '../types';
import { BUFFER_SCREENS, UNIT_LENGTHS } from '../utils/constants';

/**
 * Хук для управления фрагментами временной шкалы
 * @param params Параметры для загрузки фрагментов
 * @returns Состояние фрагментов и методы для управления ими
 */
export const useTimelineFragments = ({ url, port, credentials, camera }: TimelineFragmentsParams) => {
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

    /**
     * Функция для запуска загрузки из очереди
     */
    const processLoadQueue = useCallback(async () => {
        if (isLoadingFragments || !loadQueue.current) return;

        const { start, end, zoomIndex } = loadQueue.current;
        loadQueue.current = null;
        setIsLoadingFragments(true);

        try {
            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            const response = await getFramesTimeline({
                startTime: bufferStart,
                url: url,
                port: port,
                credentials: credentials,
                endTime: bufferEnd,
                unitLength: UNIT_LENGTHS[zoomIndex],
                stream: 'video',
                channel: camera
            });

            // Проверяем, не появился ли новый запрос в очереди
            if (!loadQueue.current) {
                setFragments(response.timeline);
                setFragmentsBufferRange({ start: bufferStart, end: bufferEnd });
            }
        } catch (error) {
            console.error('Failed to load fragments:', error);
        } finally {
            setIsLoadingFragments(false);
            // Если в очереди появился новый запрос, обрабатываем его
            if (loadQueue.current) {
                processLoadQueue();
            }
        }
    }, [isLoadingFragments, url, port, credentials, camera]);

    /**
     * Функция для добавления запроса в очередь
     */
    const loadFragments = useCallback(
        (start: Date, end: Date, zoomIndex: number = 0) => {
            // Проверяем, не загружается ли уже этот диапазон
            if (
                loadQueue.current &&
                loadQueue.current.start.getTime() === start.getTime() &&
                loadQueue.current.end.getTime() === end.getTime() &&
                loadQueue.current.zoomIndex === zoomIndex
            ) {
                console.log('loadFragments: запрос уже в очереди, пропускаем');
                return;
            }

            // Проверяем, не покрывает ли текущий буферизованный диапазон запрашиваемый диапазон
            const screenDuration = end.getTime() - start.getTime();
            const bufferStart = new Date(start.getTime() - screenDuration * BUFFER_SCREENS);
            const bufferEnd = new Date(end.getTime() + screenDuration * BUFFER_SCREENS);

            const currentBufferStart = fragmentsBufferRange.start.getTime();
            const currentBufferEnd = fragmentsBufferRange.end.getTime();

            // Если запрашиваемый диапазон уже покрыт текущим буфером и масштаб не изменился
            if (
                currentBufferStart <= bufferStart.getTime() &&
                currentBufferEnd >= bufferEnd.getTime() &&
                currentBufferStart !== 0 && // Проверяем, что это не начальное состояние
                !isLoadingFragments
            ) {
                console.log('loadFragments: диапазон уже загружен, пропускаем');
                return;
            }

            console.log('loadFragments: добавляем новый запрос в очередь');
            loadQueue.current = { start, end, zoomIndex };
            processLoadQueue();
        },
        [processLoadQueue, fragmentsBufferRange, isLoadingFragments]
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
    }, []);

    return {
        fragments,
        fragmentsBufferRange,
        isLoadingFragments,
        loadFragments,
        resetFragments
    };
};
