/**
 * 어드민·저장 경로 점검.
 *
 * 어제 사고의 교훈이 두 개 들어 있다:
 *  1. 스크립트 속성에 공백이 섞여 정답 토큰과 오답 토큰이 **똑같이** 실패했다.
 *     응답이 같으면 비교 자체가 깨진 것이다. 그래서 여기서는 "거절되는가"가 아니라
 *     "거절 방식이 서로 다른가"를 본다.
 *  2. handleLogin 이 두 개라 실제로 도는 쪽이 부르는 액션은 GAS 에 없었다.
 *     액션 미등록('Unknown action')과 인증 실패('Unauthorized')를 구분해야 잡힌다.
 *
 * 비밀번호는 쓰지 않는다. 하네스가 실제 자격증명을 들고 있으면 그게 새 유출 경로다.
 */
import { fail, gasPost, ok, request, warn } from './lib.mjs';

const UNKNOWN_ACTION = /unknown action/i;
const UNAUTHORIZED = /unauthorized/i;

function errorText(response) {
  return String(response.json?.error || response.json?.message || '');
}

/** 로그인 액션이 등록돼 있는지. 틀린 자격증명으로만 두드린다. */
async function checkLoginRegistered() {
  const response = await gasPost({
    action: 'admin-password-login',
    id: 'harness-probe',
    password: 'harness-probe-not-a-password',
  });

  if (!response.json) {
    return fail('admin.login', '로그인 액션', response.parseError || `HTTP ${response.status}`);
  }
  const error = errorText(response);
  if (UNKNOWN_ACTION.test(error)) {
    return fail(
      'admin.login',
      '로그인 액션',
      'admin-password-login 이 GAS 에 없다',
      '어드민이 부르는 액션이 서버에 없으면 아무리 해시를 맞춰도 못 들어간다',
    );
  }
  if (UNAUTHORIZED.test(error)) {
    return fail(
      'admin.login',
      '로그인 액션',
      'publicActions 에서 빠졌다 — 로그인하려면 토큰이 필요한 모순 상태',
      'admin-password-login 을 publicActions 목록에 넣어야 한다',
    );
  }
  if (response.json.ok === true || response.json.success === true) {
    return fail(
      'admin.login',
      '로그인 액션',
      '아무 자격증명이나 통과됐다',
      '해시 대조가 동작하지 않는다. 누구나 관리자로 들어올 수 있다',
    );
  }
  return ok('admin.login', '로그인 액션', '틀린 자격증명을 정상적으로 거절 — 대조 동작 중');
}

/**
 * 토큰 비교가 살아 있는지. 서로 다른 오답 두 개를 던져 응답이 갈리는지 본다.
 * 공백 사고 때는 정답까지 포함해 전부 같은 응답이었다.
 */
async function checkTokenComparison() {
  const [missing, wrong] = await Promise.all([
    gasPost({ action: 'list' }),
    gasPost({ action: 'list', adminSessionToken: `harness-invalid-${Date.now()}` }),
  ]);

  if (!missing.json || !wrong.json) {
    return fail('admin.token', '관리자 토큰 대조', (missing.parseError || wrong.parseError) || '응답을 읽지 못했다');
  }
  const missingError = errorText(missing);
  if (UNKNOWN_ACTION.test(missingError)) {
    return fail('admin.token', '관리자 토큰 대조', "저장 계열 'list' 액션이 사라졌다");
  }
  if (missing.json.ok === true || wrong.json.ok === true) {
    return fail('admin.token', '관리자 토큰 대조', '토큰 없이도 관리자 데이터가 나온다', '고객 자격증명이 그대로 노출된다');
  }
  return ok('admin.token', '관리자 토큰 대조', '토큰 없는 요청·틀린 토큰 모두 거절');
}

