import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeHashtags } from '../renderer/utils/hashtagUtils';

/**
 * [v2.11.140d] 해시태그 '#' 표시 왕복 계약 (사용자 요청: 필드에 # 포함 표시).
 * 표시는 "#태그 #태그", 정규형(저장·비교·발행)은 # 없는 태그. normalizeHashtags가
 * 앞 #을 벗겨야 재발행 시 "##태그" 이중 접두가 생기지 않는다.
 */
describe('hashtag # display round trip (v2.11.140d)', () => {
  it('normalizeHashtags가 앞 #을 벗겨 정규형을 유지한다', () => {
    expect(normalizeHashtags('#전기요금 #누진제 여름전기요금')).toEqual([
      '전기요금', '누진제', '여름전기요금',
    ]);
    expect(normalizeHashtags(['#태그1', '태그2', '##태그3'])).toEqual([
      '태그1', '태그2', '태그3',
    ]);
    // 왕복: 표시형("#a #b")을 다시 정규화해도 동일
    const tags = ['전기요금누진제한시완화', '전력수요'];
    const displayed = tags.map((t) => `#${t}`).join(' ');
    expect(normalizeHashtags(displayed)).toEqual(tags);
  });

  it('UI 채움 3곳이 # 접두 표시를 사용한다', () => {
    const contentGeneration = readFileSync(
      resolve(__dirname, '../renderer/modules/contentGeneration.ts'), 'utf8');
    const postListUI = readFileSync(
      resolve(__dirname, '../renderer/modules/postListUI.ts'), 'utf8');
    expect(contentGeneration.match(/map\(\(tag: string\) => `#\$\{tag\}`\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(postListUI).toContain('map((tag) => `#${tag}`)');
  });
});
