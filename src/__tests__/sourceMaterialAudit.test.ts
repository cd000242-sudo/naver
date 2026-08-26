import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  auditSourceMaterial,
  classifySourceKind,
} from '../content/sourceMaterialAudit';

/**
 * [2026-08-27 사장님 지시] "자료부족 먼저 해줘. 실시간 검색어가 떴다는 건 기사가 떴다는
 * 소리이니까."
 *
 * 맞는 논리다. 이슈 키워드로 검색했는데 기사를 하나도 못 긁었다면 둘 중 하나다 —
 * 아직 기사가 안 나온 키워드이거나, 애초에 이슈가 아닌 키워드다. 어느 쪽이든
 * 블로그 요약만으로 글을 쓰게 되고, 그때 지어내기가 시작된다.
 *
 * 실측이 그걸 보여줬다. "서은광 애교 자판기" 글은 풀텍스트 4건이 전부 블로그였고,
 * 키 172cm · 발사이즈 250mm · 차트 1위 · 경연 1등 트로피가 확정 사실처럼 실렸다.
 * 전부 블로그 출처이고 원 기사로 확인된 것이 하나도 없다.
 *
 * 막지 않는다. 알리기만 한다 — 사장님이 보고 판단할 자리다.
 */
describe('자료 출처 분류', () => {
  it('네이버 뉴스와 언론사 도메인을 기사로 본다', () => {
    expect(classifySourceKind('https://n.news.naver.com/mnews/article/346/0000114833')).toBe('news');
    expect(classifySourceKind('https://m.entertain.naver.com/article/440/0000042181')).toBe('news');
    expect(classifySourceKind('https://news.hidoc.co.kr/news/articleView.html?idxno=66654')).toBe('news');
    expect(classifySourceKind('https://www.starnewskorea.com/star/2026/08/26/2026082622310279187')).toBe('news');
  });

  it('네이버 블로그를 블로그로 본다', () => {
    expect(classifySourceKind('https://blog.naver.com/yeongland/224391478975')).toBe('blog');
    expect(classifySourceKind('https://m.blog.naver.com/ddobot17/224391478846')).toBe('blog');
  });

  it('지식iN·카페는 기사가 아니다', () => {
    expect(classifySourceKind('https://kin.naver.com/qna/detail.naver?docId=494882267')).not.toBe('news');
    expect(classifySourceKind('https://cafe.naver.com/abc/123')).not.toBe('news');
  });

  it('이상한 입력에도 던지지 않는다', () => {
    expect(() => classifySourceKind('' as never)).not.toThrow();
    expect(() => classifySourceKind(null as never)).not.toThrow();
  });
});

describe('자료 충분도 판정', () => {
  it('기사가 있으면 조용하다', () => {
    const r = auditSourceMaterial({ newsCount: 4, blogCount: 0, totalChars: 8187 });
    expect(r.level).toBe('ok');
    expect(r.message).toBe('');
  });

  it('기사 없이 블로그만이면 알린다 — 사장님 지적의 핵심', () => {
    const r = auditSourceMaterial({ newsCount: 0, blogCount: 4, totalChars: 10000 });
    expect(r.level).toBe('warn');
    expect(r.message).toContain('기사');
    expect(r.message).toContain('블로그');
  });

  it('본문을 하나도 못 긁으면 더 세게 알린다', () => {
    const r = auditSourceMaterial({ newsCount: 0, blogCount: 0, totalChars: 0 });
    expect(r.level).toBe('severe');
    expect(r.message).toContain('스니펫');
  });

  it('건수는 있어도 분량이 얇으면 알린다', () => {
    const r = auditSourceMaterial({ newsCount: 1, blogCount: 0, totalChars: 400 });
    expect(r.level).not.toBe('ok');
  });

  it('경고 문구가 무엇을 조심하라는지 말한다', () => {
    const r = auditSourceMaterial({ newsCount: 0, blogCount: 3, totalChars: 9000 });
    expect(r.message).toMatch(/수치|숫자|확인/);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => auditSourceMaterial(null as never)).not.toThrow();
    expect(auditSourceMaterial(null as never).level).toBe('ok');
  });
});

describe('본선 배선', () => {
  const src = readFileSync(resolve(__dirname, '../sourceAssembler.ts'), 'utf-8');

  it('수집기가 자료 등급을 판정한다', () => {
    expect(src).toMatch(/auditSourceMaterial\(/);
  });

  it('기사 건수를 따로 센다', () => {
    expect(src).toMatch(/classifySourceKind\(/);
  });

  it('막지 않는다 — 경고만', () => {
    const codeOnly = src.split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toMatch(/throw[^\n]{0,50}자료 부족/);
  });
});
