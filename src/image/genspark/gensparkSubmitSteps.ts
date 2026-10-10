// src/image/genspark/gensparkSubmitSteps.ts
// [2026-10-10] 젠스파크 전송 단계별 도우미(모델 맞추기 / 설정 / 입력). 오케스트레이션은 gensparkSubmit.ts.
//   화면 읽기 함수·셀렉터·문구는 gensparkSelectors 의 것만 쓴다. 모델·설정 버튼은 DOM click 이 무반응이라 마우스 좌표로 누른다.
import {
  GENSPARK_RATIO_LABELS,
  GENSPARK_SELECTORS,
  focusGensparkComposer,
  locateGensparkPoint,
  readGensparkComposer,
  readGensparkMenuState,
  readGensparkModelMenu,
  readGensparkSelectedModel,
  readGensparkSettingsMenu,
} from './gensparkSelectors';
import type { GensparkPointRequest } from './gensparkSelectors';
import {
  GENSPARK_COMPOSER_NOT_FOUND,
  GENSPARK_MODEL_CREDIT_CHANGED,
  GENSPARK_MODEL_NOT_FOUND,
  GENSPARK_SETTINGS_NOT_FOUND,
  GENSPARK_SUBMIT_FAILED,
  GensparkError,
} from './gensparkErrors';
import type { GensparkModelEntry } from './gensparkModels';
import type { GensparkPageLike } from './gensparkTypes';

export interface GensparkSubmitDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** 0 이상 1 미만(동작 사이 무작위 간격용) */
  random(): number;
  /** 이번 실행에서 이미 받은 작업 ID — 같은 ID 가 다시 나오면 거부하고, 새 ID 는 여기에 기록한다 */
  seenJobIds: Set<string>;
  log(message: string): void;
  /** 전송 뒤 작업 주소가 나타날 때까지 기다리는 한도(기본 20초) */
  jobUrlWaitMs?: number;
}

/** 값을 얻을 때까지 intervalMs 마다 확인. 시간이 지나면 null. */
export async function gensparkWaitFor<T>(
  deps: Pick<GensparkSubmitDeps, 'now' | 'sleep'>,
  timeoutMs: number,
  intervalMs: number,
  probe: () => Promise<T | null | undefined | false>,
): Promise<T | null> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (deps.now() >= deadline) return null;
    await deps.sleep(intervalMs);
  }
}

/** 동작 사이 0.4~0.9초 무작위 간격. */
export async function gensparkPause(deps: Pick<GensparkSubmitDeps, 'sleep' | 'random'>): Promise<void> {
  await deps.sleep(400 + Math.floor(deps.random() * 500));
}

async function clickPoint(page: GensparkPageLike, req: GensparkPointRequest): Promise<boolean> {
  const point = await page.evaluate(locateGensparkPoint, req);
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}

async function clickFirstOf(page: GensparkPageLike, reqs: GensparkPointRequest[]): Promise<boolean> {
  for (const req of reqs) {
    if (await clickPoint(page, req)) return true;
  }
  return false;
}

export async function gensparkCloseMenu(page: GensparkPageLike): Promise<void> {
  try {
    await page.keyboard.press('Escape');
    // [2026-10-10 실측] 이 메뉴는 Escape 로 안 닫히고 남아 입력창·전송 버튼을 덮었다 — 남아 있으면 페이지 큰 제목을 눌러 닫는다.
    const state = await page.evaluate(readGensparkMenuState);
    if (state.openMenus > 0 && state.neutral) await page.mouse.click(state.neutral.x, state.neutral.y);
  } catch {
    // 메뉴 닫기는 최선 노력 — 실패해도 이어서 진행한다
  }
}

/** 현재 모델이 다를 때만 메뉴를 열어 menuLabel 정확 일치 항목을 누르고, 고른 뒤 다시 읽어 확인한다. */
export async function gensparkEnsureModel(
  page: GensparkPageLike,
  model: GensparkModelEntry,
  deps: GensparkSubmitDeps,
): Promise<void> {
  const selected = await page.evaluate(readGensparkSelectedModel);
  if (selected === model.menuLabel) return;

  if (!(await clickPoint(page, { selector: GENSPARK_SELECTORS.modelButton }))) {
    throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, '모델 버튼을 찾지 못함');
  }
  const menu = await gensparkWaitFor(deps, 5_000, 250, async () => {
    const items = await page.evaluate(readGensparkModelMenu);
    return items.length > 0 ? items : null;
  });
  if (!menu) throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, '모델 목록이 열리지 않음');

  const entry = menu.find((m) => m.label === model.menuLabel);
  if (!entry) {
    await gensparkCloseMenu(page);
    throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, model.menuLabel);
  }
  if (entry.creditFree !== model.creditFree) {
    await gensparkCloseMenu(page);
    throw new GensparkError(
      GENSPARK_MODEL_CREDIT_CHANGED,
      `${model.menuLabel}: 앱 표 ${model.creditFree ? '무제한' : '크레딧 차감'} / 젠스파크 ${entry.creditFree ? '무제한' : '크레딧 차감'}`,
    );
  }
  const clicked = await clickPoint(page, {
    selector: GENSPARK_SELECTORS.modelItem,
    label: model.menuLabel,
    scope: GENSPARK_SELECTORS.menuRoot,
  });
  if (!clicked) throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, `${model.menuLabel} 항목을 누르지 못함`);

  const confirmed = await gensparkWaitFor(deps, 3_000, 250, async () =>
    (await page.evaluate(readGensparkSelectedModel)) === model.menuLabel ? true : null,
  );
  if (!confirmed) throw new GensparkError(GENSPARK_MODEL_NOT_FOUND, `${model.menuLabel} 선택 확인 실패`);
  deps.log(`[젠스파크] 모델 선택: ${model.menuLabel}`);
}

