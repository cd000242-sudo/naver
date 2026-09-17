import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { getImageDiversityHints, resolveDiversitySeedFromText } from '../image/imageStyles';

/*
 * [2026-09-17 실측 사고] 발행 글의 소제목 이미지 6장이 전부 같은 구도로 나갔다 —
 * 위에서 내려다본 부감에 같은 노란 햇빛.
 *
 *   [OpenAI-Image] 🎲 다양성[0]: 📐bird-eye view | 💡warm golden hour sunlight   ← 8장 전부
 *   (다른 생성에서는 다양성[4] [5] [6] 으로 제대로 돌고 있었다)
 *
 * 축 배열의 0번이 각각 'bird-eye view' 와 'warm golden hour sunlight' 인데,
 * 호출자가 이미지를 한 장씩 넘기면 루프 인덱스가 언제나 0 이라 0번만 나온다.
 * 이 실패 모드는 주석에 이미 적혀 있었고 diversityIndex 라는 해결책도 있었지만,
 * 그 값을 넘기지 않는 호출 경로가 남아 있어 증상이 되살아났다.
 *
 * 그래서 두 겹으로 막는다.
 *   1) 소제목 전체를 아는 호출자(main.ts)는 순번을 실어 보낸다 — 각도가 확실히 갈린다.
 *   2) 순번이 없는 경로는 소제목 글자로 시드를 만든다 — 최소한 전부 같지는 않게.
 */
describe('소제목 글자로 만든 시드', () => {
  it('같은 소제목은 늘 같은 시드 — 재생성해도 구도가 흔들리지 않는다', () => {
    const a = resolveDiversitySeedFromText('북촌에서 시작되는 위험한 사랑 내기');
    const b = resolveDiversitySeedFromText('북촌에서 시작되는 위험한 사랑 내기');
    expect(a).toBe(b);
  });

  it('소제목이 다르면 시드도 다르다', () => {
    expect(resolveDiversitySeedFromText('9월 18일 오후 5시, 전편이 열립니다'))
      .not.toBe(resolveDiversitySeedFromText('북촌에서 시작되는 위험한 사랑 내기'));
  });

  it('빈 값은 0 — 기존 동작과 같다', () => {
    expect(resolveDiversitySeedFromText('')).toBe(0);
    expect(resolveDiversitySeedFromText(undefined)).toBe(0);
  });

  it('실측 소제목 6개가 한 구도로 몰리지 않는다', () => {
    const headings = [
      '9월 18일 오후 5시, 전편이 열립니다',
      '북촌에서 시작되는 위험한 사랑 내기',
      '조씨부인·조원·희연, 관계는 이렇게 엮입니다',
      '정지우 감독과 두 작가가 만든 조선의 밤',
      '24년 만의 사극 복귀가 더 눈에 들어오는 이유',
      '금요일에 시작할지, 주말에 몰아볼지',
    ];
    const combos = new Set(
      headings.map(h => {
        const d = getImageDiversityHints(resolveDiversitySeedFromText(h));
        return `${d.angle}|${d.lighting}`;
      }),
    );
    // 사고 당시에는 6장이 전부 한 조합이었다.
    expect(combos.size).toBeGreaterThan(1);
    expect(combos.size).toBeGreaterThanOrEqual(5);
  });
});

describe('순번을 아는 호출자는 순번을 보낸다', () => {
  it('소제목 이미지 항목에 diversityIndex 가 실린다', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/diversityIndex: headingImageIndex\+\+/);
  });

  it('연속 순번이면 각도가 모두 갈린다', () => {
    const angles = new Set([0, 1, 2, 3, 4, 5].map(i => getImageDiversityHints(i).angle));
    expect(angles.size).toBe(6);
  });
});
