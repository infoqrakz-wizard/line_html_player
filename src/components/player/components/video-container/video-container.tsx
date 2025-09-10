import styles from './video-container.module.scss';

export const VideoContainer: React.FC<{children: React.ReactNode; isLandscape: boolean}> = ({
    children,
    isLandscape
}) => {
    return (
        <div className={`${styles.videoContainer} ${isLandscape ? styles.landscapeVideoContainer : ''}`}>
            {children}
        </div>
    );
};
