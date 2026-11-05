/**
 * Grounding text for the quality gate's evidence checks (unsupported numbers, first-person claims).
 *
 * Kept in one place so both gate calls in contentGenerator read the same evidence.
 */
interface GroundingSource {
  readonly title?: string;
  readonly rawText?: string;
  readonly personalExperience?: string;
  readonly contentMode?: string;
  readonly businessInfo?: Record<string, unknown>;
}

/**
 * [2026-11-05] Business mode: the business's own numbers (덧방 2~3일, 보증 2년, 실측 30분, 경력 12년) come from
 *   the business info form, not the collected material. Without them the gate called them unsupported,
 *   capped safety at 35 and asked for a regeneration of a correct post.
 */
function businessInfoText(info: Record<string, unknown> | undefined): string {
  if (!info) return '';
  return Object.values(info)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * [2026-11-05] The app gives the model today's date as 기준일 (recency directive), and posts write it in the
 *   summary table ("| 기준일 | 2026년 11월 5일 |"). That date was read as an unsupported "5일" → regenerate.
 */
function referenceDateText(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return `기준일 ${y}년 ${m}월 ${d}일 (${iso})`;
}

export function buildQualityGateGroundingText(source: GroundingSource, now: Date = new Date()): string {
  const business = source.contentMode === 'business' ? businessInfoText(source.businessInfo) : '';
  return [source.title, source.rawText, source.personalExperience, business, referenceDateText(now)]
    .filter(Boolean)
    .join('\n');
}
