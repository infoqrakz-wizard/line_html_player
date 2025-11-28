export type MotionObjectType = 'human' | 'transport';
export type MotionFilterOption = 'motion' | MotionObjectType;

export interface MotionMaskPayload {
    width: number;
    height: number;
    data: number[];
}

export interface TimelineMotionFilter {
    mask?: MotionMaskPayload;
    types?: MotionObjectType[];
}

export const createMotionFilterSignature = (filter?: TimelineMotionFilter | null): string =>
    JSON.stringify(filter ?? null);
