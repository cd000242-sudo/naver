import { useRef, useState } from 'react';
import { makeAvatar } from '../../lib/avatarImage';
import { setMyAvatar } from '../../lib/communityAvatars';
import { useAvatars } from '../../lib/useAvatars';
import type { CommunityProfile } from '../../lib/communitySession';
import Avatar from '../community/Avatar';

/** The round photo on /me with [프로필 사진 바꾸기] and [사진 지우기]. A picked picture is shown first and only sent when confirmed. */
function AvatarEditor({ profile, onChanged }: { profile: CommunityProfile; onChanged: () => void }) {
    const input = useRef<HTMLInputElement>(null);
    const photos = useAvatars([profile.avatarKey]);
    const [preview, setPreview] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setMessage('');
        const made = await makeAvatar(file);
        setBusy(false);
        if (input.current) input.current.value = '';
        if (made.ok) setPreview(made.dataUrl); else setMessage(made.message);
    };

    const send = async (image: string | null) => {
        if (busy) return;
        setBusy(true);
        setMessage('');
        const result = await setMyAvatar(image);
        setBusy(false);
        if (!result.ok) { setMessage(result.message); return; }
        setPreview('');
        onChanged();
    };

    return (
        <div className="me-avatar">
            <Avatar name={profile.nickname || profile.userId} src={preview || photos[profile.avatarKey]} size={72} />
            <div className="me-avatar-side">
                <input type="file" accept="image/*" hidden ref={input} onChange={(event) => { void pick(event.target.files?.[0]); }} />
                {preview ? (
                    <div className="me-avatar-row" role="group" aria-label="고른 사진">
                        <button type="button" className="lp-btn lp-btn-dark lp-btn-sm me-avatar-btn" disabled={busy} onClick={() => { void send(preview); }}>{busy ? '올리는 중…' : '이 사진으로 정하기'}</button>
                        <button type="button" className="lp-btn lp-btn-line lp-btn-sm me-avatar-btn" disabled={busy} onClick={() => setPreview('')}>취소</button>
                    </div>
                ) : (
                    <div className="me-avatar-row">
                        <button type="button" className="lp-btn lp-btn-line lp-btn-sm me-avatar-btn" disabled={busy} onClick={() => input.current?.click()}>프로필 사진 바꾸기</button>
                        {profile.avatarKey ? <button type="button" className="lp-btn lp-btn-line lp-btn-sm me-avatar-btn" disabled={busy} onClick={() => { void send(null); }}>사진 지우기</button> : null}
                    </div>
                )}
                {preview ? <p className="au-help">미리보기예요. 마음에 들면 [이 사진으로 정하기]를 눌러 주세요.</p> : null}
                {message ? <p className="lp-error" role="alert">{message}</p> : null}
            </div>
        </div>
    );
}

export default AvatarEditor;
