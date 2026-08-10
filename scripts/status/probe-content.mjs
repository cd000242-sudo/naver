/**
 * 공개 콘텐츠 점검 — 방문자가 보는 데이터가 실제로 채워져 있는지.
 *
 * 여기서 잡으려는 건 "500 에러"가 아니라 **조용한 공백**이다.
 * 공지 0건, 황금보드 0행, 정책 레인 실종은 전부 HTTP 200 으로 온다.
 */
import { fail, gasGet, minutesSince, ok, readRepoJson, request, skip, warn } from './lib.mjs';

const SITE = 'https://leaderspro.kr';

/** 관리자 공지. GAS 가 비면 정적 아카이브가 받쳐 주는 구조라 둘 다 본다. */
async function checkNotices() {
  const live = await gasGet('get-notices');
  const results = [];
  const notices = Array.isArray(live.json?.notices) ? live.json.notices : null;

  if (!notices) {
    results.push(fail('content.notices', 'GAS 공지', live.parseError || '목록을 받지 못했다'));
  } else if (notices.length === 0) {
    results.push(warn('content.notices', 'GAS 공지', '0건 — 정적 아카이브만 노출된다'));
  } else {
    results.push(ok('content.notices', 'GAS 공지', `${notices.length}건`));
  }

  const archive = readRepoJson('spa/public/data/home-notices-archive.json');
  const archiveCount = Array.isArray(archive?.items) ? archive.items.length : 0;
  results.push(
    archiveCount > 0
      ? ok('content.notice-archive', '공지 정적 아카이브', `${archiveCount}건 (GAS 다운 시 대체)`)
      : warn('content.notice-archive', '공지 정적 아카이브', '비어 있다 — GAS 가 죽으면 공지 화면이 빈다'),
  );
  return results;
}

/** 홈 황금키워드 보드. 실측 검색량·문서수가 실제로 붙어 있는지까지 본다. */
async function checkGoldenBoard() {
  const response = await request(`${SITE}/data/home-keyword-briefing-seed.json?cb=${Date.now()}`, { timeoutMs: 20000 });
  if (!response.okStatus) {
    return [fail('content.golden', '황금키워드 보드', response.error || `HTTP ${response.status}`)];
  }
  let data;
  try {
    data = JSON.parse(response.text);
  } catch {
    return [fail('content.golden', '황금키워드 보드', 'JSON 파싱 실패')];
  }

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const results = [];
  if (rows.length === 0) {
    results.push(fail('content.golden', '황금키워드 보드', '0행 — 발굴 결과가 없다'));
    return results;
  }

  // 추정치를 화면에 올리지 않는 것이 이 프로젝트의 규칙이다. 검색량이나
  // 문서수가 비어 있으면 그 행은 근거 없이 노출된다.
  const measured = rows.filter((row) => Number(row.searchVolume) > 0 && Number(row.documentCount) >= 0);
  results.push(
    measured.length === rows.length
      ? ok('content.golden', '황금키워드 보드', `${rows.length}행 전부 실측 검색량·문서수 보유`)
      : fail(
          'content.golden',
          '황금키워드 보드',
          `${rows.length}행 중 ${rows.length - measured.length}행에 실측값이 없다`,
          '근거 없는 행이 화면에 나간다',
        ),
  );

  const ageMin = minutesSince(data.publishedAt);
  if (ageMin === null) {
    results.push(warn('content.golden-age', '황금보드 신선도', 'publishedAt 을 읽을 수 없다'));
  } else {
    const hours = Math.round((ageMin / 60) * 10) / 10;
    results.push(
      ageMin > 24 * 60
        ? warn('content.golden-age', '황금보드 신선도', `${hours}시간 전 — 하루 넘게 안 바뀌었다`)
        : ok('content.golden-age', '황금보드 신선도', `${hours}시간 전`),
    );
  }
  return results;
}

/**
 * 선점 황금키워드 보드. 배치가 멈추면 /leword 첫 화면이 통째로 빈다.
 * 여기서 잡으려는 건 "보드가 오래됐다"와 "행은 있는데 근거가 없다" 둘이다.
 */
