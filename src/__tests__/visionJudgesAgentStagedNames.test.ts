// [2026-09-23] The subscription vision judge must name the files the CLI runner actually stages.
// Live run: the prompt said "image-1.jpg" while the runner staged "photo-01.jpg" into its own cwd,
// so the model answered "이미지 파일을 찾을 수 없어" and every judgement fell back.
import { describe, expect, it, vi } from 'vitest';

const runClaude = vi.fn(async (_prompt: string, _opts: { imagePaths?: string[] }) => '{"ok":true}');
vi.mock('../agentCli/claudeRunner.js', () => ({ runClaude }));

import { judgeImagesWithRoute } from '../crawler/issueHarness/visionJudges';
import { stagedImageName } from '../agentCli/imageStaging';

describe('judgeImagesWithRoute — agent-claude', () => {
  it('names the staged files (photo-01.jpg …) in the prompt, in order', async () => {
    const route = { vendor: 'agent-claude', model: 'agent-claude', apiKey: '', label: 'Claude 구독', free: true, fellBack: false } as any;
    const images = [{ base64: Buffer.from('a').toString('base64') }, { base64: Buffer.from('b').toString('base64') }];
    await judgeImagesWithRoute(images, '심사하세요', route);
    const [prompt, opts] = runClaude.mock.calls[0];
    const expected = (opts.imagePaths || []).map((p, i) => stagedImageName(i, p));
    expect(expected).toEqual(['photo-01.jpg', 'photo-02.jpg']);
    expect(prompt).toContain('photo-01.jpg, photo-02.jpg');
    expect(prompt).not.toContain('image-1.jpg');
  });
});
