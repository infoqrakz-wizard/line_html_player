import { makeIcon } from './make-icon';

import { ReactComponent as Datepicker } from './svg/calendar.svg';
import { ReactComponent as Archive } from './svg/archive.svg';
import { ReactComponent as Live } from './svg/live_new.svg';
import { ReactComponent as Play } from './svg/play_new.svg';
import { ReactComponent as Pause } from './svg/pause_new.svg';
import { ReactComponent as Export } from './svg/download.svg';
import { ReactComponent as Mute } from './svg/mute.svg';
import { ReactComponent as Unmute } from './svg/unmute.svg';
import { ReactComponent as Fullscreen } from './svg/fullscreen.svg';
import { ReactComponent as FullscreenExit } from './svg/fullscreen_exit.svg';
import { ReactComponent as Record } from './svg/record.svg';
import { ReactComponent as CenterTimeline } from './svg/center_timeline.svg';
import { ReactComponent as ChangeToPoster } from './svg/change_to_poster.svg';
import { ReactComponent as ArrowBack } from './svg/arrow_back.svg';
import { ReactComponent as Check } from './svg/check.svg';

import { IconType } from './types';
export { getIcon } from './utils';

export type { IconType };

export const Icons: { [type: string]: IconType } = {
    Datepicker: makeIcon(Datepicker, 'Datepicker', 20, 20),
    Archive: makeIcon(Archive, 'Archive', 32, 32),
    Live: makeIcon(Live, 'Live', 20, 20),
    Play: makeIcon(Play, 'Play', 20, 20),
    Pause: makeIcon(Pause, 'Pause', 20, 20),
    Export: makeIcon(Export, 'Export', 16, 16),
    Mute: makeIcon(Mute, 'Mute', 20, 15),
    Unmute: makeIcon(Unmute, 'Unmute', 20, 20),
    Fullscreen: makeIcon(Fullscreen, 'Fullscreen', 18, 18),
    FullscreenExit: makeIcon(FullscreenExit, 'FullscreenExit', 20, 20),
    Record: makeIcon(Record, 'Record', 20, 20),
    CenterTimeline: makeIcon(CenterTimeline, 'CenterTimeline', 20, 20),
    ChangeToPoster: makeIcon(ChangeToPoster, 'ChangeToPoster', 20, 20),
    ArrowBack: makeIcon(ArrowBack, 'ArrowBack', 20, 20),
    Check: makeIcon(Check, 'Check', 11, 9)
};
