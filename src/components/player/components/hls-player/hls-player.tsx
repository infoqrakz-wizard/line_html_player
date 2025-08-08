import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

import { PlayOverlay } from '../play-overlay';
import { Loader } from '../loader';
import { VideoContainer } from '../video-container';

import styles from './hls-player.module.scss';

export interface HlsPlayerProps {
    url: string;
    playing?: boolean;
    posterUrl?: string;
    muted?: boolean;
    onProgress?: (progress: { currentTime: number; duration: number }) => void;
    onPlayPause?: (playing: boolean) => void;
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({
    url,
    playing = false,
    onProgress,
    onPlayPause,
    posterUrl,
    muted = true
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isFragLoading, setIsFragLoading] = useState(false);
    const bufferingTimeout = useRef<NodeJS.Timeout | null>(null);
    const fragLoadingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPlayheadPosition = useRef<number>(0);
    const stallCount = useRef<number>(0);
    const activeFragLoads = useRef<number>(0);
    const recoveryAttempts = useRef<number>(0);
    const MAX_RECOVERY_ATTEMPTS = 3;

    const playingRef = useRef(playing);
    const mutedRef = useRef(muted);

    useEffect(() => {
        if (playing !== playingRef.current) {
            playingRef.current = playing;
            handlePlayPause();
        }
    }, [playing, playingRef]);

    useEffect(() => {
        mutedRef.current = muted;
        handleMuteToggle();
    }, [muted, mutedRef]);

    const handleTimeUpdate = () => {
        if (videoRef.current && onProgress) {
            onProgress({
                currentTime: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handlePlayPause = () => {
        if (videoRef.current) {
            if (!playingRef.current) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            videoRef.current.muted = mutedRef.current;
        }
    };

    const handleSpeedChange = (speed: number) => {
        if (videoRef.current) {
            videoRef.current.playbackRate = speed;
            setPlaybackSpeed(speed);
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
                        timeoutRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 },
                        errorRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 }
                    }
                },
                playlistLoadPolicy: {
                    default: {
                        maxLoadTimeMs: 20000,
                        maxTimeToFirstByteMs: 8000,
                        timeoutRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 },
                        errorRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 }
                    }
                },
                fragLoadPolicy: {
                    default: {
                        maxLoadTimeMs: 120000,
                        maxTimeToFirstByteMs: 8000,
                        timeoutRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 },
                        errorRetry: { maxNumRetry: 5, retryDelayMs: 500, maxRetryDelayMs: 2000 }
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

                if (activeFragLoads.current === 1) {
                    setIsFragLoading(true);
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

                if (activeFragLoads.current === 0) {
                    fragLoadingTimeout.current = setTimeout(() => {
                        setIsFragLoading(false);
                    }, 300);
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
                                ? { start: video.buffered.start(0), end: video.buffered.end(0) }
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
                        video.playbackRate = playbackSpeed;
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
                            video.playbackRate = playbackSpeed;
                            break;
                        case 2:
                            video.currentTime = video.currentTime;
                            hls.recoverMediaError();
                            video.playbackRate = playbackSpeed;
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
                                video.playbackRate = playbackSpeed;
                            }, 100);
                            break;
                    }
                }, 1000 * recoveryAttempts.current);
            };

            hls.on(Hls.Events.FRAG_LOADED, () => {
                if (recoveryAttempts.current > 0) {
                    console.log('Воспроизведение успешно восстановлено');
                    if (video.playbackRate !== playbackSpeed) {
                        video.playbackRate = playbackSpeed;
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
        <VideoContainer>
            {(isLoading || isBuffering) && (
                <Loader
                    message={isLoading ? 'Загрузка видео...' : 'Буферизация...'}
                    className="video-loader"
                />
            )}
            {!playingRef.current && !isLoading && !isBuffering && <PlayOverlay onClick={() => onPlayPause?.(true)} />}
            <video
                data-type="hls"
                ref={videoRef}
                controls={false}
                controlsList="nodownload nofullscreen noremoteplayback"
                onTimeUpdate={handleTimeUpdate}
                playsInline
                muted={mutedRef.current}
                // poster={posterUrl}
                autoPlay={true}
            />
        </VideoContainer>
    );
};