async function checkPreemptionBoard() {
  const response = await request(`${SITE}/data/preemption-board.json?cb=${Date.now()}`, { timeoutMs: 20000 });
  if (response.status === 404) {
    return [skip('content.preemption', '선점 보드', '아직 발행 전 — 배치를 한 번도 안 돌렸다')];
  }
  if (!response.okStatus) {
    return [fail('content.preemption', '선점 보드', response.error || `HTTP ${response.status}`)];
  }
  let board;
  try {
    board = JSON.parse(response.text);
  } catch {
    return [fail('content.preemption', '선점 보드', 'JSON 파싱 실패')];
  }

  const rows = Array.isArray(board.rows) ? board.rows : [];
  const results = [];
  const ageMin = minutesSince(board.publishedAt);
  const days = ageMin === null ? null : Math.round((ageMin / 1440) * 10) / 10;

  // 주 2회 배치라 4일을 넘으면 멈춘 것이다.
  if (days === null) results.push(warn('content.preemption-age', '선점 보드 신선도', 'publishedAt 을 읽을 수 없다'));
  else if (days > 4) results.push(fail('content.preemption-age', '선점 보드 신선도', `${days}일 전`, '주 2회 배치가 멈췄다'));
  else results.push(ok('content.preemption-age', '선점 보드 신선도', `${days}일 전`));

  if (rows.length === 0) {
    // 순도 우선 게이트라 빈 회차가 정상일 수 있다. 실패로 단정하지 않는다.
    results.push(warn('content.preemption', '선점 보드', '통과 0건 — 게이트가 과하게 조였는지 확인 필요'));
    return results;
  }

  const withoutEvidence = rows.filter((row) => !Array.isArray(row.evidence) || row.evidence.length === 0).length;
  const topics = new Set(rows.map((row) => row.topic).filter(Boolean)).size;
  results.push(
    withoutEvidence > 0
      ? fail('content.preemption', '선점 보드', `${rows.length}행 중 ${withoutEvidence}행에 근거가 없다`, '근거 없는 행이 화면에 나간다')
      : ok('content.preemption', '선점 보드', `${rows.length}행 · ${topics}/${board.topicsTotal || 32}개 주제 커버`),
  );
  return results;
}

/** 관리자 콘텐츠의 필수 구획이 살아 있는지. 통째로 빠지면 전 페이지가 기본값으로 돈다. */
async function checkSiteContentSections() {
  const response = await gasGet('site-content');
  const content = response.json?.content;
  if (!content) return [fail('content.site-content', '관리자 콘텐츠', response.parseError || '내용이 비었다')];

  const required = ['hero', 'pricing', 'downloads', 'products'];
  const missing = required.filter((key) => !content[key]);
  const results = [
    missing.length === 0
      ? ok('content.site-content', '관리자 콘텐츠 구획', `${required.join(' · ')} 전부 존재`)
      : fail('content.site-content', '관리자 콘텐츠 구획', `빠진 구획: ${missing.join(', ')}`),
  ];

  const proofs = Array.isArray(content.hero?.proofs) ? content.hero.proofs : [];
  results.push(
    proofs.length > 0
      ? ok('content.proofs', '홈 성과 캡처', `${proofs.length}건`)
      : warn('content.proofs', '홈 성과 캡처', '0건 — 홈 신뢰 구획이 빈다'),
  );
  return results;
}

/** 수익 인증 공개 목록. 가짜 시드가 다시 흘러나오지 않는지도 함께 본다. */
async function checkIncomeList() {
  const response = await gasGet('income-list', { view: 'home', limit: '5' });
  if (!response.json) return [skip('content.income', '수익 인증 목록', response.parseError || '응답 없음')];
  const income = Array.isArray(response.json.income) ? response.json.income : [];
  const seeds = income.filter((row) => /^I-seed-\d+$/i.test(String(row?.id || '')));
  return [
    seeds.length === 0
      ? ok('content.income', '수익 인증 목록', `${income.length}건 · 시드 데이터 없음`)
      : warn('content.income', '수익 인증 목록', `가짜 시드 ${seeds.length}건이 여전히 서빙된다`, '시트에서 해당 행을 삭제할 것'),
  ];
}

export const contentProbe = {
  id: 'content',
  title: '공개 콘텐츠',
  async run() {
    const settled = await Promise.allSettled([
      checkNotices(),
      checkGoldenBoard(),
      checkPreemptionBoard(),
      checkSiteContentSections(),
      checkIncomeList(),
    ]);
    return settled.flatMap((entry, index) =>
      entry.status === 'fulfilled'
        ? entry.value
        : [fail(`content.probe-${index}`, '콘텐츠 점검', `점검이 실패했다: ${entry.reason?.message || entry.reason}`)],
    );
  },
};

export default contentProbe;
