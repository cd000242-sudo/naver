/**
 * 키워드 상세 페이지 본문 생성기 (빌드 스크립트 · React 페이지 공용).
 *
 * 원칙: 추정치를 만들지 않는다. 실측값(검색량·문서수), 단순 산술(기회지수·비율),
 * 키워드 자체 해석, 같은 브리핑 안의 매칭 사실만 쓴다. 예상 수익·예상 트래픽 같은
 * 추정 수치는 넣지 않는다.
 *
 * 얇은 자동생성 페이지는 AdSense '가치 없는 콘텐츠'에 걸리므로, 페이지마다
 * (1) 무엇을 확인하려는 검색인지 (2) 실측 근거와 그 해석 (3) 글에 넣을 항목
 * (4) 같은 브리핑의 관련 키워드를 채운다.
 */

/** 키워드 뒤에 붙어 '무엇을 알고 싶은지'를 드러내는 토큰. 앞의 것이 더 구체적이라 먼저 본다. */
const NEED_TOKENS = [
  ['기본정보', '기본 정보를 한 번에 정리한 것'],
  ['관람평', '실제로 본 사람들의 평가'],
  ['프로필', '인물의 기본 이력과 배경'],
  ['시험일정', '시험이 언제 치러지는지'],
  ['출시일', '언제 나오는지'],
  ['발매일', '언제 발매되는지'],
  ['사용처', '어디서 쓸 수 있는지'],
  ['신청방법', '어떻게 신청하는지'],
  ['신청기간', '언제까지 신청할 수 있는지'],
  ['지급일', '언제 지급되는지'],
  ['주의사항', '미리 알아둬야 조심할 점'],
  ['체크리스트', '빠뜨리면 안 되는 확인 항목'],
  ['일정', '일정이 언제인지'],
  ['방법', '어떻게 하는지'],
  ['후기', '먼저 해본 사람의 경험'],
  ['비교', '무엇이 더 나은지'],
  ['가격', '얼마인지'],
  ['비용', '얼마나 드는지'],
  ['순위', '무엇이 상위인지'],
  ['뜻', '무슨 뜻인지'],
  ['이유', '왜 그런지'],
  ['논란', '무엇이 문제가 됐는지'],
  ['정리', '흩어진 내용을 한눈에'],
];

const numberFormat = new Intl.NumberFormat('ko-KR');

