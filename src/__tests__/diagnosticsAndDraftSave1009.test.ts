/**
 * [2026-10-09 고객 진단 파일] 세 가지:
 *  1) 진단 파일이 기록 마지막 500줄만 담아, 오류 뒤에 작업을 더 하면 원인(이미지 삽입 실패)이 밀려 사라졌다.
 *  2) 임시저장 뒤 페이지 이동을 기다리느라 제한 시간을 다 채웠다(고객 61초, 이 PC 46.9초) — 임시저장은 이동이 없다.
 *  3) 이미지 9장이 들어갔는데 배치 검증이 "실제 콘텐츠 이미지가 하나도 없습니다"로 오경보했다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pickProblemLogLines } from '../main/ipc/diagnosticsLogFilter';

describe('진단 파일: 오늘 기록의 오류·경고 줄', () => {
  const log = [
    '[2026-10-09T05:00:00.000Z] [LOG] [+1.0s] ✅ 정상 줄',
    '[2026-10-09T05:00:01.000Z] [LOG] [+2.0s]       ⚠️ 이미지 삽입 시도 1/3 실패: 파일 전송 오류',
    '[2026-10-09T05:00:02.000Z] [WARN] [AdaptiveLimiter] 🚨 freeze(5729ms)',
    '[2026-10-09T05:00:03.000Z] [WARN] [TailDebug] {"stage":"x"}',
    '[2026-10-09T05:00:04.000Z] [ERROR] [Main] IMAGE_INSERTION_FAILED:1/1개 이미지 삽입 실패',
    '[2026-10-09T05:00:05.000Z] [LOG] [+3.0s]    ❌ 이미지 1 최종 삽입 실패, 건너뜀',
    '[2026-10-09T05:00:06.000Z] [WARN] [IPCTiming] 🚨 SEVERE "agent:status" 3001ms',
  ];

  it('오류·경고·실패 줄만 고르고 성능 측정·TailDebug 같은 소음은 뺀다', () => {
    expect(pickProblemLogLines(log)).toEqual([log[1], log[4], log[5]]);
  });

  it('많으면 가장 최근 것부터 정해진 수만 남기고, 순서는 오래된 것부터 둔다', () => {
    const many = Array.from({ length: 50 }, (_, i) => `[2026-10-09T05:00:${String(i).padStart(2, '0')}.000Z] [LOG] ❌ 실패 ${i}`);
    const picked = pickProblemLogLines(many, 10);
    expect(picked).toHaveLength(10);
    expect(picked[0]).toContain('실패 40');
    expect(picked[9]).toContain('실패 49');
  });

  it('진단 파일이 이 구역을 마지막 500줄과 따로 담는다', () => {
    const handler = readFileSync(resolve('src/main/ipc/diagnosticsHandlers.ts'), 'utf8');
    expect(handler).toContain('----- 오늘 기록 중 오류·경고 줄');
    expect(handler).toContain('pickProblemLogLines(');
    expect(handler).toContain('----- 최근 로그 (main, 마지막 500줄) -----');
  });
});

describe('임시저장: 이동이 없는 저장을 오래 기다리지 않는다', () => {
  it('임시저장 뒤 이동 대기는 최대 10초다', () => {
    const engine = readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
    const draft = engine.slice(engine.indexOf("this.log('🔄 블로그 글 임시저장 중...');"), engine.indexOf("this.log('✅ 블로그 글이 임시저장되었습니다.');"));
    expect(draft.length).toBeGreaterThan(200);
    expect(draft).toContain("await frame.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => undefined);");
    expect(draft).not.toMatch(/waitForNavigation\(\{ waitUntil: 'networkidle2' \}\)/);
  });
});

describe('이미지 배치 검증: 이미지 없는 칸을 먼저 잡아 0장으로 세지 않는다', () => {
  it('고른 영역에 이미지가 없으면 문서 전체에서 센다', () => {
    const helpers = readFileSync(resolve('src/automation/imageHelpers.ts'), 'utf8');
    const verify = helpers.slice(helpers.indexOf('export async function verifyImagePlacement('));
    expect(verify).toContain("const imageScope: ParentNode | null = contentArea && contentArea.querySelector('img') ? contentArea : (contentArea ? document : null);");
    expect(verify).toContain("imageScope.querySelectorAll('img')");
  });
});
