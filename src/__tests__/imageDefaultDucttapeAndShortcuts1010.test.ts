// @vitest-environment happy-dom
/**
 * [2026-10-10] 시니어층 배려 — (A) 이미지 기본값 = 덕트테이프 + Sunburst, (B) 발행·이미지 바로가기 배치.
 * 기본값은 "저장값이 없을 때"만 바뀌고, 사용자가 저장한 엔진 값은 절대 바뀌지 않아야 한다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolvePipelineConfig } from '../renderer/modules/pipelineConfig';
import { migrateOpenaiImageTwoModels } from '../runtime/imageProviderMigration';
import { getFullAutoImageSource, getGlobalImageSource } from '../renderer/components/HeadingImageSettings';

const root = path.resolve(__dirname, '..', '..');
const read = (...seg: string[]): string => fs.readFileSync(path.join(root, ...seg), 'utf-8').replace(/\r\n/g, '\n');
const html = read('public', 'index.html');
const css = read('public', 'floating-buttons.css');
const js = read('public', 'floating-scroll.js');

const makeStorage = (data: Record<string, string>) => ({
  getItem: (k: string) => (k in data ? data[k] : null),
});

afterEach(() => {
  delete (globalThis as any).document;
  localStorage.clear();
});

describe('A. 이미지 엔진 기본값 = 덕트테이프(openai-image)', () => {
  it('#image-source-select 의 selected option 은 openai-image 하나뿐이다', () => {
    const start = html.indexOf('id="image-source-select"');
    const block = html.slice(start, html.indexOf('</select>', start));
    const selected = [...block.matchAll(/<option value="([^"]+)"[^>]*\sselected[\s>]/g)].map((m) => m[1]);
    expect(selected).toEqual(['openai-image']);
  });

  it('덕트테이프 모델 라디오의 기본 checked 는 Sunburst 하나뿐이다', () => {
    const radios = [...html.matchAll(/<input[^>]*name="openai-image-model"[^>]*>/g)].map((m) => m[0]);
    const checked = radios.filter((r) => /\schecked/.test(r)).map((r) => /value="([^"]+)"/.exec(r)?.[1]);
    expect(checked).toEqual(['gpt-image-2.5-sunburst']);
  });

  it('저장값이 전혀 없으면 풀오토·글로벌 엔진 읽기 기본값이 openai-image 다', () => {
    localStorage.clear();
    expect(getFullAutoImageSource()).toBe('openai-image');
    expect(getGlobalImageSource()).toBe('openai-image');
  });

  it.each(['dropshot', 'nano-banana-2', 'flow', 'prodia', 'openai-image'])(
    '사용자가 저장한 엔진 %s 는 그대로 읽힌다',
    (engine) => {
      localStorage.setItem('globalImageSource', engine);
      localStorage.setItem('fullAutoImageSource', engine);
      expect(getFullAutoImageSource()).toBe(engine);
      expect(getGlobalImageSource()).toBe(engine);
    },
  );

  it('옛 별칭 nano-banana-pro · nano-banana 는 여전히 nano-banana-2 로 읽힌다', () => {
    for (const old of ['nano-banana-pro', 'nano-banana']) {
      localStorage.setItem('globalImageSource', old);
      expect(getFullAutoImageSource()).toBe('nano-banana-2');
    }
  });

  it('파이프라인 설정: 저장값 없음 → openai-image / Sunburst, 저장값 있음 → 저장값 그대로', () => {
    const original = (globalThis as any).localStorage;
    try {
      (globalThis as any).localStorage = makeStorage({});
      const fresh = resolvePipelineConfig('full-auto');
      expect(fresh.image.imageSource).toBe('openai-image');
      expect(fresh.shopping.aiImageEngine).toBe('openai-image');
      expect(fresh.shopping.aiImageModel).toBe('gpt-image-2.5-sunburst');

      for (const engine of ['dropshot', 'nano-banana-2', 'flow']) {
        (globalThis as any).localStorage = makeStorage({
          fullAutoImageSource: engine,
          globalImageSource: engine,
          scAIImageEngine: engine,
        });
        const cfg = resolvePipelineConfig('full-auto');
        expect(cfg.image.imageSource).toBe(engine);
        expect(cfg.shopping.aiImageEngine).toBe(engine);
      }
    } finally {
      (globalThis as any).localStorage = original;
    }
  });

  it('모델 이관은 엔진 저장값(fullAuto/global/scAI/큐)을 건드리지 않는다', () => {
    const data: Record<string, string> = {
      openaiImageModel: 'gpt-image-1.5',
      fullAutoImageSource: 'dropshot',
      globalImageSource: 'nano-banana-2',
      scAIImageEngine: 'flow',
      continuousQueue: '[{"imageSource":"dropshot"}]',
    };
    const store = {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { data[k] = v; },
    };
    expect(migrateOpenaiImageTwoModels(store)).toBe(1);
    expect(data).toMatchObject({
      openaiImageModel: 'gpt-image-2.5-sunburst',
      fullAutoImageSource: 'dropshot',
      globalImageSource: 'nano-banana-2',
      scAIImageEngine: 'flow',
      continuousQueue: '[{"imageSource":"dropshot"}]',
    });
  });

  it('옛 값 교정 자리(별칭 맵·취소 시 되돌림·로컬폴더 보조 엔진)는 nano-banana-2 로 남아 있다', () => {
    const heading = read('src', 'renderer', 'components', 'HeadingImageSettings.ts');
    expect(heading).toMatch(/'nano-banana-pro': 'nano-banana-2',\s*'nano-banana': 'nano-banana-2'/);
    expect(heading).toContain("setGlobalImageSource('nano-banana-2');");
    expect(heading).toContain('<option value="nano-banana-2" selected>');
    expect(read('src', 'renderer', 'modules', 'imageManagementTab.ts')).toContain("imageSourceSelect.value = 'nano-banana-2';");
  });
});

describe('B. 바로가기 두 개 — 메인 풀오토 이미지 설정 버튼 위에 쌓는다', () => {
  /** CSS 에서 선택자(쉼표 목록 포함) 그대로의 규칙 본문을 돌려준다. */
  const rule = (selector: string): string => {
    // 쉼표 목록의 뒤쪽 선택자("..,\n#image-shortcut-btn {")를 단독 규칙으로 착각하지 않도록 앞이 쉼표가 아닌 경우만 센다
    const escaped = selector.replace(/[#.]/g, '\\$&');
    const m = new RegExp(`(?:^|\\n)(?<!,\\n)${escaped} \\{`).exec(css);
    const at = m ? m.index : -1;
    if (at < 0) return '';
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  };
  const px = (body: string, prop: string): number => Number(new RegExp(`${prop}:\\s*(\\d+)`).exec(body)?.[1]);
  const BASE = '#publish-shortcut-btn,\n#image-shortcut-btn';

  it('index.html 에 두 버튼이 있고 이미지 바로가기는 images 패널을 가리킨다', () => {
    expect(html).toMatch(/<button[^>]*id="publish-shortcut-btn"[^>]*aria-label="[^"]+"[^>]*title="[^"]+"/);
    expect(html).toMatch(/<button[^>]*id="image-shortcut-btn"[^>]*aria-controls="tab-images"[^>]*aria-label="[^"]+"[^>]*title="[^"]+"/);
    expect(html).toContain('이미지 바로가기');
    expect(html).toMatch(/<div id="tab-images" class="tab-panel" role="tabpanel" tabindex="-1"/);
  });

  it('두 버튼 모두 bottom 기준이고 위로 쌓인다 (이미지 > 발행 > 메인 풀오토 130px), 간격 10~12px', () => {
    const base = rule(BASE);
    const pub = rule('#publish-shortcut-btn');
    const img = rule('#image-shortcut-btn');
    expect(base).toMatch(/position:\s*fixed/);
    expect(base).toMatch(/right:\s*24px/);
    expect(base).not.toMatch(/\btop:/);
    expect(px(base, 'height')).toBeGreaterThanOrEqual(56);
    expect(px(base, 'font-size')).toBeGreaterThanOrEqual(17);
    expect(base).toMatch(/font-weight:\s*800/);
    expect(px(base, 'z-index')).toBeLessThan(10000);
    const mainTop = 130 + 56;
    expect(px(pub, 'bottom') - mainTop).toBeGreaterThanOrEqual(10);
    expect(px(pub, 'bottom') - mainTop).toBeLessThanOrEqual(12);
    const pubTop = px(pub, 'bottom') + px(base, 'height');
    expect(px(img, 'bottom') - pubTop).toBeGreaterThanOrEqual(10);
    expect(px(img, 'bottom') - pubTop).toBeLessThanOrEqual(12);
  });

  it('색(발행=초록 유지, 이미지=파랑)·포커스 표시·같은 너비', () => {
    expect(rule('#publish-shortcut-btn')).toMatch(/background:\s*#087c4c/);
    expect(rule('#image-shortcut-btn')).toMatch(/background:\s*#1d4ed8/);
    expect(css).toMatch(/#publish-shortcut-btn:focus-visible,\n#image-shortcut-btn:focus-visible\s*\{[^}]*outline:\s*3px solid/);
    expect(rule(BASE)).toMatch(/width:\s*210px/);
    expect(rule('#publish-shortcut-btn')).not.toMatch(/\bwidth:/);
    expect(rule('#image-shortcut-btn')).not.toMatch(/\bwidth:/);
  });

  it('메인 풀오토 이미지 설정 버튼은 bottom 130px · right 24px · 높이 56px 로 고정된다', () => {
    const src = read('src', 'renderer', 'components', 'HeadingImageSettings.ts');
    const from = src.indexOf("btn.id = 'heading-image-setting-btn'");
    const block = src.slice(from, src.indexOf('btn.addEventListener', from));
    expect(block).toMatch(/bottom: 130px;/);
    expect(block).toMatch(/right: 24px;/);
    expect(block).toMatch(/height: 56px;/);
    expect(block).toMatch(/box-sizing: border-box;/);
  });

  it('이미지 바로가기: images 탭 클릭 → 패널 맨 위 스크롤 → 패널 포커스 → 강조, 발행 버튼은 누르지 않는다', () => {
    const start = js.indexOf('(function initImageShortcut()');
    const body = js.slice(start, js.indexOf('// 플로팅 버튼 스크롤 따라다니기'));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("document.getElementById('image-shortcut-btn')");
    expect(body).toContain('document.body.appendChild(shortcut)');
    expect(body).toContain('.tab-button[data-tab="images"]');
    expect(body).toContain("document.getElementById('tab-images')");
    expect(body).toContain('tab.click()');
    expect(body).toMatch(/behavior: reduceMotion \? 'instant' : 'smooth', block: 'start'/);
    expect(body).toContain('panel.focus({ preventScroll: true })');
    expect(body).toContain('image-shortcut-highlight');
    expect(body).not.toContain('unified-publish-btn');
    // 발행 바로가기 동작은 그대로
    expect(js).toContain('.tab-button[data-tab="unified"]');
    expect(js).toContain('section.focus({ preventScroll: true })');
  });
});
