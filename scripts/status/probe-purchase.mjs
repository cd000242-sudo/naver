/**
 * 구매 흐름 점검 — 매출이 직접 걸린 레인이라 제일 먼저 본다.
 *
 * 실제로 났던 사고를 그대로 검사로 옮겼다:
 *  - 관리자 화면에서 다운로드 URL 이 빈 값으로 저장돼 버튼이 아무 일도 안 했다
 *  - 요금제 전환 시각 상수가 공지와 어긋나 일주일 동안 2배가 청구됐다
 *  - GAS 액션이 사라졌는데 화면은 조용해서 며칠 뒤에 알았다
 *
 * 그래서 여기서는 "코드에 뭐라고 적혀 있나"가 아니라
 * **손님이 실제로 받게 되는 값**(기본값에 관리자 설정을 덮은 결과)을 검사한다.
 */
import { check, collect, fail, gasGet, ok, probeLink, readRepoJson, readRepoText, skip, warn } from './lib.mjs';

const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';

/** 화면(DownloadPage)이 하는 병합을 그대로 재현한다. 빈 문자열이면 기본값이 이긴다. */
function resolveDownloads(catalog, override) {
  const byKey = override?.downloads || {};
  return (catalog.downloads || []).map((item) => {
    const configured = byKey[item.key] || {};
    const rawUrl = typeof configured.url === 'string' ? configured.url : undefined;
    return {
      key: item.key,
      label: configured.label || item.label,
      detail: configured.detail || item.detail,
      url: (rawUrl || '').trim() || item.url,
      overrideBlank: rawUrl !== undefined && !rawUrl.trim(),
      overrodeUrl: Boolean((rawUrl || '').trim()) && rawUrl.trim() !== item.url,
    };
  });
}

/** "2.49.85 · exe" 같은 라벨에서 버전만 뽑는다. */
function labelVersion(detail) {
  const hit = /(\d+\.\d+\.\d+)/.exec(String(detail || ''));
  return hit ? hit[1] : '';
}

async function checkDownloadLinks(siteContent) {
  const catalog = readRepoJson('spa/src/data/download-catalog.json');
  if (!catalog) {
    return [fail('download.catalog', '다운로드 카탈로그', 'spa/src/data/download-catalog.json 을 읽을 수 없다')];
  }

  const results = [];
  const blanks = [];
  const mismatches = [];
  const probes = [];

  for (const productKey of ['naver', 'leword', 'orbit']) {
    const product = catalog[productKey];
    if (!product) continue;
    const resolved = resolveDownloads(product, siteContent?.downloads?.[productKey]);
    for (const item of resolved) {
      if (item.overrideBlank) blanks.push(`${productKey}/${item.key}`);
      const urlVersion = labelVersion(item.url);
      const detailVersion = labelVersion(item.detail);
      if (urlVersion && detailVersion && urlVersion !== detailVersion) {
        mismatches.push(`${productKey}/${item.key}: 표기 ${detailVersion} ≠ 파일 ${urlVersion}`);
      }
      probes.push({ id: `${productKey}/${item.key}`, url: item.url, overrode: item.overrodeUrl });
    }
  }

  const linkResults = await Promise.all(probes.map((p) => probeLink(p.url)));
  const dead = probes
    .map((probe, index) => ({ ...probe, ...linkResults[index] }))
    .filter((entry) => !entry.alive);

  results.push(
    dead.length === 0
      ? ok('download.links', '다운로드 링크 생존', `${probes.length}개 전부 응답 (관리자 설정 반영 후 최종 주소)`)
      : fail(
          'download.links',
          '다운로드 링크 생존',
          `${dead.length}/${probes.length}개가 죽었다 — ${dead.map((d) => `${d.id}(HTTP ${d.status})`).join(', ')}`,
          '구매자가 받을 수 없는 상태다. 어드민 다운로드 URL 또는 릴리스 태그를 확인할 것',
        ),
  );

  results.push(
    blanks.length === 0
      ? ok('download.blank-override', '관리자 URL 빈 값', '빈 값으로 덮인 항목 없음')
      : warn(
          'download.blank-override',
          '관리자 URL 빈 값',
          `${blanks.length}건이 빈 문자열로 저장돼 있다 — ${blanks.join(', ')}`,
          '지금은 기본값이 받쳐 주지만, 기본값을 지우는 순간 조용히 빈 버튼이 된다',
        ),
  );

  results.push(
    mismatches.length === 0
      ? ok('download.version-label', '버전 표기 일치', '표기한 버전과 실제 파일 버전이 같다')
      : warn(
          'download.version-label',
          '버전 표기 일치',
          `${mismatches.length}건 불일치 — ${mismatches.join(' / ')}`,
          '구매자에게 다른 버전을 안내하는 중이다',
        ),
  );

  return results;
}

