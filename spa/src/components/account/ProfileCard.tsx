import { useState } from 'react';
import type { ProfileDetail } from '../../lib/communityAccount';
import { formatJoined, phoneStatus, roleLabel } from '../../lib/accountModel.mjs';
import { isAssociate } from '../../lib/communityLevel.mjs';
import { gradeProgress } from '../../lib/communityModel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import { GradeBadge } from '../community/Badges';
import LevelUpCard from '../community/LevelUpCard';
import NicknameForm from '../community/NicknameForm';
import AvatarEditor from './AvatarEditor';
import PhoneVerifyForm from './PhoneVerifyForm';
import RewardStatus from './RewardStatus';

type Props = {
    profile: CommunityProfile;
    /** The full profile from the server; null until it arrives. */
    detail: ProfileDetail | null;
    /** The nickname changed (the stored login is already updated). */
    onChanged: () => void;
    onDetail: (detail: ProfileDetail) => void;
};

/** Who I am here: nickname, grade, score bar, activity, join date, role and the phone state. */
function ProfileCard({ profile, detail, onChanged, onDetail }: Props) {
    const [editing, setEditing] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const progress = gradeProgress(profile);
    const phone = phoneStatus(detail);
    const joined = formatJoined(detail?.createdAt);
    // The owner is 숲, the top grade: no bar, no next grade, no rewards to earn.
    const owner = profile.role === 'owner';

    return (
        <section className="lp-box me-card" aria-labelledby="me-profile-title">
            <h2 id="me-profile-title" className="lp-sr">프로필</h2>
            <AvatarEditor profile={profile} onChanged={onChanged} />
            <div className="me-top">
                <div>
                    <p className="me-name">
                        <b className="me-nick">{profile.nickname || '닉네임을 정해 주세요'}</b>
                        <GradeBadge grade={profile.grade} isOperator={profile.role === 'owner' || profile.isOperator} />
                        <span className="me-role">{roleLabel(profile)}</span>
                    </p>
                    {joined ? <p className="me-joined">{joined}</p> : null}
                </div>
                <button type="button" className="lp-btn lp-btn-line lp-btn-sm" aria-expanded={editing} onClick={() => setEditing((on) => !on)}>
                    {editing ? '닫기' : '닉네임 바꾸기'}
                </button>
            </div>
            {editing ? (
                <NicknameForm initial={profile.nickname} submitLabel="이 닉네임으로 바꾸기" onDone={() => { setEditing(false); onChanged(); }} />
            ) : null}
            {owner ? <p className="me-score is-owner"><b>{progress.text}</b></p> : (
                <>
                    <p className="me-score"><b>{profile.score}점</b><span>{progress.text}</span></p>
                    {isAssociate(profile) ? null : (
                        <div className="me-bar" role="progressbar" aria-label="다음 등급까지" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                            <i style={{ width: `${progress.percent}%` }} />
                        </div>
                    )}
                </>
            )}
            <LevelUpCard profile={profile} />
            <dl className="me-stats">
                <div><dt>내 글</dt><dd>{profile.activity.posts}</dd></div>
                <div><dt>내 댓글</dt><dd>{profile.activity.comments}</dd></div>
                <div><dt>들른 글</dt><dd>{profile.activity.visits}</dd></div>
                {profile.activity.likes === null ? null : <div><dt>받은 좋아요</dt><dd>{profile.activity.likes}</dd></div>}
            </dl>
            {owner ? null : <RewardStatus rewards={profile.rewards} />}
            <dl className="me-info">
                <div><dt>아이디</dt><dd>{profile.userId}</dd></div>
                <div>
                    <dt>휴대폰</dt>
                    <dd>
                        <span className={phone.verified ? 'me-ok' : undefined}>{detail ? phone.text : '확인하는 중…'}</span>
                        {detail && !phone.verified ? (
                            <button type="button" className="lp-btn lp-btn-dark lp-btn-sm" aria-expanded={verifying} onClick={() => setVerifying((on) => !on)}>
                                지금 인증하기
                            </button>
                        ) : null}
                    </dd>
                </div>
            </dl>
            {verifying && detail && !phone.verified ? (
                <PhoneVerifyForm onCancel={() => setVerifying(false)} onVerified={(next) => { setVerifying(false); onDetail(next); }}
                    onAlready={() => { setVerifying(false); onChanged(); }} />
            ) : null}
        </section>
    );
}

export default ProfileCard;
