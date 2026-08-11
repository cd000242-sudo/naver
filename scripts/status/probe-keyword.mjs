/**
 * /leword 키워드 API 점검.
 *
 * 이 레인이 구분해야 하는 상태가 셋이다. 셋을 섞으면 "왜 안 되는지"를
 * 또 사람이 눌러 가며 찾아야 한다:
 *   ① 액션 미배포        — GAS 에 코드가 안 올라갔다 (Unknown action)
 *   ② 자격증명 미설정    — 코드는 있는데 스크립트 속성이 비었다 (needs-setup)
 *   ③ 동작               — 실측값이 돌아온다
 *
 * 쿼터를 태우는 점검이므로 액션당 한 번씩만 부른다.
 */
import { fail, gasGet, ok, skip, warn } from './lib.mjs';

const ACTIONS = [
  { action: 'keyword-analyze', label: '키워드 분석', params: { keyword: '주휴수당' } },
  { action: 'keyword-shopping', label: '쇼핑 신호', params: { keyword: '주휴수당' } },
  { action: 'keyword-rank', label: '노출 추적', params: { keyword: '주휴수당', target: 'blog.naver.com/leaderspro-harness' } },
  { action: 'keyword-youtube', label: '유튜브 급상승', params: {} },
];

/** 하네스 호출이 방문자 무료 횟수를 갉아먹지 않도록 고정 식별자를 쓴다. */
const HARNESS_VISITOR = 'kv_status_harness';

function inspect(entry, response) {
  const id = `keyword.${entry.action}`;
  if (!response.json) {
    return fail(id, entry.label, response.parseError || `HTTP ${response.status}`);
  }

  const error = String(response.json.error || '');
  if (/unknown action/i.test(error)) {
    return warn(id, entry.label, '아직 배포되지 않았다', 'KeywordApi.js 와 Code.js 를 GAS 에 올리면 동작한다');
  }
  if (error === 'needs-setup') {
    const missing = Array.isArray(response.json.missing) ? response.json.missing.join(', ') : '알 수 없음';
    return warn(id, entry.label, `자격증명 미설정: ${missing}`, 'GAS 스크립트 속성에 값을 넣으면 바로 켜진다');
  }
  if (error === 'daily-limit' || error === 'visitor-limit') {
    return warn(id, entry.label, `한도 도달 (${error}) — 코드는 살아 있다`);
  }
  if (!response.json.ok) {
    return fail(id, entry.label, `${error}${response.json.status ? ` (upstream ${response.json.status})` : ''}`);
  }

  // 동작한다면 실측값이 실제로 들어 있는지까지 본다. ok:true 인데 값이 비면
  // 화면에는 빈 표가 뜨고, 그건 지금까지 제일 자주 놓친 실패 모양이다.
  const payload = response.json;
  if (entry.action === 'keyword-analyze') {
    const measured = payload.measured || {};
    return measured.searchVolume === null && measured.documentCount === null
      ? fail(id, entry.label, 'ok 인데 검색량·문서수가 둘 다 비었다')
      : ok(id, entry.label, `검색량 ${measured.searchVolume ?? '—'} · 문서수 ${measured.documentCount ?? '—'} · 연관 ${(payload.related || []).length}개`);
  }
  if (entry.action === 'keyword-shopping') {
    return ok(id, entry.label, `상품수 ${payload.productCount ?? '—'} · 상위 ${(payload.items || []).length}개`);
  }
  if (entry.action === 'keyword-rank') {
    return ok(id, entry.label, `${payload.scanned}건 스캔 · ${payload.found ? `${payload.found.rank}위` : '해당 없음(정상)'}`);
  }
  return (payload.items || []).length > 0
    ? ok(id, entry.label, `${payload.items.length}개`)
    : fail(id, entry.label, 'ok 인데 목록이 비었다');
}

/** 사용량이 응답에 실려 오는지, 그리고 한도에 얼마나 다가갔는지. */
function inspectUsage(responses) {
  const usage = responses.map((response) => response.json?.usage).find(Boolean);
  if (!usage) {
    return skip('keyword.usage', '사용량 계량', '응답에 usage 가 없다 — 아직 배포 전이거나 형식이 바뀌었다');
  }
  const detail = `오늘 ${usage.dailyCalls}/${usage.dailyLimit}건 (${usage.dailyPercent}%) · API 호출 ${usage.urlFetchToday}/${usage.urlFetchLimit} (${usage.urlFetchPercent}%)`;
  if (usage.dailyPercent >= 90 || usage.urlFetchPercent >= 90) {
    return fail('keyword.usage', '사용량 계량', detail, '오늘 안에 한도가 닫힌다');
  }
  return usage.dailyPercent >= 70 || usage.urlFetchPercent >= 70
    ? warn('keyword.usage', '사용량 계량', detail)
    : ok('keyword.usage', '사용량 계량', detail);
}

export const keywordProbe = {
  id: 'keyword',
  title: '/leword 키워드 API',
  async run() {
    const responses = [];
    // 순차로 돈다. 네 개를 동시에 던지면 GAS 쪽 LockService 대기가 겹친다.
    for (const entry of ACTIONS) {
      responses.push(await gasGet(entry.action, { ...entry.params, visitorId: HARNESS_VISITOR }));
    }
    return [
      ...ACTIONS.map((entry, index) => inspect(entry, responses[index])),
      inspectUsage(responses),
    ];
  },
};

export default keywordProbe;
