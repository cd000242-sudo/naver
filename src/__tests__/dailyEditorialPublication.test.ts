import { describe, expect, it } from 'vitest';
import { sealDailyEditorialPublication } from '../main/services/dailyEditorialPublication.js';

const article = { selectedTitle: '실제 장면을 확인할 제목', bodyPlain: '확인한 원문으로 제목의 답을 설명합니다.', headings: [{ title: '실제 선택', content: '확인한 선택의 이유' }] };
const payload = () => ({ title: article.selectedTitle, content: article.bodyPlain,
  structuredContent: structuredClone(article), generatedImages: [{ url: 'fixture' }] });
describe('daily editorial publication binding', () => {
  it('allows image metadata and manual review flags without changing admitted text', () => {
    const verify = sealDailyEditorialPublication(article), value = payload();
    value.structuredContent = { ...value.structuredContent, imageMeta: 'fixture' } as typeof article;
    expect(() => verify({ ...value, _contentPolicyManualReviewApproved: true })).not.toThrow();
  });
  it.each(['title', 'content', 'structured-title', 'structured-body', 'heading', 'missing'])(
    'stops a changed %s before editor execution', kind => {
      const verify = sealDailyEditorialPublication(article), value = payload();
      if (kind === 'title') value.title = '검수하지 않은 제목';
      if (kind === 'content') value.content += '검수하지 않은 주장';
      if (kind === 'structured-title') value.structuredContent.selectedTitle = '다른 제목';
      if (kind === 'structured-body') value.structuredContent.bodyPlain += '다른 답';
      if (kind === 'heading') value.structuredContent.headings[0].content = '다른 이유';
      if (kind === 'missing') delete (value as any).structuredContent;
      expect(() => verify(value)).toThrow('DAILY_EDITORIAL_CHANGED');
    });
  it('snapshots before later mutation and refuses incomplete admission', () => {
    const mutable = structuredClone(article), verify = sealDailyEditorialPublication(mutable);
    mutable.bodyPlain = '나중 변경';
    expect(() => verify({ ...payload(), content: mutable.bodyPlain, structuredContent: mutable })).toThrow('DAILY_EDITORIAL_CHANGED');
    expect(() => sealDailyEditorialPublication({} as never)).toThrow('DAILY_EDITORIAL_REQUIRED');
    expect(() => verify(null)).toThrow('DAILY_EDITORIAL_CHANGED');
  });
});