async function checkPaymentKeys() {
  const source = readRepoText('spa/src/pages/PricingPage.tsx');
  if (!source) return [fail('payment.key', '결제 클라이언트 키', 'PricingPage.tsx 를 읽을 수 없다')];

  const keyHit = /const TOSS_CLIENT_KEY = '([^']+)'/.exec(source);
  const results = [];
  if (!keyHit) {
    results.push(fail('payment.key', '결제 클라이언트 키', 'TOSS_CLIENT_KEY 를 찾지 못했다 — 결제창이 열리지 않는다'));
  } else if (keyHit[1].startsWith('test_ck_')) {
    results.push(
      fail('payment.key', '결제 클라이언트 키', '테스트 키가 배포본에 박혀 있다', '실결제가 되지 않는다. live_ck_ 키로 교체할 것'),
    );
  } else if (!keyHit[1].startsWith('live_ck_')) {
    results.push(warn('payment.key', '결제 클라이언트 키', `형식이 낯설다: ${keyHit[1].slice(0, 12)}…`));
  } else {
    results.push(ok('payment.key', '결제 클라이언트 키', `live_ck_ 키 확인 (…${keyHit[1].slice(-6)})`));
  }

  const sdk = await probeLink(TOSS_SDK_URL, 15000);
  results.push(
    sdk.alive
      ? ok('payment.sdk', '토스 결제 SDK', `${TOSS_SDK_URL} 응답 ${sdk.status}`)
      : fail('payment.sdk', '토스 결제 SDK', `SDK 를 못 받는다 (HTTP ${sdk.status})`, 'SDK 가 없으면 결제 버튼이 아무 일도 안 한다'),
  );
  return results;
}

/**
 * 요금제 정합 — 2배 청구 사고의 재발 방지.
 * 코드 상수(전환 시각)와 관리자 안내 문구의 날짜가 어긋나면 실패시킨다.
 */
