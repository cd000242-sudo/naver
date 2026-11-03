import { describe, expect, it, vi } from 'vitest';
import { DAILY_FREE_IMAGE_ENGINES, missingDailyImageItems, refillDailyImages } from '../main/services/dailyImageRefill.js';

const headings = [{ title: '하나' }, { title: '둘', imagePrompt: 'two prompt' }, '셋'];
const image = (heading: string, isThumbnail = false) => ({ heading, isThumbnail, filePath: `C:/img/${heading}.png` });
const fill = (engine: string) => async (_provider: string, items: Array<{ heading: string }>) =>
  items.map(item => ({ heading: item.heading, filePath: `C:/${engine}/${item.heading}.png` }));

describe('daily image refill with free engines', () => {
  it('uses only free engines and never the closed ImageFX', () => {
    expect([...DAILY_FREE_IMAGE_ENGINES]).toEqual(['flow', 'genspark', 'dropshot']);
  });
  it('lists only the empty slots, thumbnail first, keeping heading prompts', () => {
    const items = missingDailyImageItems({ title: '제목', headings, images: [image('하나'), { heading: '둘', filePath: '' }] });
    expect(items.map(item => [item.heading, item.isThumbnail, item.prompt])).toEqual([
      ['제목', true, '제목'], ['둘', false, 'two prompt'], ['셋', false, '셋'],
    ]);
  });
  it('does not call any engine when every slot already has an image', async () => {
    const generate = vi.fn();
    const images = [image('제목', true), image('하나'), image('둘'), image('셋')];
    expect(await refillDailyImages({ title: '제목', headings, images, generate })).toEqual(images);
    expect(generate).not.toHaveBeenCalled();
  });
  it('fills the missing slots with Flow and puts the thumbnail first', async () => {
    const generate = vi.fn(fill('flow'));
    const result = await refillDailyImages({ title: '제목', headings, images: [image('하나')], primaryProvider: 'nano-banana-2', generate });
    expect(generate.mock.calls.map(call => call[0])).toEqual(['flow']);
    expect(result.map(item => [item.heading, item.isThumbnail])).toEqual([['제목', true], ['하나', false], ['둘', false], ['셋', false]]);
  });
  it('skips the engine that already failed and moves on until every slot is filled', async () => {
    const generate = vi.fn(async (provider: string, items: Array<{ heading: string }>) => {
      if (provider === 'genspark') throw new Error('GENSPARK_LOGIN_REQUIRED');
      return fill(provider)(provider, items);
    });
    const result = await refillDailyImages({ title: '제목', headings, images: [], primaryProvider: 'imagefx', generate });
    // imagefx is the same engine as Flow now, so Flow is not asked again.
    expect(generate.mock.calls.map(call => call[0])).toEqual(['genspark', 'dropshot']);
    expect(result).toHaveLength(4);
  });
  it('asks the next engine only for the slots the previous one left empty', async () => {
    const generate = vi.fn(async (provider: string, items: Array<{ heading: string }>) =>
      provider === 'flow' ? items.slice(0, 2).map(item => ({ heading: item.heading, filePath: `C:/flow/${item.heading}.png` })) : fill(provider)(provider, items));
    const result = await refillDailyImages({ title: '제목', headings, images: [], generate });
    expect(generate.mock.calls[1][1].map((item: { heading: string }) => item.heading)).toEqual(['둘', '셋']);
    expect(result).toHaveLength(4);
  });
  it('keeps the original images when every engine fails, but never swallows a cancel', async () => {
    const images = [image('하나')];
    expect(await refillDailyImages({ title: '제목', headings, images, generate: async () => { throw new Error('quota'); } })).toEqual(images);
    await expect(refillDailyImages({ title: '제목', headings, images, generate: async () => { throw new Error('PUBLISH_CANCELLED'); } }))
      .rejects.toThrow('PUBLISH_CANCELLED');
  });
});
