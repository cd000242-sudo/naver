/**
 * [2026-09-12 사장님 보고] 이슈 끝판왕 수집이 7개 소제목 내내 "후보 116장 → 검증 통과 0장".
 * 6분을 쓰고 한 장도 못 건졌다.
 *
 * 확인한 것: 활성 계정 설정(settings_cd00242.json)에 평문 Gemini 키(AIza…39자)가 있는데도
 * 수집기는 "Gemini 키 없음" 으로 돌았다. 키를 한 필드에서만 찾고 있었다.
 * 저장 위치가 여럿이다 — 정규화 필드 / 다중 키 배열 / 하이픈 표기 / 환경변수.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveIssueVisionKey } from '../main/ipc/issueCollectHandlers';

const PLAIN = 'AIzaSyDUMMYKEYFORTESTONLY_0123456789ab';

afterEach(() => { delete process.env.GEMINI_API_KEY; });

describe('resolveIssueVisionKey', () => {
  it('정규화된 필드에서 찾는다', () => {
    expect(resolveIssueVisionKey({ geminiApiKey: PLAIN })).toBe(PLAIN);
  });

  it('다중 키 배열에서 첫 유효 키를 쓴다', () => {
    expect(resolveIssueVisionKey({ geminiApiKeys: ['', '   ', PLAIN] })).toBe(PLAIN);
  });

  it('하이픈 표기도 읽는다 — 구버전 설정 파일이 이 꼴이다', () => {
    expect(resolveIssueVisionKey({ 'gemini-api-key': PLAIN })).toBe(PLAIN);
  });

  it('환경변수를 마지막 수단으로 쓴다', () => {
    process.env.GEMINI_API_KEY = PLAIN;
    expect(resolveIssueVisionKey({})).toBe(PLAIN);
  });

  it('암호화 저장본("enc:…")은 없는 것으로 본다 — 그대로 쓰면 인증이 실패한다', () => {
    expect(resolveIssueVisionKey({ geminiApiKey: 'enc:AAAABBBBCCCC' })).toBe('');
  });

  it('공백만 있는 값은 키가 아니다', () => {
    expect(resolveIssueVisionKey({ geminiApiKey: '   ' })).toBe('');
    expect(resolveIssueVisionKey({})).toBe('');
    expect(resolveIssueVisionKey(null)).toBe('');
  });

  it('앞뒤 공백을 떼고 돌려준다', () => {
    expect(resolveIssueVisionKey({ geminiApiKey: `  ${PLAIN}  ` })).toBe(PLAIN);
  });
});

describe('키가 없어도 멈추지 않고, 무엇을 못 하는지 먼저 알린다', () => {
  it('캡션 게이트가 있으므로 중단하지 않는다 — 대신 화면에 한계를 알린다', () => {
    const src = readFileSync(resolve(__dirname, '../main/ipc/issueCollectHandlers.ts'), 'utf8');
    expect(src).toMatch(/캡션 텍스트로만 관련성을 판정합니다/);
    expect(src).toMatch(/워터마크·구도는 확인하지 못합니다/);
    // 수집을 시작하기 전에 알려야 의미가 있다.
    expect(src.indexOf('collectProgress')).toBeLessThan(src.indexOf('collectIssueImages'));
  });
});
