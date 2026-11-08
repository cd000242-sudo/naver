import { avatarInitial, safeAvatarUrl } from '../../lib/communityAvatarModel.mjs';

/**
 * The round photo next to a nickname, or the first letter of the nickname in a round when there is no photo (or the
 * server's picture is not a plain image). The nickname is always written next to it, so it is hidden from screen readers.
 */
function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
    const url = safeAvatarUrl(src);
    return (
        <span className="cm-avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}>
            {url ? <img src={url} alt="" width={size} height={size} draggable={false} /> : avatarInitial(name)}
        </span>
    );
}

export default Avatar;
