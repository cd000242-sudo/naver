import {
  buildBusinessAngleDirective,
  buildStructureVariationDirective,
  resolveCategory,
  HOMEFEED_ISSUE_STORY_CATEGORIES,
  type PromptMode,
} from './promptLoader.js';
import { describeTitleLength } from './content/titleLengthPolicy.js';
import { preprocessLongKeyword } from './contentKeywordHelpers';
import { buildVoiceProfileBlock, sampleVoiceProfile } from './contentVoiceProfile.js';

type ContentJsonPromptSource = {
  previousTitles?: string[];
  customPrompt?: string;
  /** issue-story 골격과 STRUCTURE OVERRIDE의 배타 판정에 사용 */
  categoryHint?: string;
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

/**
 * [2026-08-05] 추론 선행(pre-writing analysis) — 전 모드.
 *
 * LLM 은 JSON 을 필드 순서대로 생성한다. 스키마 맨 앞에 분석 필드를 두면
 * "자료 추론 → 제목 → 본문 → 이미지" 순서가 같은 호출 안에서 강제된다
 * (추가 API 호출 없음). 모드마다 추론 축이 다르다.
 *
 * 환각 가드: whyNow 는 자료의 시점·사건 단서가 있을 때만 그 단서로 추론하고
 * 없으면 "단서 없음"이라 적는다 — 트렌드 이유를 지어내는 통로를 막는다.
 * 파서는 preWritingAnalysis 를 소비하지 않으므로 본문에 누출될 수 없다.
 */
function buildPreWritingAnalysisSchema(mode: PromptMode, usesIssueStorySkeleton: boolean): string {
  const common = `
    "coreSubject": "입력 자료의 핵심을 1문장으로 (자료에 있는 것만)",
    "entityCheck": "키워드 속 고유명사 판별 — 작품명·인물명·브랜드를 크롤링 자료와 대조해 식별한다. 수식어처럼 보이는 구절이 실제 드라마·예능·영화 제목일 수 있다(예: 키워드 앞부분 전체가 작품명). 작품명은 쪼개거나 일반 수식어로 취급하지 않으며, 자료에 근거 없는 실체 단정은 하지 않는다",
    "whyNow": "이 키워드가 지금 검색·소비되는 이유를 입력 단서에서 추론 — 단서는 이미 주어져 있다: 뉴스·상위 노출 글의 발행 시점과 사건, 여러 자료에서 반복되는 지점, 지식iN 질문이 보여주는 독자 상황, 월간검색량·문서량 지표. 이 중 실제로 찾은 단서를 근거로 명시한다. 자료 밖 트렌드 이유를 지어내지 않으며, 훑고도 시점 단서가 없으면 '자료 내 시점 단서 없음'이라 적고 자료가 가장 두텁게 다루는 지점을 대신 근거로 쓴다",
    "readerSituation": "독자가 어떤 상황·막힌 지점에서 이 글을 만나는지 추론 (독자에 대한 추론 — 작성자 체험 주장 아님)",`;
  const title = `
    "titleRationale": "titleCandidates 3개가 각각 어떤 각도·어떤 근거를 쓰는지, 도입이 그 약속을 어떻게 갚는지 1~2문장"`;
  const image = `,
    "imageDirection": "글 전체 이미지 톤·소재 1문장 — 각 headings[].imagePrompt 는 그 소제목 본문의 구체 장면에서 도출한다"`;

  let modeAxes = '';
  if (mode === 'seo' || mode === 'mate') {
    modeAxes = `
    "searchIntent": "정보형|비교형|거래형 중 판정 + 독자의 실제 질문 1문장",
    "mustAnswer": ["본문이 반드시 답해야 할 질문들 — headings 소제목이 이 질문들에 대응해야 한다"],
    "clickReason": "검색 결과 목록에서 경쟁 글 대신 이 글을 클릭할 이유 1문장 — searchIntent 의 질문에 가장 직접적인 답을 약속하는 지점과 자료에서 확인된 구체 신호(수치·조건·기준)로 도출",${mode === 'mate' ? `
    "citationAtoms": ["정의/기준/절차/비교/주의 중 자료에서 뽑을 수 있는 인용 원자 후보"],` : ''}`;
  } else if (mode === 'homefeed') {
    modeAxes = usesIssueStorySkeleton ? `
    "confirmed": ["공식 발표·판결 등 확정 사실만"],
    "unconfirmed": ["보도·추측 등 미확정 — 여기 넣은 것은 제목·궁금증 소재로 쓰지 않는다"],
    "curiosityGaps": ["독자가 멈출 궁금증 갭 후보 2~3개 — 공적 활동(출연·하차·이적·복귀·편성·계약·수상)과 확정 사실 소재만"],
    "clickReason": "지나가던 사람이 이 글을 클릭할 단 하나의 이유 1문장 — 자료 속 가장 의외의 확정 사실이나 모순에서 도출",` : `
    "stopReason": "스크롤 중인 독자가 멈출 한 지점 — 자료에 실재하는 장면·조건·반복 지적만, 없으면 자료가 가장 구체적으로 다루는 것",
    "clickReason": "지나가던 사람이 이 글을 클릭할 단 하나의 이유 1문장 — 자료 속 가장 의외의 사실이나 모순에서 도출, 자료 밖 사실 날조 금지",`;
  } else if (mode === 'affiliate') {
    modeAxes = `
    "purchaseDecision": "구매가 갈리는 구체 조건 1~2개 (자료·후기에서 관찰되는 것만)",
    "objections": ["자료·후기에서 관찰되는 우려·반박 — 없으면 빈 배열, 지어내지 않는다"],
    "evidenceMode": "FIRST_PARTY|REVIEW_SYNTHESIS|SPEC_ONLY 중 이 글의 근거 모드 판정",
    "clickReason": "이 제품 구매를 고민하는 사람이 이 글을 클릭할 단 하나의 이유 1문장 — purchaseDecision 의 갈리는 조건에서 도출, 자료·후기에 없는 체험 날조 금지",`;
  } else if (mode === 'business') {
    modeAxes = `
    "inquiryTrigger": "문의로 이어지는 고객 상황 — 입력된 업체 정보·자료 범위에서만",
    "inquiryBarriers": ["독자가 문의를 망설이는 장벽 — 가격 불안·업체 불신·절차 모름 중 자료·업체 정보에서 관찰되는 것만, 없으면 빈 배열. 근거 없는 장벽을 만들지 않는다"],
    "clickReason": "이 상황의 잠재 고객이 검색 결과에서 다른 업체 글 대신 이 글을 클릭할 단 하나의 이유 1문장 — inquiryTrigger 의 상황과 inquiryBarriers 의 장벽 하나에서 도출, 업체 정보에 없는 실적·자격 날조 금지",`;
  }

  return `
  "preWritingAnalysis": {${common}${modeAxes}${title}${image}
  },`;
}

function buildPreWritingAnalysisDirective(mode: PromptMode, usesIssueStorySkeleton: boolean): string {
  const issueExtra = usesIssueStorySkeleton ? `
- titleCandidates 3개는 preWritingAnalysis.curiosityGaps 에서 나와야 하며, 서로 다른 제목 공식을 쓴다.
- unconfirmed 에 넣은 사안은 제목·도입의 궁금증 소재로 쓰지 않는다(홈판 실존 인물 안전 규율과 동일).` : `
- titleCandidates 3개는 preWritingAnalysis 의 추론(독자 상황·핵심 질문)에서 나와야 하며, 서로 다른 각도를 쓴다.${mode === 'homefeed' ? `
- 홈판은 검색 결과가 아니라 피드 노출면이다 — 각 후보가 스크롤 중 어느 지점에서 멈춤을 만드는지 titleRationale 에 적는다.` : ''}`;
  const homefeedClickContract = mode === 'homefeed' ? `
- [클릭 사유가 제목의 출발점] 모든 titleCandidates 는 preWritingAnalysis.clickReason 에서 출발한다.
  자료 내용과 무관하게 키워드를 요약·나열한 제목은 0점이다.
- [whyClick 자가검증] 후보마다 whyClick 에 "이 제목을 본 사람이 클릭하는 이유"를 1문장으로 쓴다.
  이 문장이 자연스럽게 써지지 않는 후보는 버리고 다시 만든다. "궁금해서" 같은 빈말은 실패 —
  "반값인데 빈손으로 나왔다는 모순을 해소하고 싶어서"처럼 제목 속 구체 긴장을 짚어야 한다.
- [훅은 말이 되어야 한다] 제목만 읽고 0.5초 안에 무슨 이야기인지·왜 눌러야 하는지 파악되지
  않으면 그 후보는 버린다. 억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점.
- [요약 명사 종결 금지] "~정리/~총정리/~가이드/~현황/~포인트/~모음/~대응/~의미/~근황"으로
  끝나는 제목은 보도자료 문형이라 0점 — 궁금증이 남는 서술이나 의문으로 끝낸다.` : '';
  const seoClickContract = mode === 'seo' ? `
- [검색 클릭 계약] 검색자는 이미 질문을 들고 결과 목록을 훑는다 — 홈판과 달리 답을 숨기면
  지고, "내 질문에 가장 직접적인 답"을 약속하는 제목이 이긴다. 모든 titleCandidates 는
  preWritingAnalysis.clickReason 에서 출발하고, 경쟁 글과의 차별점은 은닉이 아니라
  구체성(수치·조건·기준·연도·대상)으로 만든다.
- [whyClick 자가검증] 후보마다 whyClick 에 "검색자가 결과 목록에서 다른 글 대신 이 글을
  고르는 이유"를 1문장으로 쓴다. 자연스럽게 써지지 않는 후보는 버리고 다시 만든다.
  "정보가 많아서" 같은 빈말은 실패 — searchIntent 의 질문과 제목의 약속을 직접 연결해야 한다.
- [훅은 말이 되어야 한다] 제목만 읽고 0.5초 안에 어떤 질문의 답인지 파악되지 않으면
  그 후보는 버린다. 억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점.
- [약속-상환] 제목이 약속한 답은 introduction 과 headings 가 반드시 갚는다 —
  약속만 하고 답이 없는 글은 이탈로 이어져 순위가 죽는다.` : '';
  const mateClickContract = mode === 'mate' ? `
- [메이트 클릭 계약] 메이트 글은 검색 결과와 AI 요약 인용, 두 자리를 동시에 노린다 — 검색자에게는
  "내 질문에 가장 직접적인 답"을, AI 에게는 인용할 기준·조건·절차(citationAtoms)를 약속하는
  제목이 이긴다. 모든 titleCandidates 는 preWritingAnalysis.clickReason 에서 출발하고,
  차별점은 은닉이 아니라 판단 기준의 구체성(조건·비교·연도·대상)으로 만든다.
- [whyClick 자가검증] 후보마다 whyClick 에 "검색자가 결과 목록에서 다른 글 대신 이 글을
  고르는 이유"를 1문장으로 쓴다. 자연스럽게 써지지 않는 후보는 버리고 다시 만든다.
  "정보가 많아서" 같은 빈말은 실패 — searchIntent 의 질문과 제목의 약속을 직접 연결해야 한다.
- [훅은 말이 되어야 한다] 제목만 읽고 0.5초 안에 어떤 질문의 답인지 파악되지 않으면
  그 후보는 버린다. 억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점.
- [약속-상환] 제목이 약속한 답과 기준은 introduction 첫 300자와 headings 가 반드시 갚는다.` : '';
  const businessClickContract = mode === 'business' ? `
- [업체홍보 클릭 계약] 이 글의 독자는 업체를 비교·검증하는 중인 잠재 고객이다 — 화려한 수식이
  아니라 "내 상황을 정확히 아는 글"이 클릭된다. 모든 titleCandidates 는
  preWritingAnalysis.clickReason 에서 출발한다: inquiryTrigger 의 고객 상황을 정면으로 짚고,
  inquiryBarriers 의 장벽 하나(비용이 정해지는 조건·진행 절차·문의 전 확인 항목)를 해소한다고
  약속하는 제목. 업체명 나열·자화자찬형 제목은 0점이다.
- [whyClick 자가검증] 후보마다 whyClick 에 "이 상황의 잠재 고객이 다른 업체 글 대신 이 글을
  여는 이유"를 1문장으로 쓴다. 자연스럽게 써지지 않는 후보는 버리고 다시 만든다.
- [광고법·신뢰 우선] 최상급·보장·과장("1위"·"최고"·"100%")은 기존 business 규율 그대로 금지 —
  클릭 계약은 그 규율 위에서만 동작하며, 문의 전환 구조(각도·CTA)는 기존 business 지시가 계속 소유한다.
- [훅은 말이 되어야 한다] 제목만 읽고 0.5초 안에 어떤 상황의 어떤 답인지 파악되지 않으면
  그 후보는 버린다. 억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점.` : '';
  const affiliateClickContract = mode === 'affiliate' ? `
- [쇼핑 클릭 계약 — 제품명+상황+후킹] 쇼핑커넥트 제목은 "제품명이 포함된 홈판"이다:
  {브랜드+모델명} + {구매가 갈리는 구체 상황} + {그 상황의 판단이 궁금해지는 훅} 순서로
  조립한다. 모든 titleCandidates 는 preWritingAnalysis.clickReason 에서 출발한다.
  예: "린백 LB221HA, 허리 예민한 사람이 두 시간 앉아보면 갈린다" (제품명+상황+후킹)
  ❌ 스펙 나열·"~후기/~추천" 단독 종결 — 상황과 훅이 없으면 클릭 이유가 없다.
- [whyClick 자가검증] 후보마다 whyClick 에 "이 제품을 고민 중인 사람이 클릭하는 이유"를
  1문장으로 쓴다. 자연스럽게 써지지 않는 후보는 버리고 다시 만든다. 훅은 purchaseDecision
  의 갈리는 조건을 짚어야 하며, 자료·후기에 없는 체험·기간·가족 반응을 만들지 않는다.
- [훅은 말이 되어야 한다] 제목만 읽고 0.5초 안에 어떤 제품·어떤 상황인지 파악되지 않으면
  그 후보는 버린다. 억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점.` : '';
  const modeExtra = (mode === 'seo' || mode === 'mate') ? `
- headings 소제목은 mustAnswer 의 질문들에 대응한다. 질문에 대응하지 않는 소제목을 만들지 않는다.` : mode === 'affiliate' ? `
- evidenceMode 판정과 다른 화자·근거를 본문에서 쓰지 않는다. objections 가 비어 있으면 반박 문단을 지어내지 않는다.` : mode === 'business' ? `
- headings 는 inquiryTrigger 의 상황과 inquiryBarriers 의 장벽 해소에 대응한다 — 비용이 정해지는 조건·진행 절차·문의 전 확인 항목 같은 소제목을 장벽에 맞춰 배치한다. inquiryBarriers 가 비어 있으면 장벽 해소 문단을 지어내지 않는다.` : '';
  return `📌 [모든 모드 — 제목보다 추론이 먼저다]
- preWritingAnalysis 를 반드시 가장 먼저 채운다. 크롤링 자료를 분석하기 전에 제목부터 쓰지 않는다.
- whyNow 는 주어진 단서(뉴스 시점·상위글 반복 지점·지식iN 질문·검색량 지표)를 실제로 훑어 근거를 명시한다. 크롤링과 검색 API 가 이미 단서를 모아 왔다 — 훑지 않고 건너뛰지 않는다. 자료 밖 트렌드 이유는 지어내지 않는다.${issueExtra}${homefeedClickContract}${seoClickContract}${mateClickContract}${businessClickContract}${affiliateClickContract}${modeExtra}
- 각 headings[].imagePrompt 는 imageDirection 을 따르되 그 소제목 본문의 구체 장면에서 도출한다 — 일반 소품 사진 묘사로 도망가지 않는다.
- preWritingAnalysis 는 설계 메모다 — 그 문장들을 introduction·headings·conclusion 본문에 옮기지 않는다.

`;
}

function buildModeStructureRule(mode: PromptMode): string {
  const isHomefeed = mode === 'homefeed';
  const isMate = mode === 'mate';

  if (mode === 'affiliate') {
    return `
⚠️⚠️⚠️ [쇼핑커넥트 최종 출력 규칙] ⚠️⚠️⚠️
- AFFILIATE AUTHENTICITY CONTRACT의 FIRST_PARTY / REVIEW_SYNTHESIS / SPEC_ONLY 근거 모드를 그대로 유지한다.
- 구매자 리뷰를 작성자 경험으로 바꾸지 않는다. 실사용 메모가 없으면 써보니·받아보니·가족 반응을 만들지 않는다.
- introduction: 인사나 글 소개 없이 구매 판단이 갈리는 구체 조건에 바로 답한다.
- headings: 3~7개. 확인된 사실, 생활 의미, 의견이 갈린 조건, 아쉬운 점, 맞는 사람을 제품에 맞게 조합한다.
- 단점을 바로 장점으로 덮지 않고, 입력에 없는 비교·감각·기간·할인·재고를 만들지 않는다.
- conclusion: 구매 압박 없이 현재 가격·옵션·배송 조건 확인을 1회만 안내한다.
- 광고대행사 문구, AI 보고체, 사람 흉내용 감탄사 반복을 금지한다.
`;
  }

  return isHomefeed ? `
⚠️⚠️⚠️ [홈판 모드 필수 구조 규칙] ⚠️⚠️⚠️
- introduction: 2~4개의 짧은 문장. 제목이 던진 질문에 먼저 답하고, 독자가 겪을 법한 상황과 이 글에서 얻을 것을 보여준다. 표현은 매번 달라도 되지만 "답부터 준다"는 순서는 지킨다.
- headings: 위 구조 힌트를 따르되, 힌트가 없으면 내용에 맞게 정한다. (개수를 맞추려고 얕은 소제목을 추가하지 않는다)
- 각 소제목 첫 1~2문장은 그 소제목이 던진 질문의 답이어야 한다. 그 문장만 떼어내도 답이 되게 쓰고, 배경·서론을 먼저 깔지 않는다.
- 각 소제목은 앞 소제목과 다른 질문·판단을 맡고, 인물명·키워드로 기계적으로 시작하지 않는다.
- (선택) 맥락상 자연스러울 때만 독자 반응을 본문에 1~2문장 녹임. ⛔ "📌 당시 대중 반응 요약" 같은 가짜 댓글 블록 합성 금지(거짓 신호 = AI 티 + 신뢰 저하)
- conclusion: 핵심 판단과 다음 확인 행동 또는 여운을 1~3문장으로 마무리. 댓글·저장·공유를 동시에 요구하지 않는다.
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
- [강제] 원본에 없는 수치·날짜·비용·경험·정책은 만들지 말고, 부족한 항목은 본문에서 조용히 생략 ("확인되지 않습니다"류 자료 부족 안내 문장을 독자에게 노출 금지)
- [강제] "한 줄 판정", "한 줄 결론", "[한 줄 판정: ...]" 같은 라벨 출력 금지. 핵심 문장은 라벨 없이 자연 문장으로 작성
- 결론: 핵심 요약 2~3줄 + 다음에 확인할 행동 1개, 선정/수익/AI 브리핑 인용 보장 표현 금지
` : (mode === 'business' || mode === 'custom') ? `
⚠️ [공통 구조 규칙]
- 1번 소제목은 메인 주제(주어)로 시작하고, 첫 1~2문장에서 바로 핵심에 답한다.
- 제목은 자극어 대신 정보 가치와 판단 기준을 약속하고, 그 약속에는 도입부가 직접 답한다.
` : `
⚠️⚠️⚠️ [SEO 모드 필수 규칙] ⚠️⚠️⚠️
- [강제] 1번 소제목은 반드시 메인 주제(주어)로 시작 (예: "아이폰16 디자인" - O / "의 디자인" - X)
- 주어가 생략된 채 조사(~의, ~에 대한)로 시작하는 소제목 절대 금지

💡 [SEO 제목 생성 가이드 — 상황 기준]
- 충격, 경악, 소름, 비밀 공개 같은 자극어는 사용하지 마세요.
- 메인 키워드가 제목에 분명히 보이게 하고, 독자가 처한 상황(조건·시점·갈림길)을 함께 담으세요.
  키워드를 첫 3글자로 끌어오려고 어순을 비틀지 마세요(R0-1).
- 검색어는 조사와 서술어가 잘린 검색어투입니다("○○ 누구", "○○ 방법", "○○ 후기").
  검색어를 제목에 원문 그대로 붙여 넣지 마세요 — 핵심 명사는 유지하되,
  누구·방법·후기·뜻 같은 꼬리는 자연스러운 문장으로 소화하세요.
  정체·이유·뜻을 묻는 검색어는 물음표 질문형 제목으로 소화해도 좋습니다 —
  단 도입 첫 문장이 그 질문에 바로 답해야 합니다.
  예: 검색어 "여권 재발급 방법" → 제목 "여권 재발급, 주말에 급하게 해야 할 때 순서"
  예: 검색어 "△△ 하영 누구" → 제목 "△△ 하영은 누구? 낯익다 했더니 이 배우"
- "○○ 총정리 / ○○ 방법 / ○○ 완벽 가이드"처럼 상황이 없는 제목은 쓰지 마세요.
  그런 제목은 AI 요약이 이미 답한 자리라 클릭으로 이어지지 않습니다.
`;
}

function buildEvidenceBlockRule(): string {
  return `
📊 [모든 모드 공통: 표/체크리스트/그래프성 블록 규칙]
- 비교·비용·시간·절차·기준·안전·스펙처럼 구조화가 판단을 실제로 돕는 주제에만 표·체크리스트·단계 목록 중 가장 알맞은 하나를 넣는다.
- 표는 서로 대조할 행이 2개 이상 있고 입력 근거가 충분할 때만 최대 2열 마크다운으로 작성한다:
  | 항목 | 정리 |
  | --- | --- |
  | 기준 | 독자가 바로 판단할 수 있는 내용 |
  위 표의 '항목/정리'는 형식 예시일 뿐이다 — 실제 열 이름은 글 내용에 맞는 단어로 바꿔라. 표 밖에 "| 항목 | 정리 |" 같은 단독 헤더 행을 출력하지 마라.
- 표가 어색한 글은 억지로 넣지 않는다. 홈판은 필요할 때만 짧은 체크리스트나 단계 목록을 사용한다.
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

/**
 * [2026-08-06] 업체 강조 각도 단일화 — 감사 이관 (c).
 *
 * 랜덤 8각도(buildBusinessAngleDirective)와 사용자 로테이션 각도(promoAngle)가
 * 같은 프롬프트에 동시에 들어가, 서로 다른 프레임을 지시할 수 있었다
 * (예: 랜덤 "가격 투명성" + 사용자 "A/S 안내"). 사용자가 고른 각도가 있으면
 * 그것만 쓰고, 없을 때만 랜덤 각도로 매 글의 프레임을 돌린다.
 */
function buildBusinessAngleBlock(
  contentMode: PromptMode,
  source: ContentJsonPromptSource,
): string {
  if (contentMode !== 'business') return '';
  const userAngle = source.businessInfo?.promoAngle;
  if (userAngle && String(userAngle).trim()) return ''; // 사용자 각도는 businessInfo 블록이 주입
  return buildBusinessAngleDirective();
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
   → 제목에서 주제가 분명하게 보이는 자연스러운 위치에 1회 사용
   → 본문에는 의미상 필요한 곳에만 사용하고 밀도·횟수를 맞추지 말 것
   → 주제 문맥(${processed.contextHint})은 참고만, 제목에 그대로 사용 금지`;
  }
  return `🔑 메인 키워드: "${processed.coreKeyword}"
   → 제목에서 주제가 분명하게 보이는 자연스러운 위치에 1회 사용
   → 본문에는 의미상 필요한 곳에만 사용하고 밀도·횟수를 맞추지 말 것
   → 소제목은 검색 질문과 흐름을 우선하며, 같은 키워드로 반복 시작하지 말 것`;
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
  // [2026-08-27] 길이 계약은 스키마 필드에 적는다. 프롬프트 산문("28~42자 권장")만으로는
  //   지켜지지 않아 53자 제목이 발행됐다 — 평가기는 29점을 매겼는데도 그대로 나갔다.
  const titleLength = describeTitleLength(mode as never);
  const isMate = mode === 'mate';
  const modeStructureRule = buildModeStructureRule(mode);
  const evidenceBlockRule = buildEvidenceBlockRule();
  // [2026-07-30] issue-story 골격(연예/시사)은 자체적으로 "소제목 0~3개 + 이 골격이
  // 우선"을 선언한다. 여기에 STRUCTURE OVERRIDE(개수 지정)까지 겹치면 한 글에
  // 상충하는 개수 계약이 둘 들어가 골격이 무작위로 뒤집힌다 → 배타 처리.
  const usesIssueStorySkeleton = isHomefeed
    && HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory(source?.categoryHint));
  const structureDirective = isHomefeed && !usesIssueStorySkeleton
    ? buildStructureVariationDirective(minChars)
    : '';

  return `
────────────────────
[출력 형식 — 반드시 이 순서와 JSON 형식으로]${modeStructureRule}${evidenceBlockRule}

{${buildPreWritingAnalysisSchema(mode, usesIssueStorySkeleton)}
  "selectedTitle": "제목 1 (${titleLength} — 넘기면 피드·검색에서 뒷부분이 잘려 안 보인다)",
  "titleCandidates": [${(isHomefeed || mode === 'seo' || mode === 'affiliate' || mode === 'mate' || mode === 'business') ? `
    {"text": "제목 1 (${titleLength})", "score": 95, "whyClick": "이 제목을 본 사람이 클릭하는 이유 1문장"},
    {"text": "제목 2 (${titleLength})", "score": 90, "whyClick": "이 제목을 본 사람이 클릭하는 이유 1문장"},
    {"text": "제목 3 (${titleLength})", "score": 85, "whyClick": "이 제목을 본 사람이 클릭하는 이유 1문장"}` : `
    {"text": "제목 1 (${titleLength})", "score": 95},
    {"text": "제목 2 (${titleLength})", "score": 90},
    {"text": "제목 3 (${titleLength})", "score": 85}`}
  ],
  ${buildHeadingsExample()},${isHomefeed ? '' : `
  "summaryTable": [
    {"label": "기준일", "value": "자료에 있는 날짜"},
    {"label": "주제에 맞는 축", "value": "확인된 값 (숫자·조건은 숫자로)"},
    {"label": "또 다른 축", "value": "확인된 값"}
  ],`}
  "introduction": "${isHomefeed ? '도입부 (2~4개의 짧은 문장, 상황 + 읽을 이유)' : isMate ? '도입부 (첫 300자 안에 직접 답변)' : '도입부'}",
  "conclusion": "${isHomefeed ? '마무리 (핵심 판단 + 다음 확인 행동 또는 여운, 1~3문장)' : isMate ? '마무리 (핵심 요약 + 다음 행동)' : '마무리'}",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"],
  "category": "카테고리"
}

${buildPreWritingAnalysisDirective(mode, usesIssueStorySkeleton)}📌 [소제목 스타일 — 모든 모드 공통] headings[].title은 명사형·구 단위로 끝낸다(예: "…가 갈린 이유", "…확인 포인트"). "…습니다/…해요/…했어요/…했다"처럼 완결 문장으로 끝나는 소제목 금지, 30자 이내.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 [이미지 프롬프트 작성 규칙 - 매우 중요!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

imagePrompt 규칙: 각 소제목 본문 문맥과 일치하는 구체적 한국어 묘사. 추상/막연 금지, 소제목별 고유(중복·동일 패턴 금지).
⛔ 이미지 묘사는 JSON의 imagePrompt 필드에만 쓴다. 본문(content/introduction/conclusion)에
   "[이미지 설명]", "[사진: ...]" 같은 이미지 지시문을 쓰면 독자에게 그대로 노출된다 — 절대 금지.
※ 소제목 성격에 맞는 이미지 "타입"을 골라라:
 - 경험·장소·사물·사람 중심 → 사실적 장면 묘사. 예: "보습 크림 바르는 손, 촉촉한 겨울 피부, 따뜻한 실내"
 - 정보·수치·비교·절차·제도 중심(정책/세금/금융 등) → 풍경 사진 대신 인포그래픽/도식 스타일.
   예: "단계별 흐름도 그래픽, 비교 표, 아이콘+화살표, 깔끔한 정보 카드, 한글 라벨"
 - 비율: 정방형(1:1) 권장 — 네이버 목록 썸네일 위아래 잘림 방지.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[원본 텍스트]
${structureDirective}${buildBusinessAngleBlock(contentMode, source)}${buildVoiceProfileBlock(sampleVoiceProfile())}
${buildPreviousTitlesBlock(source, contentMode)}${contentMode === 'business' ? buildBusinessInfoBlock(source) : ''}${buildCustomPromptBlock(source)}
══════════════════════════════════════════
🎯 [필수 키워드 정보 — 제목/소제목 작성에 반드시 반영]
══════════════════════════════════════════
${title ? `📌 원본 제목 참고: "${title}"
   → 핵심 주제와 사실 범위를 유지하면서 독자가 얻을 답·판단 기준이 보이는 제목으로 다듬는다.
