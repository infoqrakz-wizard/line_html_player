import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import {formatDate, addSecondsToDate} from '../../utils/dates';
import {getProtocol, formatUrlForDownload, clickA} from '../../utils/url-params';
import {Mode} from '../../utils/types';
import {getCameraState} from '../../utils/api';
import {ControlPanel} from '../control-panel';

import {useTime} from '../../context/time-context';
import {useTimelineState} from '../timeline/hooks/use-timeline-state';

import {HlsPlayer, VideoTag, SaveStreamModal, ModeIndicator} from './components';
import {PlayerComponentProps} from './components/player-interface';
import type {PlayerRef} from './components/player-interface';

import styles from './player.module.scss';

export interface PlayerProps {
    // Основные пропсы из DevLinePlayerProps
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string; // Делаем пароль опциональным
    mode?: Mode;
    muted?: boolean; // Делаем звук опциональным
    camera: number;
}

export const Player: React.FC<PlayerProps> = ({
    streamUrl = '',
    streamPort = 80,
    login = '',
    password = '',
    mode = Mode.Live,
    muted = false,
    camera = 0
}) => {
    // Local auth state to allow updating credentials when 401 occurs
    const [authLogin, setAuthLogin] = useState<string>(login);
    const [authPassword, setAuthPassword] = useState<string>(password ?? '');
    const [currentMode, setCurrentMode] = useState<Mode>(mode);
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const {serverTime, setServerTime, progress: ctxProgress, setProgress} = useTime();
    const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
    const [isH265Codec, setIsH265Codec] = useState<boolean>(false);
    const [isNoSound, setIsNoSound] = useState<boolean>(false);

    // Availability/auth check state
    const [isCheckingAvailability, setIsCheckingAvailability] = useState<boolean>(false);
    const [authRequired, setAuthRequired] = useState<boolean>(false);
    const [serverUnavailable, setServerUnavailable] = useState<boolean>(false);
    const [authVerified, setAuthVerified] = useState<boolean>(false);

    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(muted);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

    const [showControls, setShowControls] = useState<boolean>(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const controlAreaRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<PlayerRef | null>(null);
    const archiveTargetTimeRef = useRef<Date | null>(null);
    const forwardAccumOffsetRef = useRef<number | null>(null);
    const wasPlayingBeforeHiddenRef = useRef<boolean>(false);

    const protocol = getProtocol();
    const getStreamUrl = (type: string) =>
        `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/streaming/main.${type}?authorization=Basic%20${btoa(`${authLogin}:${authPassword}`)}`;

    // const posterUrl = `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/image?stream=main&authorization=Basic%20${btoa(`${login}:${password}`)}`;
    const streamType = currentMode === 'record' ? 'm3u8' : 'mp4';
    const authorization = `${authLogin}:${authPassword}`;
    const videoUrl = getStreamUrl(streamType);

    const {updateServerTime} = useTimelineState(
        undefined,
        streamUrl,
        streamPort,
        authVerified ? authorization : undefined
    );

    // Формирование URL для потока в зависимости от режима и серверного времени
    const finalStreamUrl = authVerified
        ? currentMode === 'record' && serverTime
            ? `${videoUrl}&time=${formatDate(serverTime)}&autoplay=1&audio=1`
            : videoUrl || ''
        : '';

    // Отслеживаем переключение режимов для определения, что это уже не первая загрузка
    useEffect(() => {
        if (isFirstLoad && currentMode !== mode) {
            setIsFirstLoad(false);
        }
    }, [currentMode, mode, isFirstLoad]);

    useEffect(() => {
        const fetchCameraState = async () => {
            const result = await getCameraState(streamUrl, streamPort, authorization, camera);

            setIsH265Codec(result.state.video_streams.video.codec === 'h265');
            setIsNoSound(result.state.audio_streams.audio.signal === 'no');
        };

        if (authVerified && streamUrl && streamPort && authorization && Number.isInteger(camera)) {
            void fetchCameraState();
        }
    }, [authVerified, streamUrl, streamPort, authorization, camera]);

    const checkAvailability = useCallback(
        async (credentials: string) => {
            if (!streamUrl || !streamPort) return;
            const controller = new AbortController();
            const timeoutMs = 5000;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            setIsCheckingAvailability(true);
            setAuthVerified(false);
            setServerUnavailable(false);
            setAuthRequired(false);

            const url = `${protocol}://${streamUrl}:${streamPort}/cameras?authorization=Basic%20${btoa(credentials)}`;

            try {
                timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(url, {method: 'GET', signal: controller.signal});
                if (res.status === 401) {
                    setAuthRequired(true);
                    setServerUnavailable(false);
                    setAuthVerified(false);
                    return;
                }
                if (!res.ok) {
                    console.warn('Cameras check failed with status', res.status);
                    setAuthVerified(false);
                    return;
                }
                setAuthRequired(false);
                setServerUnavailable(false);
                setAuthVerified(true);
            } catch (e) {
                setServerUnavailable(true);
                setAuthVerified(false);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                setIsCheckingAvailability(false);
            }
        },
        [protocol, streamPort, streamUrl]
    );

    useEffect(() => {
        void checkAvailability(`${authLogin}:${authPassword}`);
    }, [checkAvailability, streamUrl, streamPort, camera]);

    useEffect(() => {
        setAuthLogin(login);
        setAuthPassword(password ?? '');
        void checkAvailability(`${login}:${password ?? ''}`);
    }, [login, password, checkAvailability]);

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
        // Получаем текущее время сервера или используем текущее время системы
        // const currentServerTime = serverTime || new Date();

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
            const key = e.key.toLowerCase();
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
                console.log('arrow click');
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
                        console.log('right arrow click');
                        const baseOffset = forwardAccumOffsetRef.current ?? ctxProgress;
                        const nextOffset = baseOffset + 5;
                        forwardAccumOffsetRef.current = nextOffset;
                        candidateAbsolute = addSecondsToDate(serverTime, nextOffset);

                        const approxNow = new Date();
                        console.log('approxNow', approxNow);
                        console.log('candidateAbsolute', candidateAbsolute);
                        if (candidateAbsolute.getTime() > approxNow.getTime()) {
                            forwardAccumOffsetRef.current = null;
                            const nowServer = (await updateServerTime()) ?? new Date();
                            console.log('switch to live', nowServer);
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
                }
            };

            void resume();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isPlaying, currentMode, updateServerTime, setProgress]);

    const handleSaveStreamFinish = (start: Date, end: Date) => {
        const fileName = `record_${formatDate(start, 'yyyy-MM-dd_HH-mm')}_${formatDate(end, 'yyyy-MM-dd_HH-mm')}`;
        const protocol = getProtocol();
        const durationSeconds = (end.getTime() - start.getTime()) / 1000;

        const formatDuration = (seconds: number): string => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);

            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        const date = start.toISOString().split('.')[0];

        const url = `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/streaming/main.mp4?authorization=Basic%20${btoa(`${authLogin}:${authPassword}`)}&time=${date}&duration=${formatDuration(durationSeconds)}&download=1&filename=${fileName}`;
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

    const props: PlayerComponentProps = {
        url: finalStreamUrl,
        playing: isPlaying,
        muted: isMuted,
        // posterUrl,
        playbackSpeed,
        onPlayPause: (value?: boolean) => handlePlayPause(value),
        onProgress: p => {
            setProgress(p.currentTime);
        }
    };

    return (
        <>
            <div
                className={styles.player}
                ref={containerRef}
                role="region"
                aria-label="Плеер видео"
            >
                <div className={styles.modeIndicatorContainer}>
                    <ModeIndicator
                        mode={currentMode}
                        isPlaying={isPlaying}
                    />
                </div>
                <div
                    className={styles.videoContainer}
                    onDoubleClick={handleToggleFullscreen}
                    role="button"
                    aria-label="Переключить полноэкранный режим"
                    tabIndex={0}
                    onKeyDown={e => {
                        const key = e.key.toLowerCase();
                        if (key === 'enter') {
                            e.preventDefault();
                            handleToggleFullscreen();
                        }
                    }}
                >
                    {currentMode === 'record' ? (
                        <HlsPlayer
                            ref={playerRef}
                            {...props}
                        />
                    ) : (
                        <VideoTag
                            ref={playerRef}
                            {...props}
                        />
                    )}
                    {showSaveModal && (
                        <SaveStreamModal
                            currentTime={addSecondsToDate(serverTime ?? new Date(), ctxProgress)}
                            isOpen={showSaveModal}
                            onClose={() => setShowSaveModal(false)}
                            onFinish={handleSaveStreamFinish}
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
                                        onSubmit={e => {
                                            e.preventDefault();
                                            // Re-check availability with new credentials
                                            void checkAvailability(`${authLogin}:${authPassword}`);
                                        }}
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
                    <div className={`${styles.controlPanelContainer} ${showControls ? styles.show : ''}`}>
                        <ControlPanel
                            mode={currentMode}
                            isPlaying={isPlaying}
                            isMuted={isMuted}
                            isFullscreen={isFullscreen}
                            isNoSound={isNoSound}
                            playbackSpeed={playbackSpeed}
                            url={streamUrl}
                            port={streamPort}
                            credentials={authVerified ? authorization : ''}
                            progress={ctxProgress}
                            camera={camera}
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

                {/** FIXME: убрать после завершения разработки */}
                {createPortal(
                    <div className={styles.debugInfo}>
                        <h2 className="title">Debug info</h2>
                        <div className="debug-info-content">
                            <p>serverTime: {serverTime?.toLocaleTimeString()}</p>
                            <p>ctxProgress: {ctxProgress}</p>
                            <p>isPlaying: {isPlaying ? 'true' : 'false'}</p>
                            <p>isMuted: {isMuted ? 'true' : 'false'}</p>
                            <p>playbackSpeed: {playbackSpeed}</p>
                            <p>currentMode: {currentMode}</p>
                            <p>isFullscreen: {isFullscreen ? 'true' : 'false'}</p>
                            <p>showControls: {showControls ? 'true' : 'false'}</p>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
            {isH265Codec && (
                <div className={styles.h265CodecWarning}>
                    <p>265</p>
                </div>
            )}
        </>
    );
};
