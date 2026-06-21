import {
  buildBusinessAngleDirective,
  buildStructureVariationDirective,
  type PromptMode,
} from './promptLoader.js';
import { preprocessLongKeyword } from './contentKeywordHelpers';

type ContentJsonPromptSource = {
  previousTitles?: string[];
  customPrompt?: string;
  businessInfo?: {
    name?: string;
    phone?: string;
    kakao?: string;
    address?: string;
    hours?: string;
    serviceArea?: string;
    region?: string;
    extra?: string;
    promoTarget?: string;
    promoAngle?: string;
    promoAngleDirective?: string;
  };
};

export interface ContentJsonOutputFormatOptions {
  contentMode: PromptMode;
  mode: PromptMode;
  source: ContentJsonPromptSource;
  title: string;
  rawText: string;
  primaryKeyword: string;
  subKeywords: string;
  metrics?: { searchVolume?: number; documentCount?: number };
  minChars?: number;
}

function buildHeadingsExample(): string {
  return `"headings": [
    {"title": "소제목 1", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 2", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 3", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"}
  ]`;
}

function buildModeStructureRule(mode: PromptMode): string {
  const isHomefeed = mode === 'homefeed';
  const isMate = mode === 'mate';

  return isHomefeed ? `
⚠️⚠️⚠️ [홈판 모드 필수 구조 규칙] ⚠️⚠️⚠️
- introduction: 정확히 3줄, 첫 문장 25자 이내, 상황/발언/반응으로 시작
- headings: STRUCTURE OVERRIDE에서 지정한 소제목 개수를 따를 것 (3~8개)
- [강제] 1번 소제목은 반드시 인물명(주어)으로 시작 (예: "매니저의 폭로" - O / "의 폭로" - X)
- (선택) 맥락상 자연스러울 때만 독자 반응을 본문에 1~2문장 녹임. ⛔ "📌 당시 대중 반응 요약" 같은 가짜 댓글 블록 합성 금지(거짓 신호 = AI 티 + 신뢰 저하)
- conclusion: 결론/정리 금지, 여운형 문장 2줄만
- 전체 톤: 사용자 설정 글톤 어미 적용, 기자체/설명체 절대 금지
` : isMate ? `
⚠️⚠️⚠️ [네이버 메이트 모드 필수 구조 규칙 — 울트라 플랜] ⚠️⚠️⚠️
- introduction: 첫 300자 안에 핵심 답변 + 판단 기준 2~3개 + 글의 적용 범위를 먼저 작성
- headings: 5~7개, 각 소제목은 하나의 검색 질문에 답하는 형태
- [강제] 1번 소제목은 반드시 메인 주제(주어)로 시작하고, 첫 문장에 바로 답을 쓴다
- [강제] 모든 소제목 본문 첫 2문장 안에 정의/기준/절차/비교/주의 중 1개 이상의 "인용 원자"를 넣는다
- [강제] 본문 중간에 기준표/비교표/체크리스트/단계형 정리 중 최소 1개를 실제 본문 블록으로 작성
- [강제] 마지막 소제목 또는 결론 직전에 FAQ 4~6개를 포함
- [강제] 최신성 또는 확인 기준일이 필요한 주제는 "확인 기준" 또는 "최신 확인 포인트" 문장을 포함하되, 출처 없는 "공식 가이드/최신 가이드" 표현은 절대 금지
- [강제] 원본에 없는 수치·날짜·비용·경험·정책은 만들지 말고, 부족하면 "자료 기준으로는 확인되지 않습니다"라고 처리
- [강제] "한 줄 판정", "한 줄 결론", "[한 줄 판정: ...]" 같은 라벨 출력 금지. 핵심 문장은 라벨 없이 자연 문장으로 작성
- 결론: 핵심 요약 2~3줄 + 다음에 확인할 행동 1개, 선정/수익/AI 브리핑 인용 보장 표현 금지
` : `
⚠️⚠️⚠️ [SEO 모드 필수 규칙] ⚠️⚠️⚠️
- [강제] 1번 소제목은 반드시 메인 주제(주어)로 시작 (예: "아이폰16 디자인" - O / "의 디자인" - X)
- 주어가 생략된 채 조사(~의, ~에 대한)로 시작하는 소제목 절대 금지

💡 [SEO 제목 생성 가이드 - 과한 자극 자제]
- 과도한 충격 유도형 단어(충격, 경악, 소름 등)는 실제 내용과 관련이 깊을 때만 제한적으로 사용하세요.
- 단순히 클릭을 위한 낚시성보다는 정보의 가치와 해결책을 암시하는 제목을 우선하세요.
- [메인 키워드] + [핵심 혜택/결과] + [궁금증 유발] 구조를 권장합니다.
`;
}

