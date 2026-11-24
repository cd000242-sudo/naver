import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(__dirname, '..', path), 'utf8');
const handlers = read('renderer/modules/publishingHandlers.ts');
const flow = read('renderer/modules/fullAutoFlow.ts');

function handleFullAutoPublishBody(): string {
  const start = handlers.indexOf('export async function handleFullAutoPublish(): Promise<void> {');
  const end = handlers.indexOf('\n}', start);
  expect(start).toBeGreaterThan(-1);
  return handlers.slice(start, end);
}

describe('풀오토 단추 경로: 멈춤 창·기록 연결', () => {
  it('글 쓰기 두 갈래가 글 단계 멈춤 문맥 안에서 돈다', () => {
    const body = handleFullAutoPublishBody();
    const stage = body.indexOf("generationStopRunStage('text', textEngineNow, fullAutoStopResumeContext(fullAutoStopLabel)");
    expect(stage).toBeGreaterThan(-1);
    const stageEnd = body.indexOf('} catch (contentError) {', stage);
    const wrapped = body.slice(stage, stageEnd);
    expect(wrapped).toContain('await generateContentFromUrl(urls[0]');
    expect(wrapped).toContain('await generateContentFromKeywords(title, keywords');
    // The engine is read from the screen again (same as continuous publishing).
    expect(body).toContain(`const textEngineNow = (document.querySelector('input[name="primaryGeminiTextModel"]:checked')`);
  });

  it('"여기서 멈추기"는 콘텐츠 생성 실패 창이 아니라 조용한 안내로 끝난다', () => {
    const body = handleFullAutoPublishBody();
    const textCatch = body.slice(body.indexOf('} catch (contentError) {'), body.indexOf("modal.showError('❌ 콘텐츠 생성 실패'"));
    expect(textCatch).toContain("(contentError as any)?.name === 'GstopHaltedError') throw contentError");
    const outerCatch = body.slice(body.lastIndexOf('  } catch (error) {'));
    expect(outerCatch.indexOf("'GstopHaltedError'")).toBeLessThan(outerCatch.indexOf("modal.showError('❌ 발행 실패'"));
    expect(outerCatch).toContain('[이어서 발행]으로 이어 갈 수 있습니다');
  });

  it('이미지 생성 세 갈래(일반·쇼핑 AI·로컬 폴더 대체)가 같은 멈춤 문맥을 넘긴다', () => {
    const body = handleFullAutoPublishBody();
    expect(body.match(/stopContext: fullAutoStopResumeContext\(fullAutoStopLabel/g)).toHaveLength(3);
    expect(body).toContain('stopContext: fullAutoStopResumeContext(fullAutoStopLabel, { shopping: true, article: () => structuredContent })');
  });

  it('단추 경로가 run 의 주인: 시작하고, 성공을 표시하고, finally 에서 끝낸다', () => {
    const body = handleFullAutoPublishBody();
    expect(body).toContain('ownsFullAutoStopRun = fullAutoStopResumeBeginRun({ ...contentReuseSeed');
    expect(body.indexOf('fullAutoStopResumeMarkPublished();')).toBeGreaterThan(body.indexOf("modal.showSuccess('🎉 발행 완료!'"));
    expect(body).toMatch(/\} finally \{\r?\n\s+if \(ownsFullAutoStopRun\) void fullAutoStopResumeFinishRun\(\);/);
  });

  it('executeFullAutoFlow 는 자기가 시작한 run 만 끝내고, 성공은 표시만 한다', () => {
    expect(flow).toContain('const ownsFullAutoStopRun = !isContinuousInvocation && fullAutoStopResumeBeginRun(formData);');
    expect(flow).toContain('if (ownsFullAutoStopRun) void fullAutoStopResumeFinishRun();');
    expect(flow).toContain('fullAutoStopResumeMarkPublished();');
    expect(flow).not.toMatch(/kind: 'full-auto'[^\n]*noRecord: true/);
  });
});
