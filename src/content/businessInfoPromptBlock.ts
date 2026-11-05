/**
 * [2026-11-05] Business info block of the business-mode prompt (moved out of
 * contentJsonPromptFormat.ts, which is far over the file-size limit).
 *
 * What changed in the move:
 *  - The post centers on the customer's question; the business answers it with
 *    input facts ("주인공은 업체다" / "전환 설득" framing removed).
 *  - Empty fields are listed ("📭 입력 안 됨") so the model never fills them in.
 *  - The region example is built from the 업종 field instead of a hardcoded
 *    "인테리어"; the homepage, 업종, FAQ and blog-owner fields are rendered.
 *  - Voice: agency blogs may not use the operator voice; own blogs of shops and
 *    contractors may, inside the memo; medical/professional stay informational.
 */
import { resolveBusinessIndustry, type BusinessIndustry } from './businessIndustryDetector.js';

export interface BusinessInfoPromptInput {
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
  /** 업종 (예: 고깃집, 치과) */
  industry?: string;
  /** 손님이 자주 묻는 것 · 실제 진행 방식 (여러 줄) */
  faq?: string;
  /** 'owner' = 업체 본인 블로그 (기본), 'agency' = 대행 블로그 */
  blogOwner?: string;
  /** 업체 홈페이지 (리서치 URL) */
  researchUrl?: string;
}

function line(label: string, value: string | undefined): string {
  return value ? `${label}${value}` : '';
}

function firstRegionOf(region: string): string {
  return region.split(/[,/\s]+/)[0] || region;
}

/** Title-prefix tail for the region example: the 업종 field, else the keyword without its region word. */
function exampleTail(industry: string, primaryKeyword: string, region: string): string {
  if (industry) return industry.split(/[,/]+/)[0].trim();
  const regions = region.split(/[,/\s]+/).filter(Boolean);
  const rest = primaryKeyword.split(/\s+/).filter((w) => w && !regions.includes(w)).join(' ');
  return rest || '업종';
}

function buildAreaLines(info: BusinessInfoPromptInput, tail: string): string {
  if (info.serviceArea === 'nationwide') {
    return `🌏 서비스 범위: 전국 (지역 제한 없음)
   → 제목/본문에 특정 지역명 강제 삽입 금지. 제목은 '업종 + 세부 서비스'를 앞에 둔다
   → "전국 상담 가능", "지역 무관 안내", "서비스 가능 범위 확인"처럼 입력 정보 기반 표현 활용
   → 단, 디지털·온라인 상품(앱/소프트웨어/전자책/강의/구독 등)이면 "전국" 표현 자체를 쓰지 마라 — 지역 개념이 무의미하다. 대신 사용 환경(OS·기기·사양), 라이선스 조건, 지원 채널(오픈채팅·원격)을 다뤄라
   → 거점 수, 방문 가능 시간 같은 수치는 특징/경력에 실제 입력된 경우에만 사용`;
  }
  if (!info.region) return '';
  return `🗺️ 서비스 지역: ${info.region}
   → 제목 맨 앞에 위 지역명 중 1개 필수 배치 (예: "${firstRegionOf(info.region)} ${tail}")
   → 본문에 위 지역명들을 골고루 분산 등장 (각 지역 최소 1회)
   → 가격, 당일 방문, 경력 같은 수치는 특징/경력 또는 원본 텍스트에 실제 입력된 경우에만 사용
   → 입력 근거가 없으면 지역별 상담 가능 범위, 문의 전 확인사항, 방문 가능 여부 확인 절차를 설명
   → 다른 지역명(서울/강남 등) 임의 추가 절대 금지`;
}

function buildVoiceLine(info: BusinessInfoPromptInput, industry: BusinessIndustry | null): string {
  if (info.blogOwner === 'agency') {
    return '✍️ 글 시점: 대행 블로그 — 운영자 시점("저희", "제가") 금지. 제3자가 이 업체를 안내하는 글로 쓴다. 손님 체험·후기도 만들지 마라.';
  }
  if (industry === 'medical' || industry === 'professional') {
    return '✍️ 글 시점: 정보 안내형 고정 — 운영자 시점·체험담 없이 차분한 안내체로 쓴다.';
  }
  if (industry === 'local' || industry === 'construction') {
    return '✍️ 글 시점: 업체 본인 블로그 — 위 업체 메모 범위 안에서만 운영자 시점 허용 (예: "상담 오시면 먼저 ~를 여쭙니다"). 손님 체험·후기는 만들지 마라.';
  }
  return '';
}

