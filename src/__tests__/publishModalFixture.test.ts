// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { getAllSelectors, PUBLISH_SELECTORS } from '../automation/selectors';
import type { SelectorEntry } from '../automation/selectors';

function matches(entry: SelectorEntry): boolean {
  return getAllSelectors(entry).some((selector) => {
    try {
      return document.querySelector(selector) !== null;
    } catch {
      return false;
    }
  });
}

describe('publish modal selector fixture', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <button class="publish_btn__m9KHH" data-click-area="tpb.publish">발행</button>
        <button class="save_btn__bzc5B" data-click-area="tpb.save">저장</button>
        <section role="dialog" aria-label="발행 설정">
          <button data-click-area="tpb*i.category" aria-label="카테고리 목록 버튼">카테고리</button>
          <div class="category_selector__root" role="listbox">
            <button class="categoryArea__item">생활·정책</button>
          </div>
          <label for="radio_time1">현재 발행</label>
          <input id="radio_time1" name="radio_time" value="now" type="radio" />
          <label for="radio_time2">예약 발행</label>
          <input id="radio_time2" name="radio_time" value="pre" type="radio" />
          <input class="input_date__abc" type="date" />
          <select class="hour_option__abc" name="hour"><option>09</option></select>
          <select class="minute_option__abc" name="minute"><option>30</option></select>
          <button class="confirm_btn__WEaBq" data-testid="seOnePublishBtn" data-click-area="tpb*i.publish">발행</button>
        </section>
      </main>
    `;
  });

  it('matches the current toolbar and modal publish controls', () => {
    expect(matches(PUBLISH_SELECTORS.publishButton)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.confirmPublishButton)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.saveButton)).toBe(true);
  });

  it('matches category and schedule controls used by the publish modal', () => {
    expect(matches(PUBLISH_SELECTORS.categoryButton)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.categorySelector)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.immediateRadio)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.scheduleRadio)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.scheduleRadioByValue)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.dateInput)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.hourSelect)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.minuteSelect)).toBe(true);
  });

  it('does not confuse the toolbar publish button with the modal confirm button', () => {
    document.body.innerHTML = '<button class="publish_btn__m9KHH" data-click-area="tpb.publish">발행</button>';
    expect(matches(PUBLISH_SELECTORS.publishButton)).toBe(true);
    expect(matches(PUBLISH_SELECTORS.confirmPublishButton)).toBe(false);
  });
});