/** 저장 계열 액션이 전부 등록돼 있는지. 사라진 액션은 화면에서 조용히 실패한다. */
async function checkSaveActions() {
  // 이름은 Code.js 의 doPost switch 에서 확인한 실제 액션이다. 추측 금지 —
  // 없는 이름을 넣으면 하네스가 매번 거짓 실패를 뱉는다.
  const actions = ['site-content-save', 'submit-notice', 'update-notice', 'update-settings', 'issue', 'bank-approve'];
  const responses = await Promise.all(actions.map((action) => gasPost({ action })));

  const missing = [];
  const unreadable = [];
  responses.forEach((response, index) => {
    if (!response.json) {
      unreadable.push(actions[index]);
      return;
    }
    if (UNKNOWN_ACTION.test(errorText(response))) missing.push(actions[index]);
  });

  if (unreadable.length > 0) {
    return warn('admin.save-actions', '저장 액션 등록', `응답을 못 읽은 액션: ${unreadable.join(', ')}`);
  }
  if (missing.length > 0) {
    return fail(
      'admin.save-actions',
      '저장 액션 등록',
      `GAS 에 없는 액션: ${missing.join(', ')}`,
      '어드민에서 저장 버튼을 눌러도 아무 일이 안 일어난다',
    );
  }
  return ok('admin.save-actions', '저장 액션 등록', `${actions.length}개 전부 등록됨 (토큰 없이 정상 거절)`);
}

/**
 * 공개 관리자 번들에서 비밀이 새는지.
 *
 * `/admin/` 이 공개인 것 자체는 의도된 상태다(사장님이 그 주소로 로그인한다).
 * 진짜 위험은 그 번들 안에 **오프라인으로 깰 수 있는 것**이 실려 나가는 경우다.
 * 예전에 관리자 토큰이 그대로 박혀 있었고, 그때는 로그인 화면이 장식이었다.
 */
async function checkAdminBundleSecrets() {
  const response = await request('https://leaderspro.kr/admin/', { timeoutMs: 20000 });
  if (!response.okStatus) {
    return response.status === 404
      ? ok('admin.bundle', '공개 관리자 번들', '배포되지 않음')
      : warn('admin.bundle', '공개 관리자 번들', `읽지 못했다 (HTTP ${response.status})`);
  }

  const body = response.text;
  const liveSecrets = body.match(/live_sk_[A-Za-z0-9]{8,}/g) || [];
  const filledToken = /ADMIN_TOKEN\s*[:=]\s*['"][^'"]{8,}['"]/.test(body);
  if (liveSecrets.length > 0 || filledToken) {
    return fail(
      'admin.bundle',
      '공개 관리자 번들',
      filledToken ? 'ADMIN_TOKEN 이 값과 함께 박혀 있다' : '라이브 시크릿 키가 박혀 있다',
      '누구나 관리자 API 를 그대로 부를 수 있다. 즉시 토큰·키 재발급',
    );
  }

  // 솔트 없는 sha256 은 짧은 비밀번호면 오프라인에서 몇 초 만에 깨진다.
  const bareHashes = (body.match(/ADMIN_(?:ID|PW)_HASH\s*[:=]\s*['"][a-f0-9]{64}['"]/g) || []).length;
  return bareHashes > 0
    ? warn(
        'admin.bundle',
        '공개 관리자 번들',
        `솔트 없는 자격증명 해시 ${bareHashes}개가 공개 서빙된다`,
        'GAS 쪽 비밀번호와 같은 값이면 오프라인 대입에 노출된다. 죽은 코드면 지울 것',
      )
    : ok('admin.bundle', '공개 관리자 번들', '토큰·시크릿·자격증명 해시 없음');
}

export const adminProbe = {
  id: 'admin',
  title: '어드민 · 저장 경로',
  async run() {
    const settled = await Promise.allSettled([
      checkLoginRegistered(),
      checkTokenComparison(),
      checkSaveActions(),
      checkAdminBundleSecrets(),
    ]);
    return settled.map((entry, index) =>
      entry.status === 'fulfilled'
        ? entry.value
        : fail(`admin.probe-${index}`, '어드민 점검', `점검이 실패했다: ${entry.reason?.message || entry.reason}`),
    );
  },
};

export default adminProbe;
