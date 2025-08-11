/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import styles from './play-overlay.module.scss';

export interface PlayOverlayProps {
    onClick: () => void;
    text?: string;
}

export const PlayOverlay: React.FC<PlayOverlayProps> = ({onClick, text}) => {
    return (
        <div
            className={styles.playOverlay}
            onClick={onClick}
        >
            <div className={styles.content}>
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
                {text && <div className={styles.label}>{text}</div>}
            </div>
        </div>
    );
};