function buildEvidenceBlockRule(): string {
  return `
📊 [모든 모드 공통: 표/체크리스트/그래프성 블록 규칙]
- 비교·비용·시간·절차·기준·안전·스펙·장단점·FAQ형 주제는 본문 중간에 반드시 1개 이상의 구조화 블록을 넣는다.
- 정보형/SEO/메이트/쇼핑/업체홍보: 기준·금액·서류·절차·비교처럼 항목화 가능한 주제면 2열 마크다운 표 1개를 반드시 작성한다. 인용구·산문으로 대체 금지. 항목화가 어려운 주제만 체크리스트 대체 허용. 형식은 반드시 최대 2열:
  | 항목 | 정리 |
  | --- | --- |
  | 기준 | 독자가 바로 판단할 수 있는 내용 |
  위 표의 '항목/정리'는 형식 예시일 뿐이다 — 실제 열 이름은 글 내용에 맞는 단어로 바꿔라. 표 밖에 "| 항목 | 정리 |" 같은 단독 헤더 행을 출력하지 마라.
- 표가 어색한 홈판/감성글은 짧은 체크리스트 또는 단계 리스트로 대체한다.
- 그래프는 실제 수치 데이터가 있을 때만 표로 표현한다. 수치가 없으면 "흐름 정리" 또는 "체크리스트"로 작성한다.
- 표/체크리스트는 본문용 콘텐츠이며, 자가검수 체크리스트나 내부 검증 결과를 출력하면 안 된다.
- 출처 없는 "공식 가이드", "최신 가이드에서는" 같은 표현은 금지한다. 확인 기준은 "2026년 6월 기준", "제조사 안내 확인 기준"처럼 범위를 좁혀 쓴다.
`;
}

function buildPreviousTitlesBlock(source: ContentJsonPromptSource, contentMode: PromptMode): string {
  if (!source.previousTitles?.length) return '';
  if (!(contentMode === 'business' || contentMode === 'seo' || contentMode === 'homefeed' || contentMode === 'mate')) return '';
  return `
══════════════════════════════════════════
🚫 [이전 작성 제목 — 비슷한 패턴 반복 금지]
══════════════════════════════════════════
${source.previousTitles.slice(-5).map((title, index) => `${index + 1}. ${title}`).join('\n')}

⛔ 위 제목들과 같은 시작 단어, 같은 패턴, 같은 후킹 방식 절대 금지.
⛔ 완전히 다른 각도로 새 제목 창작하라.
`;
}

