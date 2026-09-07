import { useState } from 'react';
import { affiliateWritingBrief, type WritingAssessment } from '../../lib/recommendationView.mjs';

/** Same evidence-first writing brief in all lanes. No per-view AI calls. */
function AffiliateTitles({ keyword, product, item, assessment, onAnalyze }: {
    keyword: string;
    product: string;
    item?: unknown;
    assessment?: WritingAssessment;
    onAnalyze?: (keyword: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const brief = affiliateWritingBrief(item || { name: product, keyword }, assessment);
    return (
        <div className="lw-aff-titles">
            <button type="button" className="lw-aff-make" aria-expanded={open} onClick={() => setOpen(!open)}>
                {open ? '작성 근거 접기' : '작성 근거·본문 구성 보기'}
                <span>수요 → 상품 → 근거</span>
            </button>
            {open && <div style={{ padding: 12, fontSize: 13, lineHeight: 1.7 }}>
                <p>{brief.warning}</p>
                <p><strong>공략 검색어</strong> {brief.query}{onAnalyze && <button type="button" className="lw-mini" onClick={() => onAnalyze(brief.query)}>분석</button>}</p>
                <ul>{brief.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
                <p><strong>{brief.title.label}</strong><br />{brief.title.text}</p>
                <ol>{brief.sections.map(section => <li key={section}>{section}</li>)}</ol>
                <strong>확인된 공식 제품 자료</strong>
                {brief.sources.length === 0 ? <p>상세 사양의 출처가 아직 없습니다. 제품 성능·비교 우위·사용 후기를 단정하지 마세요.</p>
                    : <ul>{brief.sources.map((source, i) => <li key={source.id + '-' + i}><a href={source.url} target="_blank" rel="noreferrer">원문 확인</a> · {source.excerpt}{source.measuredAt && <> · {source.measuredAt}</>}</li>)}</ul>}
            </div>}
        </div>
    );
}

export default AffiliateTitles;
