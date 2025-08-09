import React, {useEffect, useRef, useState} from 'react';

import {formatDate, addSecondsToDate} from '@/utils/dates';
import {getProtocol, formatUrlForDownload, clickA} from '@/utils/url-params';
import {Mode} from '@/utils/types';

import {ControlPanel} from '../control-panel';
import {useTime} from '../../context/time-context';

import {HlsPlayer, VideoTag, SaveStreamModal, ModeIndicator} from './components';
import {PlayerComponentProps} from './components/player-interface';

import styles from './player.module.scss';
import {useTimelineState} from '../timeline/hooks/use-timeline-state';

export interface PlayerProps {
    // Основные пропсы из DevLinePlayerProps
    streamUrl: string;
    streamPort: number;
    login: string;
    password?: string; // Делаем пароль опциональным
    rpcUrl: string;
    rpcPort: number;
    mode?: Mode;
    muted?: boolean; // Делаем звук опциональным
    camera: number;
}

export const Player: React.FC<PlayerProps> = ({
    streamUrl = '',
    streamPort = 80,
    login = '',
    password = '',
    rpcUrl = '',
    rpcPort = 80,
    mode = Mode.Live,
    muted = false,
    camera = 0
}) => {
    const [currentMode, setCurrentMode] = useState<Mode>(mode);
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const {serverTime, setServerTime, progress: ctxProgress, setProgress} = useTime();
    const [showSaveModal, setShowSaveModal] = useState<boolean>(false);

    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(muted);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

    const [showControls, setShowControls] = useState<boolean>(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const controlAreaRef = useRef<HTMLDivElement>(null);

    const protocol = getProtocol();
    const getStreamUrl = (type: string) =>
        `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/streaming/main.${type}?authorization=Basic%20${btoa(`${login}:${password}`)}`;

    // const posterUrl = `${protocol}://${streamUrl}:${streamPort}/cameras/${camera}/image?stream=main&authorization=Basic%20${btoa(`${login}:${password}`)}`;
    const streamType = currentMode === 'record' ? 'm3u8' : 'mp4';
    const authorization = `${login}:${password}`;
    const videoUrl = getStreamUrl(streamType);

    const {updateServerTime} = useTimelineState(undefined, rpcUrl, rpcPort, authorization);

    // Формирование URL для потока в зависимости от режима и серверного времени
    const finalStreamUrl =
        currentMode === 'record' && serverTime
            ? `${videoUrl}&time=${formatDate(serverTime)}&autoplay=1&audio=1`
            : videoUrl || '';

    // Отслеживаем переключение режимов для определения, что это уже не первая загрузка
    useEffect(() => {
        if (isFirstLoad && currentMode !== mode) {
            setIsFirstLoad(false);
        }
    }, [currentMode, mode, isFirstLoad]);

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
            handleChangeMode(Mode.Record, clickedTime);
            // Если время в прошлом - переключаемся на запись
            // setCurrentMode(Mode.Record);
            // setServerTime(clickedTime, true);
        }
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

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            // Если элемент не в полноэкранном режиме, переключаем в полноэкранный режим
            if (containerRef.current?.requestFullscreen) {
                containerRef.current.requestFullscreen().catch(err => {
                    console.error(`Ошибка при попытке перехода в полноэкранный режим: ${err.message}`);
                });
            }
        } else {
            // Если элемент уже в полноэкранном режиме, выходим из него
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => {
                    console.error(`Ошибка при попытке выхода из полноэкранного режима: ${err.message}`);
                });
            }
        }
    };

    const handleToggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
        toggleFullscreen();
    };

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

        const url = `${protocol}://${rpcUrl}:${rpcPort}/cameras/${camera}/streaming/main.mp4?authorization=Basic%20${btoa(`${login}:${password}`)}&time=${date}&duration=${formatDuration(durationSeconds)}&download=1&filename=${fileName}`;
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

    const VideoComponent = currentMode === 'record' ? HlsPlayer : VideoTag;
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
        <div
            className={styles.player}
            ref={containerRef}
        >
            <div className={styles.modeIndicatorContainer}>
                <ModeIndicator
                    mode={currentMode}
                    isPlaying={isPlaying}
                />
            </div>
            <div className={styles.videoContainer}>
                <VideoComponent {...props} />
                {showSaveModal && (
                    <SaveStreamModal
                        currentTime={addSecondsToDate(serverTime ?? new Date(), ctxProgress)}
                        isOpen={showSaveModal}
                        onClose={() => setShowSaveModal(false)}
                        onFinish={handleSaveStreamFinish}
                    />
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
                        playbackSpeed={playbackSpeed}
                        url={rpcUrl}
                        port={rpcPort}
                        credentials={authorization}
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
        </div>
    );
};
