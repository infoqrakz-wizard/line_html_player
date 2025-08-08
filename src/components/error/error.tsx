import styles from './error.module.scss';

interface ErrorProps {
    message: string;
}

export const Error = ({ message }: ErrorProps) => {
    return (
        <div className={styles.error}>
            <div className={styles.icon} />
            <div className={styles.message}>{message}</div>
        </div>
    );
};
