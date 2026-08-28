// src/content/publicInfoFactTable.ts
// 공공정보(지원금·수당·바우처·공고) 글에서 집필 전에 "사실표"부터 채우게 만든다.
//
// [2026-08-28 사장님 실측] 외부 LLM 팩트체크에서 가장 크게 틀린 축이 지원금 글이었다.
// 금액은 맞는데 신청기간이 다른 지자체 것이거나, 주민등록 기준일이 없는데 있는 것처럼
// 단정하거나, '상태'(추진중/부결)를 확정으로 써버리는 식이다.
//
// 원인은 이 글들이 **여러 지역·여러 공고를 한 번에** 다루기 때문이다. 재료가 뒤섞인
// 상태로 바로 산문을 쓰면 모델은 빈칸을 그럴듯한 값으로 메운다.
//
// 그래서 산문보다 먼저 표를 채우게 한다. 표는 칸이 비어 있는 게 눈에 보이고,
// 빈칸은 "모른다"로 남는다. sourceFactChecklist가 원문 사실을 목록으로 박아
// 보존율을 올린 것과 같은 수법이다 — 구조가 있으면 모델이 채우고, 없으면 흘린다.
//
// 표 자체는 본문에 출력하지 않는다(독자용이 아니다). 근거 메타 노출은
// evidenceIntegrity.buildEvidenceMetaLeakRule 에서 이미 금지돼 있다.

/** 공공정보 주제로 볼 신호. 하나만 걸려도 사실표를 요구한다. */
const PUBLIC_INFO_SIGNALS = [
  '지원금', '지원사업', '보조금', '재난지원금', '소비쿠폰', '상품권',
  '바우처', '수당', '급여', '장려금', '환급', '보험료 지원',
  '공고', '모집', '신청 자격', '신청자격', '지급 대상', '지급대상',
  '정책', '제도 시행', '지자체', '주민등록', '요일제',
] as const;

/** 표를 채울 만큼의 재료가 없으면 요구 자체가 환각을 부른다. */
const MIN_MATERIAL_CHARS = 300;

export interface PublicInfoFactTableSource {
  readonly title?: string;
  readonly keyword?: string;
  readonly keywords?: readonly string[];
  readonly topic?: string;
  readonly rawText?: string;
}

function haystack(source: PublicInfoFactTableSource): string {
  return [
    source.title,
    source.topic,
    source.keyword,
    ...(source.keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

/** 제목·키워드에 공공정보 신호가 있고, 대조할 재료가 충분한가. */
export function isPublicInfoTopic(source: PublicInfoFactTableSource): boolean {
  const text = haystack(source);
  if (!text) return false;
  return PUBLIC_INFO_SIGNALS.some((signal) => text.includes(signal));
}

export function shouldRequireFactTable(source: PublicInfoFactTableSource): boolean {
  if (!isPublicInfoTopic(source)) return false;
  return String(source.rawText ?? '').length >= MIN_MATERIAL_CHARS;
}

export function buildPublicInfoFactTableBlock(): string {
  return `## 집필 전 필수 단계 — 사실표부터 채운다 (표는 본문에 출력하지 않는다)

본문 첫 문장을 쓰기 전에, 자료를 읽으며 아래 표를 머릿속으로 채운다.
표를 다 채우기 전에는 어떤 사실 문장도 쓰지 않는다.

| 항목 | 채우는 값 |
|---|---|
| 지역 / 대상 기관 | |
| 공식 사업명 (공고 표기 그대로) | |
| 금액 | |
| 지급 수단 (현금·지역화폐·카드·상품권) | |
| 주민등록 기준일 | |
| 신청 기간 (시작~종료, 절대 날짜) | |
| 신청 방법 (온라인·방문·앱) | |
| 요일제 여부와 그 기준 용어 | |
| 상태 (신청중 / 확정 / 추진중 / 부결) | |
| 출처 (매체·기관명) | |

**칸 채우기 규칙**
- 자료에서 직접 읽은 값만 넣는다. 기억·추론·"보통 이렇다"로 채우지 않는다.
- 근거가 없는 칸은 **비워 둔다**. 비운 칸의 사실은 본문에 한 글자도 쓰지 않는다.
  (문장이 그 값 없이는 성립하지 않으면, 그 문장을 통째로 뺀다.)
- 지역이 여럿이면 지역마다 표를 따로 채운다. 한 표에 두 지역을 섞지 않는다.
- '상태'가 추진중·검토중·부결이면 본문도 그렇게 쓴다. 확정으로 올려 쓰지 않는다.

**출처 등급** — 낮은 등급만 있는 값은 표에 넣지 않는다(= 본문에 못 쓴다).
  1순위 공식기관 공고·보도자료 → 2순위 통신사·주요 언론 → 3순위 지역 언론
  → ⛔ 블로그·요약글만 근거인 수치·날짜는 표에서 제외한다.
  같은 항목을 두 자료가 다르게 말하면 더 높은 등급을 따른다.

**표를 다 채운 뒤 본문을 쓴다.** 본문의 모든 수치·날짜·지역명·사업명은
표에 적어 둔 값과 글자 그대로 일치해야 한다.`;
}

export function appendPublicInfoFactTable(
  systemPrompt: string,
  source: PublicInfoFactTableSource,
): string {
  if (!shouldRequireFactTable(source)) return systemPrompt;
  return `${systemPrompt}\n\n${buildPublicInfoFactTableBlock()}`;
}
