import React, {useRef} from 'react';

import {Mode} from '@/utils/types';
import {Timeline} from '../timeline';
import {PlayerControls} from '../player-controls';
import {TimelineRef} from '../timeline/types';
import styles from './control-panel.module.scss';

interface ControlPanelProps {
    mode: Mode;
    isPlaying: boolean;
    isMuted: boolean;
    isFullscreen: boolean;
    playbackSpeed: number;
    url: string;
    port: number;
    credentials: string;
    progress?: number;
    camera: number;
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
    playbackSpeed,
    url,
    port,
    credentials,
    progress,
    camera,
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
    const timelineRef = useRef<TimelineRef>(null);

    return (
        <div className={styles.controlPanel}>
            <PlayerControls
                mode={mode}
                isPlaying={isPlaying}
                isMuted={isMuted}
                isFullscreen={isFullscreen}
                playbackSpeed={playbackSpeed}
                onPlayPause={onPlayPause}
                onMuteToggle={onMuteToggle}
                onSpeedChange={onSpeedChange}
                onCenterTimeline={() => timelineRef.current?.centerOnCurrentTime()}
                onChangeStartDate={onChangeStartDate}
                onSaveStream={onSaveStream}
                onToggleFullscreen={onToggleFullscreen}
                disableSpeedChange={disableSpeedChange}
                disableCenterTimeline={disableCenterTimeline}
                onChangeMode={onChangeMode}
            />
            <Timeline
                ref={timelineRef}
                url={url}
                port={port}
                credentials={credentials}
                onTimeClick={onTimeClick}
                progress={progress}
                camera={camera}
            />
        </div>
    );
};
