import React, {useRef} from 'react';

import {Timeline} from '../timeline';
import {PlayerControls} from '../player-controls';
import {TimelineRef} from '../timeline/types';
import styles from './control-panel.module.scss';
import {Mode, Protocol} from '../../utils/types';
import {useTimelineAuth} from '../../context/timeline-auth-context';

interface ControlPanelProps {
    mode: Mode;
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    isNoSound: boolean;
    playbackSpeed: number;
    url: string;
    port: number;
    credentials: string;
    progress?: number;
    camera: number;
    protocol?: Protocol;
    onPlayPause: () => void;
    onMuteToggle: () => void;
    onSpeedChange: (speed: number) => void;
    onSaveStream: () => void;
    onTimeClick?: (time: Date) => void;
    onChangeStartDate?: (date: Date) => void;
    onToggleFullscreen?: () => void;
    disableSpeedChange?: boolean;
    disableCenterTimeline?: boolean;
    onChangeMode?: (mode: Mode) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    mode,
    isPlaying,
    isMuted,
    isFullscreen,
    isNoSound,
    playbackSpeed,
    url,
    port,
    credentials,
    progress,
    camera,
    protocol,
    onPlayPause,
    onMuteToggle,
    onSpeedChange,
    onSaveStream,
    onTimeClick,
    onChangeStartDate,
    onToggleFullscreen,
    disableSpeedChange = false,
    disableCenterTimeline = false,
    onChangeMode
}) => {
    const {hasTimelineAccess} = useTimelineAuth();
    const timelineRef = useRef<TimelineRef>(null);

    return (
        <div className={styles.controlPanel}>
            <PlayerControls
                mode={mode}
                isPlaying={isPlaying}
                isMuted={isMuted}
                isFullscreen={isFullscreen}
                isNoSound={isNoSound}
                isDownloadAccess={hasTimelineAccess}
                playbackSpeed={playbackSpeed}
                url={url}
                port={port}
                credentials={credentials}
                camera={camera}
                protocol={protocol}
                onPlayPause={onPlayPause}
                onMuteToggle={onMuteToggle}
                onSpeedChange={onSpeedChange}
                onCenterTimeline={hasTimelineAccess ? () => timelineRef.current?.centerOnCurrentTime() : undefined}
                onChangeStartDate={onChangeStartDate}
                onSaveStream={onSaveStream}
                onToggleFullscreen={onToggleFullscreen}
                disableSpeedChange={disableSpeedChange}
                disableCenterTimeline={disableCenterTimeline}
                onChangeMode={onChangeMode}
            />
            {hasTimelineAccess && (
                <Timeline
                    ref={timelineRef}
                    url={url}
                    port={port}
                    credentials={credentials}
                    onTimeClick={onTimeClick}
                    progress={progress}
                    protocol={protocol}
                    camera={camera}
                    mode={mode}
                />
            )}
        </div>
    );
};
