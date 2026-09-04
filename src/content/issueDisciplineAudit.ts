// src/content/issueDisciplineAudit.ts
// 사건/의혹 글 자동 검수 — 규칙 탐지 후 저비용 LLM 1회 교정.
//
// [2026-09-04 사장님] "본문 생성 후 자체 검수하고, 문제가 있으면 최종 출력 전에 자동 수정."
//
// 설계 세 가지:
//   1) 기계 치환을 쓰지 않는다. "횡령했다"→"횡령 혐의를 언급했다" 식 정규식 치환은 문맥을 못 봐서
//      주어가 뒤바뀐 문장을 만든다(celebrityAssertionSanitizer 가 같은 이유로 치환을 배제했다).
//      대신 문제 문장만 골라 모델에게 그 문장만 다시 쓰게 한다.
//   2) 호출은 사용자가 고른 엔진 그대로 간다 — 벤더 하드코딩·키 순서 폴백 금지.
//      고른 엔진의 키가 없으면 교정 없이 경고만 남긴다.
//   3) 교정문을 그대로 믿지 않는다. 치환 전에 같은 규칙으로 다시 재서, 여전히 걸리거나
//      길이가 반토막 나면 그 치환은 버린다. 검수가 글을 망가뜨리는 쪽이 더 나쁘다.
//
// 실패는 절대 던지지 않는다 — 검수가 글 생성을 실패시켜선 안 된다(팩트체크와 같은 계약).

import { auditIssueDiscipline, type IssueDisciplineFinding } from './issueDisciplineRules.js';

interface AuditableDraft {
  bodyPlain?: string;
  bodyHtml?: string;
}

interface AuditSource {
  contentMode?: unknown;
  categoryHint?: unknown;
  generator?: unknown;
}

export interface IssueDisciplineAuditResult {
  readonly ran: boolean;
  readonly engineUsed: string;
  readonly findingCount: number;
  readonly correctedCount: number;
  readonly findings: readonly IssueDisciplineFinding[];
}

const SKIPPED: IssueDisciplineAuditResult = {
  ran: false,
  engineUsed: '',
  findingCount: 0,
  correctedCount: 0,
  findings: [],
};

/** 기능 플래그. 기본 ON, ISSUE_DISCIPLINE_AUDIT_V1=false 로 롤백. */
export function isIssueDisciplineAuditEnabled(): boolean {
  const raw = process.env.ISSUE_DISCIPLINE_AUDIT_V1;
  if (raw == null) return true;
  const n = String(raw).trim().toLowerCase();
  return n !== 'false' && n !== '0' && n !== 'off';
}

/** 이슈·사건형 카테고리에서만 돈다. 일상·후기 글의 1인칭 체험 문체와 충돌하기 때문. */
export async function isIssueDisciplineTarget(source: AuditSource): Promise<boolean> {
  if (!isIssueDisciplineAuditEnabled()) return false;
  const { HOMEFEED_ISSUE_STORY_CATEGORIES, resolveCategory } = await import('../promptLoader.js');
  return HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory(String(source?.categoryHint || '')));
}

function buildCorrectionPrompt(findings: readonly IssueDisciplineFinding[]): string {
  const items = findings
    .map((f, i) => `${i + 1}. [${f.code}] ${f.hint}\n   원문: ${f.sentence}`)
    .join('\n');
  return `다음은 사건·의혹을 다룬 블로그 글에서 문제로 지적된 문장들이다.
각 문장을 지적 사항대로 고쳐 써라.

[규칙]
- 문장 하나를 문장 하나로 바꾼다. 새 사실을 만들지 마라.
- 원문에 없는 인물·금액·날짜·출처를 추가하지 마라.
- 확정형 범죄 표현은 "누가 무엇을 주장했는지"로 바꾼다.
- 금액은 그 금액이 무엇인지(주장액·차용증 기재액 등)를 붙인다.
- 출처 없는 해석은 빼고 당사자 발언만 남긴다.
- 존댓말/반말 등 원문의 문체를 유지한다.

[지적 사항]
${items}

[출력 형식] JSON 배열만 출력한다. 설명을 붙이지 마라.
[{"index": 1, "replacement": "고친 문장"}, ...]
고칠 수 없으면 그 항목은 배열에서 뺀다.`;
}

