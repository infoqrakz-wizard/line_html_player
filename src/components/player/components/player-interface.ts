export type PlaybackStatus = 'loading' | 'buffering' | 'playing' | 'paused' | 'error';

export interface PlayerComponentProps {
    url: string;
    playing: boolean;
    muted: boolean;
    // posterUrl: string;
    playbackSpeed: number;
    onPlayPause?: () => void;
    onProgress?: (progress: {currentTime: number; duration: number}) => void;
    onPlaybackStatusChange?: (status: PlaybackStatus) => void;
}

export interface PlayerRef {
    seekBy: (seconds: number) => void;
}
