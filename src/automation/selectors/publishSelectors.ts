/**
 * 네이버 블로그 발행/카테고리/예약 관련 셀렉터
 */
import type { SelectorEntry, SelectorMap } from './types';

export type PublishSelectorKey =
  | 'publishButton'
  | 'confirmPublishButton'
  | 'saveButton'
  | 'categoryButton'
  | 'categorySelector'
  | 'categoryAreaButton'
  | 'categoryWrapButton'
  | 'categoryItems'
  | 'immediateRadio'
  | 'scheduleRadio'
  | 'scheduleRadioLabel'
  | 'scheduleRadioByValue'
  | 'radioTimeGroup'
  | 'dateInput'
  | 'hourSelect'
  | 'minuteSelect'
  | 'dateTimeLocalInput'
  | 'dateTypeInput'
  | 'timeTypeInput'
  | 'datepicker'
  | 'datepickerTitle'
  | 'datepickerYear'
  | 'datepickerMonth'
  | 'datepickerNext'
  | 'datepickerPrev'
  | 'datepickerDayCells';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const PUBLISH_SELECTORS: SelectorMap<PublishSelectorKey> = {
  // --- 발행 버튼 ---
  publishButton: entry(
    'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
    [
      'button.publish_btn__m9KHH',
      'button[data-click-area="tpb.publish"]',
      'button[class*="publish_btn"]',
    ],
    '발행 버튼 (에디터 상단)',
  ),
  confirmPublishButton: entry(
    'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
    [
      'button[data-testid="seOnePublishBtn"]',
      'button[data-click-area="tpb*i.publish"]',
      'button.confirm_btn__WEaBq',
      'button[class*="confirm_btn"][data-testid="seOnePublishBtn"]',
      'button[class*="confirm_btn"]',
    ],
    '발행 확인 버튼 (모달 내부)',
  ),
  saveButton: entry(
    'button.save_btn__bzc5B',
    [
      'button[class*="save_btn"]',
      'button[data-click-area="tpb.save"]',
    ],
    '저장 버튼',
  ),

  // --- 카테고리 ---
  categoryButton: entry(
    '[data-click-area="tpb*i.category"]',
    [
      'button[aria-label="카테고리 목록 버튼"]',
      '[data-testid="seOneCategoryBtn"]',
      'button[class*="category_btn"]',
    ],
    '카테고리 드롭다운 열기 버튼',
  ),
  categorySelector: entry(
    '[class*="category_selector"]',
    [
      '[class*="categoryArea"]',
      '[class*="category_list"]',
      '[role="listbox"]',
    ],
    '카테고리 선택기 컨테이너',
  ),
  categoryAreaButton: entry(
    '[class*="categoryArea"] button',
    ['[class*="category_area"] button'],
    '카테고리 영역 내 버튼',
  ),
  categoryWrapButton: entry(
    '[class*="category"][class*="wrap"] button',
    ['[class*="category_wrap"] button'],
    '카테고리 래퍼 내 버튼',
  ),
  categoryItems: entry(
    '[class*="category"]',
    [
      '[data-testid*="category"]',
      '[class*="Category"]',
      '[role="option"]',
    ],
    '카테고리 아이템 목록 (querySelectorAll용)',
  ),

  // --- 발행 시간 (즉시/예약) ---
  immediateRadio: entry(
    'input#radio_time1',
    [
      'input[name="radio_time"][value="now"]',
      'input[name="radio_time"]:first-of-type',
    ],
    '즉시 발행 라디오 버튼',
  ),
  scheduleRadio: entry(
    'input#radio_time2',
    [
      'input[name="radio_time"][value="pre"]',
      'input[name="radio_time"]:nth-of-type(2)',
    ],
    '예약 발행 라디오 버튼',
  ),
  scheduleRadioLabel: entry(
    'label[for="radio_time2"]',
    ['label:has(input#radio_time2)', 'label[for*="radio_time"]'],
    '예약 발행 라디오 레이블',
  ),
  scheduleRadioByValue: entry(
    'input[name="radio_time"][value="pre"]',
    ['input#radio_time2', 'input[name="radio_time"]:nth-of-type(2)'],
    '예약 발행 라디오 (value 기반)',
  ),
  radioTimeGroup: entry(
    'input[name="radio_time"]',
    ['[class*="radio_time"]', '.publish_time_radio input'],
    '발행 시간 라디오 그룹 (querySelectorAll용)',
  ),

  // --- 날짜/시간 입력 ---
  dateInput: entry(
    'input[class*="input_date"]',
    ['input[type="date"]', 'input[placeholder*="날짜"]'],
    '날짜 입력 필드',
  ),
  hourSelect: entry(
    'select[class*="hour_option"]',
    ['select[class*="hour"]', 'select[name="hour"]'],
    '시간 선택 드롭다운',
  ),
  minuteSelect: entry(
    'select[class*="minute_option"]',
    ['select[class*="minute"]', 'select[name="minute"]'],
    '분 선택 드롭다운',
  ),
  dateTimeLocalInput: entry(
    'input[type="datetime-local"]',
    ['input[class*="datetime"]'],
    '날짜/시간 통합 입력',
  ),
  dateTypeInput: entry(
    'input[type="date"]',
    ['input[class*="input_date"]'],
    '날짜 전용 입력',
  ),
  timeTypeInput: entry(
    'input[type="time"]',
    ['input[class*="input_time"]'],
    '시간 전용 입력',
  ),

  // --- jQuery UI Datepicker ---
  datepicker: entry(
    '.ui-datepicker',
    ['#ui-datepicker-div', '[class*="datepicker"]'],
    'jQuery UI 달력 팝업',
  ),
  datepickerTitle: entry(
    '.ui-datepicker-title',
    ['.ui-datepicker-header .ui-datepicker-title'],
    '달력 제목 (년/월)',
  ),
  datepickerYear: entry(
    '.ui-datepicker-year',
    ['select.ui-datepicker-year', '.ui-datepicker-title .ui-datepicker-year'],
    '달력 연도',
  ),
  datepickerMonth: entry(
    '.ui-datepicker-month',
    ['select.ui-datepicker-month', '.ui-datepicker-title .ui-datepicker-month'],
    '달력 월',
  ),
  datepickerNext: entry(
    '.ui-datepicker-next:not(.ui-state-disabled)',
    ['.ui-datepicker-next', 'a.ui-datepicker-next'],
    '달력 다음 월 버튼',
  ),
  datepickerPrev: entry(
    '.ui-datepicker-prev:not(.ui-state-disabled)',
    ['.ui-datepicker-prev', 'a.ui-datepicker-prev'],
    '달력 이전 월 버튼',
  ),
  datepickerDayCells: entry(
    '.ui-datepicker td',
    ['.ui-datepicker tbody td', '.ui-datepicker-calendar td'],
    '달력 날짜 셀 (querySelectorAll용)',
  ),
};