/**
 * 모델 출력에서 {index, replacement} 목록을 뽑는다.
 * jsonParser 의 safeParseJson 은 쓰지 않는다 — cleanJsonOutput 이 최상위 배열을
 * 첫 원소 하나로 접어버려서(실측) 교정이 1건만 반영된다. 배열은 직접 판다.
 */
function parseReplacements(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  const text = String(raw || '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return out;
  let list: unknown[];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    return out; // 파싱 실패는 교정 없음과 같다 — 원문을 그대로 둔다.
  }
  for (const item of list) {
    const index = Number((item as { index?: unknown })?.index);
    const replacement = String((item as { replacement?: unknown })?.replacement || '').trim();
    if (Number.isInteger(index) && index > 0 && replacement) out.set(index, replacement);
  }
  return out;
}

/** 교정문이 (1) 같은 규칙에 다시 걸리거나 (2) 원문의 절반 미만이면 버린다. */
function isAcceptableReplacement(original: string, replacement: string): boolean {
  if (replacement === original) return false;
  if (replacement.length < Math.floor(original.length * 0.5)) return false;
  return auditIssueDiscipline(replacement).length === 0;
}

/**
 * 초안을 제자리에서 검수·교정한다 (팩트체크와 같은 in-place 계약).
 * 엔진을 못 잡으면 탐지 결과만 로그로 남기고 원문을 그대로 둔다.
 */
export async function applyIssueDisciplineAudit(
  draft: AuditableDraft,
  source: AuditSource,
  resolveRoute: () => Promise<{ engine: string; callModel: (prompt: string, options?: { maxTokens?: number }) => Promise<string> } | null>,
): Promise<IssueDisciplineAuditResult> {
  try {
    if (!draft?.bodyPlain) return SKIPPED;
    if (!(await isIssueDisciplineTarget(source))) return SKIPPED;

    const findings = auditIssueDiscipline(draft.bodyPlain);
    if (findings.length === 0) {
      console.log('[IssueDiscipline] 🔎 사건 글 검수: 지적 사항 없음');
      return { ...SKIPPED, ran: true };
    }
    for (const f of findings) {
      console.log(`[IssueDiscipline] ⚠️ ${f.code}: ${f.sentence.slice(0, 60)}`);
    }

    const route = await resolveRoute().catch(() => null);
    if (!route) {
      console.warn(`[IssueDiscipline] 교정 엔진 없음 — 지적 ${findings.length}건 경고만 남긴다`);
      return { ran: true, engineUsed: '', findingCount: findings.length, correctedCount: 0, findings };
    }

    const raw = await route.callModel(buildCorrectionPrompt(findings), { maxTokens: 2000 });
    const replacements = parseReplacements(String(raw || ''));

    let corrected = 0;
    for (const [index, replacement] of replacements) {
      const finding = findings[index - 1];
      if (!finding) continue;
      if (!isAcceptableReplacement(finding.sentence, replacement)) {
        console.warn(`[IssueDiscipline] 교정문 반려(${finding.code}): ${replacement.slice(0, 50)}`);
        continue;
      }
      if (draft.bodyPlain?.includes(finding.sentence)) {
        draft.bodyPlain = draft.bodyPlain.replace(finding.sentence, replacement);
        corrected += 1;
      }
      if (draft.bodyHtml?.includes(finding.sentence)) {
        draft.bodyHtml = draft.bodyHtml.replace(finding.sentence, replacement);
      }
    }

    console.log(`[IssueDiscipline] 🔎 사건 글 검수(${route.engine}): 지적 ${findings.length}건 중 ${corrected}건 교정`);
    return { ran: true, engineUsed: route.engine, findingCount: findings.length, correctedCount: corrected, findings };
  } catch (error) {
    console.warn('[IssueDiscipline] 검수 실패 (글은 그대로 사용):', (error as Error)?.message || error);
    return SKIPPED;
  }
}
