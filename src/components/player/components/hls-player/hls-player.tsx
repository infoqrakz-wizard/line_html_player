/* eslint-disable jsx-a11y/media-has-caption */
import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import Hls, {Fragment} from 'hls.js';

import {VideoContainer} from '../video-container';

const FALLBACK_BASE_URL = typeof window !== 'undefined' ? window.location.href : 'http://localhost';

const safelyCreateUrl = (value: string): URL | null => {
    try {
        return new URL(value, FALLBACK_BASE_URL);
    } catch {
        return null;
    }
};

const parseIsoDate = (value?: string | null): number | null => {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return parsed;
};

const extractTimestampFromParams = (urlValue?: string | null, paramName?: string): number | null => {
    if (!urlValue || !paramName) return null;
    const parsedUrl = safelyCreateUrl(urlValue);
    if (!parsedUrl) return null;
    return parseIsoDate(parsedUrl.searchParams.get(paramName));
};

const extractNextTimeMs = (urlValue?: string | null): number | null =>
    extractTimestampFromParams(urlValue, 'next_time');

const extractFragmentStartMs = (urlValue?: string | null, frag?: Fragment): number | null => {
    const paramValue = extractTimestampFromParams(urlValue, 'time');
    if (paramValue !== null) return paramValue;
    if (typeof frag?.programDateTime === 'number') {
        return frag.programDateTime;
    }
    return null;
};

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
    onFragmentTimeUpdate?: (time: Date) => void;
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
        isLandscape = false,
        onFragmentTimeUpdate
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
    const targetStartDateRef = useRef<number | null>(extractNextTimeMs(url));
    const pendingSeekRef = useRef<number | null>(null);
    const startAppliedRef = useRef(false);
    const metadataListenerRef = useRef<(() => void) | null>(null);
    const firstFragmentTimeNotifiedRef = useRef<boolean>(false);
    const currentUrlRef = useRef<string>(url);

    const cleanupMetadataListener = () => {
        const handler = metadataListenerRef.current;
        const video = videoRef.current;
        if (handler && video) {
            video.removeEventListener('loadedmetadata', handler);
            metadataListenerRef.current = null;
        }
    };

    const ensureTargetDateFromUrl = (candidateUrl?: string | null) => {
        if (targetStartDateRef.current) return;
        const parsed = extractNextTimeMs(candidateUrl || undefined);

        if (parsed !== null) {
            targetStartDateRef.current = parsed;
        }
    };

    const updatePendingSeekFromFragment = (frag: Fragment, fragUrl?: string | null) => {
        if (pendingSeekRef.current !== null || !targetStartDateRef.current) return;
        const fragmentStartMs = extractFragmentStartMs(fragUrl || undefined, frag);
        if (fragmentStartMs === null) return;

        const offsetSeconds = (targetStartDateRef.current - fragmentStartMs) / 1000;
        const effectiveOffset = Math.max(0, offsetSeconds);
        const cappedOffset =
            frag.duration && Number.isFinite(frag.duration)
                ? Math.min(effectiveOffset, frag.duration)
                : effectiveOffset;
        const fragStartSeconds =
            Number.isFinite(frag.start) && typeof frag.start === 'number'
                ? frag.start
                : videoRef.current?.currentTime || 0;

        pendingSeekRef.current = Math.max(0, fragStartSeconds + cappedOffset);
    };

    const buildUrlWithTimeParam = (baseUrl: string, isoTime: string): string | null => {
        if (!baseUrl) return null;

        const hashIndex = baseUrl.indexOf('#');
        const hasHash = hashIndex >= 0;
        const hash = hasHash ? baseUrl.slice(hashIndex) : '';
        const urlWithoutHash = hasHash ? baseUrl.slice(0, hashIndex) : baseUrl;

        const queryIndex = urlWithoutHash.indexOf('?');
        const basePath = queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;
        const queryString = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';

        const preservedParams: string[] = [];

        if (queryString) {
            const rawParams = queryString.split('&').filter(Boolean);
            rawParams.forEach(param => {
                const equalsIndex = param.indexOf('=');
                const rawKey = equalsIndex === -1 ? param : param.slice(0, equalsIndex);
                let decodedKey: string;
                try {
                    decodedKey = decodeURIComponent(rawKey);
                } catch {
                    decodedKey = rawKey;
                }
                if (decodedKey === 'time' || decodedKey === 'next_time') {
                    return;
                }
                preservedParams.push(param);
            });
        }

        preservedParams.push(`time=${isoTime}`);
        const queryPart = `?${preservedParams.join('&')}`;

        return `${basePath}${queryPart}${hash}`;
    };

    const reloadFromNextTime = (nextTimeMs: number, fragmentUrl?: string | null) => {
        const hls = hlsRef.current;
        if (!hls) return;

        const currentTarget = targetStartDateRef.current;
        if (currentTarget && Math.abs(currentTarget - nextTimeMs) < 1) {
            return;
        }

        const isoTime = new Date(nextTimeMs).toISOString();
        const nextSource = buildUrlWithTimeParam(url, isoTime);
        if (!nextSource) {
            console.warn('[HLS][next_time][error] failed to build url', {url, isoTime, fragmentUrl});
            return;
        }

        targetStartDateRef.current = nextTimeMs;
        pendingSeekRef.current = null;
        startAppliedRef.current = false;
        cleanupMetadataListener();
        setIsLoading(true);

        hls.loadSource(nextSource);
        hls.startLoad(0);
    };

    const applyPendingSeek = () => {
        if (startAppliedRef.current || pendingSeekRef.current === null) return;
        const video = videoRef.current;
        if (!video) return;

        const seekTo = pendingSeekRef.current;
        const performSeek = () => {
            video.currentTime = seekTo;
            startAppliedRef.current = true;
            pendingSeekRef.current = null;
            if (playingRef.current) {
                video.play().catch(console.error);
            }
        };

        if (video.readyState >= 1) {
            performSeek();
            return;
        }

        if (metadataListenerRef.current) return;

        const handleLoadedMetadata = () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            metadataListenerRef.current = null;
            performSeek();
        };

        metadataListenerRef.current = handleLoadedMetadata;
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
    };

    useEffect(() => {
        targetStartDateRef.current = extractNextTimeMs(url);
        pendingSeekRef.current = null;
        startAppliedRef.current = false;
        // Сбрасываем флаг при изменении URL для нового таймблока
        if (currentUrlRef.current !== url) {
            firstFragmentTimeNotifiedRef.current = false;
            currentUrlRef.current = url;
        }
    }, [url]);

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
        // Сбрасываем флаг для нового таймблока
        firstFragmentTimeNotifiedRef.current = false;
        currentUrlRef.current = url;

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

                const fragmentUrl =
                    data.frag?.url ||
                    (data.frag?.baseurl && data.frag?.relurl
                        ? `${data.frag.baseurl}${data.frag.relurl}`
                        : data.frag?.relurl);

                ensureTargetDateFromUrl(fragmentUrl);
                updatePendingSeekFromFragment(data.frag, fragmentUrl);
                const nextTimeFromFragment = extractTimestampFromParams(fragmentUrl || undefined, 'next_time');
                if (nextTimeFromFragment !== null) {
                    reloadFromNextTime(nextTimeFromFragment, fragmentUrl || undefined);
                }
                // Перехватываем первый запрос к .ts файлу с параметром time для обновления индикатора времени
                if (onFragmentTimeUpdate && !firstFragmentTimeNotifiedRef.current && fragmentUrl) {
                    const parsedUrl = safelyCreateUrl(fragmentUrl);
                    if (parsedUrl) {
                        const pathname = parsedUrl.pathname.toLowerCase();
                        if (pathname.endsWith('.ts') || pathname.includes('.ts?')) {
                            // Извлекаем время из параметра time
                            const timeParam = parsedUrl.searchParams.get('time');
                            if (timeParam) {
                                const fragmentTime = parseIsoDate(timeParam);
                                if (fragmentTime !== null) {
                                    // Вызываем callback только один раз для первого фрагмента
                                    firstFragmentTimeNotifiedRef.current = true;
                                    const timeDate = new Date(fragmentTime);
                                    console.log(
                                        '[HLS][time-indicator-update] Обновляем индикатор времени на актуальное время из первого .ts фрагмента:',
                                        {
                                            time: timeDate.toISOString(),
                                            fragmentUrl: fragmentUrl?.substring(0, 200)
                                        }
                                    );
                                    onFragmentTimeUpdate(timeDate);
                                }
                            }
                        }
                    }
                }

                console.log('[HLS][frag-loading]', {
                    sn: data.frag.sn,
                    pendingSeek: pendingSeekRef.current,
                    startApplied: startAppliedRef.current
                });
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

                applyPendingSeek();
                console.log('[HLS][frag-loaded]', {
                    sn: data.frag.sn,
                    pendingSeek: pendingSeekRef.current,
                    startApplied: startAppliedRef.current
                });
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
                console.log('[HLS][manifest-parsed]', {
                    pendingSeek: pendingSeekRef.current,
                    startApplied: startAppliedRef.current,
                    playingRef: playingRef.current,
                    videoPaused: video.paused
                });
                applyPendingSeek();
                // Убеждаемся, что видео начинает воспроизведение после загрузки манифеста
                // если playing установлен в true
                if (playingRef.current && video.paused) {
                    video.play().catch(error => {
                        console.error('[HLS][manifest-parsed] Ошибка при запуске воспроизведения:', error);
                    });
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
                cleanupMetadataListener();
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
