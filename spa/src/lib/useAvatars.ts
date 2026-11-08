import { useEffect, useMemo, useState } from 'react';
import { isAvatarKey } from './communityAvatarModel.mjs';
import { fetchAvatars, readCachedAvatars } from './communityAvatars';

/**
 * Photos for some avatar keys: what this browser already holds comes back on the first draw, the rest is filled in
 * when the one call answers. A missing photo (old server, no photo) is simply absent, and the caller draws a letter.
 */
export function useAvatars(keys: readonly string[]): Record<string, string> {
    const wanted = useMemo(() => [...new Set(keys.filter(isAvatarKey))], [keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
    const signature = wanted.join('|');
    const [photos, setPhotos] = useState<Record<string, string>>(() => readCachedAvatars(wanted));
    useEffect(() => {
        let alive = true;
        setPhotos(readCachedAvatars(wanted));
        if (wanted.length > 0) {
            void fetchAvatars(wanted).then((found) => { if (alive) setPhotos((previous) => ({ ...previous, ...found })); });
        }
        return () => { alive = false; };
    }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
    return photos;
}
