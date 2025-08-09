export interface PlayerComponentProps {
    url: string;
    playing: boolean;
    muted: boolean;
    // posterUrl: string;
    playbackSpeed: number;
    onPlayPause?: () => void;
    onProgress?: (progress: {currentTime: number; duration: number}) => void;
}

export interface PlayerRef {
    seekBy: (seconds: number) => void;
}
