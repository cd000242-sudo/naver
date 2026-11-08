import { rewardRows } from '../../lib/communityGrades.mjs';
import type { CommunityReward } from '../../lib/communitySession';

/** "내 보상": the rewards my grade earned and where each one stands. Nothing is drawn when the server sent none. */
function RewardStatus({ rewards }: { rewards: readonly CommunityReward[] }) {
    const rows = rewardRows(rewards);
    if (rows.length === 0) return null;
    return (
        <section className="me-rewards" aria-labelledby="me-rewards-title">
            <h3 id="me-rewards-title">내 보상</h3>
            <ul>
                {rows.map((row) => (
                    <li key={row.key}>
                        <b>{row.tierLabel}</b>
                        <span>{row.text}</span>
                        <em className={`lp-state lp-state-${row.tone}`}>{row.statusLabel}</em>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default RewardStatus;