` : ''}${buildPrimaryKeywordBlock(primaryKeyword)}
${subKeywords ? `🔖 서브 키워드: ${subKeywords}
   → 독자의 실제 하위 질문을 설명할 때만 자연스럽게 사용
   → 도입부·결론부·소제목에 횟수를 맞춰 넣지 말 것` : ''}
${contentMode === 'homefeed' && subKeywords ? `
⚠️ [홈판 추가] 키워드 반복보다 독자 상황, 관찰 가능한 디테일, 저장할 판단 기준을 우선한다. 스크롤 트리거 개수를 맞추지 않는다.` : ''}
${contentMode === 'seo' ? `
⚠️ [SEO 모드 제목 필수 조건]
1. 메인 주제를 제목의 자연스러운 위치에 1회 포함하되 첫 3글자로 강제 이동하지 않는다.
2. 22~42자 길이
3. 독자가 찾는 답, 적용 조건, 비교 기준 중 하나를 분명히 보여준다.
4. 사용자 직접 경험 메모가 없으면 1인칭 체험·사용 기간·결과를 만들지 않는다.
5. 숫자는 입력 자료에 있을 때만 사용하고, AI 표현·낚시 표현을 금지한다.` : ''}
${contentMode === 'affiliate' ? `
⚠️ [쇼핑커넥트 제목 필수 조건]
1. 제품명과 구매 판단이 갈리는 구체 조건을 한 문장으로 작성
2. 실사용 근거가 없으면 써보니·직접 써본·사용 기간·내돈내산 금지
3. 최저가·오늘만·품절 임박·1위·인생템·놓치면 후회 금지
4. 빈 후킹보다 소음·크기·구성·호환·관리·가격 등 확인된 판단 기준 우선` : ''}
${contentMode === 'mate' ? `
⚠️ [네이버 메이트 모드 제목 필수 조건]
1. 메인 주제를 제목의 자연스러운 위치에 1회 포함하고 과한 낚시 표현 금지
2. 28~45자 길이
3. 질문에 답하는 의도 또는 판단 기준을 제목에 반영
4. "선정 보장", "수익 보장", "돈쓸어담는" 등 과장 표현 금지
5. 기준형/방법형/비교형/질문답변형 중 하나로 작성
6. 제목과 본문 주제가 1:1로 일치해야 하며, 주제 이탈 금지` : ''}
${contentMode === 'homefeed' ? `
⚠️ [홈판 모드 제목 필수 조건]
1. 28~42자 길이
2. 감정어보다 독자가 멈출 구체 상황과 읽을 이유를 보여준다.
3. 충격·소름·대박·비밀 공개·난리 같은 클릭베이트를 금지한다.
4. 메인 주제를 자연스럽게 1회 포함하되 맨 앞에 강제하지 않는다.
5. 작성자 경험이나 타인 반응은 입력 근거가 있을 때만 제목에 쓴다.
6. 제목과 본문 주제가 1:1로 일치해야 하며, 주제 이탈 금지. 홈피드는 제목-본문
   일치로 문서를 분류·추천하므로 본문에 없는 주제를 제목에 걸면 노출 자체가 막힌다.