function buildBusinessInfoBlock(source: ContentJsonPromptSource): string {
  const info = source.businessInfo;
  if (!info) return '';

  return `
══════════════════════════════════════════
🏢 [업체 정보 — 절대 변경/조작 금지, 그대로 사용]
══════════════════════════════════════════
${info.name ? `📛 업체명: ${info.name}` : ''}
${info.phone ? `📞 전화번호: ${info.phone}` : ''}
${info.kakao ? `💬 카카오톡: ${info.kakao}` : ''}
${info.address ? `📍 주소: ${info.address}` : ''}
${info.hours ? `🕐 영업시간: ${info.hours}` : ''}
${info.serviceArea === 'nationwide' ? `🌏 서비스 범위: 전국 (지역 제한 없음)
   → 제목/본문에 특정 지역명 강제 삽입 금지
   → "전국 상담 가능", "지역 무관 안내", "서비스 가능 범위 확인"처럼 입력 정보 기반 표현 활용
   → 단, 디지털·온라인 상품(앱/소프트웨어/전자책/강의/구독 등)이면 "전국" 표현 자체를 쓰지 마라 — 지역 개념이 무의미하다. 대신 사용 환경(OS·기기·사양), 라이선스 조건, 지원 채널(오픈채팅·원격)을 다뤄라
   → 시공 건수, 거점 수, 방문 가능 시간은 특징/경력에 실제 입력된 경우에만 사용
   → 지역 키워드 대신 업종+차별점으로 검색 노출 (예: "원목 인테리어", "친환경 도배")` : info.region ? `🗺️ 서비스 지역: ${info.region}
   → 제목 맨 앞에 위 지역명 중 1개 필수 배치 (예: "${info.region.split(/[,/\s]+/)[0]} 인테리어")
   → 본문에 위 지역명들을 골고루 분산 등장 (각 지역 최소 1회)
   → 시공 건수, 당일 방문, 가격, 경력 수치는 특징/경력 또는 원본 텍스트에 실제 입력된 경우에만 사용
   → 입력 근거가 없으면 지역별 상담 가능 범위, 문의 전 확인사항, 방문 가능 여부 확인 절차를 설명
   → 다른 지역명(서울/강남 등) 임의 추가 절대 금지` : ''}
${info.extra ? `✨ 특징/경력: ${info.extra}` : ''}
${info.promoTarget === 'product' ? `
🛍️ [홍보 대상: 취급 상품 판매]
- 이 글의 주인공은 업체가 아니라 업체가 취급/판매하는 상품이다. 수집 자료(원문)의 상품 정보(이름·가격·조건·혜택)를 중심으로 작성하라.
- 상품의 장점·혜택·사용 시나리오를 구체적으로 다루고, 업체는 "믿을 수 있는 판매처"로 소개하라.
- 글의 목표는 구매·문의 전환 — 마무리에 위 연락처(전화/카카오톡)로 문의를 자연스럽게 유도하라.
- 수집 자료에 없는 상품 스펙·가격·혜택을 지어내지 마라.` : `
🏢 [홍보 대상: 업체 자체 홍보]
- 이 글의 주인공은 업체다. 전문성·신뢰·서비스 품질을 중심으로 작성하라.
- 취급 상품/서비스는 업체의 강점을 보여주는 근거로 활용하라.
- 글의 목표는 문의 전환 — 마무리에 위 연락처로 상담 문의를 자연스럽게 유도하라.`}
${info.promoAngle ? `
🎯 [이번 글 강조 각도: ${info.promoAngle}]
- ${info.promoAngleDirective || '이 각도를 글의 중심 프레임으로 사용하라.'}
- 같은 업체로 발행된 직전 글들과 프레임이 겹치지 않도록, 제목과 소제목 구성을 이 각도 중심으로 잡아라. 마무리는 항상 문의 전환으로 수렴하라.` : ''}

⛔ 위 연락처 정보는 한 글자도 변경하지 말고 그대로 사용하라.
⛔ 절대 가짜 전화번호, 가짜 카카오톡 ID, 가짜 주소, 가짜 지역을 만들지 마라.
⛔ 입력/원본에 없는 시공 건수·평점·가격·A/S 기간·당일 방문 가능 여부를 만들지 마라.
⛔ 위 업체명은 제목 1회 + 도입/본문/문의 안내에 총 3~6회만 자연 노출하라.
⛔ 업체명을 문단마다 반복하지 말고, 서비스 장점·절차·고객 상황·문의 CTA로 전환 설득을 구성하라.
`;
}

function buildCustomPromptBlock(source: ContentJsonPromptSource): string {
  if (!source.customPrompt) return '';
  return `
══════════════════════════════════════════
💡 [사용자 추가 지시사항 — 최우선 반영, 다른 모든 규칙보다 상위]
══════════════════════════════════════════
${source.customPrompt.trim()}
`;
}

