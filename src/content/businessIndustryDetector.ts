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
 */
export type BusinessIndustry = 'medical' | 'construction' | 'professional' | 'local';

const MEDICAL_PATTERN = /병원|의원|치과|한의원|피부과|성형외과|정형외과|안과|이비인후과|산부인과|소아과|내과|외과|비뇨|재활의학|요양병원|클리닉|의료|진료/;

const PROFESSIONAL_PATTERN = /변호사|법무법인|법무사|법률사무소|세무사|세무법인|회계사|회계법인|노무사|노무법인|행정사|변리사|특허사무소|감정평가|공인중개사/;

const CONSTRUCTION_PATTERN = /인테리어|시공|리모델링|철거|도배|장판|타일|방수|누수|배관|설비|샷시|샤시|창호|전기공사|목공|미장|페인트|욕실 공사|주방 공사|건축|증축|익스테리어/;

const LOCAL_PATTERN = /맛집|카페|미용실|헤어샵|네일|왁싱|학원|과외|헬스장|피트니스|필라테스|요가|세차|정비소|공업사|꽃집|펜션|숙소|스튜디오|공방|반찬가게|정육점|세탁소/;

export function detectBusinessIndustry(text: string): BusinessIndustry | null {
  const haystack = String(text ?? '').trim();
  if (!haystack) return null;

  if (MEDICAL_PATTERN.test(haystack)) return 'medical';
  if (PROFESSIONAL_PATTERN.test(haystack)) return 'professional';
  if (CONSTRUCTION_PATTERN.test(haystack)) return 'construction';
  if (LOCAL_PATTERN.test(haystack)) return 'local';
  return null;
}