7. 제목이 만든 궁금증은 도입부가 즉시 갚는다. 궁금증만 만들고 본문이 답하지
   않으면 낚시다 — 멈추게 하는 힘과 갚는 힘은 한 쌍이다.` : ''}
${buildMetricsBlock(metrics)}

══════════════════════════════════════════
📄 [원본 본문 — 아래 내용을 바탕으로 작성하라]
══════════════════════════════════════════
${rawText}

══════════════════════════════════════════
⚠️ [최종 강제 조건 — 위반 시 0점]
══════════════════════════════════════════${minChars && minChars > 0 ? `
1. 분량은 목표가 아니라 결과다(seo R0-5). 채워야 할 글자수는 없다 — 약속한 질문에 근거를 갖고 답했으면 거기서 끝낸다.
   같은 말을 반복하거나 배경 설명을 붙여 늘리지 말고, 답이 남아 있는데 멈추지도 마라.` : ''}
2. 메인 주제는 제목에 자연스럽게 1회 포함하고, 소제목·서론·결론에 강제로 반복하지 않는다.
3. 위 [필수 키워드 정보]의 모든 규칙을 한 줄도 어기지 말 것
4. 출력은 오직 JSON 객체 하나만. JSON 밖에 설명·코드펜스(\`\`\`)를 붙이지 말 것. JSON 문자열 값 안의 마크다운 표·리스트는 허용이며 위 표 규칙은 그대로 유효하다.
5. JSON은 반드시 { 로 시작하고 } 로 끝나야 함.
6. 표·체크리스트는 독자 판단을 실제로 더 쉽게 만들고 입력 근거가 충분할 때만 포함한다.
7. 자료 앞에 붙은 \`[YYYY-MM-DD 작성]\` 표시를 반드시 확인한다.
   · ⚠️ 가 붙은 오래된 자료의 **금액·기간·조건은 그대로 옮기지 않는다.** 제도는 해마다 바뀐다.
   · 같은 항목인데 자료마다 값이 다르면 **가장 최근 자료를 따른다.**
     예) 2024년 자료 "보증금 이자와 월세 지원" vs 2026년 자료 "월세 지원" → 최근 것만 쓴다.
   · 최신 자료에서 확인되지 않는 조건은 **아예 쓰지 않는다.** 빼는 것이 틀리는 것보다 낫다.
   · 옛 내용을 꼭 다뤄야 하면 "○○년에는 …였습니다" 로 과거임을 분명히 한다.

이제 위 모든 정보를 종합하여 즉시 JSON으로 출력하라.
`;
}
