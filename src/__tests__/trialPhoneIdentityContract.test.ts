import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readBackend = (): string => readFileSync(
  resolve(process.cwd(), 'GAS_결제주문관리.js'),
  'utf8',
);

const readDeployedBackend = (): string => readFileSync(
  resolve(process.cwd(), 'payment-page/.gas-license-backend/Code.js'),
  'utf8',
);

const readTrialVerifyHandler = (source: string): string => {
  const start = source.indexOf('function handleTrialVerify(data)');
  const end = source.indexOf('// ── trial-activate:', start);

  expect(start, 'trial-verify handler must exist').toBeGreaterThan(-1);
  expect(end, 'trial-verify handler must precede trial activation').toBeGreaterThan(start);

  return source.slice(start, end);
};

const readTrialActivationHandler = (source: string): string => {
  const start = source.indexOf('function handleTrialActivate(data)');
  const end = source.indexOf('// ── trial-list:', start);

  expect(start, 'trial-activate handler must exist').toBeGreaterThan(-1);
  expect(end, 'trial-list handler must follow trial activation').toBeGreaterThan(start);

  return source.slice(start, end);
};

describe('trial verification phone-identity contract', () => {
  it('routes the 인증하기 request to a dedicated trial-verify handler', () => {
    const source = readBackend();

    expect(source).toMatch(/case 'trial-verify':\s*return handleTrialVerify\(data\);/);
  });

  /*
   * [2026-08-25 사장님 결정으로 갱신]
   *
   * 이 계약은 원래 "기기 조건을 아예 보지 않는다"까지 못 박고 있었다. 그러다 같은 PC 에서
   * 아무 이름·아무 번호를 새로 넣으면 체험이 계속 열리는 우회가 실측됐고, 사장님이
   * "하나의 PC 에 하나의 번호만"을 명시했다. 그래서 뒤집힌 부분과 유지되는 부분을 가른다.
   *
   *   유지: 기존 체험이냐 신규냐를 가르는 신원은 여전히 전화번호다(기기가 아니다).
   *   추가: 그 판정 앞에 기기·이름 조건이 선다 — 한 PC 한 번호, 한 번호 한 이름.
   *
   * 판정 자체의 동작 검증은 trialDeviceBinding.test.ts 가 실제 함수를 실행해서 한다.
   */
  it('keeps the phone—not a stale PC device id—as the existing-vs-new identity', () => {
    const handler = readTrialVerifyHandler(readBackend());
    const normalIdentityStart = handler.indexOf('기존 체험은 전화번호 하나에 하나만 연결한다.');

    expect(normalIdentityStart, 'phone identity branch must exist').toBeGreaterThan(-1);
    const normalIdentityBranch = handler.slice(normalIdentityStart);

    // existing/new 를 가르는 루프는 전화번호만 본다.
    expect(normalIdentityBranch).toContain('rowPhone === phone');
    expect(normalIdentityBranch).toMatch(/status:\s*'existing'/);
    expect(normalIdentityBranch).toMatch(/status:\s*'new'/);
    expect(normalIdentityBranch).not.toContain('rowDeviceId');
    expect(handler).toMatch(/blocked:\s*true/);
  });

  it('refuses a second phone on a device that already used its trial', () => {
    const handler = readTrialVerifyHandler(readBackend());

    expect(handler).toContain('findTrialDeviceOwner_');
    // 기기 조건은 existing/new 판정보다 먼저 서야 새 행이 생기기 전에 막힌다.
    expect(handler.indexOf('findTrialDeviceOwner_'))
      .toBeLessThan(handler.indexOf('기존 체험은 전화번호 하나에 하나만 연결한다.'));
  });

  it('refuses a second nickname on a phone that already registered one', () => {
    const handler = readTrialVerifyHandler(readBackend());

    expect(handler).toContain('findTrialNameOwner_');
    expect(handler.indexOf('findTrialNameOwner_'))
      .toBeLessThan(handler.indexOf('기존 체험은 전화번호 하나에 하나만 연결한다.'));
  });

  it('lets the email-free app activation continue with the verified phone identity', () => {
    const handler = readTrialActivationHandler(readBackend());

    expect(handler).not.toMatch(/if\s*\(\s*!email\s*\|\|/);
    expect(handler).toMatch(/getRange\('C:C'\)\.createTextFinder\(phone\)/);
    expect(handler).toContain('(email && rowEmail && rowEmail === email)');
  });
});

describe('deployed trial verification phone-identity contract', () => {
  it('does not reject a normal user merely because the PC has an earlier phone record', () => {
    const source = readDeployedBackend();
    const start = source.indexOf('function findTrialConflict_(sheet, email, phone, deviceId)');
    const end = source.indexOf('/** 전화번호로 체험 행 찾기', start);

    expect(start, 'deployed conflict helper must exist').toBeGreaterThan(-1);
    expect(end, 'phone row helper must follow conflict helper').toBeGreaterThan(start);

    const conflictHelper = source.slice(start, end);
    const normalHistoryStart = conflictHelper.indexOf('// 비차단 이력은 전화번호가 달라도 거부하지 않는다.');
    expect(normalHistoryStart, 'non-blocked history branch must be explicit').toBeGreaterThan(-1);
    expect(conflictHelper.slice(normalHistoryStart)).not.toContain('rowDevice');
    expect(source).not.toContain('이 기기(PC)는 다른 전화번호로 이미 무료 체험을 사용했습니다');
  });

  it('keeps explicit blocks active while looking up existing trials by phone', () => {
    const source = readDeployedBackend();

    expect(source).toMatch(/case 'trial-verify':\s*return handleTrialVerify\(data\);/);
    expect(source).toContain('(deviceId && bDevice && bDevice === deviceId)');
    expect(source).toContain('findTrialRowByPhone_(sheet, phone)');
    expect(source).toMatch(/status:\s*'existing'/);
    expect(source).toMatch(/status:\s*'new'/);
  });
});
