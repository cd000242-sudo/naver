// src/crawler/issueHarness/relevanceVocabulary.ts
//
// Vocabulary rules for the strict free relevance gate (captionRelevanceGate.ts).
//
// The gate needs "scene evidence": a heading (or event/fandom query) word that shows up in
// the candidate's caption. A word only counts as evidence when it can tell two photos of the
// same subject apart. Words that appear in nearly every caption about a celebrity ("근황",
// "사진", "공개"), number+unit tokens ("2026년", "36세") and sentence-ending verb forms
// ("흘렀다") say nothing about the scene, so they are filtered out here.
//
// Pure functions, no I/O.

const SEPARATORS = /[\s .,!?·•|/\\\-–—_()[\]{}"'`~:;#*<>]+/;

/** Comparison units. Two letters or more; pure digits are dropped. */
export function relevanceTokens(value: string): string[] {
  const out: string[] = [];
  for (const raw of String(value || '').split(SEPARATORS)) {
    const token = raw.trim().toLowerCase();
    if (token.length < 2) continue;
    if (/^\d+$/.test(token)) continue;
    out.push(token);
  }
  return out;
}

/** Words that say nothing about WHICH scene a photo shows. Lower-case. */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  // celebrity / press boilerplate
  '배우', '가수', '근황', '사진', '모습', '공개', '화제', '최근', '영상', '이슈', '뉴스', '기사',
  '오늘', '어제', '이번', '공식', '인스타그램', '인스타', 'sns', '셀럽', '스타', '관련', '이유', '정리',
  '논란', '반응', '소식', '현재', '최신', '사건', '상황', '이야기', '포토', '포토뉴스', '직찍', '직캠',
  '팬', '팬들', '네티즌', '누리꾼', '기자', '보도', '인물', '주인공', '본인', '자신', '순간', '시절',
  '방송', '출연', '활동', '일상', '변화', '비교', '장면', '이미지', '캡처', '화면', '연예인', '연예',
  '스포츠', '선수',
  // hook / filler words
  '한편', '그리고', '하지만', '그러나', '이렇게', '그렇게', '어떻게', '무엇', '정말', '진짜', '완전',
  '대박', '충격', '놀라운', '놀란', '반전', '단독', '속보', '특집', '숨겨진', '그것', '이것', '최초',
  '드디어', '결국', '과연', '바로', '다시', '또한', '모두', '함께', '계속', '하나', '이후', '이전',
  '당시', '지금', '처음', '우리', '때문', '위해', '통해', '대한', '대해', '다른', '어느덧', '어느새',
  // ordinal / counter words left after the leading digit is dropped
  '번째', '개월',
  // image-slot names (meta headings describe a slot, not a scene)
  '썸네일', '마무리', '서론', '도입부', '대표', '대표이미지',
]);

/** Digits followed by a unit: 2026년, 36세, 20년, 9월, 3일, 100만, 30대, 10%, 36세의 ... */
const NUMBER_UNIT = new RegExp(
  '^\\d[\\d.,]*(?:년|월|일|세|살|명|개월|개|억|만|천|원|%|퍼센트|시|분|초|위|등|회|차|대|배|주|번째|번|호|점|골|승|패|조|달러|엔|kg|cm)'
  + '(?:[은는이가을를의에도로와과만]|에서|으로|까지|부터|간|째|동안|전|후|쯤|이상|이하|만에)?$',
);

const PARTICLES_2 = ['에서', '으로', '까지', '부터', '에게', '에는', '에도', '이라', '처럼', '보다', '마다', '이나'];
const PARTICLES_1 = '은는이가을를의에도로와과만';

/** Light Korean particle stripper. Never returns fewer than 2 characters. */
export function stemKorean(token: string): string {
  if (!/[가-힣]$/.test(token)) return token;
  for (const p of PARTICLES_2) {
    if (token.endsWith(p) && token.length - p.length >= 2) return token.slice(0, -p.length);
  }
  const last = token[token.length - 1];
  if (PARTICLES_1.includes(last) && token.length - 1 >= 2) return token.slice(0, -1);
  return token;
}

/** Sentence-ending forms ("흘렀다", "향했습니다", "달라졌어요") are never caption nouns. */
function isPredicateLike(token: string): boolean {
  return token.length >= 3 && /[다요죠까]$/.test(token);
}

/** true when the token can never serve as scene evidence. */
export function isGenericSceneToken(raw: string): boolean {
  const token = String(raw || '').trim().toLowerCase();
  if (!token) return true;
  if (/^\d+$/.test(token) || NUMBER_UNIT.test(token)) return true;
  if (GENERIC_WORDS.has(token) || GENERIC_WORDS.has(stemKorean(token))) return true;
  return isPredicateLike(token);
}

/** Inputs the scene-token builder reads. */
export interface SceneSource {
  readonly subject?: string;
  readonly mainKeyword?: string;
  readonly heading?: string;
  /** Event / fandom query text and program name from the query plan. */
  readonly sceneTerms?: readonly string[];
}

const EDGE_JUNK = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** A heading word that is just the subject (or the subject plus a particle) is no evidence. */
function isSubjectDerived(token: string, subjectTokens: ReadonlySet<string>): boolean {
  for (const s of subjectTokens) {
    if (token === s) return true;
    if (token.startsWith(s) && token.length - s.length <= 2) return true;
  }
  return false;
}

/**
 * Non-generic, non-subject words from the heading and the query-plan scene terms.
 * Two-letter Korean words are kept (Korean nouns are short). An empty result means the
 * heading is vague and the caller must fall back to the subject-only rule.
 */
export function sceneEvidenceTokens(src: SceneSource): string[] {
  const subjectTokens = new Set<string>([
    ...relevanceTokens(src.subject || ''),
    ...relevanceTokens(src.mainKeyword || ''),
  ]);
  const out = new Set<string>();
  for (const text of [src.heading || '', ...(src.sceneTerms || [])]) {
    for (const raw of relevanceTokens(text)) {
      const token = raw.replace(EDGE_JUNK, '');
      if (token.length < 2) continue;
      if (isGenericSceneToken(token)) continue;
      if (isSubjectDerived(token, subjectTokens) || isSubjectDerived(stemKorean(token), subjectTokens)) continue;
      out.add(token);
    }
  }
  return [...out];
}
