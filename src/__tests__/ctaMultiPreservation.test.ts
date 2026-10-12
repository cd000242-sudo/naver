// [2026-10-13] 사용자 보고 "CTA 여러 개 넣으면 마지막 하나만 나온다" — 코드 추적으로 찾은 손실 지점 5곳의 회귀 시험.
//   1) 메인 정규화가 CTA별 위치(position)를 버림  2) 링크만 넣은 행을 UI·정규화가 버림
//   3) 일반 모드 하단에서 링크 없는 CTA 가 조용히 빠짐  4) 쇼핑커넥트 하단 CTA 1개 제한
//   5) 소제목 수를 넘는 위치(heading-5, 소제목 3개)는 어디에도 안 들어감
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resolveNaverRunOptions } from '../automation/runOptionsPolicy';
import { planEditorTail } from '../automation/editorTailPlan';
import { insertTailTextBlock, PREVIOUS_POST_SEPARATOR } from '../automation/editorTailActions.js';
import { safeKeyboardType } from '../automation/typingUtils.js';

vi.mock('../automation/ctaHelpers.js', () => ({ PREV_POST_HOOKS: ['hook line'] }));
vi.mock('../automation/typingUtils.js', () => ({ safeKeyboardType: vi.fn() }));
vi.mock('../automation/richTextPaste.js', () => ({ ensureTailTypingReady: vi.fn() }));

const src = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');
const resolveWith = (ctas: unknown[]) => resolveNaverRunOptions({
  runOptions: { title: '제목', content: '본문입니다.', ctas } as any,
  defaults: {},
  log: vi.fn(),
});

describe('메인 정규화(normalizeCtas)', () => {
  it('CTA별 위치를 버리지 않고 bottom / heading-N 만 통과시킨다', () => {
    const resolved = resolveWith([
      { text: '하나', link: 'https://a.example', position: 'heading-2' },
      { text: '둘', link: 'https://b.example', position: 'bottom' },
      { text: '셋', link: 'https://c.example', position: '' },
      { text: '넷', link: 'https://d.example', position: 'garbage' },
    ]);
    expect(resolved.ctas.map((c: any) => c.position)).toEqual(['heading-2', 'bottom', undefined, undefined]);
    expect(resolved.ctas).toHaveLength(4);
  });

  it('링크만 넣은 CTA 는 기본 문구를 붙여 살리고, 둘 다 빈 행만 버린다', () => {
    const resolved = resolveWith([{ text: '', link: 'https://only.example' }, { text: '', link: '' }]);
    expect(resolved.ctas).toEqual([{ text: '자세히 보러가기', link: 'https://only.example' }]);
  });
});

describe('꼬리 계획(planEditorTail)', () => {
  it('소제목 수를 넘는 위치의 CTA 는 버리지 않고 하단으로 보낸다', () => {
    const plan = planEditorTail({
      ctas: [
        { text: '5번', link: 'https://a.example', position: 'heading-5' },
        { text: '2번', link: 'https://b.example', position: 'heading-2' },
      ],
      ctaPosition: 'bottom',
      headingCount: 3,
    });
    expect(plan.bottomCtas.map((c) => c.text)).toEqual(['5번']);
    expect(plan.headingOverflowCtaCount).toBe(1);
  });

  it('headingCount 를 모르면 예전처럼 소제목 위치 CTA 를 하단에서 뺀다', () => {
    const plan = planEditorTail({ ctas: [{ text: '5번', link: 'https://a.example', position: 'heading-5' }], ctaPosition: 'bottom' });
    expect(plan.bottomCtas).toEqual([]);
    expect(plan.headingOverflowCtaCount).toBe(0);
  });

  it('같은 링크 CTA 는 첫 것만 남기고 개수를 알린다(링크 카드 중복 방지)', () => {
    const plan = planEditorTail({
      ctas: [
        { text: '첫', link: 'https://same.example/x?utm=1' },
        { text: '중복', link: 'https://same.example/x/' },
        { text: '다른', link: 'https://other.example' },
        { text: '링크 없음 A' },
        { text: '링크 없음 B' },
      ],
    });
    expect(plan.bottomCtas.map((c) => c.text)).toEqual(['첫', '다른', '링크 없음 A', '링크 없음 B']);
    expect(plan.skippedSameLinkCtaCount).toBe(1);
  });
});

describe('링크 없는 꼬리 CTA 텍스트 블록(insertTailTextBlock)', () => {
  it('구분선 + 문구만 치고 링크 카드를 기다리지 않는다', async () => {
    const pressed: string[] = [];
    const page: any = { keyboard: { press: vi.fn(async (k: string) => { pressed.push(k); }) } };
    const self: any = { delay: vi.fn(async () => undefined), waitForLinkCard: vi.fn(async () => true) };
    await insertTailTextBlock({ self, page, label: '📎 댓글로 문의 주세요' });
    const typedTexts = (safeKeyboardType as any).mock.calls.map((c: unknown[]) => c[1]);
    expect(typedTexts).toEqual([PREVIOUS_POST_SEPARATOR, '📎 댓글로 문의 주세요']);
    expect(pressed.filter((k) => k === 'Enter').length).toBeGreaterThanOrEqual(2);
    expect(self.waitForLinkCard).not.toHaveBeenCalled();
  });
});

describe('화면·발행 경로 배선(소스 가드)', () => {
  it('통합 화면 행 읽기는 링크만 있는 행도 기본 문구로 살린다', () => {
    const fn = src('src/renderer/renderer.ts').split('function readUnifiedCtasFromUi(')[1].split('\nfunction ')[0];
    expect(fn).toContain('if (text || link)');
    expect(fn).toContain("'자세히 보러가기'");
    expect(fn).not.toMatch(/if \(text\) items\.push/);
  });

  it('연속 발행 모달 행 읽기도 링크만 있는 행에 기본 문구를 붙인다', () => {
    const fn = src('src/renderer/modules/continuousPublishing.ts').split('_getModalCtaItems = ')[1].split('_setModalCtaItems')[0];
    expect(fn).toContain("'자세히 보러가기'");
  });

  it('다중계정·완전자동 경로는 링크만 있는 CTA 를 걸러내지 않는다', () => {
    const multi = src('src/renderer/modules/multiAccountManager.ts');
    const full = src('src/renderer/modules/fullAutoFlow.ts');
    expect(multi).not.toMatch(/\.filter\(\(c\) => Boolean\(c\.text\)\)/);
    expect(full).not.toMatch(/\.filter\(\(c\) => Boolean\(c\?\.text\)\)/);
  });

  it('에디터 꼬리: 쇼핑 1개 제한 제거 · 소제목 수 전달 · 링크 없는 CTA 텍스트 삽입 · 모든 CTA 최종 확인', () => {
    const helpers = src('src/automation/editorHelpers.ts');
    const tail = helpers.slice(helpers.indexOf('const tailPlan = planEditorTail({'));
    expect(tail).not.toContain('1개로 제한');
    expect(tail).toContain('headingCount: headings.length');
    expect(tail).toContain('insertTailTextBlock(');
    expect(tail).not.toMatch(/verifyCtaInsertion\(frame, resolved\.ctas\[0\]/);
  });

  it('소제목 아래 CTA 는 링크가 없으면 "👉 #" 줄을 치지 않는다', () => {
    const auto = src('src/naverBlogAutomation.ts');
    const fn = auto.split('private async insertCtaLink(')[1].split('\n  private ')[0];
    expect(fn).not.toContain("const finalUrl = url || '#'");
    expect(fn).toMatch(/if \(finalUrl\)/);
  });
});
