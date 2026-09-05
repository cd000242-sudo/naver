import { describe, expect, it } from 'vitest';
import { buildBlueprintPrompt } from '../content/blueprint/buildBlueprintPrompt';
import { findOffTopicRemnants } from '../content/blueprint/offTopicPostCheck';

/**
 * [2026-09-05] 확정 제목(키워드 그대로/수동 지정)이 있으면 설계도의 angle 은 그 제목이
 * 약속한 질문이어야 한다 — 키워드를 재해석해 제3의 각도를 만들면 제목 따로 본문 따로.
 * 그리고 offTopic 은 부탁이 아니라 사후 검사까지 이어져야 한다(경고-only).
 */
describe('buildBlueprintPrompt — 확정 제목', () => {
  const base = {
    keyword: '한 번 입은 옷',
    mode: 'seo',
    material: '자'.repeat(300),
  };

  it('확정 제목이 있으면 프롬프트가 제목 기준으로 바뀐다', () => {
    const prompt = buildBlueprintPrompt({
      ...base,
      confirmedTitle: '한 번 입은 옷, 옷장에 넣기는 찝찝하고 빨기는 애매하다면 ??',
    });
    expect(prompt).toContain('확정 제목 "한 번 입은 옷, 옷장에 넣기는 찝찝하고 빨기는 애매하다면 ??"');
    expect(prompt).toContain('제목과 다른 각도를 새로 만들지 않는다');
    expect(prompt).toContain('확정 제목의 질문에 답하지 않아');
    expect(prompt).toContain('관련 단어가 같아도 질문에 답하지 않으면');
  });

  it('확정 제목이 없으면 기존 키워드 기준 프롬프트 그대로 (회귀 확인)', () => {
    const prompt = buildBlueprintPrompt(base);
    expect(prompt).toContain('키워드 "한 번 입은 옷"');
    expect(prompt).toContain('키워드를 검색한 사람이 실제로 묻는 것');
    expect(prompt).not.toContain('확정 제목');
  });
});

describe('findOffTopicRemnants — 제외 주제 사후 검사', () => {
  const headings = [
    { title: '다시 입기 전에 확인할 옷의 상태', content: '냄새와 얼룩을 먼저 확인합니다. 통풍 후 세탁 여부를 정합니다.' },
    { title: '중고거래 옷 위생 논란', content: '중고거래 플랫폼에서 산 옷의 위생 문제가 논란이 되고 있다.' },
    { title: '섬유 폐기물 통계', body: '연간 섬유 폐기물이 수십만 톤에 달한다.' },
  ];

  it('본문에 남은 제외 주제를 소제목 단위로 찾는다', () => {
    const hits = findOffTopicRemnants(['중고거래 옷 위생', '섬유 폐기물 증가'], headings);
    expect(hits.map((h) => h.heading)).toContain('중고거래 옷 위생 논란');
    expect(hits.map((h) => h.heading)).toContain('섬유 폐기물 통계');
    // 정답 섹션은 걸리지 않는다.
    expect(hits.map((h) => h.heading)).not.toContain('다시 입기 전에 확인할 옷의 상태');
  });

  it('낱말 하나만 겹치는 섹션은 잡지 않는다 (오탐 방지)', () => {
    const hits = findOffTopicRemnants(['중국 사진용 의류 소비'], [
      { title: '옷 보관법', content: '의류 커버를 씌워 보관합니다.' },
    ]);
    expect(hits).toEqual([]);
  });

  it('제외 주제나 소제목이 없으면 빈 배열 — 던지지 않는다', () => {
    expect(findOffTopicRemnants([], headings)).toEqual([]);
    expect(findOffTopicRemnants(undefined, undefined)).toEqual([]);
    expect(findOffTopicRemnants(['주제'], [])).toEqual([]);
  });
});
