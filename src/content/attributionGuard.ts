/**
 * attributionGuard.ts — Evidence-aware attribution detection.
 *
 * Principle: "LLM이 작성한 좋은 결과를 후처리기가 임의로 망가뜨리지 않는다."
 * Blind regex stripping of every "~에 따르면" phrase destroys real, evidence-backed
 * attributions along with fabricated ones. This module classifies attribution phrases
 * as `named` (a specific org/person is credited) or `generic` (no specific source named,
 * e.g. "기사에 따르면"), then checks whether the claimed source is actually present in
 * the evidence the generator was given. Only unsupported attributions should be stripped
 * by the caller — and even then, only the attribution phrase itself, never the claim body.
 *
 * @since 2026-09-22
 */

export interface Attribution {
  /** The exact matched attribution phrase (e.g. "보건복지부 발표에 따르면"). */
  phrase: string;
  /** Normalized organization/person name, or null for generic attributions. */
  orgName: string | null;
  /** 'named' when a specific source is credited, 'generic' otherwise. */
  kind: 'named' | 'generic';
  /** Character offset of `phrase` within the scanned text. */
  index: number;
}

export interface AttributionEvidence {
  /** Known-real source names (e.g. RAG source titles, org names from the material). */
  sourceNames: string[];
  /** Full text of the evidence/material the generator was given. */
  corpus: string;
}

// Nouns that describe *a kind of* source without naming one. When these appear as the
// captured "name" token in a named-attribution pattern, the match is generic instead.
const GENERIC_SOURCE_NOUNS = [
  '기사', '보도', '원문', '원본', '관계자', '매체', '자료', '보고서',
  '방송', '포스팅', '포스트', '문서', '리뷰', '뉴스', '한 매체',
  // Marker nouns used by the "발표/입장/기준/가격표" attribution pattern itself —
  // when captured alone (no org name precedes them), they are not a source name.
  '발표', '공식 발표', '입장', '기준', '가격표',
  // [2026-09-22 P1 live] perspective nouns — "독자 입장에서", "소비자 입장" are viewpoints, not sources.
  '독자', '소비자', '사용자', '구매자', '이용자', '본인', '고객', '시청자',
];

const LEADING_PREFIX_RE = /^(?:본|위|해당|이|그)\s*/;

function normalizeOrgCandidate(raw: string): string {
  return raw.replace(LEADING_PREFIX_RE, '').trim();
}

function isGenericNoun(name: string): boolean {
  return GENERIC_SOURCE_NOUNS.some((g) => name === g || name.endsWith(g));
}

interface RawMatch {
  index: number;
  phrase: string;
  orgName: string | null;
  kind: 'named' | 'generic';
}

/** Detects Korean attribution phrases in `text`, classifying each as named or generic. */
export function extractAttributions(text: string): Attribution[] {
  if (!text) return [];

  const results: RawMatch[] = [];
  const seenKeys = new Set<string>();

  const record = (m: RegExpExecArray, orgRaw: string | null, kind: 'named' | 'generic') => {
    const key = `${m.index}:${m[0]}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push({
      index: m.index,
      phrase: m[0],
      orgName: orgRaw ? normalizeOrgCandidate(orgRaw) : null,
      kind,
    });
  };

  const runNamed = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const org = normalizeOrgCandidate(m[1]);
      if (!org || isGenericNoun(org)) continue;
      record(m, org, 'named');
    }
  };

  // Named: "<이름>(에|에서) (따르면|의하면)" — e.g. "보건복지부에 따르면"
  runNamed(/([가-힣A-Za-z0-9·]{2,20})\s*(?:에서|에)\s*(?:따르면|의하면)/g);

  // Named: "<이름> 관계자(는|에 따르면)" — e.g. "금융위원회 관계자는"
  runNamed(/([가-힣A-Za-z0-9·]{2,20})\s*관계자(?:는|에\s*따르면)/g);

  // Named: "<이름> (발표|공식 발표|보도|가격표)(에 따르면|기준|에서는)?" — these marker nouns
  // are attribution-shaped on their own ("기아 공식 가격표 기준", "국토교통부 발표").
  runNamed(/([가-힣A-Za-z0-9·]{2,20})\s*(?:공식\s*)?(?:발표|보도|가격표)(?:에\s*따르면|기준|에서는)?/g);

  // Named: "<이름> (기준|자료|입장)(에 따르면|에서는)" — bare "기준/자료/입장" is ordinary prose
  // ("소득 기준", "가입일 기준", "독자 입장에서") so it only counts with an explicit tail.
  // [2026-09-22 live] the bare forms stripped "겹쳐서 기준" / "독자 입장" out of normal sentences.
  runNamed(/([가-힣A-Za-z0-9·]{2,20})\s*(?:기준|자료|입장)(?:에\s*따르면|에서는)/g);

  // Generic: no specific source named.
  const genericPatterns: RegExp[] = [
    /기사에\s*따르면/g,
    /보도에\s*따르면/g,
    /원문에는/g,
    /관계자에\s*따르면/g,
    /한\s*매체에\s*따르면/g,
  ];
  for (const re of genericPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      record(m, null, 'generic');
    }
  }

  return results
    .sort((a, b) => a.index - b.index)
    .map(({ index, phrase, orgName, kind }) => ({ index, phrase, orgName, kind }));
}

function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, '');
}

/** Builds normalized match candidates for a name: full string + 2/3/4-char Hangul prefixes. */
function buildNameCandidates(org: string): string[] {
  const stripped = normalizeForMatch(org);
  const candidates = new Set<string>();
  if (stripped) candidates.add(stripped);
  const hangulOnly = stripped.replace(/[^\p{Script=Hangul}]/gu, '');
  for (const len of [4, 3, 2]) {
    if (hangulOnly.length >= len) candidates.add(hangulOnly.slice(0, len));
  }
  return Array.from(candidates).filter(Boolean);
}

/**
 * Splits attributions found in `text` into supported (backed by evidence) and
 * unsupported (no matching source in evidence) groups.
 *
 * - A named attribution is supported when a normalized form of its org name
 *   appears in `evidence.sourceNames` or `evidence.corpus`.
 * - A generic attribution is supported whenever `evidence.corpus` is non-empty
 *   (i.e. some real source material exists, even if unnamed).
 */
export function classifyAttributions(
  text: string,
  evidence: AttributionEvidence,
): { supported: Attribution[]; unsupported: Attribution[] } {
  const attributions = extractAttributions(text);
  const supported: Attribution[] = [];
  const unsupported: Attribution[] = [];

  const normalizedSourceNames = (evidence?.sourceNames || [])
    .filter(Boolean)
    .map(normalizeForMatch);
  const corpus = evidence?.corpus || '';
  const normalizedCorpus = normalizeForMatch(corpus);
  const corpusHasContent = corpus.trim().length > 0;

  for (const attr of attributions) {
    if (attr.kind === 'generic') {
      (corpusHasContent ? supported : unsupported).push(attr);
      continue;
    }

    const candidates = buildNameCandidates(attr.orgName || '');
    const matchesEvidence = candidates.some(
      (c) =>
        normalizedSourceNames.some((sn) => sn.length > 0 && (sn.includes(c) || c.includes(sn)))
        || (c.length >= 2 && normalizedCorpus.includes(c)),
    );

    (matchesEvidence ? supported : unsupported).push(attr);
  }

  return { supported, unsupported };
}
