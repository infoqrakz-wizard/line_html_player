import React, {useCallback, useEffect, useRef, useState} from 'react';

import {formatDate, addSecondsToDate} from '../../utils/dates';
import {getProtocol, formatUrlForDownload, clickA} from '../../utils/url-params';
import {Mode, Protocol} from '../../utils/types';
import {getCameraState, getCamerasList, type CameraInfo} from '../../utils/api';
import {ControlPanel} from '../control-panel';
import {
    CAMERA_SWIPE_THRESHOLD_PERCENT,
    PLAYER_HORIZONTAL_SWIPE_THRESHOLD,
    UNIT_LENGTHS
} from '../timeline/utils/constants';

import {useTime} from '../../context/time-context';
import {useTimelineState} from '../timeline/hooks/use-timeline-state';
import {useOrientation} from '../timeline/hooks/use-orientation';
import {TimelineRef} from '../timeline/types';
import {hasVisibleFramesInNextSeconds, findNextVisibleFrame} from '../timeline/utils/fragment-utils';

import {HlsPlayer, VideoTag, SaveStreamModal, ModeIndicator, ZoomMagnifier, PlayOverlay, Loader} from './components';
import {PlayerComponentProps, PlaybackStatus} from './components/player-interface';
import {getAuthToken} from '../../utils/getAuthToken';

import type {PlayerRef} from './components/player-interface';
import Select from '../select/select';
import styles from './player.module.scss';
import {buildRequestUrl} from '../../utils/url-builder';
import {MotionMaskOverlay} from './components/motion-mask-overlay/motion-mask-overlay';
import {MotionFilterOption, MotionMaskPayload, MotionObjectType, TimelineMotionFilter} from '../../types/motion-filter';

const OVERLAY_TEXT_265 = 'Ваш браузер не поддерживает кодек H.265 (HEVC).';
const MOTION_MASK_WIDTH = 8;
const MOTION_MASK_HEIGHT = 8;

type MaskGrid = number[][];

const createFilledMaskGrid = (fillValue: 0 | 1 = 0): MaskGrid =>
    Array.from({length: MOTION_MASK_HEIGHT}, () => Array.from({length: MOTION_MASK_WIDTH}, () => fillValue));

const gridFromMaskPayload = (payload: MotionMaskPayload): MaskGrid => {
    const totalCells = payload.width * payload.height;
    const values: number[] = [];

    for (let i = 0; i < payload.data.length; i += 2) {
        const count = payload.data[i];
        const value = payload.data[i + 1] ?? 0;
        for (let j = 0; j < count; j += 1) {
            if (values.length >= totalCells) break;
            values.push(value);
        }
    }

    while (values.length < totalCells) {
        values.push(0);
    }

    const grid: MaskGrid = [];
    for (let row = 0; row < payload.height; row += 1) {
        const start = row * payload.width;
        grid.push(values.slice(start, start + payload.width));
    }
    return grid;
};

const buildMaskPayload = (grid: MaskGrid): MotionMaskPayload => {
    const flatValues = grid.reduce<number[]>((acc, row) => acc.concat(row), []);
    if (flatValues.length === 0) {
        return {
            width: MOTION_MASK_WIDTH,
            height: MOTION_MASK_HEIGHT,
            data: []
        };
    }

    const data: number[] = [];
    let currentValue = flatValues[0];
    let count = 0;

    flatValues.forEach(value => {
        if (value === currentValue) {
            count += 1;
            return;
        }
        data.push(count, currentValue);
        currentValue = value;
        count = 1;
    });

    data.push(count, currentValue);

    return {
        width: MOTION_MASK_WIDTH,
        height: MOTION_MASK_HEIGHT,
        data
    };
};

export interface PlayerProps {
    // Основные пропсы из DevLinePlayerProps
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string; // Делаем пароль опциональным
    mode?: Mode;
    muted?: boolean; // Делаем звук опциональным
    camera?: number;
    protocol?: Protocol;
    showCameraSelector?: boolean;
    proxy?: string;
    isUseProxy?: boolean;
    enableZoomMagnifier?: boolean; // Включить лупу (по умолчанию true)
    enableVideoZoom?: boolean; // Включить зум видео по скроллу (по умолчанию true)
}

