// @vitest-environment happy-dom
// [2026-10-10] 젠스파크 화면 읽기 함수 시험 — 실측 구조를 흉내 낸 고정 HTML(실제 사이트 접속 없음).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  gensparkBuildJobUrl,
  gensparkExtractJobId,
  gensparkIsResultImageUrl,
  focusGensparkComposer,
  readGensparkComposer,
  readGensparkJobImages,
  readGensparkModelMenu,
  readGensparkPageSignals,
  readGensparkSelectedModel,
  locateGensparkPoint,
  readGensparkSettingsMenu,
} from '../image/genspark/gensparkSelectors';

const rect = (l: number, t: number, w: number, h: number) =>
  () => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
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

describe('readGensparkSettingsMenu — 실측 클래스(.ratio-option / .size-option)', () => {
  it('.ratio-option 을 1순위로 읽고 selected 를 반영한다', () => {
    document.body.innerHTML = `
      <div class="v-binder-follower-content">
        <div class="ratio-option selected"><span>자동 크기</span></div>
        <div class="ratio-option"><span>16:9</span></div>
        <div class="ratio-option">1:1</div>
        <div class="size-option selected">1</div>
        <div class="size-option">2</div>
        <div class="size-option">4</div>
      </div>`;
    const menu = readGensparkSettingsMenu();
    expect(menu.ratios).toEqual([
      { label: '자동 크기', selected: true }, { label: '16:9', selected: false }, { label: '1:1', selected: false },
    ]);
    expect(menu.counts.map((c) => c.label)).toEqual(['1', '2', '4']);
    expect(menu.counts[0].selected).toBe(true);
  });
});

describe('locateGensparkPoint — display: contents 껍데기 + 안쪽 .model', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="v-binder-follower-content">
        <div class="model-container" id="shell1"><div class="model" id="body1"><div>New</div><div>Nano Banana 2.1</div></div></div>
        <div class="model-container" id="shell2"><div class="model" id="body2"><div>GPT Image 2.5</div><div>No credit cost</div></div></div>
        <div class="model-container" id="shell3"><div class="model" id="body3"><div>GPT Image 2</div></div></div>
      </div>`;
    // 껍데기는 크기 0, 안쪽 .model 만 실제 크기(약 385×93)
    for (const id of ['shell1', 'shell2', 'shell3']) {
      (document.getElementById(id) as HTMLElement).getBoundingClientRect = rect(0, 0, 0, 0);
    }
    (document.getElementById('body1') as HTMLElement).getBoundingClientRect = rect(100, 200, 385, 93);
    (document.getElementById('body2') as HTMLElement).getBoundingClientRect = rect(100, 300, 385, 93);
    (document.getElementById('body3') as HTMLElement).getBoundingClientRect = rect(100, 400, 385, 93);
  });

  it('껍데기가 아니라 안쪽 .model 의 중심 좌표를 돌려준다(라벨 정확 일치, New 줄 건너뜀)', () => {
    const req = { selector: '.model-container', scope: '.v-binder-follower-content' };
    expect(locateGensparkPoint({ ...req, label: 'GPT Image 2.5' })).toEqual({ x: 293, y: 347 });
    expect(locateGensparkPoint({ ...req, label: 'Nano Banana 2.1' })).toEqual({ x: 293, y: 247 });
    // 'GPT Image 2' 는 'GPT Image 2.5' 와 다른 항목
    expect(locateGensparkPoint({ ...req, label: 'GPT Image 2' })).toEqual({ x: 293, y: 447 });
    expect(locateGensparkPoint({ ...req, label: 'GPT Image' })).toBeNull();
  });

  it('누르기 전에 scrollIntoView(center) 로 화면 안에 가져온다', () => {
    const calls: unknown[] = [];
    (document.getElementById('body3') as HTMLElement).scrollIntoView = ((arg: unknown) => { calls.push(arg); }) as never;
    locateGensparkPoint({ selector: '.model-container', label: 'GPT Image 2', scope: '.v-binder-follower-content' });
    expect(calls).toEqual([{ block: 'center' }]);
  });

  it('껍데기도 몸체도 크기 0 이면 null', () => {
    (document.getElementById('body2') as HTMLElement).getBoundingClientRect = rect(0, 0, 0, 0);
    expect(locateGensparkPoint({ selector: '.model-container', label: 'GPT Image 2.5', scope: '.v-binder-follower-content' })).toBeNull();
  });

  // [2026-10-10 실측] 모델 메뉴를 한 번 열면 그 follower 상자가 남는다. 다음에 연 설정 메뉴는 두 번째 상자라
  //   첫 상자만 보던 때는 "1:1" 을 못 찾아 GENSPARK_SETTINGS_NOT_FOUND 로 멈췄다(실제 엔진 시험에서 재현).
  it('남아 있는 옛 메뉴 상자 뒤의 설정 메뉴에서도 비율 항목을 찾는다', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="v-binder-follower-content" id="settings">
        <div class="ratio-option" id="r-auto"><div class="ratio-icon"></div><div class="ratio-label">자동 크기</div></div>
        <div class="ratio-option" id="r-11"><div class="ratio-icon"></div><div class="ratio-label">1:1</div></div>
        <div class="size-option" id="s-1"><span>1</span></div>
      </div>`);
    (document.getElementById('r-auto') as HTMLElement).getBoundingClientRect = rect(500, 100, 125, 35);
    (document.getElementById('r-11') as HTMLElement).getBoundingClientRect = rect(500, 140, 125, 35);
    (document.getElementById('s-1') as HTMLElement).getBoundingClientRect = rect(500, 300, 125, 36);
    const scope = '.v-binder-follower-content';
    expect(locateGensparkPoint({ selector: '.ratio-option', label: '1:1', scope })).toEqual({ x: 563, y: 158 });
    expect(locateGensparkPoint({ selector: '.size-option', label: '1', scope })).toEqual({ x: 563, y: 318 });
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
    expect(readGensparkComposer()).toEqual({ found: false, value: '', count: 0 });
    document.body.innerHTML = '<textarea class="search-input"></textarea>';
    (document.querySelector('textarea') as HTMLTextAreaElement).value = '첫 줄\n둘째 줄';
    expect(readGensparkComposer()).toEqual({ found: true, value: '첫 줄\n둘째 줄', count: 1 });
  });

  it('입력창이 여럿이면 포커스된 창의 값을 읽는다(2026-10-10 실측 진단용)', () => {
    document.body.innerHTML = '<textarea class="search-input" id="a"></textarea><textarea class="search-input" id="b"></textarea>';
    (document.getElementById('b') as HTMLTextAreaElement).value = '포커스된 창';
    (document.getElementById('b') as HTMLTextAreaElement).focus();
    expect(readGensparkComposer()).toEqual({ found: true, value: '포커스된 창', count: 2 });
  });

  it('focusGensparkComposer 는 입력창에 포커스를 주고 기존 글을 모두 선택한다', () => {
    document.body.innerHTML = '<button id="other">x</button><textarea class="search-input">이전 글</textarea>';
    (document.getElementById('other') as HTMLButtonElement).focus();
    expect(focusGensparkComposer()).toBe(true);
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(ta);
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([0, '이전 글'.length]);
    document.body.innerHTML = '';
    expect(focusGensparkComposer()).toBe(false);
  });
});

