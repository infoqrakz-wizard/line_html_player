import styles from './play-overlay.module.scss';

export interface PlayOverlayProps {
    onClick: () => void;
}

export const PlayOverlay: React.FC<PlayOverlayProps> = ({onClick}) => {
    return (
        <div
            className={styles.playOverlay}
            onClick={onClick}
        >
            <button className={styles.playButton}>
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M8 5V19L19 12L8 5Z"
                        fill="white"
                    />
                </svg>
            </button>
        </div>
    );
};