function buildPrimaryKeywordBlock(primaryKeyword: string): string {
  if (!primaryKeyword) return '';
  const processed = preprocessLongKeyword(primaryKeyword);
  if (processed.isLong) {
    return `🔑 메인 키워드: "${processed.coreKeyword}"
   → 제목 맨 앞 3글자 이내 필수 배치
   → 본문 전체에 3~5회 자연스럽게 분산 (밀도 1~2%)
   → 주제 문맥(${processed.contextHint})은 참고만, 제목에 그대로 사용 금지`;
  }
  return `🔑 메인 키워드: "${processed.coreKeyword}"
   → 제목 맨 앞 3글자 이내 필수 배치
   → 본문 전체에 3~5회 자연스럽게 분산 (밀도 1~2%)
   → 소제목 5~7개 중 2~3개에만 메인 키워드 또는 변형을 자연스럽게 포함 (나머지는 키워드 없이 작성)`;
}

function buildMetricsBlock(metrics?: { searchVolume?: number; documentCount?: number }): string {
  if (!metrics) return '';
  return `
📊 [참고 지표] 월간검색량 ${metrics.searchVolume !== undefined && metrics.searchVolume >= 0 ? metrics.searchVolume.toLocaleString() + '건' : '집계중'} / 문서량 ${metrics.documentCount !== undefined ? metrics.documentCount.toLocaleString() + '건' : '집계중'} → ${metrics.searchVolume && metrics.searchVolume > 10000 ? '대형키워드: 전문성·최신성 강조' : '블루오션: 세부 경험·독점 정보'}`;
}