// [2026-11-05] Only fields a reader would ask about (address, hours) become "문의 시 확인" items. Listing writer-side
//   fields there produced lines like "홈페이지 주소는 문의하실 때 확인해 주세요" — those are muted instead.
function buildMissingLine(info: BusinessInfoPromptInput): string {
  const askable = [!info.address && '주소', !info.hours && '영업시간'].filter(Boolean);
  const muted = [
    !info.researchUrl && '홈페이지',
    !info.industry && '업종',
    !info.extra && '특징·경력',
    !info.faq && '자주 묻는 것·진행 방식',
  ].filter(Boolean);
  return [
    askable.length > 0
      ? `📭 입력 안 됨: ${askable.join(', ')} → 지어내지 말고 마지막 소제목 '문의 시 확인'으로만 다뤄라`
      : '',
    muted.length > 0
      ? `🔇 비어 있는 칸: ${muted.join(', ')} → 글에 쓰지 마라(있다·없다, 문의해서 확인하라는 말도 쓰지 않는다)`
      : '',
  ].filter(Boolean).join('\n');
}

function buildTargetLines(info: BusinessInfoPromptInput): string {
  if (info.promoTarget === 'product') {
    return `
🛍️ [홍보 대상: 취급 상품 판매]
- 이 글의 중심은 업체가 아니라 업체가 취급/판매하는 상품이다. 수집 자료(원문)의 상품 정보(이름·가격·조건·혜택)를 중심으로 작성하라.
- 상품의 장점·혜택·사용 시나리오를 구체적으로 다루고, 업체는 구매·문의 창구로 짧게 소개하라.
- 마무리는 위 연락처(전화/카카오톡) 안내로 닫아라.
- 수집 자료에 없는 상품 스펙·가격·혜택을 지어내지 마라.`;
  }
  return `
🏢 [홍보 대상: 업체 자체 홍보]
- 글의 중심은 문의를 망설이는 고객의 질문이고, 업체는 그 질문에 입력된 사실로 답하는 쪽이다.
- 순서: 고객 질문 → 답과 갈리는 조건 → 진행 방식 → 맞는 경우/다른 선택이 나은 경우 → 다음 행동(문의 안내).
- 취급 상품/서비스는 질문에 답하는 근거로 쓴다. 마무리는 위 연락처 안내로 닫아라.`;
}

export function buildBusinessInfoBlock(
  info: BusinessInfoPromptInput | undefined,
  context: { title?: string; primaryKeyword?: string } = {},
): string {
  if (!info) return '';
  const industry = resolveBusinessIndustry(info.industry, info.name, info.extra, context.title, context.primaryKeyword);
  const tail = exampleTail(info.industry || '', context.primaryKeyword || '', info.region || '');
  const faqLine = info.faq
    ? `❓ 손님이 자주 묻는 것 · 실제 진행 방식 (이 범위 안에서 답하고 진행 순서를 쓴다):\n${info.faq.split('\n').map((l) => `   ${l}`).join('\n')}`
    : '';
  const angleLine = info.promoAngle
    ? `
🎯 [이번 글 강조 각도: ${info.promoAngle}]
- ${info.promoAngleDirective || '이 각도를 글의 중심 프레임으로 사용하라.'}
- 같은 업체로 발행된 직전 글들과 프레임이 겹치지 않도록, 제목과 소제목 구성을 이 각도 중심으로 잡아라. 마무리는 항상 문의 안내로 수렴하라.`
    : '';

  const rows = [
    line('📛 업체명: ', info.name),
    line('🏷️ 업종: ', info.industry),
    line('📞 전화번호: ', info.phone),
    line('💬 카카오톡: ', info.kakao),
    line('📍 주소: ', info.address),
    line('🕐 영업시간: ', info.hours),
    line('🔗 홈페이지: ', info.researchUrl),
    buildAreaLines(info, tail),
    line('✨ 특징/경력: ', info.extra),
    faqLine,
    buildVoiceLine(info, industry),
    buildMissingLine(info),
  ].filter(Boolean).join('\n');

  return `
══════════════════════════════════════════
🏢 [업체 정보 — 절대 변경/조작 금지, 그대로 사용]
══════════════════════════════════════════
${rows}
${buildTargetLines(info)}${angleLine}

⛔ 위 연락처 정보는 한 글자도 변경하지 말고 그대로 사용하라.
⛔ 절대 가짜 전화번호, 가짜 카카오톡 ID, 가짜 주소, 가짜 지역을 만들지 마라.
⛔ 입력/원본에 없는 시공 건수·평점·가격·A/S 기간·당일 방문 가능 여부를 만들지 마라.
⛔ 위 업체명은 제목 1회 + 도입/본문/문의 안내에 총 3~6회만 자연 노출하라.
`;
}
