/**
 * Хук для управления состоянием временной шкалы
 */
import {useState, useCallback, useEffect, useRef} from 'react';
import {useTime} from '../../../context/time-context';
import {TimeRange, CursorPosition} from '../types';
import {INTERVALS} from '../utils/constants';
import {getServerTime} from '../../../utils/api';
import {Protocol} from '../../../utils/types';

/**
 * Сравнивает два диапазона времени на равенство
 */
const areTimeRangesEqual = (range1: TimeRange | null, range2: TimeRange | null): boolean => {
    if (!range1 && !range2) return true;
    if (!range1 || !range2) return false;
    return range1.start.getTime() === range2.start.getTime() && range1.end.getTime() === range2.end.getTime();
};

/**
 * Хук для управления состоянием временной шкалы
 * @param progress Прогресс воспроизведения в секундах
 * @param url URL для API запросов
 * @param port Порт для API запросов
 * @param credentials Учетные данные для API запросов
 * @returns Состояние временной шкалы и методы для управления им
 */
export const useTimelineState = (
    progress: number = 0,
    url?: string,
    port?: number,
    credentials?: string,
    protocol?: Protocol,
    proxy?: string
) => {
    // Получаем время из глобального контекста
    const {serverTime, setServerTime, progress: ctxProgress, skipCenterTimeline} = useTime();
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const [serverTimeError, setServerTimeError] = useState<boolean>(false);

    // Индекс текущего интервала масштабирования
    const [intervalIndex, setIntervalIndex] = useState(8);

    // Видимый диапазон времени (инициализируется только после получения серверного времени)
    const [visibleTimeRange, _setVisibleTimeRangeState] = useState<TimeRange | null>(null);

    const setVisibleTimeRangeState = useCallback((range: TimeRange) => {
        _setVisibleTimeRangeState(currentRange => {
            // Проверяем, действительно ли изменился диапазон
            if (areTimeRangesEqual(currentRange, range)) {
                console.log('setVisibleTimeRangeState: диапазон не изменился, пропускаем обновление');
                return currentRange; // Возвращаем текущий диапазон без изменений
            }
            console.log('setVisibleTimeRangeState: обновляем диапазон', range);
            return range;
        });
    }, []);

    // Позиция курсора
    const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);

    // Инициализация диапазона, если серверное время уже есть, но диапазон ещё не установлен
    useEffect(() => {
        if (serverTime && !visibleTimeRange) {
            const currentInterval = INTERVALS[intervalIndex];
            const halfInterval = currentInterval / 2;
            const currentDateTime = new Date(serverTime.getTime() + ctxProgress * 1000);
            const start = new Date(currentDateTime.getTime() - halfInterval);
            const end = new Date(currentDateTime.getTime() + halfInterval);
            setVisibleTimeRangeState({start, end});
            setIsLoading(false);
        }
    }, [serverTime, visibleTimeRange, intervalIndex, ctxProgress]);

    // Получение времени сервера при инициализации
    useEffect(() => {
        if (!url || !port || !credentials || serverTime) return;

        const fetchServerTime = () => {
            setIsLoading(true);
            getServerTime(url, port, credentials, protocol, proxy)
                .then(time => {
                    setServerTime(time);

                    // Инициализируем видимый диапазон только после получения серверного времени
                    const currentInterval = INTERVALS[intervalIndex];
                    const halfInterval = currentInterval / 2;
                    // Используем текущий progress, но не добавляем его в зависимости
                    const currentDateTime = new Date(time.getTime() + ctxProgress * 1000);

                    const start = new Date(currentDateTime.getTime() - halfInterval);
                    const end = new Date(currentDateTime.getTime() + halfInterval);

                    setVisibleTimeRangeState({start, end});
                    setIsLoading(false);
                })
                .catch(error => {
                    console.error('Ошибка при получении времени сервера:', error);
                    setIsLoading(false);
                    setServerTimeError(true);
                });
        };

        fetchServerTime();
    }, [url, port, credentials, intervalIndex, protocol, proxy]);

    const updateServerTime = async () => {
        if (!url || !port || !credentials) return;
        const time = await getServerTime(url, port, credentials, protocol, proxy);
        setServerTime(time);
        return time;
    };

    /**
     * Установить видимый диапазон времени
     */
    const setVisibleTimeRange = useCallback((range: TimeRange) => {
        setVisibleTimeRangeState(range);
    }, []);

    /**
     * Центрировать временную шкалу на текущем времени
     */
    const centerOnCurrentTime = useCallback(() => {
        if (!serverTime) return;

        const currentDateTime = new Date(serverTime.getTime() + progress * 1000);
        const currentInterval = INTERVALS[intervalIndex];
        const halfInterval = currentInterval / 2;

        const start = new Date(currentDateTime.getTime() - halfInterval);
        const end = new Date(currentDateTime.getTime() + halfInterval);

        setVisibleTimeRangeState({start, end});
    }, [serverTime, ctxProgress, intervalIndex]);

    /**
     * Центрировать временную шкалу на указанном времени
     */
    const centerOnTime = useCallback(
        (time: Date) => {
            const currentInterval = INTERVALS[intervalIndex];
            const halfInterval = currentInterval / 2;

            const start = new Date(time.getTime() - halfInterval);
            const end = new Date(time.getTime() + halfInterval);

            setVisibleTimeRangeState({start, end});
        },
        [intervalIndex]
    );

    // Центрирование таймлайна при изменении serverTime
    // Используем useRef для отслеживания предыдущего серверного времени
    const previousServerTimeRef = useRef<Date | null>(null);

    useEffect(() => {
        // Центрируем только если серверное время действительно изменилось
        // и это не первая инициализация
        if (serverTime && visibleTimeRange && !skipCenterTimeline) {
            const previousTime = previousServerTimeRef.current;
            const currentTime = serverTime;

            // Проверяем, изменилось ли время более чем на 1 секунду
            // (чтобы избежать центрирования при мелких корректировках времени)
            if (!previousTime || Math.abs(currentTime.getTime() - previousTime.getTime()) > 1000) {
                console.log('Центрируем таймлайн: серверное время изменилось значительно');
                centerOnCurrentTime();
            }
        }
        previousServerTimeRef.current = serverTime;
    }, [serverTime, centerOnCurrentTime, visibleTimeRange, skipCenterTimeline]);

    /**
     * Обновить позицию курсора
     * @param x X-координата курсора
     * @param containerWidth Ширина контейнера
     */
    const updateCursorPosition = useCallback(
        (x: number, containerWidth: number) => {
            if (!visibleTimeRange) return;

            // Вычисляем время, соответствующее позиции курсора
            const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
            const timeOffset = (x / containerWidth) * visibleDuration;
            const cursorTime = new Date(visibleTimeRange.start.getTime() + timeOffset);

            setCursorPosition({
                x,
                time: cursorTime
            });
        },
        [visibleTimeRange]
    );

    /**
     * Обновить позицию курсора по времени
     * @param time Время для позиционирования курсора
     * @param containerWidth Ширина контейнера
     */
    const updateCursorPositionByTime = useCallback(
        (time: Date, containerWidth: number) => {
            if (!visibleTimeRange) return;

            // Вычисляем позицию x для данного времени
            const visibleDuration = visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime();
            const timeOffset = time.getTime() - visibleTimeRange.start.getTime();
            const x = (timeOffset / visibleDuration) * containerWidth;

            setCursorPosition({
                x,
                time
            });
        },
        [visibleTimeRange]
    );

    /**
     * Сбросить позицию курсора
     */
    const resetCursorPosition = useCallback(() => {
        setCursorPosition(null);
    }, []);

    return {
        serverTime,
        isLoading,
        intervalIndex,
        setIntervalIndex,
        visibleTimeRange,
        setVisibleTimeRange,
        centerOnCurrentTime,
        centerOnTime,
        cursorPosition,
        updateCursorPosition,
        updateCursorPositionByTime,
        resetCursorPosition,
        updateServerTime,
        serverTimeError
    };
};
