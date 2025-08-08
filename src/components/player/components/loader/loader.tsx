import styles from './loader.module.scss';

export const Loader = ({message = 'Загрузка видео...'}: {message: string}) => {
    return (
        <div className={styles.loaderContainer}>
            <div className={styles.loader}>
                <span>{message}</span>
            </div>
        </div>
    );
};
