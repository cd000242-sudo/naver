// 발행 계정 선택 블록이 세 서브탭(단일/연속/다중계정)에서 모두 보여야 한다.
//
// 원인: initPublishModeSubtabs 가 "서브탭 바 이후 형제 전부"를 단일발행 패널로 옮겼다.
// 계정 블록이 바로 아래에 있어 함께 딸려 들어갔고, 연속발행·다중계정 탭으로 가면
// 계정을 고를 수 없었다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf-8');
const renderer = readFileSync(join(ROOT, 'src', 'renderer', 'renderer.ts'), 'utf-8');

describe('계정 선택 블록 공유', () => {
  it('계정 블록에 지목 가능한 id 가 있다', () => {
    expect(html).toContain('id="publish-account-block"');
  });

  it('계정 블록이 서브탭 바보다 뒤에, 연속발행 섹션보다 앞에 있다', () => {
    const subtabs = html.indexOf('id="publish-mode-subtabs"');
    const account = html.indexOf('id="publish-account-block"');
    const continuous = html.indexOf('id="continuous-mode-section"');
    expect(subtabs).toBeGreaterThan(0);
    expect(account).toBeGreaterThan(subtabs);
    expect(continuous).toBeGreaterThan(account);
  });

  it('서브탭 래핑이 계정 블록을 단일발행 패널로 옮기지 않는다', () => {
    expect(renderer).toContain("SHARED_ACROSS_MODES = new Set(['publish-account-block'])");
    expect(renderer).toContain('if (!SHARED_ACROSS_MODES.has(n.id)) toMove.push(n);');
  });

  it('무조건 옮기던 옛 코드가 남아 있지 않다', () => {
    expect(renderer).not.toContain('while (n) { toMove.push(n); n = n.nextElementSibling; }');
  });

  it('계정 선택 드롭다운과 다중계정 탭 버튼이 그 블록 안에 있다', () => {
    const start = html.indexOf('id="publish-account-block"');
    const end = html.indexOf('id="continuous-mode-section"');
    const block = html.slice(start, end);
    expect(block).toContain('id="main-account-selector"');
    expect(block).toContain('id="multi-account-tab"');
    expect(block).toContain('id="single-account-tab"');
  });
});
