import { formatCount } from '../../lib/keywordApi';
import { ISSUE_TYPE_LABEL, type IssueBoardRow, type IssueBrief } from '../../lib/issueFlow';
import { naverSearchUrl } from './preemptionMeta';

/**
 * 이슈 흐름 브리핑 — "왜 뜨나 · 어디에 몰렸나 · 다음에 몰릴 검색어".
 *
 * 사장님(2026-09-03): "지금 왜 뜨는지, 어느 키워드에 몰려 있으니까 다음 사람들이
 * 궁금해할 키워드가 뭔지, 어떤 키워드를 선점해 놔야 트래픽이 몰릴지 분석해서
 * 올려놔야 되는 거 아니니?" — 그 추론 계층을 이슈 단위로 보여 주는 판이다.
 *
 * 세 줄의 출처가 다르다. 화면이 그 차이를 숨기지 않는다:
 *   왜 뜨나   = 에이전트 추론 중 **뉴스 헤드라인으로 검증된 문장만**(탈락분은 발행 안 됨)
 *   몰린 말   = 자동완성·연관검색어 실측(사람들이 이미 치는 말)
 *   다음 물결 = 에이전트 추론 — 보드에 올라 실측까지 간 것은 ✅/🚩 로 표시한다
 */

const LANE_LABEL: Record<string, string> = { realtime: '실검', tech: 'IT·AI', policy: '정책' };

const ORIGIN_LABEL: Record<string, string> = {
    autocomplete: '자동완성', related: '연관검색어', head: '이슈명', 'next-wave': '다음 물결', derived: '파생',
};

type Props = {
    brief: IssueBrief;
    /** 이 이슈에서 실측을 통과해 카드가 된 행 — 다음 물결 옆에 ✅(틈새)/🚩(선점) 표시. */
    rows: IssueBoardRow[];
    /** 비로그인: 다음 물결은 가린다. 왜 뜨나·몰린 말은 열어 둔다. */
    locked: boolean;
    onAnalyze?: (keyword: string) => void;
    /** 카드의 '이슈 ·' 태그에서 뛰어올 앵커. */
    anchorId?: string;
};

function IssueFlowBrief({ brief, rows, locked, onAnalyze, anchorId }: Props) {
    const verdictOf = new Map(rows.map((row) => [row.keyword.replace(/\s+/g, ''), row.verdict]));
    const headlines = brief.headlines.slice(0, 2);
    const hasWave = brief.nextWave.length > 0;
    return (
        <article id={anchorId} className={`lw-issue-flow${brief.isHot ? ' hot' : ''}`}>
            <header className="lw-issue-flow-head">
                <h3>
                    {brief.issue}
                    <span className="lw-trend-tag">{ISSUE_TYPE_LABEL[brief.issueType] || brief.issueType}</span>
                    {brief.lane !== 'realtime' && <span className="lw-trend-tag">{LANE_LABEL[brief.lane] || brief.lane}</span>}
                    {brief.isHot && <span className="lw-warn-tag">급상승</span>}
                    {brief.rowCount > 0 && <span className="lw-intent-tag">실측 카드 {brief.rowCount}</span>}
                </h3>
                <a href={naverSearchUrl(brief.issue)} target="_blank" rel="noreferrer">네이버 검색결과</a>
            </header>

            {brief.why ? (
                <div className="lw-why">
                    <em>왜 지금?</em>{brief.why}
                    <small>뉴스 헤드라인 {brief.headlines.length}건 근거 · 에이전트 추론(헤드라인으로 검증된 문장만)</small>
                </div>
            ) : (
                <div className="lw-why lw-why-empty">
                    <em>왜 지금?</em>검증된 이유 없음
                    <small>에이전트 추론이 뉴스 헤드라인과 맞지 않아 실리지 않았습니다 — 지어내지 않습니다</small>
                </div>
            )}

            {headlines.length > 0 && (
                <ul className="lw-issue-flow-heads">
                    {headlines.map((head) => (
                        <li key={head.title}>
                            {head.link
                                ? <a href={head.link} target="_blank" rel="noreferrer">{head.title}</a>
                                : <span>{head.title}</span>}
                            {head.press && <small>{head.press}</small>}
                        </li>
                    ))}
                </ul>
            )}

            {brief.concentrated.length > 0 && (
                <div className="lw-issue-flow-row">
                    <em>몰린 말 <small>자동완성·연관검색어 실측</small></em>
                    <div className="lw-issue-flow-chips">
                        {brief.concentrated.map((item) => (
                            <button
                                key={item.keyword}
                                type="button"
                                title={`${ORIGIN_LABEL[item.origin || ''] || '실측'} — LEWORD 로 분석`}
                                onClick={() => onAnalyze?.(item.keyword)}
                            >
                                {item.keyword}
                                {typeof item.searchVolume === 'number' && <b>{formatCount(item.searchVolume)}</b>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {hasWave && (
                <div className={`lw-issue-flow-row lw-issue-flow-wave${locked ? ' locked' : ''}`}>
                    <em>다음 물결 <small>에이전트 추론 — ✅ 틈새 · 🚩 선점 후보로 실측 통과</small></em>
                    <div className="lw-issue-flow-chips">
                        {brief.nextWave.map((wave) => {
                            const verdict = verdictOf.get(wave.keyword.replace(/\s+/g, ''));
                            return (
                                <button
                                    key={wave.keyword}
                                    type="button"
                                    className={verdict ? `on-board ${verdict}` : ''}
                                    title={wave.reason}
                                    onClick={() => onAnalyze?.(wave.keyword)}
                                >
                                    🌊 {wave.keyword}
                                    {verdict === 'niche' && <i>✅</i>}
                                    {verdict === 'preemption' && <i>🚩</i>}
                                    {typeof wave.searchVolume === 'number' && <b>{formatCount(wave.searchVolume)}</b>}
                                    <small>{wave.reason}</small>
                                </button>
                            );
                        })}
                    </div>
                    {locked && (
                        <div className="lw-lock" aria-hidden="true">
                            <span>🔒</span>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}

export default IssueFlowBrief;
