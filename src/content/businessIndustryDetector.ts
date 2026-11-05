/**
 * [2026-08-06] Business industry detection from user-entered fields.
 *
 * The four industry prompt files (medical/construction/professional/local)
 * were dead wiring — buildSystemPrompt only looks up `business/${category}`
 * with generic content categories, so industry files never matched. The user
 * approved keyword-based inference from the business info fields ("초반에
 * 필드에 작성하는 걸 추론하면 답이 나오잖아").
 *
 * Safety: explicit keyword match only. When nothing matches, return null so
 * no industry overlay is applied (base contract only) — a wrong industry
 * overlay is worse than none (e.g. medical rules on a cafe post).
 * Priority: medical > professional > construction — regulated industries win
 * mixed texts like "병원 인테리어 시공" (the CLIENT is medical, and medical
 * ad law follows the subject being promoted).
 *
 * [2026-11-05] The business info window now has an explicit "업종" field, so
 * {@link resolveBusinessIndustry} reads that field first and only then falls
 * back to the free text. Restaurant and procedure names were added because the
 * old lists missed 고깃집 / 식당 / 임플란트 and returned null for them.
 *
 * This file must stay import-free: the renderer inlines it into the single-scope
 * bundle (scripts/copy-static.mjs), so every top-level name below is unique.
 */
export type BusinessIndustry = 'medical' | 'construction' | 'professional' | 'local';

const BIZ_IND_MEDICAL_RE = /병원|의원|치과|한의원|피부과|성형외과|정형외과|안과|이비인후과|산부인과|소아과|내과|외과|비뇨|재활의학|요양병원|클리닉|의료|진료|임플란트|라식|라섹|치아교정|보톡스|필러|리프팅|탈모|도수치료|물리치료|건강검진|시술/;

const BIZ_IND_PROFESSIONAL_RE = /변호사|법무법인|법무사|법률사무소|세무사|세무법인|회계사|회계법인|노무사|노무법인|행정사|변리사|특허사무소|감정평가|공인중개사/;

const BIZ_IND_CONSTRUCTION_RE = /인테리어|시공|리모델링|철거|도배|장판|타일|방수|누수|배관|설비|샷시|샤시|창호|전기공사|목공|미장|페인트|욕실 공사|주방 공사|건축|증축|익스테리어/;

const BIZ_IND_LOCAL_RE = /맛집|음식점|식당|고깃집|횟집|국밥|술집|주점|이자카야|치킨|피자|분식|레스토랑|브런치|뷔페|베이커리|빵집|제과|디저트|카페|미용실|헤어샵|네일|왁싱|에스테틱|마사지|속눈썹|애견|학원|과외|헬스장|피트니스|필라테스|요가|세차|정비소|공업사|꽃집|펜션|숙소|스튜디오|공방|반찬가게|정육점|세탁소/;

export function detectBusinessIndustry(text: string): BusinessIndustry | null {
  const haystack = String(text ?? '').trim();
  if (!haystack) return null;

  if (BIZ_IND_MEDICAL_RE.test(haystack)) return 'medical';
  if (BIZ_IND_PROFESSIONAL_RE.test(haystack)) return 'professional';
  if (BIZ_IND_CONSTRUCTION_RE.test(haystack)) return 'construction';
  if (BIZ_IND_LOCAL_RE.test(haystack)) return 'local';
  return null;
}

/**
 * Industry from the explicit "업종" field first; the free-text fields (name, features, title,
 * keyword) are only consulted when the field is empty or names nothing recognizable.
 */
export function resolveBusinessIndustry(
  industryField: unknown,
  ...fallbackTexts: unknown[]
): BusinessIndustry | null {
  const fromField = detectBusinessIndustry(String(industryField ?? ''));
  if (fromField) return fromField;
  return detectBusinessIndustry(
    fallbackTexts.map((text) => String(text ?? '').trim()).filter(Boolean).join(' '),
  );
}

/**
 * Promo-angle ids (businessAngleRotation.ts) that do not fit an industry. Medical ad law bans
 * case/result, price and inducement framing; regulated professionals may not show results or
 * inducements; shops have no "A/S" to speak of.
 */
const BIZ_IND_ANGLE_EXCLUSIONS: Readonly<Record<BusinessIndustry, readonly string[]>> = {
  medical: ['case', 'benefit', 'price', 'warranty'],
  professional: ['case', 'benefit'],
  local: ['warranty'],
  construction: [],
};

export function excludedBusinessAngleIds(industry: BusinessIndustry | null | undefined): readonly string[] {
  return industry ? BIZ_IND_ANGLE_EXCLUSIONS[industry] : [];
}
