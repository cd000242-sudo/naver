import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  setHumanMotionEnabled,
  isHumanMotionEnabled,
  humanWarmup,
  humanClick,
  humanMouseMoveTo,
} from '../image/humanInteraction';

/*
 * [2026-09-15] 화면 밖 창에서 사람흉내 마우스 궤적을 끄는 동작을 잠근다.
 *
 * 실측으로 humanWarmup 81~155초 · 전송 버튼 humanClick 81초가 나왔고, 1장 180초 중
 * Flow 가 실제로 그림을 그리는 건 42~58초뿐이었다. 창을 -32000,-32000 으로 밀어놨기 때문에
 * mouse.move 한 점이 정상 속도로 처리되지 않는다.
 *
 * 이 테스트가 지키는 계약은 두 가지다.
 *   1) 궤적 OFF 면 mouse.move 를 점마다 부르지 않는다 (느려지지 않는다)
 *   2) 궤적 ON 이면 예전 그대로다 (봇 회피를 조용히 잃지 않는다)
 */

type Call = { name: string; args: unknown[] };

function fakePage(calls: Call[]) {
  const rec = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args });
    return Promise.resolve();
  };
  return {
    mouse: { move: rec('move'), down: rec('down'), up: rec('up'), wheel: rec('wheel') },
    waitForTimeout: rec('waitForTimeout'),
  } as any;
}

function fakeLocator(calls: Call[], box: { x: number; y: number; width: number; height: number } | null) {
  return {
    boundingBox: async () => box,
    click: async () => { calls.push({ name: 'locator.click', args: [] }); },
  } as any;
}

describe('화면 밖 창에서의 사람흉내 마우스 궤적', () => {
  beforeEach(() => setHumanMotionEnabled(true));
  afterEach(() => setHumanMotionEnabled(true));

  it('기본값은 궤적 사용 — 아무도 끄지 않으면 예전 동작이다', () => {
    expect(isHumanMotionEnabled()).toBe(true);
  });

  it('궤적 OFF 면 워밍업이 마우스를 전혀 건드리지 않는다', async () => {
    const calls: Call[] = [];
    setHumanMotionEnabled(false);
    await humanWarmup(fakePage(calls), { width: 1280, height: 800 });
    expect(calls).toHaveLength(0);
  });

  it('궤적 ON 이면 워밍업이 여전히 마우스를 움직인다', async () => {
    const calls: Call[] = [];
    await humanWarmup(fakePage(calls), { width: 1280, height: 800 });
    expect(calls.filter(c => c.name === 'move').length).toBeGreaterThan(10);
  });

  it('궤적 OFF 면 클릭이 locator.click 한 번으로 끝난다', async () => {
    const calls: Call[] = [];
    setHumanMotionEnabled(false);
    const page = fakePage(calls);
    await humanClick(page, fakeLocator(calls, { x: 10, y: 20, width: 100, height: 40 }));
    expect(calls.map(c => c.name)).toEqual(['locator.click']);
  });

  it('궤적 ON 이면 클릭이 이동+호버+누름을 그대로 한다', async () => {
    const calls: Call[] = [];
    const page = fakePage(calls);
    await humanClick(page, fakeLocator(calls, { x: 10, y: 20, width: 100, height: 40 }));
    const names = calls.map(c => c.name);
    expect(names).toContain('move');
    expect(names).toContain('down');
    expect(names).toContain('up');
    expect(names).not.toContain('locator.click');
  });

  it('궤적 OFF 면 이동이 한 번이고 대기가 없다', async () => {
    const calls: Call[] = [];
    setHumanMotionEnabled(false);
    await humanMouseMoveTo(fakePage(calls), 500, 300);
    expect(calls.filter(c => c.name === 'move')).toHaveLength(1);
    expect(calls.filter(c => c.name === 'waitForTimeout')).toHaveLength(0);
  });
});

describe('flowGenerator 배선', () => {
  const src = readFileSync(join(process.cwd(), 'src/image/flowGenerator.ts'), 'utf-8');

  it('워밍업 직전에 창 좌표로 화면 밖 여부를 판정한다', () => {
    expect(src).toMatch(/setHumanMotionEnabled\(!offScreen\)/);
    expect(src).toMatch(/window\.screenX < -10000/);
  });

  it('좌표를 못 읽으면 궤적을 유지한다 — 조용히 봇회피를 잃지 않는다', () => {
    expect(src).toMatch(/let offScreen = false;/);
  });
});

describe('promptInput 셀렉터 순서', () => {
  const src = readFileSync(join(process.cwd(), 'src/automation/selectors/flowSelectors.ts'), 'utf-8');
  const block = src.slice(src.indexOf('promptInput: entry('), src.indexOf('submitButton: entry('));

  it('실측에서 45ms 에 맞은 div[contenteditable] 이 먼저다', () => {
    const div = block.indexOf(`'div[contenteditable="true"]'`);
    const role = block.indexOf(`'[role="textbox"][contenteditable="true"]'`);
    expect(div).toBeGreaterThan(-1);
    expect(role).toBeGreaterThan(-1);
    expect(div).toBeLessThan(role);
  });

  it('5,001ms 쓰던 예전 셀렉터를 지우지 않고 폴백으로 남긴다', () => {
    expect(block).toContain(`'[role="textbox"][contenteditable="true"]'`);
  });
});
