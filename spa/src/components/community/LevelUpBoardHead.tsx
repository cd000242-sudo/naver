import { isAssociate } from '../../lib/communityLevel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import LevelUpCard from './LevelUpCard';

type Props = {
    profile: CommunityProfile;
    /** Level-up went through: the page reads its lists again (the new "○○님이 새싹이 되었습니다" line shows up). */
    onDone?: () => void;
};

/** Top of the 등업신청 board: the two conditions and [등업 신청] for an associate, one line for everybody else. */
function LevelUpBoardHead({ profile, onDone }: Props) {
    if (isAssociate(profile)) return <LevelUpCard profile={profile} onDone={onDone} />;
    return <p className="lp-box cm-level-done">이미 등업했어요. 아래는 새싹이 된 분들이에요.</p>;
}

export default LevelUpBoardHead;
