/**
 * Abnormal-behaviour audit fixes: a queue must not keep hitting Naver after an account is paused, and a failed
 * post must keep the failure count and the publish interval.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { requiresAccountStop } from '../automation/publishFailureClassifier';

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('requiresAccountStop', () => {
  it.each(['LOGIN_REQUIRED', 'LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN'])('stops on the explicit code %s', (code) => {
    expect(requiresAccountStop({ code })).toBe(true);
    expect(requiresAccountStop(new Error(`[${code}] 계정 작업이 중단되었습니다.`))).toBe(true);
    expect(requiresAccountStop(`Error invoking remote method 'automation:run': Error: [${code}] 중단`)).toBe(true);
  });

  it.each([
    '코덱스 로그인이 필요합니다. 에이전트를 연동하세요.',
    'Gemini API login failed',
    '에디터 로딩 실패',
    'timeout of 30000ms exceeded',
  ])('does not stop on text that merely mentions login or a transient error: %s', (message) => {
    expect(requiresAccountStop(new Error(message))).toBe(false);
  });

  it('ignores codes that do not pause the account', () => {
    expect(requiresAccountStop({ code: 'EDITOR_NOT_READY' })).toBe(false);
    expect(requiresAccountStop({ code: 'ACCOUNT_BUSY' })).toBe(false);
    expect(requiresAccountStop({ code: undefined, message: '발행 실패' })).toBe(false);
  });
});

describe('continuous publishing queue', () => {
  const source = read('src', 'renderer', 'modules', 'continuousPublishing.ts');

  it('stops the queue when the account is paused, before paying for the next post', () => {
    expect(source).toMatch(/if \(requiresAccountStop\(error\)\) \{[\s\S]{0,900}?stopContinuousMode\('manual'\);\s*break;/);
  });

  it('an unknown outcome is never retried but is counted and keeps the interval (no jump to the next post)', () => {
    const block = source.slice(source.indexOf('const outcomeUncertain ='), source.indexOf('// 2회 이상 실패'));
    expect(block).not.toMatch(/\n\s*continue;\s*\n\s*\}\s*\n\s*if \(\(item as any\)\._publishStarted\)/);
    expect(source).toContain('if (retryCount < 1 && !isInputError && !outcomeUncertain) {');
    expect(source).toContain("if (!outcomeUncertain) item.status = 'failed';");
  });
});

describe('sequential multi-account publishing', () => {
  it('stops instead of opening the next account after a paused one', () => {
    const source = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    expect(source).toContain("import { requiresAccountStop } from '../../automation/publishFailureClassifier.js';");
    expect(source).toMatch(/if \(requiresAccountStop\(\{ code: accountResult\?\.failureCode, message: accountMessage \}\)\) \{[\s\S]{0,200}?break;/);
    expect(source).toMatch(/catch \(error\) \{[\s\S]{0,200}?if \(requiresAccountStop\(error\)\) \{[\s\S]{0,200}?break;/);
  });

  it('reads the account result, not only the run flag (main returns success: true even when the account failed)', () => {
    const source = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    expect(source).toContain('if (result.success && accountResult?.success === true) {');
    expect(source).not.toMatch(/\n\s*if \(result\.success\) \{\n\s*appendLog\(`✅ \[\$\{i \+ 1\}\/\$\{selectedAccountIds\.length\}\]/);
    expect(read('src', 'main.ts')).toContain('return { success: true, results, summary: { total: results.length, success: successCount, fail: failCount } };');
  });

  it('an exception waits the normal interval before the next account', () => {
    const source = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    expect(source).toMatch(/catch \(error\) \{[\s\S]{0,700}?applySequentialMultiAccountJitter\(intervalPolicy\.safe, intervalPolicy\.safe\)[\s\S]{0,300}?waitInterruptible\(waitSeconds\)/);
  });

  it('the renderer bundle carries the classifier module', () => {
    expect(read('scripts', 'copy-static.mjs')).toContain('publishFailureClassifier');
  });
});