async function openSettingsMenu(page: GensparkPageLike, deps: GensparkSubmitDeps) {
  const current = await page.evaluate(readGensparkSettingsMenu);
  if (current.ratios.length > 0) return current;
  if (!(await clickPoint(page, { selector: GENSPARK_SELECTORS.settingsButton }))) {
    throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, '설정 버튼을 찾지 못함');
  }
  const opened = await gensparkWaitFor(deps, 5_000, 250, async () => {
    const menu = await page.evaluate(readGensparkSettingsMenu);
    return menu.ratios.length > 0 ? menu : null;
  });
  if (!opened) throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, '설정 메뉴가 열리지 않음');
  return opened;
}

/** 종횡비를 req.ratio 로, 생성 횟수를 '1' 로 맞춘다(선택 여부를 다시 읽어 확인, 최대 4번 시도). */
export async function gensparkEnsureSettings(
  page: GensparkPageLike,
  ratio: string,
  deps: GensparkSubmitDeps,
): Promise<void> {
  if (!GENSPARK_RATIO_LABELS.includes(ratio)) {
    throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, `지원하지 않는 종횡비 ${ratio}`);
  }
  const scope = GENSPARK_SELECTORS.menuRoot;
  for (let attempt = 0; attempt < 4; attempt++) {
    const menu = await openSettingsMenu(page, deps);
    const ratioOption = menu.ratios.find((o) => o.label === ratio);
    const countOption = menu.counts.find((o) => o.label === '1');
    if (!ratioOption || !countOption) {
      await gensparkCloseMenu(page);
      throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, !ratioOption ? `종횡비 ${ratio}` : '생성 횟수 1');
    }
    if (ratioOption.selected && countOption.selected) {
      await gensparkCloseMenu(page);
      return;
    }
    // [2026-10-10] 종횡비 항목은 .ratio-option 이 1순위, 보조로 .size-option·글자만 가진 말단 요소
    const ok = !ratioOption.selected
      ? await clickFirstOf(page, [
          { selector: GENSPARK_SELECTORS.ratioOption, label: ratio, scope },
          { selector: GENSPARK_SELECTORS.sizeOption, label: ratio, scope },
          { selector: ':not(:has(*))', label: ratio, scope },
        ])
      : await clickPoint(page, { selector: GENSPARK_SELECTORS.sizeOption, label: '1', scope });
    if (!ok) throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, '설정 항목을 누르지 못함');
    await gensparkPause(deps);
  }
  await gensparkCloseMenu(page);
  throw new GensparkError(GENSPARK_SETTINGS_NOT_FOUND, `종횡비 ${ratio}·생성 횟수 1 선택 확인 실패`);
}

/** 줄바꿈을 공백으로, 연속 공백을 하나로. 입력값 비교에도 같은 규칙을 쓴다. */
export function gensparkNormalizePrompt(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** 줄바꿈 없는 한 줄을 insertText 로 넣고 값을 다시 읽어 비교. 다르면 지우고 1회 더. */
export async function gensparkFillComposer(
  page: GensparkPageLike,
  prompt: string,
  deps: GensparkSubmitDeps,
): Promise<void> {
  const expected = gensparkNormalizePrompt(prompt);
  if (!expected) throw new GensparkError(GENSPARK_SUBMIT_FAILED, '프롬프트가 비어 있음');
  let lastSeen = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await clickPoint(page, { selector: GENSPARK_SELECTORS.composer }))) {
      throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND);
    }
    // [2026-10-10 실측] 눌러도 포커스가 안 들어간 적이 있다(입력창 0자) — 직접 포커스를 주고 기존 글을 선택한 뒤 지운다.
    if (!(await page.evaluate(focusGensparkComposer))) throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND, '입력창에 포커스를 줄 수 없음');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(expected);
    await gensparkPause(deps);
    const state = await page.evaluate(readGensparkComposer);
    if (!state.found) throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND);
    if (gensparkNormalizePrompt(state.value) === expected) return;
    // [2026-10-10] 원인을 볼 수 있게 글자 수·입력창 개수만 남긴다(프롬프트 원문은 남기지 않음).
    lastSeen = `넣은 글 ${expected.length}자, 입력창 ${gensparkNormalizePrompt(state.value).length}자, 입력창 ${state.count ?? '?'}개`;
    deps.log(`[젠스파크] 입력값 불일치 — 지우고 다시 입력 (${attempt + 1}/2) · ${lastSeen}`);
  }
  throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND, `입력한 글이 입력창 값과 다름 (${lastSeen})`);
}

/** 전송 버튼을 마우스로 누른다. 주 셀렉터가 없으면 대체 셀렉터를 차례로. */
export async function gensparkClickSend(page: GensparkPageLike): Promise<void> {
  const reqs = [GENSPARK_SELECTORS.sendButton, ...GENSPARK_SELECTORS.sendButtonFallbacks].map((selector) => ({ selector }));
  if (!(await clickFirstOf(page, reqs))) throw new GensparkError(GENSPARK_SUBMIT_FAILED, '전송 버튼을 찾지 못함');
}
