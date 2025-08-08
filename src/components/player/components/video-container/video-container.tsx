import styles from './video-container.module.scss';

export const VideoContainer: React.FC<{children: React.ReactNode}> = ({children}) => {
    return <div className={styles.videoContainer}>{children}</div>;
};
