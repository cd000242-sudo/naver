import { useState } from 'react';
import { fetchKeywordPostIdeas, type KinPostIdea } from '../../lib/keywordApi';
import { bridgePostIdeas } from '../../lib/bridge';
import { loadUserKeys } from '../../lib/userKeys';
import { claudePolicyBlocked, isClaudePolicyBlocked, markClaudePolicyBlocked, siteCanGenerate } from '../../lib/claudeAuthPolicy';

/**
 * 제휴 상품 하나의 제목 만들기 — SEO 와 홈판을 동시에 노린다.
 *
 * 사장님 지시(2026-08-20): "노출 가능성 높은 제목도 같이 보여주면 되겠네.
 * SEO 노출과 홈판을 동시에 노리는 거지. 브랜드커넥트뿐만 아니라 토스
 * 쉐어링크랑 쿠팡 파트너스도 마찬가지야."
 *
 * 세 레인이 같은 부품을 쓴다. 레인마다 따로 만들면 제목 교리가 갈라진다.
 * 제목은 유튜브 글감 탭과 **같은 엔진·같은 교리**로 만든다(keyword-post-ideas).
 *
 * 누를 때만 만든다 — 목록에 있는 것을 미리 다 만들면 구독을 헛되이 태운다.
 */

type State = { status: 'idle' | 'loading' | 'done' | 'error'; ideas?: KinPostIdea[]; message?: string };

function AffiliateTitles({ keyword, product, onAnalyze }: {
    /** 글을 걸 검색어 — 니즈 검색어가 있으면 그것, 없으면 상품명 검색어. */
    keyword: string;
    /** 상품명. 없는 사실을 지어내지 않게 붙잡아 주는 재료다. */
    product: string;
    onAnalyze?: (keyword: string) => void;
}) {
    const [state, setState] = useState<State>({ status: 'idle' });

    const make = async () => {
        if (state.status === 'loading' || !keyword) return;
        setState({ status: 'loading' });
        /*
         * **앱을 먼저 쓴다**(사장님 지시 2026-09-07 "실패가 안 되어야지").
         * 앤트로픽이 구독 토큰의 외부 사용을 막은 뒤로 사이트를 먼저 던지면 한 번은
         * 반드시 실패하고 그 실패가 화면에 뜬다. 앱은 이 PC 의 구독이라 정상이다.
         */
        const viaApp = await bridgePostIdeas({
            kind: 'keyword',
            keyword,
            context: product,
            provider: String(loadUserKeys().aiProvider || ''),
        });
        if (viaApp.status === 'ok') {
            const usable = viaApp.ideas
                .filter((idea) => idea.seo && idea.home)
                .map((idea) => ({
                    keyword: idea.keyword,
                    why: idea.why || '',
                    clickWhy: idea.clickWhy,
                    seo: idea.seo as string,
                    home: idea.home as string,
                    sub: idea.sub,
                })) as KinPostIdea[];
            setState(usable.length > 0
                ? { status: 'done', ideas: usable }
                : { status: 'error', message: `${viaApp.provider} 가 제목을 못 만들었습니다 — 다시 눌러 주세요.` });
            return;
        }
        /*
         * 앱이 못 하면 사이트로 — 단 **쓸 수 있는 자격이 있을 때만** 부른다.
         * 클로드 토큰만 있는 상태로 부르면 거절이 확정이라 시도하지 않는다.
         */
        if (siteCanGenerate(loadUserKeys()) && !claudePolicyBlocked()) {
            const result = await fetchKeywordPostIdeas(keyword, product);
            if (result.ok && result.data) {
                setState({ status: 'done', ideas: result.data.ideas });
                return;
            }
            if (isClaudePolicyBlocked(result.message)) markClaudePolicyBlocked();
            else {
                setState({ status: 'error', message: result.message || result.error || '만들지 못했습니다.' });
                return;
            }
        }
        setState({
            status: 'error',
            message: viaApp.status === 'outdated'
                ? 'LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 업데이트해 주세요.'
                : 'LEWORD 앱을 켜면 이 PC 의 구독으로 바로 만듭니다. 앱 없이 쓰시려면 [내 API 키] 탭에서 Gemini 무료 키를 넣으세요.',
        });
    };

    if (!keyword) return null;

    return (
        <div className="lw-aff-titles">
            {state.status !== 'done' && (
                <button type="button" className="lw-aff-make" onClick={make} disabled={state.status === 'loading'}>
                    {state.status === 'loading' ? '만드는 중…' : '노출 노리는 제목 만들기'}
                    <span>SEO + 홈판</span>
                </button>
            )}
            {state.status === 'error' && <p className="lw-aff-err">{state.message}</p>}
            {state.status === 'done' && (
                <ul className="lw-aff-ideas">
                    {(state.ideas || []).map((idea) => (
                        <li className={idea.recommended ? 'on' : undefined} key={idea.keyword}>
                            {onAnalyze ? (
                                <button type="button" className="lw-aff-ideakey" onClick={() => onAnalyze(idea.keyword)}>
                                    {idea.keyword}
                                </button>
                            ) : <b className="lw-aff-ideakey">{idea.keyword}</b>}
                            {idea.recommended && <span className="lw-pick">추천 · 메인+서브+후킹</span>}
                            <p><em>SEO</em> {idea.seo}</p>
                            <p><em>홈판</em> {idea.home}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default AffiliateTitles;