export function buildContentJsonOutputFormat(options: ContentJsonOutputFormatOptions): string {
  const {
    contentMode,
    mode,
    source,
    title,
    rawText,
    primaryKeyword,
    subKeywords,
    metrics,
    minChars,
  } = options;

  const isHomefeed = mode === 'homefeed';
  const isMate = mode === 'mate';
  const modeStructureRule = buildModeStructureRule(mode);
  const evidenceBlockRule = buildEvidenceBlockRule();

  return `
────────────────────
[출력 형식 — 반드시 이 순서와 JSON 형식으로]${modeStructureRule}${evidenceBlockRule}

{
  "selectedTitle": "제목 1",
  "titleCandidates": [
    {"text": "제목 1", "score": 95},
    {"text": "제목 2", "score": 90},
    {"text": "제목 3", "score": 85}
  ],
  ${buildHeadingsExample()},
  "introduction": "${isHomefeed ? '도입부 (정확히 3줄, 첫 문장 25자 이내)' : isMate ? '도입부 (첫 300자 안에 직접 답변)' : '도입부'}",
  "conclusion": "${isHomefeed ? '마무리 (여운형 2줄, 결론/정리 금지)' : isMate ? '마무리 (핵심 요약 + 다음 행동)' : '마무리'}",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"],
  "category": "카테고리"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 [이미지 프롬프트 작성 규칙 - 매우 중요!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

imagePrompt 규칙: 각 소제목 본문 문맥과 일치하는 구체적 한국어 묘사. 추상/막연 금지, 소제목별 고유(중복·동일 패턴 금지).
※ 소제목 성격에 맞는 이미지 "타입"을 골라라:
 - 경험·장소·사물·사람 중심 → 사실적 장면 묘사. 예: "보습 크림 바르는 손, 촉촉한 겨울 피부, 따뜻한 실내"
 - 정보·수치·비교·절차·제도 중심(정책/세금/금융 등) → 풍경 사진 대신 인포그래픽/도식 스타일.
   예: "단계별 흐름도 그래픽, 비교 표, 아이콘+화살표, 깔끔한 정보 카드, 한글 라벨"
 - 비율: 정방형(1:1) 권장 — 네이버 목록 썸네일 위아래 잘림 방지.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[원본 텍스트]
${contentMode === 'homefeed' ? buildStructureVariationDirective() : ''}${contentMode === 'business' ? buildBusinessAngleDirective() : ''}${buildPreviousTitlesBlock(source, contentMode)}${contentMode === 'business' ? buildBusinessInfoBlock(source) : ''}${buildCustomPromptBlock(source)}
══════════════════════════════════════════
🎯 [필수 키워드 정보 — 제목/소제목 작성에 반드시 반영]
══════════════════════════════════════════
${title ? `📌 원본 제목 참고: "${title}"
   → 이 제목을 참고하여 더 강력한 후킹 제목으로 변환. 핵심 키워드 유지 + 감정/호기심 트리거 추가.
` : ''}${buildPrimaryKeywordBlock(primaryKeyword)}
${subKeywords ? `🔖 서브 키워드: ${subKeywords}
   → 소제목 5~7개 중 2~3개의 소제목에 분산 포함
   → 도입부·결론부 각 1회 이상 자연스럽게 등장` : ''}
${contentMode === 'homefeed' && subKeywords ? `
⚠️ [홈판 추가] 메인키워드 3~5회(1~2%), 서브키워드 2~3개 소제목에 분산, 도입부·결론부 각 1회. 스크롤 트리거 3개 이상 의무. 키워드를 억지로 넣지 말 것.` : ''}
${contentMode === 'seo' ? `
⚠️ [SEO 모드 제목 필수 조건]
1. 메인 키워드를 제목 맨 앞 3글자 이내 배치 (검색 매칭률 ↑)
2. 28~45자 길이
3. 1인칭 경험 + 구체성(결과/변화/수치) 포함 (예: "써본 후기", "바꿨더니", "월 얼마 절감"). 기간 수치(N주/N개월)는 연속 발행 시 반복되므로 다른 구체성 우선.
4. AI 표현 절대 금지 ("결론적으로", "정리하면", "알아보겠습니다")` : ''}
${contentMode === 'mate' ? `
⚠️ [네이버 메이트 모드 제목 필수 조건]
1. 메인 키워드를 제목 앞쪽에 배치하되 과한 낚시 표현 금지
2. 28~45자 길이
3. 질문에 답하는 의도 또는 판단 기준을 제목에 반영
4. "선정 보장", "수익 보장", "돈쓸어담는" 등 과장 표현 금지
5. 기준형/방법형/비교형/질문답변형 중 하나로 작성
6. 제목과 본문 주제가 1:1로 일치해야 하며, 주제 이탈 금지` : ''}
${contentMode === 'homefeed' ? `
⚠️ [홈판 모드 제목 필수 조건]
1. 28~35자 길이 (모바일 1.5초 법칙)
2. 감정 트리거 1개 이상 (충격/공감/궁금증)
3. 결핍 설계 5대 공식 중 하나 적용 (정보 결핍/사회적 결핍/경험 결핍/시간 결핍/금전 결핍)
4. 메인 키워드 자연스럽게 포함 (단, SEO처럼 맨 앞 강제 아님)` : ''}
${buildMetricsBlock(metrics)}

══════════════════════════════════════════
📄 [원본 본문 — 아래 내용을 바탕으로 작성하라]
══════════════════════════════════════════
${rawText}

══════════════════════════════════════════
⚠️ [최종 강제 조건 — 위반 시 0점]
══════════════════════════════════════════${minChars && minChars > 0 ? `
1. 글자수: 최소 ${minChars}자 이상. 각 소제목 5문장 이상. 요약/축약 금지.` : ''}
2. 메인 키워드를 제목 맨 앞에 배치. 소제목에는 절반 이하에만 자연스럽게 포함 (과다 삽입 금지)
3. 위 [필수 키워드 정보]의 모든 규칙을 한 줄도 어기지 말 것
4. 출력은 오직 JSON 객체 하나만. JSON 밖에 설명·코드펜스(\`\`\`)를 붙이지 말 것. JSON 문자열 값 안의 마크다운 표·리스트는 허용이며 위 표 규칙은 그대로 유효하다.
5. JSON은 반드시 { 로 시작하고 } 로 끝나야 함.
6. 기준·금액·서류·절차·비교처럼 항목화 가능한 주제면 본문에 2열 마크다운 표(| 항목 | 정리 | 형식) 1개를 반드시 포함하라. 인용구·산문으로 대체 금지.

이제 위 모든 정보를 종합하여 즉시 JSON으로 출력하라.
`;
}