describe('readGensparkPageSignals', () => {
  // iframe 주소를 실제로 내려받지 않게 한다(시험은 외부 접속 없음)
  beforeAll(() => {
    const settings = (window as unknown as { happyDOM?: { settings?: { disableIframePageLoading?: boolean } } }).happyDOM?.settings;
    if (settings) settings.disableIframePageLoading = true;
  });

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

  it('작업 화면에 늘 깔린 보이지 않는 reCAPTCHA 틀은 보안 확인이 아니다 (2026-10-10 실측)', () => {
    document.body.innerHTML = '<div class="grecaptcha-badge" style="visibility:hidden;position:fixed"><div class="grecaptcha-logo">'
      + '<iframe id="rc" title="reCAPTCHA" src="https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=x&size=invisible"></iframe></div></div>'
      + '<img src="https://www.genspark.ai/api/files/s/abc">';
    (document.getElementById('rc') as HTMLElement).getBoundingClientRect = rect(0, 0, 0, 0);
    expect(readGensparkPageSignals().challenge).toBe(false);
  });

  it('화면에 보이는 확인 틀(reCAPTCHA 문제 창·Cloudflare)은 보안 확인이다', () => {
    document.body.innerHTML = '<iframe id="bf" src="https://www.google.com/recaptcha/enterprise/bframe?k=x"></iframe>';
    (document.getElementById('bf') as HTMLElement).getBoundingClientRect = rect(300, 100, 400, 580);
    expect(readGensparkPageSignals().challenge).toBe(true);
    document.body.innerHTML = '<iframe id="cf" src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x"></iframe>';
    (document.getElementById('cf') as HTMLElement).getBoundingClientRect = rect(400, 300, 300, 65);
    expect(readGensparkPageSignals().challenge).toBe(true);
  });

  it('프롬프트 에코(입력창 안 글자)는 오탐하지 않는다', () => {
    document.body.innerHTML = '<textarea class="search-input">생성에 실패 Too many requests</textarea><p>정상 화면</p>';
    const s = readGensparkPageSignals();
    expect(s.failed).toBe(false);
    expect(s.rateLimited).toBe(false);
    expect(s.challenge).toBe(false);
  });
});
