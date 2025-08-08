import React from 'react';
import {IconType} from './types';

export const getIcon = (Icon?: IconType | React.ReactNode, width: number = 21) =>
    Icon ? (
        React.isValidElement(Icon) ? (
            Icon
        ) : (
            // @ts-ignore
            <Icon
                width={`${width}px`}
                height={`${width}px`}
            />
        )
    ) : null;
