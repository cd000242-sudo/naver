import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * [2026-08-25 사장님 실측] "하나의 PC에 하나의 번호만 인증 가능해야 하는데,
 * 아무 이름 넣고 아무 번호 넣으니까 또 사용 가능하다."
 *
 * 원인: 전화번호를 본인 확인 키로 바꾸면서 기기 조건이 통째로 빠졌다. 남은
 * findTrialConflict_ 는 '차단된 행'만 보므로, 차단 이력이 없는 PC 에서 새 번호를
 * 넣으면 매번 새 체험 행이 생겼다.
 *
 * 이 테스트는 소스 문자열이 아니라 실제 판정 함수를 꺼내 돌린다 — 문구만 맞고
 * 동작은 안 하는 잠금을 만들지 않기 위해서다.
 */

/** GAS 소스에서 함수 하나의 본문을 통째로 잘라낸다(중괄호 균형 기준). */
function sliceFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);

  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  expect(end, `${name} must be balanced`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * GAS 소스에서 순수 함수를 꺼내 실행 가능한 형태로 만든다.
 * deps 로 같은 스코프에 함께 넣을 의존 함수를 지정한다 — 빠뜨리면 호출 시점에
 * ReferenceError 로 터진다(작성 중 실제로 겪었다).
 */
function extractFunction<T extends (...args: any[]) => any>(
  source: string,
  name: string,
  deps: readonly string[] = [],
): T {
  const bodies = [...deps, name].map((fn) => sliceFunction(source, fn)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(`${bodies}; return ${name};`)() as T;
}

const rootSource = readFileSync(resolve(process.cwd(), 'GAS_결제주문관리.js'), 'utf8');

/*
 * 배포본은 payment-page/.gas-license-backend/ 아래에 있는데 이 경로는 .gitignore 대상이다
 * (.gitignore:63). 즉 새로 받은 저장소에는 존재하지 않는다. 있으면 검사하고 없으면 건너뛴다 —
 * 없다고 실패시키면 남의 체크아웃에서 애먼 빨간불이 뜬다.
 */
const deployedPath = resolve(process.cwd(), 'payment-page/.gas-license-backend/Code.js');
const deployedSource = existsSync(deployedPath) ? readFileSync(deployedPath, 'utf8') : '';
const describeDeployed = deployedSource ? describe : describe.skip;

type Row = unknown[];
/** 시트 컬럼: 0 email, 1 nickname, 2 phone, 3 deviceId, 4 appVersion, 5 blocked, ... */
function row(phone: string, deviceId: string): Row {
  return ['', '닉', phone, deviceId, '2.11.212', 'false', '', '', 1];
}
const HEADER: Row = ['email', 'nickname', 'phone', 'deviceId', 'ver', 'blocked', 'reg', 'last', 'cnt'];

const PC_A = 'a'.repeat(32); // 실제 deviceId 는 sha256 앞 32자
const PC_B = 'b'.repeat(32);

const findOwner = extractFunction<
  (allData: Row[], deviceId: string, phone: string) => { phone: string } | null
>(rootSource, 'findTrialDeviceOwner_');

const maskPhone = extractFunction<(phone: string) => string>(rootSource, 'maskTrialPhone_');

describe('한 PC 에는 한 번호만 — 판정 동작', () => {
  it('같은 PC 에서 다른 번호로 새로 신청하면 잡아낸다 (실측 우회 경로)', () => {
    const sheet = [HEADER, row('01011112222', PC_A)];
    const owner = findOwner(sheet, PC_A, '01099998888');
    expect(owner).not.toBeNull();
    expect(owner!.phone).toBe('01011112222');
  });

  it('같은 번호가 같은 PC 로 돌아오는 것은 막지 않는다 (재설치·재인증)', () => {
    const sheet = [HEADER, row('01011112222', PC_A)];
    expect(findOwner(sheet, PC_A, '01011112222')).toBeNull();
  });

  it('다른 PC 에서는 막지 않는다', () => {
    const sheet = [HEADER, row('01011112222', PC_A)];
    expect(findOwner(sheet, PC_B, '01099998888')).toBeNull();
  });

  it('빈/짧은 deviceId 로는 아무도 막지 않는다 (오탐 차단)', () => {
    const sheet = [HEADER, row('01011112222', PC_A)];
    for (const bad of ['', '   ', 'short', 'a'.repeat(15)]) {
      expect(findOwner(sheet, bad, '01099998888'), bad).toBeNull();
    }
  });

  it('기기 칸이 빈 옛날 행은 근거로 쓰지 않는다', () => {
    const sheet = [HEADER, row('01011112222', '')];
    expect(findOwner(sheet, PC_A, '01099998888')).toBeNull();
  });

  it('번호 칸이 빈 행은 근거로 쓰지 않는다', () => {
    const sheet = [HEADER, row('', PC_A)];
    expect(findOwner(sheet, PC_A, '01099998888')).toBeNull();
  });

  it('행이 헤더뿐이어도 터지지 않는다', () => {
    expect(findOwner([HEADER], PC_A, '01011112222')).toBeNull();
  });
});

describe('안내 문구 — 번호를 그대로 노출하지 않는다', () => {
  it('가운데를 가린다', () => {
    expect(maskPhone('01011112222')).toBe('010****2222');
  });

  it('하이픈이 있어도 같다', () => {
    expect(maskPhone('010-1111-2222')).toBe('010****2222');
  });

  it('이상한 값에 터지지 않는다', () => {
    expect(maskPhone('')).toBe('***');
    expect(maskPhone('123')).toBe('***');
  });
});

describeDeployed('배포본도 같은 규칙을 갖는다', () => {
  const deployedFindOwner = extractFunction<
    (sheet: { getDataRange(): { getValues(): Row[] } }, deviceId: string, phone: string) => { phone: string } | null
  >(deployedSource, 'findDeviceTrialOwner_');

  const fakeSheet = (rows: Row[]) => ({ getDataRange: () => ({ getValues: () => rows }) });

  it('같은 PC 다른 번호를 잡는다', () => {
    const owner = deployedFindOwner(fakeSheet([HEADER, row('01011112222', PC_A)]), PC_A, '01099998888');
    expect(owner?.phone).toBe('01011112222');
  });

  it('같은 번호는 통과시킨다', () => {
    expect(deployedFindOwner(fakeSheet([HEADER, row('01011112222', PC_A)]), PC_A, '01011112222')).toBeNull();
  });
});

describe('배선 — 두 진입점 모두 막는다', () => {
  it('루트 백엔드의 verify/activate 가 모두 기기 조건을 부른다', () => {
    const verifyStart = rootSource.indexOf('function handleTrialVerify(data)');
    const activateStart = rootSource.indexOf('function handleTrialActivate(data)');
    const verifyBody = rootSource.slice(verifyStart, activateStart);
    const activateBody = rootSource.slice(activateStart, rootSource.indexOf('// ── trial-list:', activateStart));

    expect(verifyBody).toContain('findTrialDeviceOwner_');
    expect(activateBody).toContain('findTrialDeviceOwner_');
  });

  it.skipIf(!deployedSource)('배포본의 verify/activate 가 모두 기기 조건을 부른다', () => {
    const verifyStart = deployedSource.indexOf('function handleTrialVerify(data)');
    const activateStart = deployedSource.indexOf('function handleTrialActivate(data)');
    expect(verifyStart).toBeGreaterThan(-1);
    expect(activateStart).toBeGreaterThan(-1);

    const verifyBody = deployedSource.slice(verifyStart, verifyStart + 3000);
    const activateBody = deployedSource.slice(activateStart, activateStart + 3000);
    expect(verifyBody).toContain('findDeviceTrialOwner_');
    expect(activateBody).toContain('findDeviceTrialOwner_');
  });
});

const findNameOwner = extractFunction<
  (allData: Row[], phone: string, nickname: string) => { name: string } | null
>(rootSource, 'findTrialNameOwner_', ['normalizeTrialName_']);

const maskName = extractFunction<(name: string) => string>(rootSource, 'maskTrialName_');

/** 이름 칸까지 채운 행. 컬럼 1 = nickname. */
function namedRow(phone: string, deviceId: string, nickname: string): Row {
  return ['', nickname, phone, deviceId, '2.11.212', 'false', '', '', 1];
}

describe('한 번호에는 한 이름만 — 판정 동작', () => {
  it('같은 번호에 다른 이름으로 신청하면 잡아낸다 (사장님 요청)', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, '박사장')];
    const owner = findNameOwner(sheet, '01011112222', '김철수');
    expect(owner).not.toBeNull();
    expect(owner!.name).toBe('박사장');
  });

  it('같은 이름으로 다시 오는 것은 막지 않는다', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, '박사장')];
    expect(findNameOwner(sheet, '01011112222', '박사장')).toBeNull();
  });

  it('공백·대소문자 표기 흔들림은 같은 이름으로 본다', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, 'Park Sajang')];
    expect(findNameOwner(sheet, '01011112222', 'parksajang')).toBeNull();
    expect(findNameOwner(sheet, '01011112222', ' Park  Sajang ')).toBeNull();
  });

  it('다른 번호의 이름은 상관하지 않는다', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, '박사장')];
    expect(findNameOwner(sheet, '01099998888', '김철수')).toBeNull();
  });

  it('이름이 빈 옛 행은 근거로 쓰지 않는다', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, '')];
    expect(findNameOwner(sheet, '01011112222', '김철수')).toBeNull();
  });

  it('빈 입력에 터지지 않는다', () => {
    const sheet = [HEADER, namedRow('01011112222', PC_A, '박사장')];
    expect(findNameOwner(sheet, '', '김철수')).toBeNull();
    expect(findNameOwner(sheet, '01011112222', '')).toBeNull();
    expect(findNameOwner([HEADER], '01011112222', '김철수')).toBeNull();
  });
});

