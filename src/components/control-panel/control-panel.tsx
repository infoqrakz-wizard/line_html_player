import React, {useRef} from 'react';

import {Timeline} from '../timeline';
import {PlayerControls} from '../player-controls';
import {TimelineRef} from '../timeline/types';
import {useOrientation} from '../timeline/hooks/use-orientation';
import styles from './control-panel.module.scss';
import {Mode, Protocol} from '../../utils/types';
import {useTimelineAuth} from '../../context/timeline-auth-context';
import {MotionFilterOption, TimelineMotionFilter} from '../../types/motion-filter';

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
    proxy?: string;
    popperBoundaryElement?: HTMLElement | null;
    popperPortalId?: string;
    timelineRef?: React.RefObject<TimelineRef>;
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
    motionFilter?: TimelineMotionFilter | null;
    isFilterPanelOpen?: boolean;
    activeFilterType?: MotionFilterOption | null;
    onToggleFilterPanel?: () => void;
    onSelectFilterOption?: (option: MotionFilterOption) => void;
    onClearFilter?: () => void;
    serverVersion?: number | null;
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
    proxy,
    popperBoundaryElement,
    popperPortalId,
    timelineRef: externalTimelineRef,
    onPlayPause,
    onMuteToggle,
    onSpeedChange,
    onSaveStream,
    onTimeClick,
    onChangeStartDate,
    onToggleFullscreen,
    disableSpeedChange = false,
    disableCenterTimeline = false,
    onChangeMode,
    motionFilter,
    isFilterPanelOpen,
    activeFilterType,
    onToggleFilterPanel,
    onSelectFilterOption,
    onClearFilter,
    serverVersion
}) => {
    const {hasTimelineAccess} = useTimelineAuth();
    const {isMobile, orientation} = useOrientation();
    const isMobileLandscape = isMobile && orientation === 'landscape';
    const internalTimelineRef = useRef<TimelineRef>(null);
    const timelineRef = externalTimelineRef || internalTimelineRef;

    return (
        <div className={`${styles.controlPanel} ${isMobileLandscape ? styles.mobileLandscape : ''}`}>
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
                proxy={proxy}
                popperBoundaryElement={popperBoundaryElement}
                popperPortalId={popperPortalId}
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
                isFilterPanelOpen={isFilterPanelOpen}
                activeFilterType={activeFilterType}
                onToggleFilterPanel={onToggleFilterPanel}
                onSelectFilterOption={onSelectFilterOption}
                onClearFilter={onClearFilter}
                serverVersion={serverVersion}
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
                    proxy={proxy}
                    mode={mode}
                    motionFilter={motionFilter}
                    serverVersion={serverVersion}
                />
            )}
        </div>
    );
};
