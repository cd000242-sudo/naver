import { Link } from 'react-router-dom';
import { communityPath } from '../../lib/communityModel.mjs';
import { PROMO_PLATFORMS } from '../../lib/communityPlatform.mjs';

type Props = { platform: string; sort?: string };

/** The two sub-tabs of 내 글 홍보: 네이버 블로그 | 구글 블로그 (naver is the first screen). */
function PromoTabs({ platform, sort }: Props) {
    return (
        <nav className="cm-subtabs" aria-label="블로그 종류">
            {PROMO_PLATFORMS.map((entry) => (
                <Link key={entry.key} className={`cm-subtab${entry.key === platform ? ' on' : ''}`} to={communityPath({ board: 'promo', platform: entry.key, sort })}
                    aria-current={entry.key === platform ? 'page' : undefined}>{entry.label}</Link>
            ))}
        </nav>
    );
}

export default PromoTabs;
