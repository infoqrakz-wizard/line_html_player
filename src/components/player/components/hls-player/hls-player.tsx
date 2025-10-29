/* eslint-disable jsx-a11y/media-has-caption */
import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import Hls from 'hls.js';

import {PlayOverlay} from '../play-overlay';
import {Loader} from '../loader';
import {VideoContainer} from '../video-container';

export interface HlsPlayerProps {
    url: string;
    playing?: boolean;
    playbackSpeed?: number;
    // posterUrl?: string;
    muted?: boolean;
    onProgress?: (progress: {currentTime: number; duration: number}) => void;
    onPlayPause?: (playing: boolean) => void;
    onPlaybackStatusChange?: (status: import('../player-interface').PlaybackStatus) => void;
    overlayText?: string;
    isLandscape?: boolean;
}

import type {PlayerRef} from '../player-interface';

export const HlsPlayer = forwardRef<PlayerRef, HlsPlayerProps>((props, ref) => {
    const {
        url,
        playing = false,
        onProgress,
        onPlayPause,
        onPlaybackStatusChange,
        playbackSpeed,
        muted = true,
        overlayText,
        isLandscape = false
    } = props;
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isBuffering, setIsBuffering] = useState(false);
    const bufferingTimeout = useRef<NodeJS.Timeout | null>(null);
    const fragLoadingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPlayheadPosition = useRef<number>(0);
    const stallCount = useRef<number>(0);
    const activeFragLoads = useRef<number>(0);
    const recoveryAttempts = useRef<number>(0);
    const MAX_RECOVERY_ATTEMPTS = 3;

    const playingRef = useRef(playing);
    const mutedRef = useRef(muted);

    useImperativeHandle(ref, () => ({
        seekBy: (seconds: number) => {
            const video = videoRef.current;
            if (!video) return;
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : undefined;
                const next = Math.max(0, (video.currentTime || 0) + seconds);
                video.currentTime = duration ? Math.min(next, duration) : next;
            } catch (e) {
                // no-op
            }
        },
        getVideoElement: () => videoRef.current
    }));

    useEffect(() => {
        if (playing !== playingRef.current) {
            playingRef.current = playing;
            handlePlayPause();
        }
    }, [playing, playingRef]);

    // Дополнительный эффект для принудительного обновления воспроизведения
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (playing && video.paused) {
            // Если должно воспроизводиться, но видео на паузе - запускаем
            video.play().catch(error => {
                console.error('Ошибка при принудительном запуске воспроизведения HLS:', error);
            });
        } else if (!playing && !video.paused) {
            // Если не должно воспроизводиться, но видео играет - ставим на паузу
            video.pause();
        }
    }, [playing]);

    useEffect(() => {
        mutedRef.current = muted;
        handleMuteToggle();
    }, [muted, mutedRef]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed || 1;
        }
    }, [playbackSpeed]);

    // Отслеживаем фактический статус воспроизведения и сообщаем родителю
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !onPlaybackStatusChange) return;

        const handlePlay = () => {
            if (!isLoading && !isBuffering) {
                onPlaybackStatusChange('playing');
            }
        };

        const handlePause = () => {
            onPlaybackStatusChange('paused');
        };

        const handleError = () => {
            onPlaybackStatusChange('error');
        };

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('error', handleError);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('error', handleError);
        };
    }, [isLoading, isBuffering, onPlaybackStatusChange]);

    // Отслеживаем изменения isLoading и isBuffering
    useEffect(() => {
        if (!onPlaybackStatusChange) return;

        const video = videoRef.current;
        if (!video) return;

        if (isLoading) {
            onPlaybackStatusChange('loading');
        } else if (isBuffering) {
            onPlaybackStatusChange('buffering');
        } else if (!video.paused) {
            onPlaybackStatusChange('playing');
        } else {
            onPlaybackStatusChange('paused');
        }
    }, [isLoading, isBuffering, onPlaybackStatusChange]);

    const handleTimeUpdate = () => {
        if (videoRef.current && onProgress) {
            const currentTime = videoRef.current.currentTime;
            const duration = videoRef.current.duration;

            onProgress({
                currentTime: currentTime,
                duration: duration
            });
        }
    };

    const handlePlayPause = () => {
        const video = videoRef.current;
        if (!video) return;
        if (!playingRef.current) {
            video.pause();
            return;
        }

        if (isLoading) return;

        // Проверяем, что видео готово к воспроизведению
        if (video.readyState >= 2) {
            // HAVE_CURRENT_DATA
            video.play().catch(error => {
                console.error('Ошибка при попытке воспроизведения HLS:', error);
                // Если воспроизведение не удалось, пробуем перезагрузить HLS
                if (hlsRef.current) {
                    hlsRef.current.startLoad();
                }
                setTimeout(() => {
                    video.play().catch(console.error);
                }, 100);
            });
        } else {
            // Если видео еще не готово, ждем события canplay
            const handleCanPlay = () => {
                video.removeEventListener('canplay', handleCanPlay);
                video.play().catch(error => {
                    console.error('Ошибка при попытке воспроизведения HLS после canplay:', error);
                });
            };
            video.addEventListener('canplay', handleCanPlay);
        }
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            videoRef.current.muted = mutedRef.current;
        }
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) {
            hlsRef.current.destroy();
        }

        setIsLoading(true);
        recoveryAttempts.current = 0;

        if (Hls.isSupported()) {
            const hls = new Hls({
                debug: false,
                manifestLoadPolicy: {
                    default: {
                        maxLoadTimeMs: 20000,
                        maxTimeToFirstByteMs: 8000,
                        timeoutRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000},
                        errorRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000}
                    }
                },
                playlistLoadPolicy: {
                    default: {
                        maxLoadTimeMs: 20000,
                        maxTimeToFirstByteMs: 8000,
                        timeoutRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000},
                        errorRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000}
                    }
                },
                fragLoadPolicy: {
                    default: {
                        maxLoadTimeMs: 120000,
                        maxTimeToFirstByteMs: 8000,
                        timeoutRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000},
                        errorRetry: {maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000}
                    }
                },
                maxBufferSize: 30 * 1000 * 1000,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                startLevel: -1,
                capLevelToPlayerSize: true,
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30,
                enableSoftwareAES: true,
                testBandwidth: true,
                abrEwmaDefaultEstimate: 500000,
                abrEwmaFastLive: 3,
                abrEwmaSlowLive: 9,
                startFragPrefetch: true,
                fragLoadingMaxRetry: 5,
                manifestLoadingMaxRetry: 5,
                levelLoadingMaxRetry: 5,
                fragLoadingRetryDelay: 1000,
                manifestLoadingRetryDelay: 1000,
                levelLoadingRetryDelay: 1000
            });

            hlsRef.current = hls;

            hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
                console.log('Loading fragment:', {
                    level: data.frag.level,
                    sn: data.frag.sn,
                    start: data.frag.start,
                    duration: data.frag.duration
                });
                activeFragLoads.current++;

                if (fragLoadingTimeout.current) {
                    clearTimeout(fragLoadingTimeout.current);
                }
            });

            hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
                console.log('Fragment loaded:', {
                    level: data.frag.level,
                    sn: data.frag.sn,
                    loadDuration: data.frag.stats.total
                });
                activeFragLoads.current = Math.max(0, activeFragLoads.current - 1);

                if (fragLoadingTimeout.current) {
                    clearTimeout(fragLoadingTimeout.current);
                }
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    const errorInfo = {
                        type: data.type,
                        details: data.details,
                        fatal: data.fatal,
                        buffer:
                            video.buffered.length > 0
                                ? {start: video.buffered.start(0), end: video.buffered.end(0)}
                                : null,
                        currentTime: video.currentTime,
                        readyState: video.readyState,
                        networkState: video.networkState,
                        error: video.error
                    };
                    console.error('HLS Ошибка:', errorInfo);

                    setTimeout(() => {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                if (
                                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
                                ) {
                                    console.log('Ошибка загрузки манифеста, повторная попытка...');
                                    setTimeout(() => {
                                        hls.loadSource(url);
                                        hls.startLoad();
                                    }, 1000);
                                } else {
                                    console.log('Сетевая ошибка, пытаемся восстановить...');
                                    hls.startLoad();
                                }
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Ошибка медиа, пытаемся восстановить...');
                                handleMediaError();
                                break;
                            default:
                                console.error('Неизвестная ошибка, уничтожаем плеер');
                                hls.destroy();
                                break;
                        }
                    }, 1000);
                }
            });

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setIsLoading(false);
                // Re-apply playback speed after new manifest is parsed to avoid reset to 1x
                if (video.playbackRate !== (playbackSpeed || 1)) {
                    video.playbackRate = playbackSpeed || 1;
                }
                if (playingRef.current) {
                    video.play().catch(console.error);
                }
            });

            hls.loadSource(url);
            hls.attachMedia(video);

            const checkBuffering = () => {
                if (!video || video.paused) {
                    setIsBuffering(false);
                    return;
                }

                const buffered = video.buffered;
                const currentTime = video.currentTime;

                const bufferInfo = [];
                for (let i = 0; i < buffered.length; i++) {
                    bufferInfo.push({
                        start: buffered.start(i),
                        end: buffered.end(i)
                    });
                }

                let hasBufferAhead = false;
                for (let i = 0; i < buffered.length; i++) {
                    if (
                        currentTime >= buffered.start(i) &&
                        currentTime < buffered.end(i) &&
                        buffered.end(i) > currentTime + 0.5
                    ) {
                        hasBufferAhead = true;
                        break;
                    }
                }

                if (stallCount.current % 5 === 0 || !hasBufferAhead) {
                    // console.log('Playback state:', {
                    //     currentTime,
                    //     duration: video.duration,
                    //     buffered: bufferInfo,
                    //     hasBufferAhead,
                    //     stallCount: stallCount.current,
                    //     readyState: video.readyState,
                    //     networkState: video.networkState,
                    //     error: video.error,
                    //     activeFragLoads: activeFragLoads.current,
                    //     isBuffering,
                    //     isFragLoading
                    // });
                }

                if (currentTime === lastPlayheadPosition.current && !hasBufferAhead) {
                    stallCount.current++;
                    if (stallCount.current >= 2) {
                        setIsBuffering(true);
                        console.warn('Buffering started:', {
                            currentTime,
                            buffered: bufferInfo,
                            stallCount: stallCount.current
                        });
                    }
                } else {
                    if (isBuffering) {
                        console.log('Buffering ended:', {
                            currentTime,
                            buffered: bufferInfo
                        });
                    }
                    stallCount.current = 0;
                    setIsBuffering(false);
                }

                lastPlayheadPosition.current = currentTime;
            };

            const bufferInterval = setInterval(checkBuffering, 1000);

            const handleError = (e: Event) => {
                console.error('Video Error:', {
                    error: video.error,
                    event: e,
                    currentTime: video.currentTime,
                    readyState: video.readyState,
                    networkState: video.networkState
                });
            };

            video.addEventListener('error', handleError);

            const handleMediaError = () => {
                if (recoveryAttempts.current >= MAX_RECOVERY_ATTEMPTS) {
                    console.error('Достигнуто максимальное количество попыток восстановления, уничтожаем плеер');
                    hls.destroy();
                    setIsLoading(true);
                    setTimeout(() => {
                        const newHls = new Hls({
                            ...hls.config,
                            enableWorker: false,
                            maxBufferLength: 15,
                            maxMaxBufferLength: 30
                        });
                        hlsRef.current = newHls;
                        newHls.loadSource(url);
                        newHls.attachMedia(video);
                        video.playbackRate = playbackSpeed || 1;
                        setIsLoading(false);
                    }, 2000);
                    return;
                }

                recoveryAttempts.current++;
                console.log(`Попытка восстановления #${recoveryAttempts.current}`);

                if (video.buffered.length) {
                    try {
                        video.currentTime = video.buffered.end(video.buffered.length - 1) + 0.1;
                    } catch (e) {
                        console.error('Ошибка при попытке изменить currentTime:', e);
                    }
                }

                setTimeout(() => {
                    switch (recoveryAttempts.current) {
                        case 1:
                            hls.recoverMediaError();
                            video.playbackRate = playbackSpeed || 1;
                            break;
                        case 2:
                            video.currentTime = video.currentTime;
                            hls.recoverMediaError();
                            video.playbackRate = playbackSpeed || 1;
                            break;
                        case 3:
                            const currentTime = video.currentTime;
                            hls.destroy();
                            const newHls = new Hls({
                                ...hls.config,
                                startPosition: currentTime,
                                enableWorker: false,
                                maxBufferLength: 15
                            });
                            hlsRef.current = newHls;
                            newHls.loadSource(url);
                            newHls.attachMedia(video);
                            setTimeout(() => {
                                video.playbackRate = playbackSpeed || 1;
                            }, 100);
                            break;
                    }
                }, 1000 * recoveryAttempts.current);
            };

            hls.on(Hls.Events.FRAG_LOADED, () => {
                if (recoveryAttempts.current > 0) {
                    console.log('Воспроизведение успешно восстановлено');
                    if (video.playbackRate !== playbackSpeed) {
                        video.playbackRate = playbackSpeed || 1;
                    }
                    setTimeout(() => {
                        if (!video.error) {
                            recoveryAttempts.current = 0;
                        }
                    }, 5000);
                }
            });

            const handleVideoError = (e: Event) => {
                console.error('Video Error:', {
                    error: video.error,
                    event: e,
                    currentTime: video.currentTime,
                    readyState: video.readyState,
                    networkState: video.networkState,
                    recoveryAttempts: recoveryAttempts.current
                });

                if (video.error?.code === 3) {
                    handleMediaError();
                }
            };

            video.addEventListener('error', handleVideoError);

            return () => {
                video.removeEventListener('error', handleVideoError);
                clearInterval(bufferInterval);
                if (bufferingTimeout.current) {
                    clearTimeout(bufferingTimeout.current);
                }
                if (fragLoadingTimeout.current) {
                    clearTimeout(fragLoadingTimeout.current);
                }
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                }
                stallCount.current = 0;
                lastPlayheadPosition.current = 0;
                activeFragLoads.current = 0;
                recoveryAttempts.current = 0;
            };
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
        }
    }, [url]);

    return (
        <VideoContainer isLandscape={isLandscape}>
            {(isLoading || isBuffering) && <Loader message={isLoading ? 'Загрузка видео...' : 'Буферизация...'} />}
            {!playingRef.current && !isLoading && !isBuffering && (
                <PlayOverlay
                    text={overlayText}
                    onClick={() => onPlayPause?.(true)}
                />
            )}
            <video
                data-type="hls"
                ref={videoRef}
                onClick={() => onPlayPause?.(false)}
                controls={false}
                controlsList="nodownload nofullscreen noremoteplayback"
                onTimeUpdate={handleTimeUpdate}
                playsInline
                muted={mutedRef.current}
                // poster={posterUrl}
                autoPlay={false}
                aria-label="HLS video player"
            />
        </VideoContainer>
    );
});

HlsPlayer.displayName = 'HlsPlayer';
