import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-02] 본문을 쓰는 모델이 오늘이 며칠인지 모른 채 썼다.
 *
 * 사장님 침구 글 실측:
 *   자료  = 지난해 보도자료 "2025 구스&울 페어 … 오는 17일부터"
 *   본문  = "2025 구스&울 페어는 오는 17일부터 … 열리는 행사로 안내됐습니다"
 *   본문  = "9월 26일~10월 9일 롯데백화점 침구류 매출은 전주 대비 25% 증가했습니다"
 * 9월 26일은 아직 오지 않았는데 과거형이고, 1년 전에 끝난 행사가 "오는 17일" 이다.
 * 그 글을 본 독자는 백화점에 가서 없는 행사를 찾는다.
 *
 * 제목 프롬프트에는 날짜 규율이 이미 있었다(contentGenerator:902~917).
 * 그래서 제목만 멀쩡했다. 본문 프롬프트에는 한 줄도 없었다 — 그게 전부였다.
 *
 * DateClaim 감지기는 그 문장을 정확히 잡았다. 잡고도 그대로 나갔다.
 * 감지 후 재작성은 비용만 늘린다. 첫 호출에서 알려주는 것이 해법이다.
 */

function build(mode: 'seo' | 'homefeed' | 'mate' | 'business') {
  return buildContentJsonOutputFormat({
    contentMode: mode,
    mode,
    source: { rawText: '원본', title: '제목', metadata: {} } as never,
    title: '9월 가을 환절기 침구 교체',
    rawText: '2025 구스&울 페어는 오는 17일부터 다음 달 9일까지 열립니다.',
    primaryKeyword: '침구 교체',
    subKeywords: '',
  });
}

const MODES = ['seo', 'homefeed', 'mate', 'business'] as const;

describe('본문 프롬프트는 오늘 날짜를 알려준다', () => {
  it.each(MODES.map((m) => [m]))('%s 모드에 실제 오늘 날짜가 실린다', (mode) => {
    const now = new Date();
    const label = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    expect(build(mode)).toContain(`오늘은 ${label}이다`);
  });

  it('하드코딩된 날짜가 아니다 — 실행 시점을 따른다', () => {
    const prompt = build('seo');
    expect(prompt).not.toMatch(/오늘은 2025년 12월/u);
    expect(prompt).toMatch(/오늘은 \d{4}년 \d{1,2}월 \d{1,2}일이다/u);
  });
});

describe('본문 프롬프트의 날짜 규율', () => {
  const prompt = build('seo');

  it('자료의 날짜를 올해로 바꾸지 말라고 한다', () => {
    expect(prompt).toContain('올해로 바꾸지 않는다');
    expect(prompt).toContain('지난해 것이면 지난해 일로 쓴다');
  });

  it('자료의 상대 표현을 그대로 옮기지 말라고 한다 — "오는 17일" 이 실측 사고다', () => {
    expect(prompt).toContain('"오는 17일", "다음 달", "이번 주"');
    expect(prompt).toContain('자료의 절대 날짜로 바꾸고');
    expect(prompt).toContain('독자가 없는 행사를 찾아간다');
  });

  it('오지 않은 날을 과거형으로 쓰지 말라고 한다', () => {
    expect(prompt).toContain('오늘 이후의 날짜를 이미 일어난 일처럼 쓰지 않는다');
    expect(prompt).toContain('과거형으로 단정하면 그 자체가 거짓');
  });

  it('최종 강제 조건 안에 있다 — 조립 맨 뒤라 앞선 지시를 이긴다', () => {
    const gateIdx = prompt.indexOf('[최종 강제 조건');
    const dateIdx = prompt.indexOf('이 날짜가 자료의 시점을 판정하는 유일한 기준이다');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(dateIdx).toBeGreaterThan(gateIdx);
  });
});

/*
 * [2026-09-02 2차] 산문 지시만으로는 안 됐다 — 실측으로 확인.
 *
 * 위 블록(최종 강제 조건 8번)을 넣고 빌드·재시작한 뒤 같은 키워드로 다시 뽑았더니
 * 똑같은 문장이 또 나왔다:
 *   [DateClaim] 아직 오지 않은 날("9월 26일")을 이미 일어난 일처럼 썼습니다
 *   "9월 26일~10월 9일 침구류 매출은 전주 대비 25% 증가했다는 기록도 있습…"
 * dist:450 에 문구가 있는 것도 확인했다. 프롬프트는 도착했고 모델이 흘렸다.
 *
 * 이 저장소가 다섯 번 확인한 원칙이다 — 산문 지시는 흘리고 스키마 필드는 지킨다
 * (해시태그 · 제목 길이 · 요약표 · clickReason · evidence). 형태를 바꾼다.
 * dateBasis 는 본문보다 먼저 채워지는 자리라, 모델이 자료 날짜를 오늘과
 * 하나씩 대보지 않고는 JSON 을 완성할 수 없다.
 */
describe('dateBasis — 쓰기 전에 날짜를 오늘과 대보게 만든다', () => {
  const MODES2 = [`seo`, `homefeed`, `mate`, `business`] as const;

  it.each(MODES2.map((m) => [m]))('%s 모드 스키마에 dateBasis 가 있다', (mode) => {
    const prompt = build(mode);
    expect(prompt).toContain('"dateBasis"');
    expect(prompt).toContain('"todayIs"');
    expect(prompt).toContain('"alreadyPast"');
    expect(prompt).toContain('"notYetHappened"');
    expect(prompt).toContain('"relativeExpressions"');
  });

  it('todayIs 에 실제 오늘 날짜가 값으로 박힌다 — 설명문이 아니라 값이다', () => {
    const now = new Date();
    const label = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    expect(build(`seo`)).toContain(`"todayIs": "${label}"`);
  });

  it('본문보다 먼저 채워지는 자리에 있다 — 제목·본문 필드보다 앞선다', () => {
    const prompt = build(`seo`);
    const dateIdx = prompt.indexOf('"dateBasis"');
    const titleIdx = prompt.indexOf('"selectedTitle"');
    const introIdx = prompt.indexOf('"introduction"');
    expect(dateIdx).toBeGreaterThan(-1);
    expect(dateIdx).toBeLessThan(titleIdx);
    expect(dateIdx).toBeLessThan(introIdx);
  });

  it('그 판정을 본문에 어떻게 쓰라는 계약이 함께 간다', () => {
    const prompt = build(`seo`);
    expect(prompt).toContain('[날짜 대조] dateBasis 를 본문보다 먼저 채운다');
    expect(prompt).toContain('alreadyPast 의 일은 과거형으로 쓴다');
    expect(prompt).toContain('notYetHappened 의 기간은 실적·결과·반응을 쓰지 않는다');
    expect(prompt).toContain('relativeExpressions 는 본문에 그대로 옮기지 않는다');
  });
});
