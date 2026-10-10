// @vitest-environment happy-dom
// [2026-10-10] 젠스파크 화면 읽기 함수 시험 — 실측 구조를 흉내 낸 고정 HTML(실제 사이트 접속 없음).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  gensparkBuildJobUrl,
  gensparkExtractJobId,
  gensparkIsResultImageUrl,
  readGensparkComposer,
  readGensparkJobImages,
  readGensparkModelMenu,
  readGensparkPageSignals,
  readGensparkSelectedModel,
  readGensparkSettingsMenu,
} from '../image/genspark/gensparkSelectors';

const item = (lines: string[]): string =>
  `<div class="model-container">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;

describe('gensparkSelectors 주소', () => {
  it('작업 주소에서 ID 추출·재조립', () => {
    expect(gensparkExtractJobId('https://www.genspark.ai/agents?id=abc-123')).toBe('abc-123');
    expect(gensparkExtractJobId('https://www.genspark.ai/ai_image')).toBeNull();
    expect(gensparkExtractJobId('https://www.genspark.ai/agents')).toBeNull();
    expect(gensparkExtractJobId(null)).toBeNull();
    expect(gensparkBuildJobUrl('abc 1')).toBe('https://www.genspark.ai/agents?id=abc%201');
    expect(gensparkIsResultImageUrl('https://www.genspark.ai/api/files/s/xyz')).toBe(true);
    expect(gensparkIsResultImageUrl('https://x.com/a.png')).toBe(false);
  });
});

describe('readGensparkModelMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="v-binder-follower-content">
        ${item(['모델 자동 선택'])}
        ${item(['GPT Image 2.5', 'No credit cost'])}
        ${item(['New', 'Nano Banana 2.1', '2 credits'])}
        ${item(['Bria Background Remover', 'No credit cost', '이 모델은 입력 이미지가 필요합니다'])}
        ${item(['Ideogram V4.5'])}
      </div>`;
  });

  it('이름·무료·이미지필수·New 를 읽는다', () => {
    const items = readGensparkModelMenu();
    expect(items.map((i) => i.label)).toEqual([
      '모델 자동 선택', 'GPT Image 2.5', 'Nano Banana 2.1', 'Bria Background Remover', 'Ideogram V4.5',
    ]);
    expect(items[1]).toEqual({ label: 'GPT Image 2.5', creditFree: true, needsInput: false, isNew: false });
    expect(items[2]).toEqual({ label: 'Nano Banana 2.1', creditFree: false, needsInput: false, isNew: true });
    expect(items[3].needsInput).toBe(true);
    expect(items[4].creditFree).toBe(false);
  });

  it('메뉴가 닫혀 있으면 빈 배열', () => {
    document.body.innerHTML = '<div class="model-container"><div>GPT Image 2.5</div></div>';
    expect(readGensparkModelMenu()).toEqual([]);
  });
});

describe('readGensparkSelectedModel', () => {
  it('선택된 모델 글자 / 없으면 null', () => {
    document.body.innerHTML =
      '<div class="model-select-bar"><div class="model-selector"><div class="model-button"><span class="model-selected"> GPT Image 2.5 </span></div></div></div>';
    expect(readGensparkSelectedModel()).toBe('GPT Image 2.5');
    document.body.innerHTML = '';
    expect(readGensparkSelectedModel()).toBeNull();
  });
});

describe('readGensparkSettingsMenu', () => {
  it('종횡비와 생성 횟수 selected', () => {
    document.body.innerHTML = `
      <div class="v-binder-follower-content">
        <div>종횡비</div>
        <div><span>자동 크기</span></div>
        <div><span>16:9</span></div>
        <div class="selected"><span>1:1</span></div>
        <div>생성 횟수</div>
        <div class="size-option">1</div>
        <div class="size-option selected">2</div>
        <div class="size-option">4</div>
      </div>`;
    const menu = readGensparkSettingsMenu();
    expect(menu.ratios.map((r) => r.label)).toEqual(['자동 크기', '16:9', '1:1']);
    expect(menu.ratios.find((r) => r.label === '1:1')?.selected).toBe(true);
    expect(menu.ratios.find((r) => r.label === '16:9')?.selected).toBe(false);
    expect(menu.counts).toEqual([
      { label: '1', selected: false }, { label: '2', selected: true }, { label: '4', selected: false },
    ]);
  });
});

describe('readGensparkJobImages', () => {
  it('같은 주소 반복은 하나로, 순서 유지, 다른 종류 이미지 제외, 사이드바 제외', () => {
    document.body.innerHTML = `
      <aside><img src="/api/files/s/side1"></aside>
      <main>
        <img src="/static/logo.png">
        <img src="https://www.genspark.ai/api/files/s/aaa">
        <img src="https://www.genspark.ai/api/files/s/aaa">
        <img src="/api/files/s/bbb">
        <img src="https://www.genspark.ai/api/files/s/aaa">
      </main>`;
    expect(readGensparkJobImages()).toEqual([
      'https://www.genspark.ai/api/files/s/aaa',
      'https://www.genspark.ai/api/files/s/bbb',
    ]);
  });
});

describe('readGensparkComposer', () => {
  it('입력창 없음 / 값', () => {
    document.body.innerHTML = '';
    expect(readGensparkComposer()).toEqual({ found: false, value: '' });
    document.body.innerHTML = '<textarea class="search-input"></textarea>';
    (document.querySelector('textarea') as HTMLTextAreaElement).value = '첫 줄\n둘째 줄';
    expect(readGensparkComposer()).toEqual({ found: true, value: '첫 줄\n둘째 줄' });
  });
});

describe('readGensparkPageSignals', () => {
  it('입력창이 있으면 로그인 필요 아님', () => {
    document.body.innerHTML = '<textarea class="search-input"></textarea><a>로그인</a>';
    const s = readGensparkPageSignals();
    expect(s.hasComposer).toBe(true);
    expect(s.loginRequired).toBe(false);
  });

  it('입력창 없고 로그인 버튼이 있으면 로그인 필요', () => {
    document.body.innerHTML = '<button>Sign in</button>';
    expect(readGensparkPageSignals().loginRequired).toBe(true);
  });

  it('보안 확인·제한·실패 문구', () => {
    document.body.innerHTML = '<p>Verify you are human</p><p>Too many requests</p><p>이미지 생성에 실패했습니다</p>';
    const s = readGensparkPageSignals();
    expect(s.challenge).toBe(true);
    expect(s.rateLimited).toBe(true);
    expect(s.failed).toBe(true);
  });

  it('프롬프트 에코(입력창 안 글자)는 오탐하지 않는다', () => {
    document.body.innerHTML = '<textarea class="search-input">생성에 실패 Too many requests</textarea><p>정상 화면</p>';
    const s = readGensparkPageSignals();
    expect(s.failed).toBe(false);
    expect(s.rateLimited).toBe(false);
    expect(s.challenge).toBe(false);
  });
});
