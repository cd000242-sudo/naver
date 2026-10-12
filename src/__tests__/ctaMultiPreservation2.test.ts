// @vitest-environment happy-dom
// [2026-10-13] CTA 다중 손실 2부 — 에이전트 추적으로 추가 확정된 지점:
//   6) 링크 카드 뒤 URL 원문 정리가 문서 전체 텍스트 컴포넌트를 통째로 지워 앞 CTA 문구·구분선까지 날림(마지막 카드만 남는 메커니즘)
//   7) 연속 발행 모달: CTA 유형이 기본 'none' 이면 입력한 행 N개가 통째로 버려짐
//   8) 글 불러오기 복원이 잘못된 행 클래스(.cta-item)를 찾아 값이 비어 복원됨
//   9) 다중계정 세션 복원 행에 위치 select 가 없어 position 영구 소실, 링크만 있는 행 버림
//  10) 앱 예약(app-schedule) 재생이 CTA 를 한 개도 싣지 않음
//  11) 다중계정 모달: 유형 'none' 인 채 URL/문구만 채우면 CTA 가 skip 됨
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { removeBareUrlParagraphs } from '../automation/bareUrlCleanupDom';

const src = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');
const P = (text: string) => `<p class="se-text-paragraph">${text}</p>`;
const CARD = '<div class="se-component se-oglink"><a href="https://x.example/a">카드</a></div>';

beforeEach(() => { document.body.innerHTML = ''; });

describe('removeBareUrlParagraphs (링크 카드 뒤 URL 원문 정리)', () => {
  it('지정한 URL 문단만 지우고, 같은 컴포넌트의 구분선·문구·다른 CTA 의 URL 은 남긴다', () => {
    document.body.innerHTML = `
      <div class="se-main-container">
        <div class="se-component se-text"><div class="se-module-text">
          ${P('━━━━━━')}${P('📎 첫 번째 CTA')}${P('https://first.example/path?utm=1')}
          ${P('━━━━━━')}${P('📎 두 번째 CTA')}${P('https://second.example/')}
        </div></div>
        ${CARD}
      </div>`;
    expect(removeBareUrlParagraphs('https://second.example')).toBe(1);
    const texts = Array.from(document.querySelectorAll('.se-text-paragraph')).map((p) => p.textContent);
    expect(texts).toEqual(['━━━━━━', '📎 첫 번째 CTA', 'https://first.example/path?utm=1', '━━━━━━', '📎 두 번째 CTA']);
    expect(document.querySelectorAll('.se-component.se-text')).toHaveLength(1);
  });

  it('URL 만 있는 컴포넌트는 문단을 지운 뒤 빈 컴포넌트까지 정리한다', () => {
    document.body.innerHTML = `<div class="se-main-container"><div class="se-component se-text"><div class="se-module-text">${P('👉 https://only.example')}</div></div>${CARD}</div>`;
    expect(removeBareUrlParagraphs('https://only.example/')).toBe(1);
    expect(document.querySelector('.se-component.se-text')).toBeNull();
  });

  it('링크 카드가 하나도 없으면 아무것도 지우지 않고, 대상 URL 이 없으면 URL 전용 문단 전부(문단 단위)를 지운다', () => {
    document.body.innerHTML = `<div class="se-main-container"><div class="se-component se-text"><div class="se-module-text">${P('https://a.example')}${P('본문 문장')}</div></div></div>`;
    expect(removeBareUrlParagraphs('https://a.example')).toBe(0);
    document.body.innerHTML += CARD;
    expect(removeBareUrlParagraphs()).toBe(1);
    expect(Array.from(document.querySelectorAll('.se-text-paragraph')).map((p) => p.textContent)).toEqual(['본문 문장']);
  });
});

describe('배선(소스 가드)', () => {
  it('에디터가 새 정리 함수에 방금 넣은 URL 을 넘기고, 모든 호출처가 URL 을 전달한다', () => {
    const auto = src('src/naverBlogAutomation.ts');
    expect(auto).toContain("from './automation/bareUrlCleanupDom");
    expect(auto).toMatch(/removeBareUrlTextAfterLinkCard\(targetUrl\?: string\)/);
    expect(auto).toContain('frame.evaluate(removeBareUrlParagraphs, ');
    expect(auto).toContain('this.removeBareUrlTextAfterLinkCard(finalUrl)');
    const tail = src('src/automation/editorTailActions.ts');
    expect(tail).toContain('self.removeBareUrlTextAfterLinkCard(url)');
    expect(tail).toContain('self.removeBareUrlTextAfterLinkCard(previousPostUrl)');
    expect(tail).not.toMatch(/removeBareUrlTextAfterLinkCard\(\)/);
    const cta = src('src/automation/ctaHelpers.ts');
    expect(cta).not.toMatch(/removeBareUrlTextAfterLinkCard\(\)/);
  });

  it('연속 발행: 모달 행이 있으면 CTA 유형 none 이라도 행을 버리지 않는다', () => {
    const cp = src('src/renderer/modules/continuousPublishing.ts');
    expect(cp).toContain('resolveQueueCtaType(');
    expect(cp).not.toMatch(/skipCta: item\.ctaType === 'none',/);
    expect(cp).not.toContain("ctaType: ctaTypeSelect?.value || 'none',");
  });

  it('글 불러오기 복원은 실제 행 클래스와 위치 select 를 채운다', () => {
    const pl = src('src/renderer/modules/postListUI.ts');
    expect(pl).not.toContain("querySelectorAll('.cta-item')");
    expect(pl).toContain("querySelectorAll('.unified-cta-item')");
    expect(pl).toContain('.unified-cta-pos');
  });

  it('다중계정 세션 복원은 공용 행 추가 버튼을 눌러 위치 select 가 있는 행을 만들고 링크만 있는 행도 살린다', () => {
    const ma = src('src/renderer/modules/multiAccountManager.ts');
    const block = ma.split('if (container && Array.isArray(session.ctas))')[1].split('catch (e)')[0];
    expect(block).toContain("getElementById('unified-add-cta-btn')");
    expect(block).toContain('.unified-cta-pos');
    expect(block).not.toMatch(/if \(!text\)\s*continue;/);
  });

  it('앱 예약 재생이 저장 글의 CTA 를 싣는다', () => {
    const main = src('src/main.ts');
    const block = main.split("publishMode: 'publish', // ✅ 즉시 발행 (예약이 아님!)")[1].split('console.log(`[Scheduler] 자동화 실행 시작')[0];
    expect(block).toContain('ctas: ');
    expect(block).toContain('ctaPosition: ');
    expect(block).toContain('skipCta: ');
  });

  it('다중계정 모달: 유형이 none 이어도 URL 이나 문구를 넣었으면 custom 으로 올린다', () => {
    const ma = src('src/renderer/modules/multiAccountManager.ts');
    expect(ma).not.toContain("const ctaType = document.getElementById('ma-setting-cta-type')?.value || 'none';");
    expect(ma).toMatch(/const ctaType = .*'custom'/);
  });
});
