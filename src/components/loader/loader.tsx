import styles from './loader.module.scss';

interface LoaderProps {
    message?: string;
    className?: string;
}

export const Loader = ({ message = 'Loading...', className }: LoaderProps) => {
    return (
        <div className={`${styles.loader} ${className || ''}`}>
            <div className={styles.spinner} />
            <div className={styles.message}>{message}</div>
        </div>
    );
};
