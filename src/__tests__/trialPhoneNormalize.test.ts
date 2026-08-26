import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-26 사장님 실측] 같은 번호로 인증했는데 이 메시지가 떴다.
 *   "이 PC 에서는 이미 다른 번호로 무료 체험을 사용했습니다 (107****1645)"
 * 마스킹된 번호가 곧 입력한 번호였다.
 *
 * 원인: 시트가 전화번호를 숫자로 저장하며 앞의 0을 날렸다.
 *   입력 01075451645(11자리) vs 시트 1075451645(10자리) → 문자열 비교 실패
 *   → "본인 행" 을 못 찾고 같은 기기ID가 걸려 기기 중복으로 떨어졌다.
 *
 * 고침은 GAS 쪽이라(사장님 배포) 여기서는 그 파일이 실제로 고쳐져 있는지 잠근다.
 */
const GAS_PATH = 'C:/Users/박성현/Desktop/admin-panel/google-apps-script-code.gs';

const readGas = (): string | null => {
  try {
    return readFileSync(GAS_PATH, 'utf-8');
  } catch {
    return null; // 다른 PC·CI 에서는 이 파일이 없다 — 건너뛴다.
  }
};

describe('체험 전화번호 정규화 (GAS)', () => {
  const gas = readGas();

  it.skipIf(!gas)('정규화 함수가 있고 뒤 10자리로 비교한다', () => {
    expect(gas).toMatch(/function normalizeTrialPhone_/);
    expect(gas).toMatch(/function isSameTrialPhone_/);
    expect(gas).toMatch(/digits\.slice\(-10\)/);
  });

  it.skipIf(!gas)('국가번호(82)도 흡수한다', () => {
    expect(gas).toMatch(/indexOf\('82'\) === 0/);
  });

  it.skipIf(!gas)('문자열 직접 비교가 코드에 남아 있지 않다', () => {
    // 주석에는 "문자열 비교(rowPhone === phone)가 어긋나…" 처럼 원인 설명으로 남아 있다.
    // 코드 줄만 본다 — 주석 줄(*, //)을 걷어내고 검사한다.
    const codeOnly = (gas || '')
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return t !== '' && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/rowPhone === phone/);
    expect(codeOnly).not.toMatch(/bPhone === phone\)/);
    expect(codeOnly).not.toMatch(/rowPhone !== phone/);
  });

  it.skipIf(!gas)('조회는 createTextFinder 가 아니라 정규화 비교로 한다', () => {
    // createTextFinder 는 시트에 적힌 문자열 그대로만 찾아 앞의 0을 넘지 못한다.
    expect(gas).not.toMatch(/createTextFinder\(phone\)/);
    expect(gas).toMatch(/function findTrialRowByPhone_[\s\S]{0,900}isSameTrialPhone_/);
  });

  it.skipIf(!gas)('같은 번호가 여러 행이면 가장 최근 행을 쓴다', () => {
    expect(gas).toMatch(/가장 최근 등록 행을 돌려준다/);
  });
});

describe('중복 체험 행 정리 (GAS)', () => {
  const gas = readGas();

  it.skipIf(!gas)('정리 함수가 있다', () => {
    expect(gas).toMatch(/function mergeDuplicateTrialPhones/);
  });

  it.skipIf(!gas)('이메일 없는 최근 행을 남긴다 — 사장님 지시', () => {
    expect(gas).toMatch(/이메일이 빈 행 중 가장 최근/);
    expect(gas).toMatch(/var noEmail = rows\.filter/);
  });

  it.skipIf(!gas)('등록일과 차단은 지운 행에서도 지킨다 — 체험 재시작 구멍 방지', () => {
    expect(gas).toMatch(/registeredAt : 가장 \*\*이른\*\* 값/);
    expect(gas).toMatch(/하나라도 차단이면 차단/);
  });

  it.skipIf(!gas)('전화번호를 텍스트로 다시 써 앞의 0을 지킨다', () => {
    expect(gas).toMatch(/setNumberFormat\('@'\)/);
    expect(gas).toMatch(/if \(phoneText\.length === 10\) phoneText = '0' \+ phoneText/);
  });
});

/**
 * 관리자 패널(폰으로 급할 때 보는 화면)도 같은 규칙을 쓰는지 잠근다.
 * 백엔드만 고치면 패널은 여전히 "01075451645" 로 검색해도 못 찾는다 —
 * 시트에 앞의 0이 없는 행이 남아 있는 동안 특히 그렇다.
 */
const PANEL_PATH = 'C:/Users/박성현/Desktop/admin-panel/index.html';
const readPanel = (): string | null => {
  try {
    return readFileSync(PANEL_PATH, 'utf-8');
  } catch {
    return null;
  }
};

