/**
 * 실시간 스냅샷 점검 — 기존 verify-source-signals.mjs 의 검사 논리를 그대로 옮겼다.
 *
 * 왜 필요했나: 정책 레인이 오래 0건이었는데 아무도 몰랐다. 수집기가 실패해도
 * 조용히 빈 배열을 돌려주고, 레인은 스냅샷에서 통째로 빠지고, 화면엔 "원본 수집 중"
 * 만 떴다. 실패가 사람 눈에 닿기까지 며칠이 걸렸다.
 *
 * 그래서 "무엇이 있어야 정상인가"를 코드로 못 박고, 어긋나면 실패시킨다.
 */
import { argValue, fail, ok, readRepoJson, request, skip, warn } from './lib.mjs';

const LOCAL_PATH = 'spa/public/data/source-signals.json';
const LIVE_URL = 'https://leaderspro.kr/data/source-signals.json';

/** 반드시 있어야 하는 레인과 최소 건수. 하나라도 비면 화면에 빈 탭이 생긴다. */
export const REQUIRED_LANES = [
  { id: 'naver', min: 5 },
  { id: 'daum', min: 5 },
  { id: 'nate', min: 3 },
  { id: 'zum', min: 5 },
  { id: 'policy', min: 3 },
  { id: 'issue', min: 3 },
];

function hasBrief(item) {
  const insight = item?.insight;
  if (!insight) return false;
  if (Array.isArray(insight.facts) && insight.facts.length > 0) return true;
  return Boolean(insight.body || insight.summary);
}

export async function loadSnapshot(mode) {
  if (mode === 'live') {
    const response = await request(`${LIVE_URL}?cb=${Date.now()}`, { timeoutMs: 20000 });
    if (!response.okStatus) return { source: LIVE_URL, data: null, error: response.error || `HTTP ${response.status}` };
    try {
      return { source: LIVE_URL, data: JSON.parse(response.text), error: '' };
    } catch {
      return { source: LIVE_URL, data: null, error: 'JSON 파싱 실패' };
    }
  }
  const data = readRepoJson(LOCAL_PATH);
  return { source: LOCAL_PATH, data, error: data ? '' : `파일 없음: ${LOCAL_PATH}` };
}

/**
 * 스냅샷 하나를 검사해 체크 목록을 돌려준다.
 * status-board 와 verify-source-signals 가 같은 함수를 쓴다 — 두 곳의 기준이
 * 갈라지면 한쪽만 보고 안심하게 된다.
 */