export const Player: React.FC<PlayerProps> = ({
    streamUrl = '',
    streamPort = 80,
    login = '',
    password = '',
    mode = Mode.Live,
    muted = false,
    camera: initialCamera,
    protocol: preferredProtocol,
    showCameraSelector = false,
    proxy,
    isUseProxy,
    enableZoomMagnifier = true,
    enableVideoZoom = true
}) => {
    // Local auth state to allow updating credentials when 401 occurs
    const [authLogin, setAuthLogin] = useState<string>(login);
    const [authPassword, setAuthPassword] = useState<string>(password ?? '');
    const [currentMode, setCurrentMode] = useState<Mode>(mode);
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const {serverTime, setServerTime, progress: ctxProgress, setProgress} = useTime();
    const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
    const [isNoSound, setIsNoSound] = useState<boolean>(false);
    const [showH265Warning, setShowH265Warning] = useState<boolean>(false);

    // Availability/auth check state
    const [isCheckingAvailability, setIsCheckingAvailability] = useState<boolean>(false);
    const [authRequired, setAuthRequired] = useState<boolean>(false);
    const [serverUnavailable, setServerUnavailable] = useState<boolean>(false);
    const [authVerified, setAuthVerified] = useState<boolean>(false);

    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fragmetsGapRef = useRef<number>(0);
    const nextFragmentTimeRef = useRef<Date | null>(null);
    const isTransitioningToNextFragmentRef = useRef<boolean>(false);

    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(muted);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('loading');

    const [isMobile, setIsMobile] = useState<boolean>(false);
    const [showControls, setShowControls] = useState<boolean>(false);

    // Определяем ориентацию и тип устройства
    const {orientation, isMobile: isMobileDevice, isSafari, isAndroid, isIOS} = useOrientation();

    // Состояние для отслеживания свайпов по плееру
    const [isPlayerSwipeActive, setIsPlayerSwipeActive] = useState<boolean>(false);
    const [playerSwipeStartX, setPlayerSwipeStartX] = useState<number>(0);
    const [playerSwipeStartY, setPlayerSwipeStartY] = useState<number>(0);
    const [hasPlayerSwiped, setHasPlayerSwiped] = useState<boolean>(false);

    const [isZoomActive, setIsZoomActive] = useState<boolean>(false);
    const [zoomMouseX, setZoomMouseX] = useState<number>(0);
    const [zoomMouseY, setZoomMouseY] = useState<number>(0);
    const [videoZoom, setVideoZoom] = useState<number>(1);
    const [zoomOriginX, setZoomOriginX] = useState<number>(0.5);
    const [zoomOriginY, setZoomOriginY] = useState<number>(0.5);
    const isCtrlPressedRef = useRef<boolean>(false);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const lastMousePositionRef = useRef<{x: number; y: number}>({x: 0, y: 0});

    const containerRef = useRef<HTMLDivElement>(null);
    const datepickerPortalIdRef = useRef<string>(`datepicker-portal-${Math.random().toString(36).slice(2)}`);
    const controlAreaRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PlayerRef | null>(null);
    const timelineRef = useRef<TimelineRef | null>(null);
    const archiveTargetTimeRef = useRef<Date | null>(null);
    const forwardAccumOffsetRef = useRef<number | null>(null);
    const wasPlayingBeforeHiddenRef = useRef<boolean>(false);
    const [liveStreamCacheBuster, setLiveStreamCacheBuster] = useState<number>(Date.now());

    const protocol = preferredProtocol ?? getProtocol();
    const [availableCameras, setAvailableCameras] = useState<CameraInfo[]>([]);
    const [camera, setCamera] = useState<number | undefined>(initialCamera);

    // Обрабатываем логику proxy на уровне Player
    const effectiveProxy = isUseProxy ? (proxy ?? 'https://proxy.devline.ru') : undefined;

    const getStreamUrl = (type: string, isNoSound: boolean, isMuted: boolean) =>
        buildRequestUrl({
            host: streamUrl,
            port: streamPort,
            protocol,
            proxy: effectiveProxy,
            path: `/cameras/${camera ?? 0}/streaming/main.${type}?authorization=Basic%20${getAuthToken(
                `${authLogin}:${authPassword}`
            )}${!isMuted && !isNoSound ? '&audio=1' : ''}`
        });

    // const posterUrl = `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/image?stream=main&authorization=Basic%20${btoa(`${login}:${password}`)}`;

    // Для iPhone всегда используем m3u8, так как hls.js не работает нативно
    const streamType = isSafari ? 'm3u8' : currentMode === 'record' ? 'm3u8' : 'mp4';
    const authorization = `${authLogin}:${authPassword}`;
    const videoUrl = getStreamUrl(streamType, isNoSound, isMuted);

    const {updateServerTime} = useTimelineState(
        undefined,
        streamUrl,
        streamPort,
        authVerified ? authorization : undefined,
        protocol,
        effectiveProxy
    );

    // Формирование URL для потока в зависимости от режима и серверного времени
    let finalStreamUrl = '';
    if (authVerified && camera !== undefined) {
        if (currentMode === 'record' && serverTime) {
            finalStreamUrl = `${videoUrl}&time=${formatDate(serverTime)}&autoplay=1${!isMuted && !isNoSound ? '&audio=1' : ''}`;
        } else {
            // Для Live режима добавляем cache buster для принудительной перезагрузки
            const separator = videoUrl.includes('?') ? '&' : '?';
            finalStreamUrl = `${videoUrl}${separator}_t=${liveStreamCacheBuster}`;
        }
    }

    useEffect(() => {
        fragmetsGapRef.current = 0;
        isTransitioningToNextFragmentRef.current = false;
        nextFragmentTimeRef.current = null;
    }, [serverTime]);

    // Отслеживаем переключение режимов для определения, что это уже не первая загрузка
    useEffect(() => {
        if (isFirstLoad && currentMode !== mode) {
            setIsFirstLoad(false);
        }
    }, [currentMode, mode, isFirstLoad]);

    useEffect(() => {
        const fetchCameraState = async () => {
            const result = await getCameraState(
                streamUrl,
                streamPort,
                authorization,
                camera ?? 0,
                protocol,
                effectiveProxy
            );

            const isH265 = result.result.state.video_streams.video.codec === 'h265';
            setIsNoSound(result.result.state.audio_streams.audio.signal === 'no');

            // Если кодек H.265 и это не Android/iOS, показываем предупреждение и не запускаем воспроизведение
            if (isH265 && !isAndroid && !isIOS) {
                setShowH265Warning(true);
                setIsPlaying(false); // Отключаем автовоспроизведение
            } else {
                setShowH265Warning(false);
            }
        };

        if (authVerified && streamUrl && streamPort && authorization && Number.isInteger(camera as number)) {
            void fetchCameraState();
        }
    }, [authVerified, streamUrl, streamPort, authorization, camera, protocol, effectiveProxy, isAndroid, isIOS]);

    const checkAvailability = useCallback(
        async (credentials: string) => {
            if (!streamUrl || !streamPort) return;
            setIsCheckingAvailability(true);
            setAuthVerified(false);
            setServerUnavailable(false);
            setAuthRequired(false);

            try {
                await getCamerasList(streamUrl, streamPort, credentials, 5000, protocol, effectiveProxy);
                setAuthRequired(false);
                setServerUnavailable(false);
                setAuthVerified(true);
            } catch (e) {
                // Проверяем, является ли ошибка связанной с авторизацией (401)
                if ((e as Error)?.message === 'FORBIDDEN') {
                    setAuthRequired(true);
                    setServerUnavailable(false);
                    setAuthVerified(false);
                } else {
                    setServerUnavailable(true);
                    setAuthVerified(false);
                }
            } finally {
                setIsCheckingAvailability(false);
            }
        },
        [streamUrl, streamPort, protocol, effectiveProxy]
    );

    // Функция для проверки авторизации при клике на кнопку "войти"
    const handleLoginSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            await checkAvailability(`${authLogin}:${authPassword}`);
        },
        [checkAvailability, authLogin, authPassword]
    );

    // Проверяем авторизацию только при изменении основных параметров подключения
    useEffect(() => {
        void checkAvailability(`${authLogin}:${authPassword}`);
    }, [checkAvailability, streamUrl, streamPort, camera, authLogin, authPassword]);

    useEffect(() => {
        const loadCameras = async () => {
            if (!authVerified || !streamUrl || !streamPort) return;
            try {
                const list = await getCamerasList(
                    streamUrl,
                    streamPort,
                    `${authLogin}:${authPassword}`,
                    5000,
                    protocol,
                    effectiveProxy
                );
                setAvailableCameras(list);
            } catch (err) {
                // keep silent; availability flow will show errors
            }
        };
        void loadCameras();
    }, [authVerified, streamUrl, streamPort, authLogin, authPassword, camera, protocol, effectiveProxy]);

    // Устанавливаем начальные значения логина и пароля без автоматической проверки
    useEffect(() => {
        setAuthLogin(login);
        setAuthPassword(password ?? '');
    }, [login, password]);

    // Проверяем авторизацию при первоначальной загрузке страницы
    useEffect(() => {
        if (streamUrl && streamPort) {
            void checkAvailability(`${login}:${password ?? ''}`);
        }
    }, [streamUrl, streamPort, login, password, checkAvailability]);

    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
    const [activeFilterType, setActiveFilterType] = useState<MotionFilterOption | null>(null);
    const [maskGrid, setMaskGrid] = useState<MaskGrid>(() => createFilledMaskGrid(0));
    const [isMaskEditorVisible, setIsMaskEditorVisible] = useState<boolean>(false);
    const [appliedMotionFilter, setAppliedMotionFilter] = useState<TimelineMotionFilter | null>(null);
    const maskEditorInitialGridRef = useRef<MaskGrid | null>(null);
    const editingFilterTypeRef = useRef<MotionFilterOption | null>(null);

    const handleChangeMode = (newMode: Mode, time?: Date) => {
        setCurrentMode(newMode);
        if (time) {
            setServerTime(time, true);
        } else {
            updateServerTime();
            // setServerTime(new Date(), false);
        }
    };

    const handleTimelineClick = async (clickedTime: Date) => {
        // Сразу устанавливаем статус loading, так как мы не можем сразу продолжить воспроизведение
        setPlaybackStatus('loading');

        // Получаем текущее время сервера или используем текущее время системы
        const currentServerTime = await updateServerTime();

        // Проверяем, является ли выбранное время в будущем
        // Добавляем небольшой буфер (5 секунд) для более точного определения
        const isFutureTime = clickedTime.getTime() > (currentServerTime?.getTime() ?? 0);

        if (isFutureTime) {
            // Если время в будущем - переключаемся на прямую трансляцию
            setCurrentMode(Mode.Live);
            // Обновляем позицию на timeline без изменения serverTime
            setProgress(0); // Сбрасываем progress для корректного отображения
        } else {
            // Если время в прошлом - переключаемся на запись
            handleChangeMode(Mode.Record, clickedTime);
        }

        // При клике по таймлайну всегда запускаем воспроизведение
        setIsPlaying(true);
    };

    // Обработчики событий
    const handleTimeChange = async (time: Date) => {
        setServerTime(time, true); // skipCenterTimeline=true, чтобы центрировать вручную
        setCurrentMode(Mode.Record);
        // Явно центрируем таймлайн на выбранном времени
        if (timelineRef.current) {
            timelineRef.current.centerOnTime(time);
            // Ждем обновления visibleTimeRange после центрирования
            // Используем requestAnimationFrame для ожидания следующего рендера
            requestAnimationFrame(() => {
                requestAnimationFrame(async () => {
                    const visibleTimeRange = timelineRef.current?.getVisibleTimeRange();
                    if (visibleTimeRange && timelineRef.current) {
                        // Получаем intervalIndex из данных фрагментов
                        const fragmentsData = timelineRef.current.getFragmentsData();
                        const zoomIndex = fragmentsData?.intervalIndex ?? 8;
                        // Проверяем наличие данных для дней в visibleTimeRange и загружаем недостающие
                        // Данные, которые уже есть в кэше, будут отображены сразу
                        await timelineRef.current.checkAndLoadDaysForRange(
                            visibleTimeRange.start,
                            visibleTimeRange.end,
                            zoomIndex
                        );
                    }
                });
            });
        }
    };

    const handlePlayPause = async (value?: boolean) => {
        const newPlayingState = value ?? !isPlaying;

        // Если переключаемся с паузы на play в режиме Live
        if (!isPlaying && newPlayingState && currentMode === Mode.Live) {
            // Обновляем серверное время для актуальной прямой трансляции
            await updateServerTime();
            // Сбрасываем progress на актуальное время
            setProgress(0);
            // Обновляем cache buster для принудительной перезагрузки видео
            setLiveStreamCacheBuster(Date.now());
            // Запрашиваем актуальные фреймы
            if (timelineRef.current) {
                timelineRef.current.reloadFragments();
            }
        }

        setIsPlaying(newPlayingState);
    };

    const handleMuteToggle = () => {
        setIsMuted(!isMuted);
    };

    const handleSpeedChange = (speed: number) => {
        setPlaybackSpeed(speed);
    };

    const handlePlaybackStatusChange = (status: PlaybackStatus) => {
        setPlaybackStatus(status);
    };

    const handleMouseEnter = () => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        setShowControls(true);
    };

    const handleToggleFilterPanel = () => {
        setIsFilterPanelOpen(prev => !prev);
    };

    const handleSelectFilterOption = (option: MotionFilterOption) => {
        // Для всех фильтров показываем редактор маски
        editingFilterTypeRef.current = option;

        // Определяем базовую сетку из существующего фильтра
        let baseGrid: MaskGrid;
        if (option === 'motion') {
            baseGrid = appliedMotionFilter?.mask
                ? gridFromMaskPayload(appliedMotionFilter.mask)
                : createFilledMaskGrid(0);
        } else {
            // Для фильтров human/transport проверяем, есть ли уже маска в примененном фильтре
            const objectType = option as MotionObjectType;
            if (appliedMotionFilter?.types?.includes(objectType) && appliedMotionFilter?.mask) {
                baseGrid = gridFromMaskPayload(appliedMotionFilter.mask);
            } else {
                baseGrid = createFilledMaskGrid(0);
            }
        }

        maskEditorInitialGridRef.current = baseGrid.map(row => [...row]);
        setMaskGrid(baseGrid);
        setIsMaskEditorVisible(true);
        setIsFilterPanelOpen(false);
    };

    const handleClearMotionFilter = () => {
        setAppliedMotionFilter(null);
        setActiveFilterType(null);
        setIsMaskEditorVisible(false);
        setIsFilterPanelOpen(false);
        maskEditorInitialGridRef.current = null;
        setMaskGrid(createFilledMaskGrid(0));
        editingFilterTypeRef.current = null;
    };

    const handleMaskToggleCell = (rowIndex: number, colIndex: number) => {
        setMaskGrid(prev => {
            const nextGrid = prev.map(row => row.slice());
            const currentValue = nextGrid[rowIndex][colIndex];
            nextGrid[rowIndex][colIndex] = currentValue === 1 ? 0 : 1;
            return nextGrid;
        });
    };

    const handleMaskApply = () => {
        const payload = buildMaskPayload(maskGrid);
        const filterType = editingFilterTypeRef.current;

        if (filterType === 'motion') {
            // Для фильтра движения сохраняем только маску
            setAppliedMotionFilter({mask: payload});
            setActiveFilterType('motion');
        } else if (filterType === 'human' || filterType === 'transport') {
            // Для фильтров human/transport сохраняем и маску, и тип
            const objectType = filterType as MotionObjectType;
            setAppliedMotionFilter({
                mask: payload,
                types: [objectType]
            });
            setActiveFilterType(filterType);
        }

        setIsMaskEditorVisible(false);
        maskEditorInitialGridRef.current = maskGrid.map(row => [...row]);
        editingFilterTypeRef.current = null;
    };

    const handleMouseLeave = () => {
        hideTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 10000);
    };

    // Функции переключения камеры
    const switchToNextCamera = useCallback(() => {
        if (availableCameras.length <= 1) {
            return;
        }

        const currentIndex = availableCameras.findIndex(c => c.id === camera);
        const nextIndex = (currentIndex + 1) % availableCameras.length;
        // Очищаем кэш скачанных фреймов при переключении камеры
        if (timelineRef.current) {
            timelineRef.current.clearFramesCache();
            // Загружаем актуальные данные для новой камеры
            timelineRef.current.reloadFragments();
        }
        setCamera(availableCameras[nextIndex].id);
    }, [availableCameras, camera]);

    const switchToPreviousCamera = useCallback(() => {
        if (availableCameras.length <= 1) {
            return;
        }

        const currentIndex = availableCameras.findIndex(c => c.id === camera);
        const prevIndex = currentIndex <= 0 ? availableCameras.length - 1 : currentIndex - 1;
        // Очищаем кэш скачанных фреймов при переключении камеры
        if (timelineRef.current) {
            timelineRef.current.clearFramesCache();
            // Загружаем актуальные данные для новой камеры
            timelineRef.current.reloadFragments();
        }
        setCamera(availableCameras[prevIndex].id);
    }, [availableCameras, camera]);

    // Обработчики свайпов по плееру
    const handlePlayerTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1 && availableCameras.length > 1) {
                const touch = e.touches[0];
                setIsPlayerSwipeActive(true);
                setPlayerSwipeStartX(touch.clientX);
                setPlayerSwipeStartY(touch.clientY);
                setHasPlayerSwiped(false);
            }
        },
        [availableCameras.length]
    );

    const handlePlayerTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isPlayerSwipeActive || e.touches.length !== 1 || availableCameras.length <= 1) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - playerSwipeStartX;
            const deltaY = touch.clientY - playerSwipeStartY;

            // Проверяем, что это горизонтальный свайп
            if (Math.abs(deltaX) > PLAYER_HORIZONTAL_SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
                if (!hasPlayerSwiped && containerRef.current) {
                    const containerWidth = containerRef.current.offsetWidth;
                    const swipeThreshold = (containerWidth * CAMERA_SWIPE_THRESHOLD_PERCENT) / 100;

                    if (Math.abs(deltaX) >= swipeThreshold) {
                        if (deltaX > 0) {
                            // Свайп вправо - предыдущая камера
                            switchToPreviousCamera();
                        } else {
                            // Свайп влево - следующая камера
                            switchToNextCamera();
                        }
                        setHasPlayerSwiped(true);
                    }
                }
            }
        },
        [
            isPlayerSwipeActive,
            playerSwipeStartX,
            playerSwipeStartY,
            hasPlayerSwiped,
            availableCameras.length,
            switchToNextCamera,
            switchToPreviousCamera
        ]
    );

    const handlePlayerTouchEnd = useCallback(() => {
        setIsPlayerSwipeActive(false);
        setHasPlayerSwiped(false);
    }, []);

    // Показываем панель (включая Timeline) и перезапускаем таймер авто-скрытия
    const showControlsAndRestartAutoHide = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        setShowControls(true);
        hideTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 10000);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            if (containerRef.current?.requestFullscreen) {
                containerRef.current.requestFullscreen().catch(err => {
                    console.error(`Ошибка при попытке перехода в полноэкранный режим: ${err.message}`);
                });
            }
            return;
        }

        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.error(`Ошибка при попытке выхода из полноэкранного режима: ${err.message}`);
            });
        }
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        setIsFullscreen(prev => !prev);
        toggleFullscreen();
    }, [toggleFullscreen]);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            const key = e.key?.toLowerCase();
            const code = (e as KeyboardEvent).code;

            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;

            // Fullscreen (F)
            if (key === 'f') {
                e.preventDefault();
                handleToggleFullscreen();
                return;
            }

            // Play/Pause (Space)
            const isSpace = key === ' ' || code === 'Space' || e.key === 'Spacebar';
            if (isSpace) {
                e.preventDefault();
                setIsPlaying(prev => !prev);
                return;
            }

            const isLeft = key === 'arrowleft' || code === 'ArrowLeft';
            const isRight = key === 'arrowright' || code === 'ArrowRight';
            if (isLeft || isRight) {
                e.preventDefault();
                // Всегда показываем Timeline и перезапускаем таймер скрытия
                showControlsAndRestartAutoHide();
                const delta = isLeft ? -5 : 5;

                if (currentMode === Mode.Live && isLeft) {
                    const base = archiveTargetTimeRef.current ?? (await updateServerTime()) ?? new Date();
                    const targetTime = addSecondsToDate(base, delta);
                    archiveTargetTimeRef.current = targetTime;
                    setCurrentMode(Mode.Record);
                    setServerTime(targetTime, true);
                    return;
                }

                if (currentMode === Mode.Record && serverTime) {
                    let candidateAbsolute = addSecondsToDate(serverTime, ctxProgress + delta);

                    if (isRight) {
                        const baseOffset = forwardAccumOffsetRef.current ?? ctxProgress;
                        const nextOffset = baseOffset + 5;
                        forwardAccumOffsetRef.current = nextOffset;
                        candidateAbsolute = addSecondsToDate(serverTime, nextOffset);

                        const approxNow = new Date();
                        if (candidateAbsolute.getTime() > approxNow.getTime()) {
                            forwardAccumOffsetRef.current = null;
                            const nowServer = (await updateServerTime()) ?? new Date();
                            setCurrentMode(Mode.Live);
                            setServerTime(nowServer, false);
                            setProgress(0);
                            return;
                        } else {
                            setServerTime(candidateAbsolute, true);
                        }
                    }

                    if (isLeft && ctxProgress + delta < 0) {
                        setServerTime(candidateAbsolute, true);
                        return;
                    }
                }

                playerRef.current?.seekBy(delta);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        handleToggleFullscreen,
        currentMode,
        serverTime,
        ctxProgress,
        updateServerTime,
        setProgress,
        setServerTime,
        showControlsAndRestartAutoHide
    ]);

    useEffect(() => {
        if (currentMode !== Mode.Live) {
            archiveTargetTimeRef.current = null;
        }
        if (currentMode !== Mode.Record) {
            forwardAccumOffsetRef.current = null;
        }
    }, [currentMode]);

    useEffect(() => {
        forwardAccumOffsetRef.current = null;
    }, [ctxProgress]);

    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    // Отслеживаем размер экрана для мобильных устройств
    useEffect(() => {
        const checkIsMobile = () => {
            setIsMobile(window.outerWidth < 1024);
        };

        checkIsMobile();
        window.addEventListener('resize', checkIsMobile);

        return () => window.removeEventListener('resize', checkIsMobile);
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible';
            if (!isVisible) {
                // Сохраняем текущее состояние воспроизведения и ставим на паузу
                wasPlayingBeforeHiddenRef.current = isPlaying;
                if (isPlaying) {
                    setIsPlaying(false);
                }
                return;
            }

            // Вкладка снова видима
            const resume = async () => {
                if (currentMode === Mode.Live) {
                    // Актуализируем серверное время для прямой трансляции
                    await updateServerTime();
                    setProgress(0);
                }

                if (wasPlayingBeforeHiddenRef.current) {
                    setIsPlaying(true);
                    setTimeout(() => {
                        if (playerRef.current) {
                            const videoElement = playerRef.current as {videoRef?: {current?: HTMLVideoElement}};
                            if (videoElement?.videoRef?.current) {
                                videoElement.videoRef.current.play().catch((error: Error) => {
                                    console.error('Ошибка при возобновлении воспроизведения:', error);
                                });
                            }
                        }
                    }, 100);
                }
            };

            void resume();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isPlaying, currentMode, updateServerTime, setProgress]);

    useEffect(() => {
        if (isMaskEditorVisible) {
            isCtrlPressedRef.current = false;
            setIsZoomActive(false);
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;

            if (e.key === 'Control' || e.ctrlKey || e.metaKey) {
                if (!enableZoomMagnifier) return;

                isCtrlPressedRef.current = true;

                // Если курсор уже находится над видео контейнером, сразу активируем лупу
                if (videoContainerRef.current) {
                    const rect = videoContainerRef.current.getBoundingClientRect();
                    const {x, y} = lastMousePositionRef.current;

                    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                        setIsZoomActive(true);
                        setZoomMouseX(x);
                        setZoomMouseY(y);
                    }
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control' || (!e.ctrlKey && !e.metaKey)) {
                isCtrlPressedRef.current = false;
                setIsZoomActive(false);
                // Зум видео не сбрасываем при отпускании Ctrl, чтобы сохранить уровень зума после скролла
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            // Всегда сохраняем последнюю позицию мыши для немедленной активации лупы при нажатии Ctrl
            if (enableZoomMagnifier) {
                lastMousePositionRef.current = {x: e.clientX, y: e.clientY};
            }

            if (enableZoomMagnifier && isCtrlPressedRef.current && videoContainerRef.current) {
                const rect = videoContainerRef.current.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;

                // Проверяем, что курсор находится внутри видео контейнера
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    setIsZoomActive(true);
                    setZoomMouseX(x);
                    setZoomMouseY(y);
                } else {
                    setIsZoomActive(false);
                }
            }
        };

        const handleMouseEnter = (e: MouseEvent | Event) => {
            // Сохраняем позицию мыши при входе в видео контейнер
            if (enableZoomMagnifier && 'clientX' in e) {
                const mouseEvent = e as MouseEvent;
                lastMousePositionRef.current = {x: mouseEvent.clientX, y: mouseEvent.clientY};
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (showSaveModal) return;

            // Обрабатываем скролл для зума видео без Ctrl
            if (!enableVideoZoom || !containerRef.current || !videoContainerRef.current) return;

            const target = e.target as HTMLElement | null;

            if (
                target &&
                (target.closest('[class*="timeline"]') ||
                    target.closest('[class*="controlPanel"]') ||
                    target.closest('[class*="controlArea"]') ||
                    target.closest('[class*="modalOverlay"]') ||
                    target.closest('[class*="modal"]'))
            ) {
                return;
            }

            const rect = containerRef.current.getBoundingClientRect();
            const videoContainerRect = videoContainerRef.current.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            // Проверяем, что курсор находится внутри контейнера
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                e.preventDefault();
                e.stopPropagation();

                // Вычисляем относительную позицию курсора внутри видео контейнера для transform-origin
                const relativeX = (x - videoContainerRect.left) / videoContainerRect.width;
                const relativeY = (y - videoContainerRect.top) / videoContainerRect.height;

                // Обновляем позицию мыши для лупы (если она активна)
                if (enableZoomMagnifier && isCtrlPressedRef.current) {
                    setZoomMouseX(x);
                    setZoomMouseY(y);
                }

                // Обновляем точку зума для видео
                setZoomOriginX(relativeX);
                setZoomOriginY(relativeY);

                // Изменяем зум видео: скролл вверх - увеличиваем, вниз - уменьшаем
                setVideoZoom(prev => {
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    const newZoom = Math.max(1, Math.min(5, prev + delta));
                    return Number(newZoom.toFixed(1));
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('wheel', handleWheel, {passive: false});

        const videoContainer = videoContainerRef.current;
        if (videoContainer) {
            videoContainer.addEventListener('mouseenter', handleMouseEnter as EventListener);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('wheel', handleWheel);
            if (videoContainer) {
                videoContainer.removeEventListener('mouseenter', handleMouseEnter as EventListener);
            }
        };
    }, [enableZoomMagnifier, enableVideoZoom, isMaskEditorVisible, showSaveModal]);

    const handleSaveStreamFinish = (start: Date, end: Date) => {
        const fileName = `record_${formatDate(start, 'yyyy-MM-dd_HH-mm')}_${formatDate(end, 'yyyy-MM-dd_HH-mm')}`;
        const durationSeconds = (end.getTime() - start.getTime()) / 1000;

        const formatDuration = (seconds: number): string => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        const date = start.toISOString().split('.')[0];

        const url = buildRequestUrl({
            host: streamUrl,
            port: streamPort,
            protocol,
            proxy: effectiveProxy,
            path: `/cameras/${camera ?? 0}/streaming/main.mp4?authorization=Basic%20${getAuthToken(
                `${authLogin}:${authPassword}`
            )}&time=${date}&duration=${formatDuration(durationSeconds)}&download=1&filename=${fileName}`
        });
        const downloadUrl = formatUrlForDownload({
            url,
            start,
            end,
            fileName
        });

        clickA(downloadUrl);
        setShowSaveModal(false);
    };

    const handleSaveStream = () => {
        setShowSaveModal(true);
    };

    // Функция для получения данных фрагментов из Timeline
    const getFragmentsFromTimeline = useCallback(() => {
        if (!timelineRef.current) {
            return null;
        }

        const fragmentsData = timelineRef.current.getFragmentsData();
        if (!fragmentsData) {
            return null;
        }

        return fragmentsData;
    }, []);

    // Функция для поиска следующего доступного фрагмента на timeline
    const findNextRecordingSegment = useCallback(
        (currentAbsoluteTime: Date) => {
            const fragmentsData = getFragmentsFromTimeline();
            if (!fragmentsData) {
                return null;
            }

            const {fragmentRanges} = fragmentsData;

            // Ищем следующий доступный фрагмент после текущего времени
            for (const fragment of fragmentRanges) {
                if (fragment.start.getTime() > currentAbsoluteTime.getTime()) {
                    return fragment.start;
                }
            }

            return null;
        },
        [getFragmentsFromTimeline]
    );

    // Функция для нормализации unitLengthSeconds к ближайшему значению из UNIT_LENGTHS
    // Это необходимо для избежания проблем с плавающей точкой
    const normalizeUnitLength = useCallback((calculatedValue: number): number => {
        // Находим ближайшее значение из UNIT_LENGTHS
        let closestValue = UNIT_LENGTHS[0];
        let minDifference = Math.abs(calculatedValue - closestValue);

        for (let i = 1; i < UNIT_LENGTHS.length; i++) {
            const difference = Math.abs(calculatedValue - UNIT_LENGTHS[i]);
            if (difference < minDifference) {
                minDifference = difference;
                closestValue = UNIT_LENGTHS[i];
            }
        }

        return closestValue;
    }, []);

    // Функция для поиска следующего отображаемого фрейма (используется при включенном фильтре)
    const findNextVisibleFrameFromTimeline = useCallback(
        (currentAbsoluteTime: Date) => {
            const fragmentsData = getFragmentsFromTimeline();
            if (!fragmentsData) {
                return null;
            }

            const {fragments, fragmentsBufferRange, intervalIndex} = fragmentsData;

            // Вычисляем unitLengthSeconds на основе реальных данных, а не intervalIndex из состояния
            // Это важно, так как данные могли быть созданы с другим zoomIndex при изменении зума
            const bufferDurationMs = fragmentsBufferRange.end.getTime() - fragmentsBufferRange.start.getTime();
            const calculatedUnitLengthSeconds =
                fragments.length > 0 ? bufferDurationMs / (fragments.length * 1000) : UNIT_LENGTHS[intervalIndex];

            // Нормализуем значение к ближайшему из UNIT_LENGTHS, чтобы избежать проблем с плавающей точкой
            const normalizedUnitLengthSeconds = normalizeUnitLength(calculatedUnitLengthSeconds);

            return findNextVisibleFrame(
                currentAbsoluteTime,
                fragments,
                fragmentsBufferRange,
                normalizedUnitLengthSeconds
            );
        },
        [getFragmentsFromTimeline, normalizeUnitLength]
    );

    // Функция для проверки наличия отображаемых фреймов в ближайшие 5 секунд
    const checkVisibleFramesInNextSeconds = useCallback(
        (currentAbsoluteTime: Date, lookAheadSeconds: number = 5) => {
            const fragmentsData = getFragmentsFromTimeline();
            if (!fragmentsData) {
                return false;
            }

            const {fragments, fragmentsBufferRange, intervalIndex} = fragmentsData;

            return hasVisibleFramesInNextSeconds(
                currentAbsoluteTime,
                fragments,
                fragmentsBufferRange,
                UNIT_LENGTHS[intervalIndex],
                lookAheadSeconds
            );
        },
        [getFragmentsFromTimeline]
    );

    // Функция для проверки, достиг ли указатель конца текущего фрагмента
    const checkIfAtEndOfCurrentSegment = useCallback(
        (currentAbsoluteTime: Date) => {
            const fragmentsData = getFragmentsFromTimeline();
            if (!fragmentsData) {
                return false;
            }

            const {fragmentRanges} = fragmentsData;

            // Проходим по каждому фрагменту и проверяем, находится ли текущее время внутри какого-то фрагмента
            for (let i = 0; i < fragmentRanges.length; i++) {
                const fragmentRange = fragmentRanges[i];

                // Если мы находимся в этом фрагменте
                if (
                    currentAbsoluteTime.getTime() >= fragmentRange.start.getTime() &&
                    currentAbsoluteTime.getTime() <= fragmentRange.end.getTime()
                ) {
                    // Проверяем, близки ли мы к концу (в пределах 1 секунды)
                    const timeToEnd = fragmentRange.end.getTime() - currentAbsoluteTime.getTime();
                    const isNearEnd = timeToEnd <= 1000; // 1 секунда

                    return isNearEnd;
                }
            }

            return false;
        },
        [getFragmentsFromTimeline]
    );

    const props: PlayerComponentProps = {
        url: finalStreamUrl,
        playing: isPlaying,
        muted: isMuted,
        // posterUrl,
        playbackSpeed,
        onPlayPause: (value?: boolean) => handlePlayPause(value),
        onPlaybackStatusChange: handlePlaybackStatusChange,
        onProgress: p => {
            if (currentMode === Mode.Record && serverTime) {
                // Вычисляем абсолютное время с учетом накопленного gap
                const currentTotalProgress = p.currentTime + fragmetsGapRef.current;
                const currentAbsoluteTime = new Date(serverTime.getTime() + currentTotalProgress * 1000);

                // При включенном фильтре проверяем наличие отображаемых фреймов в ближайшие 5 секунд
                if (appliedMotionFilter) {
                    // Пропускаем проверку во время перехода к новому фрагменту
                    if (isTransitioningToNextFragmentRef.current) {
                        return;
                    }

                    const hasVisibleFrames = checkVisibleFramesInNextSeconds(currentAbsoluteTime, 5);

                    if (!hasVisibleFrames) {
                        // Если нет отображаемых фреймов в ближайшие 5 секунд,
                        // находим следующий отображаемый фрейм и переключаемся на него
                        const nextVisibleFrameTime = findNextVisibleFrameFromTimeline(currentAbsoluteTime);

                        if (nextVisibleFrameTime && nextFragmentTimeRef.current !== nextVisibleFrameTime) {
                            nextFragmentTimeRef.current = nextVisibleFrameTime;
                            const newProgress = (nextVisibleFrameTime.getTime() - serverTime.getTime()) / 1000;

                            // Устанавливаем флаг перехода и обновляем gap
                            isTransitioningToNextFragmentRef.current = true;

                            // Gap равен разности между желаемой позицией и текущей позицией плеера
                            fragmetsGapRef.current = newProgress - p.currentTime;

                            // Проверяем, находится ли следующий фрейм за пределами видимого таймлайна
                            // Если да, центрируем таймлайн по времени этого фрейма
                            if (timelineRef.current) {
                                const visibleTimeRange = timelineRef.current.getVisibleTimeRange();
                                if (visibleTimeRange) {
                                    const nextFrameTime = nextVisibleFrameTime.getTime();
                                    const visibleStart = visibleTimeRange.start.getTime();
                                    const visibleEnd = visibleTimeRange.end.getTime();

                                    // Проверяем, находится ли следующий фрейм за пределами видимого диапазона
                                    const isOutsideVisibleRange =
                                        nextFrameTime < visibleStart || nextFrameTime > visibleEnd;

                                    if (isOutsideVisibleRange) {
                                        timelineRef.current.centerOnTime(nextVisibleFrameTime);
                                    }
                                }
                            }

                            // Обновляем serverTime для переключения на новый m3u8 с временной меткой следующего фрейма
                            // Проверяем, что новое время отличается от текущего serverTime, чтобы избежать бесконечных циклов
                            if (!serverTime || Math.abs(serverTime.getTime() - nextVisibleFrameTime.getTime()) > 1000) {
                                handleChangeMode(Mode.Record, nextVisibleFrameTime);
                            }

                            setProgress(newProgress);
                            return;
                        } else {
                            // Детальное логирование причины остановки
                            const fragmentsData = getFragmentsFromTimeline();
                            const currentFragmentIndex = fragmentsData
                                ? Math.floor(
                                      (currentAbsoluteTime.getTime() -
                                          fragmentsData.fragmentsBufferRange.start.getTime()) /
                                          (UNIT_LENGTHS[fragmentsData.intervalIndex] * 1000)
                                  )
                                : -1;
                            console.warn('[PLAYBACK DEBUG] Stopping playback - no next visible frame', {
                                currentAbsoluteTime: currentAbsoluteTime.toISOString(),
                                nextVisibleFrameTime: nextVisibleFrameTime?.toISOString() || null,
                                nextFragmentTimeRef: nextFragmentTimeRef.current?.toISOString() || null,
                                fragmentsData: fragmentsData
                                    ? {
                                          fragmentsLength: fragmentsData.fragments.length,
                                          fragmentsBufferRange: {
                                              start: fragmentsData.fragmentsBufferRange.start.toISOString(),
                                              end: fragmentsData.fragmentsBufferRange.end.toISOString()
                                          },
                                          visibleFramesCount: fragmentsData.fragments.filter(f => f > 0).length,
                                          currentFragmentIndex,
                                          futureVisibleFramesCount: fragmentsData.fragments
                                              .slice(currentFragmentIndex + 1)
                                              .filter(f => f > 0).length
                                      }
                                    : null,
                                reason: !nextVisibleFrameTime
                                    ? 'findNextVisibleFrame returned null'
                                    : nextFragmentTimeRef.current === nextVisibleFrameTime
                                      ? 'nextFragmentTimeRef equals nextVisibleFrameTime (duplicate transition blocked)'
                                      : 'unknown'
                            });
                            setIsPlaying(false);
                            return;
                        }
                    }
                    // Если есть отображаемые фреймы в ближайшие 5 секунд, продолжаем воспроизведение
                } else {
                    // Для обычных фреймов используем стандартную логику
                    // Проверяем, достигли ли мы конца текущего фрагмента
                    if (checkIfAtEndOfCurrentSegment(currentAbsoluteTime)) {
                        // Ищем следующий доступный фрагмент
                        const nextSegmentTime = findNextRecordingSegment(currentAbsoluteTime);

                        if (nextSegmentTime && nextFragmentTimeRef.current !== nextSegmentTime) {
                            nextFragmentTimeRef.current = nextSegmentTime;
                            const newProgress = (nextSegmentTime.getTime() - serverTime.getTime()) / 1000;

                            // Устанавливаем флаг перехода и обновляем gap
                            isTransitioningToNextFragmentRef.current = true;

                            // Gap равен разности между желаемой позицией и текущей позицией плеера
                            fragmetsGapRef.current = newProgress - p.currentTime;

                            setProgress(newProgress);
                            return;
                        } else {
                            setIsPlaying(false);
                            return;
                        }
                    }
                }
            }

            // Пропускаем обычное обновление сразу после перехода к новому фрагменту
            if (isTransitioningToNextFragmentRef.current) {
                isTransitioningToNextFragmentRef.current = false;
                // Очищаем ссылку на предыдущий фрагмент, чтобы не блокировать следующие переходы
                nextFragmentTimeRef.current = null;
                return;
            }

            const totalProgress = p.currentTime + fragmetsGapRef.current;

            setProgress(totalProgress);
        }
    };

    // Определяем, нужно ли показывать вертикальный таймлайн
    const isVerticalTimeline = isMobileDevice && orientation === 'landscape';

    const shouldHideUiForMask = isMaskEditorVisible;

    return (
        <>
            <div
                className={`${styles.player} ${isVerticalTimeline ? styles.withVerticalTimeline : ''}`}
                ref={containerRef}
                role="region"
                aria-label="Плеер видео"
            >
                {showCameraSelector && !shouldHideUiForMask && (
                    <div
                        className={`${styles.cameraSelector} ${isVerticalTimeline ? styles.mobileLandscapeCameraSelector : ''}`}
                    >
                        <Select
                            options={availableCameras.map(c => ({
                                value: c.id,
                                label: c.name ?? `Camera ${c.id}`
                            }))}
                            value={camera ?? ''}
                            onChange={value => {
                                // Очищаем кэш скачанных фреймов при переключении камеры
                                if (timelineRef.current) {
                                    timelineRef.current.clearFramesCache();
                                    // Загружаем актуальные данные для новой камеры
                                    timelineRef.current.reloadFragments();
                                }
                                setCamera(Number(value));
                            }}
                            aria-label="Выбор камеры"
                        />
                    </div>
                )}

                {!shouldHideUiForMask && (
                    <div
                        className={`${styles.topControls} ${
                            isVerticalTimeline ? styles.mobileLandscapeTopControls : ''
                        }`}
                    >
                        <ModeIndicator
                            mode={currentMode}
                            playbackStatus={playbackStatus}
                        />
                    </div>
                )}
                <div
                    ref={videoContainerRef}
                    className={`${styles.videoContainer} ${isVerticalTimeline ? styles.landscapeVideoContainer : ''}`}
                >
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            position: 'relative'
                        }}
                        onDoubleClick={handleToggleFullscreen}
                        onTouchStart={handlePlayerTouchStart}
                        onTouchMove={handlePlayerTouchMove}
                        onTouchEnd={handlePlayerTouchEnd}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                            const key = e.key.toLowerCase();
                            if (key === 'enter') {
                                e.preventDefault();
                                handleToggleFullscreen();
                            }
                        }}
                    >
                        {/* Wrapper для видео с зумом */}
                        <div
                            style={{
                                width: '100%',
                                height: '100%',
                                transform: enableVideoZoom ? `scale(${videoZoom})` : 'none',
                                transformOrigin: enableVideoZoom
                                    ? `${zoomOriginX * 100}% ${zoomOriginY * 100}%`
                                    : 'center',
                                transition: enableVideoZoom && videoZoom === 1 ? 'transform 0.3s ease-out' : 'none',
                                position: 'absolute',
                                inset: 0
                            }}
                        >
                            {isSafari ? (
                                <VideoTag
                                    isLandscape={isVerticalTimeline}
                                    ref={playerRef}
                                    {...props}
                                    updateServerTime={updateServerTime}
                                    setProgress={setProgress}
                                    overlayText={showH265Warning ? OVERLAY_TEXT_265 : undefined}
                                />
                            ) : currentMode === 'record' ? (
                                <HlsPlayer
                                    isLandscape={isVerticalTimeline}
                                    ref={playerRef}
                                    {...props}
                                    overlayText={showH265Warning ? OVERLAY_TEXT_265 : undefined}
                                    onFragmentTimeUpdate={(time: Date) => {
                                        // Обновляем serverTime на актуальное время из первого .ts фрагмента
                                        // Это переместит индикатор текущего времени на правильную позицию
                                        const videoElement = playerRef.current?.getVideoElement?.();
                                        const videoCurrentTime = videoElement?.currentTime || 0;

                                        // skipCenterTimeline = true, чтобы не центрировать таймлайн
                                        setServerTime(time, true);

                                        // Сразу обновляем progress на текущее время воспроизведения,
                                        // чтобы индикатор продолжал двигаться вместе с видео
                                        if (videoCurrentTime > 0) {
                                            setProgress(videoCurrentTime);
                                        }
                                    }}
                                />
                            ) : (
                                <VideoTag
                                    isLandscape={isVerticalTimeline}
                                    ref={playerRef}
                                    {...props}
                                    updateServerTime={updateServerTime}
                                    setProgress={setProgress}
                                    overlayText={showH265Warning ? OVERLAY_TEXT_265 : undefined}
                                />
                            )}
                        </div>
                    </div>
                    {/* Оверлеи поверх видео без зума - вне transform-контейнера */}
                    <MotionMaskOverlay
                        isVisible={isMaskEditorVisible}
                        maskGrid={maskGrid}
                        onToggleCell={handleMaskToggleCell}
                        onApply={handleMaskApply}
                    />
                    {(playbackStatus === 'loading' || playbackStatus === 'buffering') && (
                        <Loader message={playbackStatus === 'loading' ? 'Загрузка видео...' : 'Буферизация...'} />
                    )}
                    {!isPlaying && playbackStatus !== 'loading' && playbackStatus !== 'buffering' && (
                        <PlayOverlay
                            onClick={() => handlePlayPause(true)}
                            text={showH265Warning ? OVERLAY_TEXT_265 : undefined}
                        />
                    )}
                    {/* Для iPhone всегда используем VideoTag с нативным воспроизведением m3u8 */}
                    {showSaveModal && (
                        <SaveStreamModal
                            currentTime={addSecondsToDate(serverTime ?? new Date(), ctxProgress)}
                            isOpen={showSaveModal}
                            onClose={() => setShowSaveModal(false)}
                            onFinish={handleSaveStreamFinish}
                            url={streamUrl}
                            port={streamPort}
                            credentials={authVerified ? authorization : ''}
                            camera={camera}
                            protocol={protocol}
                            proxy={effectiveProxy}
                        />
                    )}
                    {(serverUnavailable || authRequired) && (
                        <div
                            className={styles.overlay}
                            aria-live="polite"
                        >
                            {serverUnavailable && (
                                <div
                                    className={styles.overlayCard}
                                    role="alert"
                                >
                                    <div className={styles.overlayTitle}>Сервер недоступен</div>
                                    <div className={styles.overlayText}>Проверьте подключение и попробуйте позже.</div>
                                </div>
                            )}
                            {authRequired && (
                                <div
                                    className={styles.overlayCard}
                                    role="dialog"
                                    aria-modal="true"
                                >
                                    <div className={styles.overlayTitle}>Требуется авторизация</div>
                                    <form
                                        className={styles.loginForm}
                                        onSubmit={handleLoginSubmit}
                                    >
                                        <label className={styles.label}>
                                            Логин
                                            <input
                                                className={styles.input}
                                                type="text"
                                                value={authLogin}
                                                onChange={e => setAuthLogin(e.target.value)}
                                            />
                                        </label>
                                        <label className={styles.label}>
                                            Пароль
                                            <input
                                                className={styles.input}
                                                type="password"
                                                value={authPassword}
                                                onChange={e => setAuthPassword(e.target.value)}
                                            />
                                        </label>
                                        <div className={styles.actions}>
                                            <button
                                                type="submit"
                                                className={styles.primaryButton}
                                                disabled={isCheckingAvailability}
                                            >
                                                Войти
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {!shouldHideUiForMask && appliedMotionFilter && isPlaying && (
                    <button
                        className={styles.resetFilterButton}
                        onClick={handleClearMotionFilter}
                        aria-label="Сброс фильтра"
                        style={{
                            position: 'absolute',
                            bottom: showControls || isMobile ? '90px' : '10px',
                            right: '10px',
                            zIndex: 10
                        }}
                    >
                        Сброс
                    </button>
                )}
                {!shouldHideUiForMask && (
                    <div
                        className={styles.controlArea}
                        ref={controlAreaRef}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div
                            className={`${styles.controlPanelContainer} ${showControls || isMobile ? styles.show : ''}`}
                        >
                            <ControlPanel
                                mode={currentMode}
                                isPlaying={isPlaying}
                                isMuted={isMuted}
                                isFullscreen={isFullscreen}
                                isNoSound={isNoSound}
                                playbackSpeed={playbackSpeed}
                                url={streamUrl}
                                port={streamPort}
                                protocol={protocol}
                                credentials={authVerified ? authorization : ''}
                                progress={ctxProgress}
                                camera={camera ?? 0}
                                proxy={effectiveProxy}
                                popperBoundaryElement={containerRef.current}
                                popperPortalId={datepickerPortalIdRef.current}
                                timelineRef={timelineRef}
                                onPlayPause={() => handlePlayPause()}
                                onMuteToggle={() => handleMuteToggle()}
                                onToggleFullscreen={() => handleToggleFullscreen()}
                                onSpeedChange={handleSpeedChange}
                                onSaveStream={handleSaveStream}
                                onTimeClick={handleTimelineClick}
                                onChangeStartDate={handleTimeChange}
                                onChangeMode={handleChangeMode}
                                disableSpeedChange={currentMode === Mode.Live}
                                disableCenterTimeline={currentMode === Mode.Live}
                                motionFilter={appliedMotionFilter}
                                isFilterPanelOpen={isFilterPanelOpen}
                                activeFilterType={activeFilterType}
                                onToggleFilterPanel={handleToggleFilterPanel}
                                onSelectFilterOption={handleSelectFilterOption}
                                onClearFilter={handleClearMotionFilter}
                            />
                        </div>
                    </div>
                )}
                <div id={datepickerPortalIdRef.current} />
                {enableZoomMagnifier &&
                    isZoomActive &&
                    playerRef.current?.getVideoElement &&
                    playerRef.current.getVideoElement() && (
                        <ZoomMagnifier
                            videoElement={playerRef.current.getVideoElement()}
                            mouseX={zoomMouseX}
                            mouseY={zoomMouseY}
                            isActive={isZoomActive}
                            zoomFactor={2}
                            size={200}
                            isFullscreen={isFullscreen}
                            playerContainerRef={containerRef}
                        />
                    )}
            </div>
        </>
    );
};