describe('관리자 패널 전화번호 (surge)', () => {
  const panel = readPanel();

  it.skipIf(!panel)('검색이 앞의 0을 가리지 않는다', () => {
    expect(panel).toMatch(/function normalizeTrialPhoneForSearch/);
    expect(panel).toMatch(/function matchTrialPhone/);
    // 예전의 단순 포함 검사가 필터에 남아 있으면 안 된다.
    expect(panel).not.toMatch(/\(u\.phone \|\| ''\)\.includes\(keyword\)/);
  });

  it.skipIf(!panel)('두 필터(로드·입력) 모두 새 판정을 쓴다', () => {
    const hits = (panel || '').match(/matchTrialPhone\(u\.phone, keyword\)/g) || [];
    expect(hits.length).toBe(2);
  });

  it.skipIf(!panel)('화면에는 앞의 0을 살려 보여준다', () => {
    expect(panel).toMatch(/function formatTrialPhone/);
    expect(panel).toMatch(/formatTrialPhone\(u\.phone\)/);
    // 휴대폰(10자리, 1로 시작)만 복원한다 — 지역번호는 건드리지 않는다.
    expect(panel).toMatch(/digits\.length === 10 && digits\.charAt\(0\) === '1'/);
  });

  it.skipIf(!panel)('GAS 와 같은 정규화 규칙을 쓴다 (뒤 10자리·국가번호)', () => {
    expect(panel).toMatch(/digits\.slice\(-10\)/);
    expect(panel).toMatch(/indexOf\('82'\) === 0/);
  });
});

/**
 * [2026-08-26] 인증 응답이 12.8초 걸려 설치본(제한시간 10초)이 먼저 끊었다.
 * 원인은 한 번의 인증에 시트를 통째로 세 번 읽은 것이다 —
 * 충돌 판정 / 이름 소유자 판정 / 행 조회가 각자 getDataRange().getValues() 를 불렀다.
 * 서버를 빠르게 만들면 앱 릴리즈 없이도 구버전에서 통과한다.
 */
describe('체험 인증 서버 응답 속도 (GAS)', () => {
  const gas = readGas();

  it.skipIf(!gas)('세 판정이 미리 읽은 데이터를 나눠 쓴다', () => {
    expect(gas).toMatch(/function findTrialConflict_\(sheet, email, phone, deviceId, preloaded\)/);
    expect(gas).toMatch(/function findTrialNameOwner_\(sheet, phone, nickname, preloaded\)/);
    expect(gas).toMatch(/function findTrialRowByPhone_\(sheet, phone, preloaded\)/);
    // 안 넘기면 예전대로 스스로 읽는다 — 다른 호출부를 깨지 않는다.
    expect(gas).toMatch(/preloaded \|\| sheet\.getDataRange\(\)\.getValues\(\)/);
  });

  it.skipIf(!gas)('trial-verify 는 시트를 한 번만 읽는다', () => {
    const body = (gas || '').slice((gas || '').indexOf('function handleTrialVerify'));
    const scope = body.slice(0, body.indexOf('\n}'));
    // 주석에 "예전에는 …getValues() 를 불러" 처럼 원인 설명이 남아 있다 — 코드 줄만 센다.
    const codeOnly = scope
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    const reads = codeOnly.match(/getDataRange\(\)\.getValues\(\)/g) || [];
    expect(reads.length).toBe(1);
    expect(scope).toMatch(/findTrialConflict_\(sheet, '', phone, deviceId, trialData\)/);
    expect(scope).toMatch(/findTrialNameOwner_\(sheet, phone, nickname, trialData\)/);
    expect(scope).toMatch(/findTrialRowByPhone_\(sheet, phone, trialData\)/);
  });

  it.skipIf(!gas)('인증번호 발송도 시트를 한 번만 열고 한 번만 읽는다', () => {
    expect(gas).toMatch(/var reqSheet = getTrialSheet\(trialProduct_\(data\)\)/);
    expect(gas).toMatch(/findTrialConflict_\(reqSheet, email, phone, deviceId, reqData\)/);
    expect(gas).toMatch(/findTrialNameOwner_\(reqSheet, phone, reqNickname, reqData\)/);
  });

  it.skipIf(!gas)('체험 등록도 한 번만 읽는다', () => {
    expect(gas).toMatch(/var actData = sheet\.getDataRange\(\)\.getValues\(\)/);
    expect(gas).toMatch(/findTrialConflict_\(sheet, email, phone, deviceId, actData\)/);
    expect(gas).toMatch(/findTrialRowByPhone_\(sheet, phone, actData\)/);
  });
});

/**
 * [2026-08-26 사장님 실측] 중복 정리를 돌린 뒤에도 화면에 1072025380 / 1023783646 처럼
 * 앞의 0 없는 번호가 남아 있었다. 정리는 중복(2행 이상)만 손대고 단일 행은 건너뛴다.
 * 비교는 정규화가 흡수하지만, 보이는 값이 실제와 다르면 볼 때마다 의심하게 된다.
 */
describe('단일 행도 전화번호 형식을 바로잡는다 (GAS)', () => {
  const gas = readGas();

  it.skipIf(!gas)('정리 후 전체 행의 앞자리 0을 복원하는 단계가 있다', () => {
    expect(gas).toMatch(/남은 모든 행의 전화번호 형식을 한 번에 바로잡는다/);
    expect(gas).toMatch(/var fixedCount = 0;/);
    expect(gas).toMatch(/앞자리 0 복원/);
  });

  it.skipIf(!gas)('휴대폰만 복원하고 지역번호는 건드리지 않는다', () => {
    expect(gas).toMatch(/digits\.length === 10 && digits\.charAt\(0\) === '1'/);
  });

  it.skipIf(!gas)('열 전체를 한 번에 쓴다 — 행마다 쓰면 실행 시간이 터진다', () => {
    expect(gas).toMatch(/var phoneRange = sheet\.getRange\(2, 3, phoneColumn\.length, 1\)/);
    expect(gas).toMatch(/phoneRange\.setNumberFormat\('@'\)/);
    expect(gas).toMatch(/phoneRange\.setValues\(phoneColumn\)/);
  });
});