function checkPricingAlignment(siteContent) {
  const source = readRepoText('spa/src/lib/pricingSchedule.ts');
  if (!source) return [fail('pricing.switch', '요금 전환 시각', 'pricingSchedule.ts 를 읽을 수 없다')];

  const hit = /Date\.UTC\((\d+),\s*(\d+),\s*(\d+)/.exec(source);
  if (!hit) return [fail('pricing.switch', '요금 전환 시각', 'PRICING_SWITCH_AT_MS 를 파싱하지 못했다')];

  // Date.UTC 의 월은 0부터다. KST 로 환산하면 하루가 넘어간다.
  const switchKst = new Date(Date.UTC(Number(hit[1]), Number(hit[2]), Number(hit[3]), 15, 0, 0) + 9 * 3600 * 1000);
  const codeYear = switchKst.getUTCFullYear();
  const codeMonth = switchKst.getUTCMonth() + 1;
  const codeDay = switchKst.getUTCDate();
  const codeLabel = `${codeYear}-${String(codeMonth).padStart(2, '0')}-${String(codeDay).padStart(2, '0')}`;

  const notice = [siteContent?.pricing?.page?.eventDesc, siteContent?.pricing?.page?.eventLine, siteContent?.pricing?.page?.eventTitle]
    .filter(Boolean)
    .join(' ');
  const results = [];

  if (!notice) {
    results.push(skip('pricing.switch', '요금 전환 시각', `코드 ${codeLabel} — 대조할 관리자 문구가 없다`));
  } else {
    const noticeHit = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(notice);
    if (!noticeHit) {
      results.push(warn('pricing.switch', '요금 전환 시각', `코드 ${codeLabel} — 관리자 문구에서 날짜를 못 찾았다`, notice.slice(0, 80)));
    } else if (Number(noticeHit[1]) === codeYear && Number(noticeHit[2]) === codeMonth && Number(noticeHit[3]) === codeDay) {
      results.push(ok('pricing.switch', '요금 전환 시각', `코드와 안내 문구 모두 ${codeLabel}`));
    } else {
      results.push(
        fail(
          'pricing.switch',
          '요금 전환 시각',
          `코드 ${codeLabel} ≠ 안내 ${noticeHit[1]}-${noticeHit[2]}-${noticeHit[3]}`,
          '2026-08-01~07 에 전 유료플랜이 2배 청구된 것과 같은 어긋남이다',
        ),
      );
    }
  }

  // 이벤트가가 정상가보다 비싸면 순서가 뒤집힌 것이다.
  const inverted = Object.entries(siteContent?.pricing?.plans || {})
    .filter(([, plan]) => Number(plan?.futureAmount) > 0 && Number(plan?.amount) > Number(plan.futureAmount))
    .map(([id]) => id);
  results.push(
    inverted.length === 0
      ? ok('pricing.order', '이벤트가 ≤ 정상가', '모든 플랜에서 순서가 맞다')
      : fail('pricing.order', '이벤트가 ≤ 정상가', `뒤집힌 플랜: ${inverted.join(', ')}`),
  );
  return results;
}

/** 라이선스 발급·조회 경로. 없는 주문을 물어 "정상적인 없음"이 오는지 본다. */
async function checkLicensePath() {
  const results = [];

  const health = await gasGet('health');
  results.push(
    health.json?.ok
      ? ok('gas.health', 'GAS 응답', `${health.ms}ms`)
      : fail('gas.health', 'GAS 응답', health.parseError || `HTTP ${health.status}`, 'GAS 가 죽으면 결제·라이선스·공지가 전부 멈춘다'),
  );

  // 실제로 없는 주문번호. 발급 경로가 살아 있으면 "찾지 못했다"가 와야 하고,
  // 액션 자체가 사라졌으면 Unknown action 이 온다. 이 둘은 완전히 다른 사건이다.
  const probeOrder = `HARNESS-NOT-A-REAL-ORDER-${Date.now()}`;
  const lookup = await gasGet('check-order', { orderId: probeOrder, callback: 'cb' });
  if (!lookup.json) {
    results.push(fail('license.lookup', '주문·라이선스 조회', lookup.parseError || `HTTP ${lookup.status}`));
  } else if (/unknown action/i.test(String(lookup.json.error || ''))) {
    results.push(fail('license.lookup', '주문·라이선스 조회', 'check-order 액션이 사라졌다', '구매자가 라이선스를 못 받는다'));
  } else {
    results.push(ok('license.lookup', '주문·라이선스 조회', '없는 주문에 정상 응답 — 발급 경로 살아 있음'));
  }

  const byEmail = await gasGet('lookup-by-email', { email: 'harness-probe@example.invalid', callback: 'cb' });
  results.push(
    byEmail.json && !/unknown action/i.test(String(byEmail.json.error || ''))
      ? ok('license.by-email', '이메일 라이선스 조회', '응답 정상')
      : fail('license.by-email', '이메일 라이선스 조회', byEmail.parseError || 'lookup-by-email 이 응답하지 않는다'),
  );

  // 구독 결제(빌링) 등록 경로가 살아 있는지. 인자가 모자란 요청이므로
  // 성공하면 안 되고, "액션 없음"이 아니라 "인자 부족"으로 거절되어야 한다.
  const billing = await gasGet('register-billing', { callback: 'cb' });
  results.push(
    billing.json && !/unknown action/i.test(String(billing.json.error || ''))
      ? ok('license.billing', '정기결제 등록 경로', '액션 등록됨')
      : fail('license.billing', '정기결제 등록 경로', 'register-billing 액션이 응답하지 않는다'),
  );

  return results;
}

/** 구매자가 실제로 밟는 페이지들이 열리는지. */
async function checkPurchasePages() {
  const paths = ['/pricing', '/download', '/lookup'];
  const results = await Promise.all(paths.map((path) => probeLink(`https://leaderspro.kr${path}`, 15000)));
  const dead = paths.filter((_, index) => !results[index].alive);
  return [
    dead.length === 0
      ? ok('purchase.pages', '구매 경로 페이지', `${paths.join(' · ')} 전부 열림`)
      : fail('purchase.pages', '구매 경로 페이지', `열리지 않는 경로: ${dead.join(', ')}`),
  ];
}

export const purchaseProbe = {
  id: 'purchase',
  title: '구매 흐름 (매출 직결)',
  async run() {
    const siteContentResponse = await gasGet('site-content');
    const siteContent = siteContentResponse.json?.content || null;
    const contentCheck = siteContent
      ? ok('gas.site-content', '관리자 콘텐츠 로드', `${siteContentResponse.ms}ms`)
      : fail(
          'gas.site-content',
          '관리자 콘텐츠 로드',
          siteContentResponse.parseError || '내용이 비어 있다',
          '요금·다운로드 주소가 전부 기본값으로만 서빙된다',
        );

    const lanes = await collect([
      { id: 'download', label: '다운로드', run: () => checkDownloadLinks(siteContent) },
      { id: 'payment', label: '결제', run: () => checkPaymentKeys() },
      { id: 'pricing', label: '요금', run: async () => checkPricingAlignment(siteContent) },
      { id: 'license', label: '라이선스', run: () => checkLicensePath() },
      { id: 'pages', label: '페이지', run: () => checkPurchasePages() },
    ]);

    return [contentCheck, ...lanes.flat().filter(Boolean)].map((entry) =>
      entry.status ? entry : check(entry.id, entry.label, 'warn', '결과 형식이 이상하다'),
    );
  },
};

export default purchaseProbe;