export function inspectSnapshot(data, options = {}) {
  const minBriefPct = Number(options.minBriefPct ?? 85);
  const maxAgeMin = Number(options.maxAgeMin ?? 90);
  const results = [];

  if (!data.updatedAt) {
    results.push(fail('signals.age', '스냅샷 신선도', 'updatedAt 이 없다'));
  } else {
    const ageMin = Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000);
    results.push(
      ageMin > maxAgeMin
        ? fail('signals.age', '스냅샷 신선도', `${ageMin}분 전 것이다 (상한 ${maxAgeMin}분)`, '크론이 멈췄는지 확인할 것')
        : ok('signals.age', '스냅샷 신선도', `${ageMin}분 전`),
    );
  }

  const lanes = new Map((data.lanes || []).map((lane) => [lane.id, lane]));
  const thin = [];
  const empty = [];
  let total = 0;
  let withBrief = 0;

  for (const required of REQUIRED_LANES) {
    const lane = lanes.get(required.id);
    const items = lane?.items || [];
    total += items.length;
    withBrief += items.filter(hasBrief).length;
    if (!lane) empty.push(`${required.id}(레인 자체 없음)`);
    else if (items.length < required.min) thin.push(`${required.id} ${items.length}/${required.min}`);
  }

  if (empty.length > 0) {
    results.push(fail('signals.lanes', '레인 존재', `${empty.join(', ')}`, '수집기가 0건을 돌려줬다 — 화면에 빈 탭이 생긴다'));
  } else if (thin.length > 0) {
    results.push(fail('signals.lanes', '레인 건수', `기준 미달: ${thin.join(', ')}`));
  } else {
    results.push(ok('signals.lanes', '레인 건수', `${REQUIRED_LANES.length}개 레인 전부 기준 이상 (총 ${total}건)`));
  }

  const briefPct = total ? Math.round((withBrief / total) * 100) : 0;
  results.push(
    briefPct < minBriefPct
      ? fail('signals.brief', '브리프 커버리지', `${withBrief}/${total} = ${briefPct}% (하한 ${minBriefPct}%)`, '마인드맵이 껍데기로 뜬다')
      : ok('signals.brief', '브리프 커버리지', `${withBrief}/${total} = ${briefPct}%`),
  );

  // 사실이 있다고 다 쓸 수 있는 게 아니다. 출처 없는 사실은 확인할 방법이 없다.
  let noLink = 0;
  let noTitle = 0;
  for (const lane of lanes.values()) {
    for (const item of lane.items || []) {
      if (!hasBrief(item)) continue;
      const insight = item.insight || {};
      if (!(insight.links || []).length) noLink += 1;
      if (!insight.titles?.seo && !insight.titles?.home) noTitle += 1;
    }
  }
  if (withBrief === 0) {
    results.push(skip('signals.links', '브리프 출처 링크', '브리프가 없어 검사할 것이 없다'));
  } else if (noLink / withBrief > 0.5) {
    results.push(fail('signals.links', '브리프 출처 링크', `${noLink}/${withBrief}건에 출처가 없다`, '확인 경로가 끊긴다'));
  } else {
    results.push(ok('signals.links', '브리프 출처 링크', `출처 없음 ${noLink}건 · 추천 제목 없음 ${noTitle}건`));
  }

  /*
   * 문장이 한가운데서 끊겼는지. 예전에는 요약을 글자 수로 잘라(.slice(0, 260))
   * "…곳곳에서 탄성이 터져 나왔습" 처럼 단어 중간이 날아갔다 — 발행본에 153건
   * 있었다(2026-09-05 실측). 인용은 완결 문장만 쓰기로 했으니 여기서 지킨다.
   */
  let cutFacts = 0;
  let totalFacts = 0;
  const cutSample = [];
  for (const lane of lanes.values()) {
    for (const item of lane.items || []) {
      for (const fact of (item.insight?.facts || [])) {
        const text = String(fact?.text || '').trim();
        if (!text) continue;
        totalFacts += 1;
        /*
         * 무엇이 "잘린 것"인가. 종결어미로 끝나야 한다는 규칙은 너무 넓었다 —
         * 기사 제목("…실업률 4.1%", "스타뉴스 최신 기사 · …강조 여행")까지 잡았다.
         * 제목은 원래 종결어미로 안 끝난다. 진짜 절단의 자국만 본다:
         *   ① 꼬리에 말줄임표가 남았거나
         *   ② 끝나다 만 어간(…터져 나왔습)으로 끝났거나
         *   ③ 공백 뒤 한 글자 조각(…김지훈 / 제)으로 끝났다.
         */
        const cutTail = /(?:\.{2,}|…)\s*$/u.test(text);
        const cutStem = /(?:습|았|었|였|왔|됐|겼|냈|랐|뤘|췄)$/u.test(text);
        const cutOneChar = /\s\S$/u.test(text) && /[가-힣]$/u.test(text);
        if (cutTail || cutStem || cutOneChar) {
          cutFacts += 1;
          if (cutSample.length < 2) cutSample.push(text.slice(-24));
        }
      }
    }
  }
  if (totalFacts === 0) {
    results.push(skip('signals.fact-cut', '인용 문장 완결', '사실 문장이 없어 검사할 것이 없다'));
  } else if (cutFacts > 0) {
    results.push(fail(
      'signals.fact-cut',
      '인용 문장 완결',
      `${cutFacts}/${totalFacts}건이 문장 중간에서 끊겼다 (예: …${cutSample.join(' / …')})`,
      '글자 수로 자르지 말고 완결 문장만 인용한다(pickQuotedSentences)',
    ));
  } else {
    results.push(ok('signals.fact-cut', '인용 문장 완결', `${totalFacts}건 모두 완결 문장`));
  }

  const unknown = [...lanes.keys()].filter((id) => !REQUIRED_LANES.some((r) => r.id === id));
  if (unknown.length > 0) results.push(warn('signals.unknown-lane', '알 수 없는 레인', unknown.join(', ')));

  return results;
}

export const signalsProbe = {
  id: 'signals',
  title: '실시간 스냅샷',
  async run(context = {}) {
    const mode = context.mode || (process.argv.includes('--local') ? 'local' : 'live');
    const { source, data, error } = await loadSnapshot(mode);
    if (!data) return [fail('signals.load', '스냅샷 로드', `${source} — ${error}`)];
    return [
      ok('signals.load', '스냅샷 로드', `${mode === 'live' ? '배포본' : '로컬'} ${source}`),
      ...inspectSnapshot(data, {
        minBriefPct: Number(argValue('min-brief', 85)),
        maxAgeMin: Number(argValue('max-age', 90)),
      }),
    ];
  },
};

export default signalsProbe;
