import React from "react"
import styles from './poster.module.scss';

interface PosterProps {
    url: string;
}

export const Poster:React.FC<PosterProps> = ({url}: PosterProps) => {
    return (
        <img src={url} className={styles.poster}></img>
    )
}