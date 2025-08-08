import {IconProps} from './types';
export function makeIcon(
    IconComponent: any,
    name: string | null,
    defaultWidth: string | number,
    defaultHeight: string | number
): React.FC<IconProps> {
    const Icon = ({width, height}: IconProps) => {
        const w = width || defaultWidth;
        const h = height || defaultHeight;
        return (
            <IconComponent
                width={Number.isInteger(w) ? `${w}px` : w}
                height={Number.isInteger(h) ? `${h}px` : h}
            />
        );
    };

    Icon.displayName = `Icon.${name}`;
    return Icon;
}
