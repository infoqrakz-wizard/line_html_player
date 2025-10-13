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
 * @param protocol Протокол для API запросов
 * @param proxy Прокси для API запросов
 * @param externalServerTime Внешнее время сервера
 * @param shouldFetchServerTime Флаг для авто-запроса времени сервера
 * @returns Состояние временной шкалы и методы для управления им
 */
export const useTimelineState = (
    progress: number = 0,
    url?: string,
    port?: number,
    credentials?: string,
    protocol?: Protocol,
    proxy?: string,
    externalServerTime?: Date,
    shouldFetchServerTime: boolean = true
) => {
    const {serverTime, setServerTime, progress: ctxProgress, skipCenterTimeline} = useTime();
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const [serverTimeError, setServerTimeError] = useState<boolean>(false);

    const [isInitialized, setIsInitialized] = useState<boolean>(false);

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

    // Обработка внешнего времени сервера
    useEffect(() => {
        if (externalServerTime && !isInitialized) {
            setServerTime(externalServerTime);

            // Инициализируем видимый диапазон
            const currentInterval = INTERVALS[intervalIndex];
            const halfInterval = currentInterval / 2;
            const currentDateTime = new Date(externalServerTime.getTime() + ctxProgress * 1000);

            const start = new Date(currentDateTime.getTime() - halfInterval);
            const end = new Date(currentDateTime.getTime() + halfInterval);

            setVisibleTimeRangeState({start, end});
            setIsLoading(false);
            setIsInitialized(true);
        }
    }, [externalServerTime, isInitialized, intervalIndex, ctxProgress, setServerTime, setVisibleTimeRangeState]);

    // Получение времени сервера при инициализации (только если не передано извне)
    useEffect(() => {
        // Если время передано извне, уже инициализированы, или не разрешено делать запросы, не делаем запрос
        if (
            externalServerTime ||
            isInitialized ||
            !shouldFetchServerTime ||
            !url ||
            !port ||
            !credentials ||
            serverTime
        ) {
            return;
        }

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
                    setIsInitialized(true);
                })
                .catch(error => {
                    console.error('Ошибка при получении времени сервера:', error);
                    setIsLoading(false);
                    setServerTimeError(true);
                });
        };

        fetchServerTime();
    }, [
        url,
        port,
        credentials,
        intervalIndex,
        protocol,
        proxy,
        externalServerTime,
        shouldFetchServerTime,
        isInitialized,
        serverTime,
        ctxProgress,
        setServerTime,
        setVisibleTimeRangeState
    ]);

    // Отдельный useEffect для обновления времени при изменении intervalIndex
    useEffect(() => {
        // Обновляем время при изменении intervalIndex только если:
        // 1. Уже инициализированы
        // 2. Изначально данные НЕ переданы извне (то есть мы сами управляем временем)
        // 3. Разрешено делать запросы
        // 4. Есть все необходимые параметры для запроса
        if (isInitialized && !externalServerTime && shouldFetchServerTime && url && port && credentials) {
            const fetchServerTime = async () => {
                try {
                    const time = await getServerTime(url, port, credentials, protocol, proxy);
                    setServerTime(time);
                } catch (error) {
                    console.error('Ошибка при обновлении времени сервера:', error);
                }
            };

            void fetchServerTime();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intervalIndex]); // Только intervalIndex в зависимостях

    const updateServerTime = async () => {
        if (!url || !port || !credentials || !shouldFetchServerTime) return;
        const time = await getServerTime(url, port, credentials, protocol, proxy);
        setServerTime(time);
        return time;
    };

    /**
     * Установить видимый диапазон времени
     */
    const setVisibleTimeRange = useCallback(
        (range: TimeRange) => {
            setVisibleTimeRangeState(range);
        },
        [setVisibleTimeRangeState]
    );

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
        cursorPosition,
        updateCursorPosition,
        resetCursorPosition,
        updateServerTime,
        serverTimeError
    };
};
