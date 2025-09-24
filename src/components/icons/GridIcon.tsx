import React from 'react';

interface GridIconProps {
    className?: string;
    size?: number;
}

export const GridIcon: React.FC<GridIconProps> = ({ className = '', size = 24 }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
    );
};
