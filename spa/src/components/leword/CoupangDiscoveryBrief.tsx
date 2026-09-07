import type { CoupangDiscovery } from '../../lib/coupangDiscovery.mjs';

export default function CoupangDiscoveryBrief({ discovery }: { discovery: CoupangDiscovery }) {
    return <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65 }}>
        <strong style={{ color: '#67e8c5' }}>{discovery.status === 'candidate' ? '실용 기능 단서 · 상품명 기준 조사 후보' : '상세정보에서 발견 가능성 확인'}</strong>
        {discovery.cues.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {discovery.cues.map(cue => <li key={cue.quote + cue.use}>
                <strong>‘{cue.quote}’ + ‘{cue.use}’</strong> — {cue.question}
            </li>)}
        </ul>}
        {discovery.reasons.map(reason => <p key={reason} style={{ color: '#f5c875', margin: '4px 0' }}>{reason}</p>)}
        <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer' }}>구매 욕구를 확인할 질문·글 구성</summary>
            <ol style={{ paddingLeft: 18 }}>
                <li>누가 어떤 상황에서 불편을 겪는지, 실제 사용 사진·영상으로 확인</li>
                <li>기존에 쓰던 물건과 달라진 기능을 상세정보에서 대조</li>
                <li>크기·재질·설치 조건·관리 방법과 맞지 않는 경우 정리</li>
                <li>가격·배송·후기 원문을 확인하고, 제휴 사실을 표시</li>
            </ol>
            <p>상품명의 표기를 연결한 조사 방향입니다. 실제 성능·신제품 여부·판매량·연예인 사용을 확인한 것은 아닙니다. 직접 써본 듯한 후기나 검증하지 않은 효과를 제목에 넣지 마세요.</p>
        </details>
    </div>;
}
