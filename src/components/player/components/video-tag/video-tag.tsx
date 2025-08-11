/* eslint-disable jsx-a11y/media-has-caption */
import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {Loader} from '../loader';
import {PlayOverlay} from '../play-overlay';
import {VideoContainer} from '../video-container';
import type {PlayerRef} from '../player-interface';
export interface VideoTagProps {
    url: string;
    playing: boolean;
    muted?: boolean;
    posterUrl?: string;
    onProgress?: (progress: {currentTime: number; duration: number}) => void;
    onPlayPause?: (playing: boolean) => void;
    overlayText?: string;
}

export const VideoTag = forwardRef<PlayerRef, VideoTagProps>((props, ref) => {
    const {url, playing = true, muted = true, posterUrl, onProgress, onPlayPause, overlayText} = props;
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const bufferingTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPlayheadPosition = useRef<number>(0);
    const stallCount = useRef<number>(0);
    const playAttemptedRef = useRef(false);

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
        }
    }));

    const handleTimeUpdate = () => {
        if (videoRef.current && onProgress) {
            onProgress({
                currentTime: videoRef.current.currentTime,
                duration: videoRef.current.duration || 0
            });
        }
    };

    const handlePlayPause = () => {
        if (videoRef.current) {
            if (!playingRef.current) {
                videoRef.current.pause();
            } else {
                videoRef.current.play().catch(error => {
                    console.error('Ошибка при попытке воспроизведения:', error);
                });
            }
        }
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            videoRef.current.muted = mutedRef.current;
        }
    };

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

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Сбрасываем флаг попытки воспроизведения при изменении URL
        playAttemptedRef.current = false;
        setIsLoading(true);

        // Обработчики событий для отслеживания состояния загрузки и воспроизведения
        const handleLoadStart = () => setIsLoading(true);
        const handleCanPlay = () => {
            setIsLoading(false);
            // Автоматически запускаем воспроизведение если должно быть playing и видео еще не воспроизводится
            if (playingRef.current && video.paused) {
                video.play().catch(error => {
                    console.error('Ошибка при автовоспроизведении:', error);
                });
            }
        };
        const handlePlay = () => onPlayPause?.(true);
        const handlePause = () => onPlayPause?.(false);
        const handleEnded = () => onPlayPause?.(false);
        const handleError = (e: Event) => {
            console.error('Ошибка воспроизведения видео:', e);
            setIsLoading(false);
        };

        // Устанавливаем источник видео и настройки
        video.src = url;
        video.muted = muted;
        if (posterUrl) {
            video.poster = posterUrl;
        }

        // Добавляем обработчики событий
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('error', handleError);
        video.addEventListener('timeupdate', handleTimeUpdate);

        // Проверка буферизации
        const checkBuffering = () => {
            if (!video || video.paused) {
                setIsBuffering(false);
                return;
            }

            const buffered = video.buffered;
            const currentTime = video.currentTime;

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
                }
            } else {
                stallCount.current = 0;
                setIsBuffering(false);
            }

            lastPlayheadPosition.current = currentTime;
        };

        const bufferInterval = setInterval(checkBuffering, 1000);

        // Принудительно загружаем видео
        video.load();

        // Очистка при размонтировании
        return () => {
            video.removeEventListener('loadstart', handleLoadStart);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('ended', handleEnded);
            video.removeEventListener('error', handleError);
            video.removeEventListener('timeupdate', handleTimeUpdate);

            clearInterval(bufferInterval);
            if (bufferingTimeout.current) {
                clearTimeout(bufferingTimeout.current);
            }

            // Останавливаем воспроизведение при размонтировании
            video.pause();
            video.src = '';

            stallCount.current = 0;
            lastPlayheadPosition.current = 0;
        };
    }, [url, posterUrl]);

    return (
        <VideoContainer>
            {(isLoading || isBuffering) && <Loader message={isLoading ? 'Загрузка видео...' : 'Буферизация...'} />}
            {!playingRef.current && !isLoading && !isBuffering && (
                <PlayOverlay
                    onClick={() => onPlayPause?.(true)}
                    text={overlayText}
                />
            )}
            <video
                data-type="video"
                onClick={() => onPlayPause?.(false)}
                ref={videoRef}
                controls={false}
                controlsList="nodownload nofullscreen noremoteplayback"
                playsInline
                muted={muted}
                poster={posterUrl}
                autoPlay={playing}
            />
        </VideoContainer>
    );
});

VideoTag.displayName = 'VideoTag';
