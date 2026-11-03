import { describe, expect, it, vi } from 'vitest';
import { filterMinedTitles, runTitleTournament, titleSimilarity, TITLE_AXES } from '../main/services/dailyTitleTournament.js';

const body = '정비소에서는 트렁크 경고음이 대부분 래치 센서 오염 때문이라고 설명했다. 센서를 닦고 배선을 고정하자 경고음이 멈췄다. 수리비는 3만원이었다.';
const source = `트렁크 경고음 민원이 늘었다. ${body}`;
const mined = (title: string, answer: string, axis = 'Problem', q = '트렁크 경고음은 왜 날까?') => ({ axis, readerQuestion: q, title, answer });

describe('local filtering of mined titles', () => {
  it('drops titles whose answer is not in the body, near duplicates and generic hooks without a concrete subject', () => {
    const result = filterMinedTitles([
      mined('트렁크 경고음, 3만원 센서 청소로 멈췄다', '센서를 닦고 배선을 고정하자 경고음이 멈췄다.'),
      mined('트렁크 경고음 3만원 센서 청소로 멈췄다!', '센서를 닦고 배선을 고정하자 경고음이 멈췄다.'),
      mined('알고 보니 이유가 따로 있었다', '센서를 닦고 배선을 고정하자 경고음이 멈췄다.', 'Curiosity'),
      mined('트렁크 경고음, 정비소가 꼽은 진짜 원인', '원인은 배터리 방전이었다.'),
      mined('경고음 울리던 트렁크, 래치 센서 하나가 문제였다', '대부분 래치 센서 오염 때문이라고 설명했다.', 'Situation'),
    ], { body, source });
    expect(result.kept.map(c => c.title)).toEqual(['트렁크 경고음, 3만원 센서 청소로 멈췄다', '경고음 울리던 트렁크, 래치 센서 하나가 문제였다']);
    expect(result.stats).toMatchObject({ generated: 5, kept: 2, duplicate: 1, noAnswer: 1, generic: 1 });
  });

  it('rejects unknown axes and malformed rows instead of trusting them', () => {
    const result = filterMinedTitles([{ axis: 'Viral', readerQuestion: '질문', title: '트렁크 경고음 원인', answer: '센서를 닦고 배선을 고정하자 경고음이 멈췄다.' }, { title: 1 } as never], { body, source });
    expect(result.kept).toEqual([]);
    expect(result.stats.invalid).toBe(2);
    expect(TITLE_AXES).toContain('Social Tension');
  });

  it('similarity treats punctuation-only changes as the same title', () => {
    expect(titleSimilarity('트렁크 경고음, 3만원으로 멈췄다', '트렁크 경고음 3만원으로 멈췄다!')).toBeGreaterThan(0.9);
    expect(titleSimilarity('트렁크 경고음 원인', '충전 커넥터 녹 제거법')).toBeLessThan(0.2);
  });
});

describe('tournament orchestration', () => {
  const many = ['트렁크 경고음 멈춘 3만원짜리 해결법', '닫아도 울리는 트렁크, 범인은 래치 센서', '정비소가 먼저 닦아 본 부품은 센서였다', '배선 고정 한 번에 사라진 경고음',
    '트렁크 열림 경고가 계속 뜰 때 볼 곳', '경고음 때문에 정비소 간 운전자의 수리비', '센서 오염이 부른 트렁크 소동', '3만원으로 끝난 트렁크 수리 이야기',
    '래치 센서 청소 전과 후 달라진 점', '경고음 민원이 늘어난 이유를 정비소에 물었다', '배선이 흔들리면 생기는 트렁크 경고', '트렁크 경고음, 부품 교체 전에 해 볼 일']
    .map(title => mined(title, '센서를 닦고 배선을 고정하자 경고음이 멈췄다.'));
  it('mines once, filters locally, then ranks a shortlist of at most 8 in one call', async () => {
    const call = vi.fn(async (_prompt: string, stage: string) => stage === 'mining'
      ? JSON.stringify({ candidates: many })
      : JSON.stringify({ ranking: ['t3', 't1', 't7'] }));
    const result = await runTitleTournament({ body, source, data: '{}' }, call);
    expect(call.mock.calls.map(c => c[1])).toEqual(['mining', 'tournament']);
    expect(call.mock.calls[0][0]).toContain('50');
    expect(result.status).toBe('ranked');
    expect(result.shortlist.map(s => s.id)).toEqual(['t3', 't1', 't7']);
    // 순위는 편집 판단 — 점수 · 확률을 요구하지 않고, 출력하지 말라고 명시한다
    expect(call.mock.calls[1][0]).toContain('확률 · 예상 반응을 출력하지 않는다');
    expect(call.mock.calls[1][0]).not.toMatch(/점수를 매겨|확률을 계산/);
  });

  it('a ranking that names unknown ids is refused and reported, never silently replaced', async () => {
    const call = vi.fn(async (_prompt: string, stage: string) => stage === 'mining' ? JSON.stringify({ candidates: many }) : JSON.stringify({ ranking: ['t99'] }));
    const result = await runTitleTournament({ body, source, data: '{}' }, call);
    expect(result.status).toBe('failed');
    expect(result.shortlist).toEqual([]);
    expect(result.reason).toContain('TOURNAMENT');
  });

  it('broken mining output is reported as failed with no shortlist', async () => {
    const result = await runTitleTournament({ body, source, data: '{}' }, async () => '그냥 문장');
    expect(result).toMatchObject({ status: 'failed', shortlist: [] });
  });
});
