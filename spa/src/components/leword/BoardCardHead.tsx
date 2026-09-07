import type { ReactNode } from 'react';
import { EVIDENCE_ICON, SURFACE_TAG, TIER_BADGE, TIMING_BADGE } from './preemptionMeta';
import { preemptionIndex } from '../../lib/preemptionIndex';

/**
 * 보드 카드의 머리 — 배지·제목·근거.
 *
 * 표시 전용이라 목록 컴포넌트에서 떼어 냈다. 판정은 하나도 안 한다 —
 * 이미 실측으로 정해진 값을 읽어 색과 문구로 옮길 뿐이다.
 */

type Evidence = { code: string; text: string };

export type CardHeadRow = {
    keyword: string;
    topic: string;
    tier?: string;
    intentLabel?: string;
    trendLabel?: string;
    briefingRisk?: string | null;
    regulatoryLabel?: string;
    layoutBestFor?: string | null;
    /** "언제 쓸 것" — 데이터랩 24개월 실측 산술. 빈 문자열 = 미측정. */
    timingGroup?: string;
    /** 12개월 최고치의 달·평소 대비 배수·2년 반복 여부·남은 달 — 발행(board-order)이 단순 산술로 채운다. */
    peakMonth?: number;
    peakMultiplier?: number;
    peakRecurring?: boolean | null;
    monthsToPeak?: number | null;
    /** 애드센스 적합 — 의도·CPC 실측 판정. null 은 재료 부족(미판정)이지 부적합이 아니다. */
    adsenseFit?: boolean | null;
    adsenseReason?: string;
    earlyMover?: boolean;
    earlyMoverReasons?: string[];
    evidence: Evidence[];
    searchVolume: number | null;
    documentCount: number | null;
    serp?: {
        adCount?: number | null;
        exactTitleHits?: number | null;
        sampledTitles?: number | null;
    };
};

/**
 * 배지는 **셋만** 남긴다 — 사장님 지시(2026-08-11):
 * "카테고리 빼고 구매검토 빼줘, 저 3개는 깔끔하게:
 *  워드프레스 판 / 상위 3위권 빈자리 / 상승세."
 *
 * 카테고리는 위쪽 주제 서브탭이 이미 말한다(카드마다 반복하면 눈만 시끄럽다).
 * '구매 검토' 같은 의도 라벨은 거의 모든 행에 붙어 변별력이 없었다.
 * '지금이 선점 적기'·경고 배지도 뺐다 — 셋만 두라는 지시가 명시적이었다.
 * 경고에 해당하는 사실은 아래 근거 줄에 그대로 남아 있다.
 */
