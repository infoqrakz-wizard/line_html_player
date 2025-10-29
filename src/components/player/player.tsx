import React, {useCallback, useEffect, useRef, useState} from 'react';

import {formatDate, addSecondsToDate} from '../../utils/dates';
import {getProtocol, formatUrlForDownload, clickA} from '../../utils/url-params';
import {Mode, Protocol} from '../../utils/types';
import {getCameraState, getCamerasList, type CameraInfo} from '../../utils/api';
import {ControlPanel} from '../control-panel';
import {CAMERA_SWIPE_THRESHOLD_PERCENT, PLAYER_HORIZONTAL_SWIPE_THRESHOLD} from '../timeline/utils/constants';

import {useTime} from '../../context/time-context';
import {useTimelineState} from '../timeline/hooks/use-timeline-state';
import {useOrientation} from '../timeline/hooks/use-orientation';
import {TimelineRef} from '../timeline/types';

import {HlsPlayer, VideoTag, SaveStreamModal, ModeIndicator, ZoomMagnifier} from './components';
import {PlayerComponentProps, PlaybackStatus} from './components/player-interface';
import {getAuthToken} from '../../utils/getAuthToken';

import type {PlayerRef} from './components/player-interface';
import Select from '../select/select';
import styles from './player.module.scss';
import {buildRequestUrl} from '../../utils/url-builder';

const OVERLAY_TEXT_265 = 'Ваш браузер не поддерживает кодек H.265 (HEVC).';

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
            finalStreamUrl = videoUrl || '';
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
    const handleTimeChange = (time: Date) => {
        setServerTime(time);
        setCurrentMode(Mode.Record);
    };

    const handlePlayPause = (value?: boolean) => {
        setIsPlaying(value ?? !isPlaying);
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
        setCamera(availableCameras[nextIndex].id);
    }, [availableCameras, camera]);

    const switchToPreviousCamera = useCallback(() => {
        if (availableCameras.length <= 1) {
            return;
        }

        const currentIndex = availableCameras.findIndex(c => c.id === camera);
        const prevIndex = currentIndex <= 0 ? availableCameras.length - 1 : currentIndex - 1;
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
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;

            if (e.key === 'Control' || e.ctrlKey || e.metaKey) {
                if (!enableZoomMagnifier) return;

                isCtrlPressedRef.current = true;

                // Если курсор уже находится над контейнером, сразу активируем лупу
                if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
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

            if (enableZoomMagnifier && isCtrlPressedRef.current && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;

                // Проверяем, что курсор находится внутри контейнера
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    setIsZoomActive(true);
                    setZoomMouseX(x);
                    setZoomMouseY(y);
                } else {
                    setIsZoomActive(false);
                }
            }
        };

        const handleMouseEnter = (e: MouseEvent) => {
            // Сохраняем позицию мыши при входе в контейнер
            if (enableZoomMagnifier) {
                lastMousePositionRef.current = {x: e.clientX, y: e.clientY};
            }
        };

        const handleMouseLeave = () => {
            if (isCtrlPressedRef.current) {
                setIsZoomActive(false);
            }
        };

        const handleWheel = (e: WheelEvent) => {
            // Обрабатываем скролл для зума видео без Ctrl
            if (!enableVideoZoom || !containerRef.current || !videoContainerRef.current) return;

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

        const container = containerRef.current;
        if (container) {
            container.addEventListener('mouseenter', handleMouseEnter as EventListener);
            container.addEventListener('mouseleave', handleMouseLeave);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('wheel', handleWheel);
            if (container) {
                container.removeEventListener('mouseenter', handleMouseEnter as EventListener);
                container.removeEventListener('mouseleave', handleMouseLeave);
            }
        };
    }, [enableZoomMagnifier, enableVideoZoom]);

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
                        console.log('No next segment found, stopping playback');
                        setIsPlaying(false);
                    }
                }
            }

            // Пропускаем обычное обновление сразу после перехода к новому фрагменту
            if (isTransitioningToNextFragmentRef.current) {
                console.log('Skipping normal update after fragment transition');
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

    return (
        <>
            <div
                className={`${styles.player} ${isVerticalTimeline ? styles.withVerticalTimeline : ''}`}
                ref={containerRef}
                role="region"
                aria-label="Плеер видео"
            >
                {showCameraSelector && (
                    <div
                        className={`${styles.cameraSelector} ${isVerticalTimeline ? styles.mobileLandscapeCameraSelector : ''}`}
                    >
                        <Select
                            options={availableCameras.map(c => ({
                                value: c.id,
                                label: c.name ?? `Camera ${c.id}`
                            }))}
                            value={camera ?? ''}
                            onChange={value => setCamera(Number(value))}
                            aria-label="Выбор камеры"
                        />
                    </div>
                )}

                <div className={`${styles.topControls} ${isVerticalTimeline ? styles.mobileLandscapeTopControls : ''}`}>
                    <ModeIndicator
                        mode={currentMode}
                        playbackStatus={playbackStatus}
                    />
                </div>
                <div
                    ref={videoContainerRef}
                    className={`${styles.videoContainer} ${isVerticalTimeline ? styles.landscapeVideoContainer : ''}`}
                    style={{
                        transform: enableVideoZoom ? `scale(${videoZoom})` : 'none',
                        transformOrigin: enableVideoZoom ? `${zoomOriginX * 100}% ${zoomOriginY * 100}%` : 'center',
                        transition: enableVideoZoom && videoZoom === 1 ? 'transform 0.3s ease-out' : 'none'
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            height: '100%'
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
                <div
                    className={styles.controlArea}
                    ref={controlAreaRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className={`${styles.controlPanelContainer} ${showControls || isMobile ? styles.show : ''}`}>
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
                        />
                    </div>
                </div>
                <div id={datepickerPortalIdRef.current} />
            </div>
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
                    />
                )}
        </>
    );
};
