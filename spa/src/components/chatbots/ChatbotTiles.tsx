import protectedLinks from '../../data/protectedLinks.json';
import { resolveProtectedTile, resolvePublicTile } from '../../lib/chatbotTiles.mjs';
import type { SiteContent } from '../../lib/siteOps';
import ProtectedLinkTile from './ProtectedLinkTile';

/** 관리자 설정이 없을 때 사용하는 제미나이 기본 안내 */
const GEMINI_DEFAULTS = {
    title: '무료 제미나이 챗봇',
    desc: '부티크 인포의 글쓰기 프롬프트 탭에서 제미나이 전용 챗봇을 바로 사용합니다.',
    url: 'https://www.boutique-info.com/?page=prompt',
    cta: '사용하러 가기',
    badge: '바로 사용',
};

/** 네이버 무료 프롬프트 — 공개 링크라 평문 그대로 둔다. 관리자가 바꾼 값이 없으면 이 값이 쓰인다. */
const NAVER_FREE_DEFAULTS = {
    title: '네이버 무료 프롬프트',
    desc: '네이버 블로그 글쓰기용 무료 프롬프트입니다. 누르면 새 창에서 열립니다.',
    url: 'https://app.notion.com/p/AI-44ec04a37c4c4c928f06241828d55982?t=3ec755b0d4a28003ba8800a9a8405a2d',
    cta: '프롬프트 보기',
    badge: '무료',
};

/** 리더남 홈판 프롬프트(테스트) — 링크는 비밀번호로 암호화된 상태로만 번들에 들어간다(src/data/protectedLinks.json). */
const HOMEFEED_LOCKED_DEFAULTS = {
    title: '리더남 홈판 프롬프트 (테스트)',
    desc: '테스트용입니다. 비밀번호를 아는 분만 열 수 있습니다.',
};

type Props = {
    /** SiteContent.chatbots — 관리자 '사이트 편집 > 무료 챗봇'이 저장한 값. 없으면 내장 기본값만 쓴다. */
    chatbots?: SiteContent['chatbots'];
};

/** 무료 챗봇 허브의 카드 세 장. 값은 관리자 저장값 → 내장 기본값 순으로 정해진다. */
export default function ChatbotTiles({ chatbots }: Props) {
    const gemini = resolvePublicTile(GEMINI_DEFAULTS, chatbots?.gemini);
    const naverFree = resolvePublicTile(NAVER_FREE_DEFAULTS, chatbots?.naverFree);
    const locked = resolveProtectedTile(HOMEFEED_LOCKED_DEFAULTS, chatbots?.homefeedLocked, protectedLinks['homefeed-prompt']);

    return (
        <>
            <a className="hub-tile fade-in" href={gemini.url} target="_blank" rel="noopener noreferrer">
                <div className="hub-tile-top">
                    <span className="hub-emoji">✨</span>
                    <span className="hub-badge purple">{gemini.badge}</span>
                </div>
                <h3>{gemini.title}</h3>
                <p>{gemini.desc}</p>
                <span className="hub-cta">{gemini.cta} →</span>
            </a>

            <a className="hub-tile fade-in" href={naverFree.url} target="_blank" rel="noopener noreferrer">
                <div className="hub-tile-top">
                    <span className="hub-emoji">📝</span>
                    <span className="hub-badge">{naverFree.badge}</span>
                </div>
                <h3>{naverFree.title}</h3>
                <p>{naverFree.desc}</p>
                <span className="hub-cta">{naverFree.cta} →</span>
            </a>

            <ProtectedLinkTile
                emoji="🔒"
                badge="비밀번호"
                title={locked.title}
                desc={locked.desc}
                payload={locked.payload}
            />
        </>
    );
}