/** 마지막 글자에 받침이 있는지. 한글이 아니면 null(조사 선택 불가). */
function hasFinalConsonant(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const code = text.charCodeAt(text.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 받침에 맞는 조사를 붙인다. 95개 페이지에 '평가을', '윤혁준가' 같은 오류가
 * 깔리면 그 자체로 저품질 신호라 규칙으로 처리한다.
 * 한글이 아니어서 판별이 안 되면 '와/과' 처럼 병기하지 않고 안전한 쪽을 쓴다.
 */
function withParticle(word, withFinal, withoutFinal) {
  const final = hasFinalConsonant(word);
  if (final === null) return `${word}${withoutFinal}`;
  return `${word}${final ? withFinal : withoutFinal}`;
}

export function keywordSlug(keyword) {
  return String(keyword || '')
    .trim()
    .replace(/[\\/?%*:|"<>#&]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function matchedNeed(keyword) {
  const compact = String(keyword || '').replace(/\s+/g, '');
  for (const [token, meaning] of NEED_TOKENS) {
    if (compact.includes(token)) return { token, meaning };
  }
  return null;
}

/** 키워드에서 니즈 토큰을 뗀 나머지 = 실제 주제어. */
function subjectOf(keyword) {
  const need = matchedNeed(keyword);
  if (!need) return String(keyword || '').trim();
  const compact = String(keyword || '').trim();
  const stripped = compact.replace(new RegExp(`\\s*${need.token}\\s*$`), '').trim();
  return stripped || compact;
}

/** 문서수 대비 검색량으로 경쟁 공백을 말한다. 실측 나눗셈이라 추정이 아니다. */
function competitionSentence(volume, documents) {
  if (!Number.isFinite(volume) || !Number.isFinite(documents) || documents <= 0) return '';
  const perDoc = volume / documents;
  const v = numberFormat.format(volume);
  const d = numberFormat.format(documents);
  if (perDoc >= 100) {
    return `한 달 검색이 ${v}회인데 관련 글은 ${d}개뿐입니다. 글 하나가 감당하는 검색이 ${Math.round(perDoc)}회꼴이라, 지금은 쓰는 사람보다 찾는 사람이 훨씬 많은 구간입니다.`;
  }
  if (perDoc >= 10) {
    return `한 달 검색 ${v}회에 관련 글은 ${d}개입니다. 글 하나당 검색 ${Math.round(perDoc)}회꼴로, 아직 자리가 남아 있는 편입니다.`;
  }
  return `한 달 검색 ${v}회에 관련 글이 ${d}개 있습니다. 이미 쓴 사람이 적지 않으니, 남들이 안 다룬 각도를 잡아야 합니다.`;
}

function meaningSentence(keyword) {
  const need = matchedNeed(keyword);
  const subject = subjectOf(keyword);
  // 조사는 따옴표가 아니라 낱말 자체의 받침으로 정해야 한다("…관람평"는 -> "…관람평"은).
  const kw = `'${keyword}'${withParticle(keyword, '은', '는').slice(keyword.length)}`;
  if (need) {
    const what = withParticle(need.meaning, '을', '를');
    return `${kw} '${subject}'에 대해 ${what} 확인하려는 검색입니다.`;
  }
  return `${kw} '${subject}' 자체를 찾아보는 검색입니다. 검색한 사람이 바로 다음에 궁금해할 것까지 이어서 답해야 글이 끝까지 읽힙니다.`;
}

/** 글에 넣을 항목. 니즈 토큰이 있으면 그에 맞춰, 없으면 주제 확인형 기본 골격. */
function outlineItems(keyword) {
  const need = matchedNeed(keyword);
  const subject = subjectOf(keyword);
  if (need) {
    return [
      `${subject} — ${withParticle(need.meaning, '을', '를')} 첫 화면에서 바로 답하기`,
      `근거와 출처 (언제 기준인지, 어디서 확인했는지)`,
      `헷갈리기 쉬운 부분과 예외`,
      `${subject} 관련해 이어서 찾게 되는 것들`,
    ];
  }
  return [
    `${withParticle(subject, '이', '가')} 무엇인지 한 문단으로 정리`,
    `지금 이 키워드가 검색되는 배경`,
    `검색한 사람이 실제로 알고 싶어 하는 것`,
    `다음 행동으로 이어지는 정보 (어디서 더 볼지)`,
  ];
}

/** 같은 브리핑 안에서 주제어를 공유하는 키워드 = 매칭 사실이라 추정이 아니다. */
function relatedKeywords(keyword, allRows, limit = 6) {
  const subject = subjectOf(keyword);
  const head = subject.split(/\s+/)[0];
  if (!head || head.length < 2) return [];
  const self = String(keyword).trim();
  const seen = new Set([self]);
  const out = [];
  for (const row of allRows || []) {
    const candidate = String(row?.keyword || '').trim();
    if (!candidate || seen.has(candidate)) continue;
    if (!candidate.includes(head)) continue;
    seen.add(candidate);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 상세 페이지에 필요한 내용을 한 번에 만든다.
 * @returns {{keyword,slug,subject,volume,documents,opportunity,meaning,competition,outline,related,metaDescription}}
 */
export function buildKeywordDetail(row, allRows) {
  const keyword = String(row?.keyword || '').trim();
  const volume = Number(row?.searchVolume);
  const documents = Number(row?.documentCount);
  const opportunity = Number(row?.opportunity);
  return {
    keyword,
    slug: keywordSlug(keyword),
    subject: subjectOf(keyword),
    volume: Number.isFinite(volume) ? volume : null,
    documents: Number.isFinite(documents) ? documents : null,
    opportunity: Number.isFinite(opportunity) ? opportunity : null,
    meaning: meaningSentence(keyword),
    competition: competitionSentence(volume, documents),
    outline: outlineItems(keyword),
    related: relatedKeywords(keyword, allRows),
    metaDescription: `${keyword} — 월 검색량 ${Number.isFinite(volume) ? numberFormat.format(volume) : '-'}회, 관련 문서 ${Number.isFinite(documents) ? numberFormat.format(documents) : '-'}개. 이 키워드로 글을 쓸 때 무엇을 다뤄야 하는지 정리했습니다.`,
  };
}

export { numberFormat };