describe('이름 안내 문구 — 전체 노출하지 않는다', () => {
  it('첫 글자만 남긴다', () => {
    expect(maskName('박사장')).toBe('박**');
    expect(maskName('김철수철수')).toBe('김****');
  });

  it('이상한 값에 터지지 않는다', () => {
    expect(maskName('')).toBe('***');
    expect(maskName('박')).toBe('박**');
  });
});

describeDeployed('배포본도 이름 규칙을 갖는다', () => {
  const deployedFindNameOwner = extractFunction<
    (sheet: { getDataRange(): { getValues(): Row[] } }, phone: string, nickname: string) => { name: string } | null
  >(deployedSource, 'findPhoneNameOwner_', ['normalizeTrialName_']);

  const fakeSheet2 = (rows: Row[]) => ({ getDataRange: () => ({ getValues: () => rows }) });

  it('같은 번호 다른 이름을 잡는다', () => {
    const owner = deployedFindNameOwner(
      fakeSheet2([HEADER, namedRow('01011112222', PC_A, '박사장')]),
      '01011112222',
      '김철수',
    );
    expect(owner?.name).toBe('박사장');
  });

  it('같은 이름은 통과시킨다', () => {
    expect(deployedFindNameOwner(
      fakeSheet2([HEADER, namedRow('01011112222', PC_A, '박사장')]),
      '01011112222',
      '박사장',
    )).toBeNull();
  });
});

describe('배선 — 이름 규칙도 두 진입점 모두', () => {
  it('루트 백엔드', () => {
    const verifyStart = rootSource.indexOf('function handleTrialVerify(data)');
    const activateStart = rootSource.indexOf('function handleTrialActivate(data)');
    expect(rootSource.slice(verifyStart, activateStart)).toContain('findTrialNameOwner_');
    expect(rootSource.slice(activateStart, rootSource.indexOf('// ── trial-list:', activateStart)))
      .toContain('findTrialNameOwner_');
  });

  it.skipIf(!deployedSource)('배포본', () => {
    const verifyStart = deployedSource.indexOf('function handleTrialVerify(data)');
    const activateStart = deployedSource.indexOf('function handleTrialActivate(data)');
    expect(deployedSource.slice(verifyStart, verifyStart + 3000)).toContain('findPhoneNameOwner_');
    expect(deployedSource.slice(activateStart, activateStart + 3000)).toContain('findPhoneNameOwner_');
  });
});
