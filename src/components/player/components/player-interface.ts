export interface PlayerComponentProps {
    url: string;
    playing: boolean;
    muted: boolean;
    posterUrl: string;
    onPlayPause?: () => void;
    onProgress?: (progress: {currentTime: number; duration: number}) => void;
}