function BoardCardHead({ row, rank, onCopy, copied, extraTags }: {
    row: CardHeadRow;
    rank?: number;
    /** 배지 줄 맨 앞에 끼울 태그 — 실검 틈새 탭이 이슈명·실측 수요·급상승을 넣는다. */
    extraTags?: ReactNode;
    /** 키워드 복사 — 액션 줄에서 홀로 밀려나던 버튼을 주인공(키워드) 옆으로 옮겼다. */
    onCopy?: () => void;
    copied?: boolean;
}) {
    const index = preemptionIndex({
        searchVolume: row.searchVolume,
        documentCount: row.documentCount,
    });
    return (
        /*
         * **한 덩어리로 감싼다.** 예전에는 프래그먼트(<>)로 배지·제목·근거를 각각
         * 내보냈다. 카드가 세로 flex 였을 때는 문제가 없었는데, 3열 그리드로 바꾸자
         * 그 셋이 **각각 다른 열**로 흩어졌다(실측: 배지 1열·제목 2열·근거 3열,
         * 지표와 액션은 둘째 줄로 밀렸다). 그리드는 자식 하나를 한 칸에 넣는다.
         */
        <div className="lw-card-head">
            <div className="lw-card-tags">
                {extraTags}
                {row.layoutBestFor && SURFACE_TAG[row.layoutBestFor] && (
                    <span className={`lw-surface-tag surface-${row.layoutBestFor}`}>
                        {SURFACE_TAG[row.layoutBestFor]}
                    </span>
                )}
                {row.tier && TIER_BADGE[row.tier] && (
                    <span className={`lw-tier-tag ${TIER_BADGE[row.tier].cls}`}>{TIER_BADGE[row.tier].text}</span>
                )}
                {/*
                  * 시기 그룹(2026-08-17: "시기별로 알 수 있으면 좋잖아")이 있으면
                  * 트렌드 배지를 **대체**한다 — 같은 실측의 더 행동적인 표현이라
                  * 배지 수를 늘리지 않는다. 없으면 기존 트렌드 배지 그대로.
                  */}
                {row.timingGroup && TIMING_BADGE[row.timingGroup] ? (
                    <span className={`lw-timing-tag ${TIMING_BADGE[row.timingGroup].cls}`}>{row.timingGroup}</span>
                ) : (row.trendLabel && row.trendLabel !== '판정불가' && (
                    <span className="lw-trend-tag">{row.trendLabel}</span>
                ))}
                {row.adsenseFit === true && (
                    <span className="lw-adsense-tag" title={row.adsenseReason || ''}>AdSense</span>
                )}
            </div>

            {/*
              * 키워드 앞: 순위 + 등급.
              *
              * 전에는 '약함 0.0'(검색량 ÷ 문서수)이 붙었는데 이 보드에서는 전 행이
              * '약함' 으로 나와 아무것도 못 가른다 — SSS 기준이 비율 5배인데 실측
              * 45건의 최대가 0.476 이었다. 검색량은 한 달 치이고 문서수는 10년치
              * 누적이라 애초에 넘을 수 없는 눈금이다. 색도 약함(노랑)이 초황금(금색)과
              * 겹쳤다(사장님 지적).
              *
              * 그래서 눈금을 사장님 기준으로 다시 잡았다 — 광고 · 검색량 · 정면 글.
              * 판정은 preemptionIndex 가 단일 출처다(화면이 따로 판정하지 않는다).
              */}
            <h3 className="lw-card-keyword">
                {rank !== undefined && <span className="lw-rank">{rank}</span>}
                <span className={`lw-index lw-index-${index.tier}`} title={index.reason}>
                    {index.label}
                </span>
                {row.keyword}
                {onCopy && (
                    <button
                        type="button"
                        className="lw-copy-mini"
                        title="키워드 복사"
                        aria-label={`${row.keyword} 복사`}
                        onClick={onCopy}
                    >{copied ? '복사됨' : '⧉'}</button>
                )}
            </h3>

            <ul className="lw-evidence">
                {/*
                  * 시기 한 줄(사장님 2026-09-07 "검색량이 폭발적이면서 상위노출이 되어야").
                  * 실측 두 가지와 달력 산술만 적는다 — "작년 그 달이 지금의 몇 배였나",
                  * "다음 그 달까지 몇 달인가". 그때 검색량이 얼마일지는 적지 않는다(추정).
                  * 주민세 납부기간이 "지금 27,110" 으로만 보이면 지금 쓸 키워드로 읽히는데,
                  * 실은 8월에 30배가 되는 키워드다 — 이 줄이 그걸 말한다.
                  */}
                {typeof row.peakMultiplier === 'number' && row.peakMultiplier >= 2 && row.peakMonth && (
                    <li className="lw-evidence-early">
                        <span aria-hidden="true">◔</span>
                        {row.peakRecurring === true
                            /* 2년 연속 같은 달 최고 — 실측이라 "매년"이라 말할 수 있다. */
                            ? `매년 ${row.peakMonth}월 최고(2년 실측) — 평소의 ${row.peakMultiplier}배`
                            /* 한 해뿐이거나 재작년은 달랐음 — 사실만 적고 시기는 말하지 않는다. */
                            : `12개월 최고치는 ${row.peakMonth}월 — 평소의 ${row.peakMultiplier}배${row.peakRecurring === false ? ' · 재작년은 달랐음' : ''}`}
                        {row.peakRecurring === true && typeof row.monthsToPeak === 'number' && (
                            row.monthsToPeak === 0 ? ' · 이번 달'
                                : row.monthsToPeak <= 6 ? ` · ${row.peakMonth}월까지 ${row.monthsToPeak}개월`
                                    : ` · ${12 - row.monthsToPeak}개월 전에 지남`
                        )}
                    </li>
                )}
                {(row.earlyMoverReasons || []).map((text) => (
                    <li key={text} className="lw-evidence-early"><span aria-hidden="true">↗</span>{text}</li>
                ))}
                {row.evidence.map((item) => (
                    <li key={item.code}>
                        <span aria-hidden="true">{EVIDENCE_ICON[item.code] || '·'}</span>{item.text}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default BoardCardHead;
