import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createDailyOfficialCaptureLoader, getDailyOfficialCaptureBatchDirectory, loadDailyOfficialCaptureBatch } from '../main/services/dailyOfficialCapture.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const when = '2026-01-01T00:00:00.000Z';
async function fixture() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'daily-official-')); roots.push(userDataDir);
  const binding = { userDataDir, jobId: 'job-1', accountId: 'account-1', blogId: 'blog-1', categoryId: '3',
    captureCategory: 'issue' as const, sourceUrl: 'https://www.imbc.com/episode?b=2&a=1',
    title: '제목', headings: ['첫 장면', '두 번째 장면', '세 번째 장면', '마지막 장면'] };
  const directory = getDailyOfficialCaptureBatchDirectory(userDataDir, binding.jobId);
  await mkdir(directory, { recursive: true });
  const verificationEvidence = path.join(userDataDir, 'operator-evidence.txt');
  await writeFile(verificationEvidence, 'Operator checked the official publisher/channel and ownership page.');
  const source = { id: 'official', verified: true, publisher: '공식 방송사', captureCategory: 'issue', host: 'www.imbc.com',
    reviewedBy: 'operator', reviewedAt: when, verificationUrl: 'https://www.imbc.com/about', verificationEvidence,
    approvedPageUrls: ['https://www.imbc.com/episode?a=1&b=2'] };
  const manifest: any = { schema: 1, ...binding, captures: [] };
  delete manifest.userDataDir;
  for (let index = 0; index < 5; index += 1) {
    const bytes = await sharp({ create: { width: 800, height: 600, channels: 3,
      background: { r: index * 35, g: 100, b: 200 } } }).png().toBuffer();
    const filePath = path.join(directory, `${index}.png`); await writeFile(filePath, bytes);
    manifest.captures.push({ slotIndex: index, heading: index === 0 ? binding.title : binding.headings[index - 1],
      filePath, sha256: createHash('sha256').update(bytes).digest('hex'), width: 800, height: 600,
      capturedAt: when, pageUrl: 'https://www.imbc.com/episode?a=1&b=2', scene: `서로 다른 공식 장면 ${index}`,
      sourceApprovalId: 'official', originType: 'official-capture', captureMethod: 'page-screenshot',
      rightsReview: { decision: 'approved', basis: 'quotation', reviewedBy: 'operator', reviewedAt: when,
        note: '본문의 비평 대상 장면으로 필요한 범위만 인용했습니다.', evidenceUrl: 'https://www.imbc.com/terms' } });
  }
  const evidence = async (capture: any) => {
    capture.captureEvidence = path.join(directory, `${path.basename(capture.filePath)}.capture.json`);
    await writeFile(capture.captureEvidence, JSON.stringify({ schema: 1,
      ...Object.fromEntries(['jobId', 'accountId', 'blogId', 'categoryId', 'captureCategory'].map(key => [key, (binding as any)[key]])),
      ...Object.fromEntries(['sha256', 'pageUrl', 'capturedAt', 'captureMethod', 'originType', 'scene'].map(key => [key, capture[key]])) }));
  };
  for (const capture of manifest.captures) await evidence(capture);
  const save = async () => {
    await writeFile(path.join(userDataDir, 'daily-official-sources.json'), JSON.stringify({ schema: 1, sources: [source] }));
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  };
  await save(); return { binding, directory, source, manifest, save, evidence };
}

describe('trusted prepared official capture batch', () => {
  it('returns the five actual local images in explicit final article slots without AI or square reshaping', async () => {
    const f = await fixture();
    const images = await createDailyOfficialCaptureLoader(f.binding.userDataDir)(f.binding);
    expect(images).toHaveLength(5);
    expect(images[0]).toMatchObject({ provider: 'collected', isCollected: true, isThumbnail: true,
      heading: f.binding.title, width: 800, height: 600, sourceUrl: f.manifest.captures[0].pageUrl });
    expect(images.slice(1).map(image => image.heading)).toEqual(f.binding.headings);
    expect(images[1].caption).toContain('공식 방송사');
    expect(Object.isFrozen(images)).toBe(true);
    expect(Object.isFrozen(images[0])).toBe(true);
  });
  it('hashes the untrusted job identity into one batch directory', () => {
    expect(path.basename(getDailyOfficialCaptureBatchDirectory('C:/data', '../../outside'))).toMatch(/^[a-f0-9]{64}$/);
  });
  it('holds a missing batch instead of manufacturing captures', async () => {
    const f = await fixture(); await rm(path.join(f.directory, 'manifest.json'));
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_PENDING');
  });
  it.each(['jobId', 'accountId', 'blogId', 'categoryId', 'captureCategory', 'sourceUrl', 'title'])('rejects a mismatched %s binding', async field => {
    const f = await fixture(); f.manifest[field] = field === 'sourceUrl' ? 'https://www.imbc.com/different' : 'different'; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('normalizes source URL ordering and tracking without weakening final title/headings equality', async () => {
    const f = await fixture();
    f.manifest.sourceUrl = 'https://www.imbc.com/episode?a=1&b=2&utm_source=test#part'; await f.save();
    expect(await loadDailyOfficialCaptureBatch(f.binding)).toHaveLength(5);
    f.manifest.headings[1] += ' 변경'; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['captureCategory', 'headings'])('requires %s on the batch', async field => {
    const f = await fixture(); delete f.manifest[field]; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['heading', 'slotIndex', 'width', 'sha256', 'capturedAt', 'scene', 'sourceApprovalId'])('checks actual capture metadata: %s', async field => {
    const f = await fixture(); f.manifest.captures[0][field] = field === 'width' || field === 'slotIndex' ? 99 : 'wrong'; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('rejects tampered bytes and corrupt images even with their updated hash', async () => {
    const f = await fixture(); await writeFile(f.manifest.captures[0].filePath, 'not an image');
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    f.manifest.captures[0].sha256 = createHash('sha256').update('not an image').digest('hex'); await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('rejects duplicate bytes under different file names, duplicate scenes and missing article slots', async () => {
    const f = await fixture();
    f.manifest.captures[1].scene = f.manifest.captures[0].scene; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    f.manifest.captures[1].scene = 'another distinct scene';
    await writeFile(f.manifest.captures[1].filePath, await readFile(f.manifest.captures[0].filePath));
    f.manifest.captures[1].sha256 = f.manifest.captures[0].sha256; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    f.manifest.captures.splice(1, 1); await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['aiEngine', 'originType', 'captureMethod'])('rejects AI or reprinted provenance %s', async field => {
    const f = await fixture(); f.manifest.captures[0][field] = 'ai-generated'; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['rightsReview', 'pageUrl'])('requires actual rights review and individually approved page: %s', async field => {
    const f = await fixture(); f.manifest.captures[0][field] = field === 'pageUrl' ? 'https://news.example/reprint' : { decision: 'not-reviewed' }; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('does not trust a registry embedded in a capture manifest or an unreviewed external registry', async () => {
    const f = await fixture(); f.manifest.sources = [f.source]; await f.save();
    await rm(path.join(f.binding.userDataDir, 'daily-official-sources.json'));
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    delete (f.source as any).reviewedBy; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('requires channel identity for each approved YouTube video rather than trusting its domain', async () => {
    const f = await fixture();
    const channelId = `UC${'a'.repeat(22)}`;
    f.source.host = 'www.youtube.com'; f.source.approvedPageUrls = ['https://www.youtube.com/watch?v=abcdefghijk'];
    Object.assign(f.source, { channelId, channelUrl: `https://www.youtube.com/channel/${channelId}` });
    f.manifest.captures.forEach((capture: any) => { capture.pageUrl = f.source.approvedPageUrls[0]; capture.captureMethod = 'video-frame'; capture.channelId = channelId; });
    for (const capture of f.manifest.captures) await f.evidence(capture);
    await f.save(); expect(await loadDailyOfficialCaptureBatch(f.binding)).toHaveLength(5);
    delete f.manifest.captures[2].channelId; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('rejects paths outside the batch and symlink escapes', async () => {
    const f = await fixture(); const outside = path.join(f.binding.userDataDir, 'outside.png');
    await writeFile(outside, await readFile(f.manifest.captures[0].filePath));
    f.manifest.captures[0].filePath = outside; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    const link = path.join(f.directory, 'escape'); await symlink(f.binding.userDataDir, link, 'junction');
    f.manifest.captures[0].filePath = path.join(link, 'outside.png'); await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['verified', 'verificationEvidence', 'reviewedAt', 'host', 'captureCategory', 'approvedPageUrls'])('rejects incomplete or wrong operator approval %s', async field => {
    const f = await fixture();
    (f.source as any)[field] = { verified: false, verificationEvidence: path.join(f.binding.userDataDir, 'missing'),
      reviewedAt: 'tomorrow', host: 'different.example', captureCategory: 'sports', approvedPageUrls: [] }[field];
    await f.save(); await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('rejects explicit generated provider provenance even if originType claims capture', async () => {
    const f = await fixture(); f.manifest.captures[0].provider = 'openai-image'; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('allows additional unique images only when assigned to an existing section', async () => {
    const f = await fixture();
    const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const filePath = path.join(f.directory, 'extra.png'); await writeFile(filePath, bytes);
    const extra = { ...f.manifest.captures[1], filePath, scene: '또 다른 실제 공식 자료 장면', sha256: createHash('sha256').update(bytes).digest('hex') };
    await f.evidence(extra);
    f.manifest.captures.push(extra); await f.save();
    expect(await loadDailyOfficialCaptureBatch(f.binding)).toHaveLength(6);
    extra.slotIndex = 0; extra.heading = f.binding.title; await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('rejects malformed manifests and symlinked manifest directories, not just image links', async () => {
    const f = await fixture(); await writeFile(path.join(f.directory, 'manifest.json'), '{broken');
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    await f.save(); const redirected = path.join(f.binding.userDataDir, 'redirected');
    await mkdir(redirected); await writeFile(path.join(redirected, 'manifest.json'), JSON.stringify(f.manifest));
    await rm(f.directory, { recursive: true }); await symlink(redirected, f.directory, 'junction');
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['captureEvidence', 'timezone', 'evidence-binding'])('requires actual bound capture evidence and timezone: %s', async failure => {
    const f = await fixture(); const capture = f.manifest.captures[0];
    if (failure === 'captureEvidence') await rm(capture.captureEvidence);
    if (failure === 'timezone') { capture.capturedAt = '2026-01-01T00:00:00'; await f.evidence(capture); }
    if (failure === 'evidence-binding') {
      const proof = JSON.parse(await readFile(capture.captureEvidence, 'utf8')); proof.accountId = 'other';
      await writeFile(capture.captureEvidence, JSON.stringify(proof));
    }
    await f.save(); await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it.each(['localhost', '127.0.0.1', '[::1]', 'publisher.local', 'publisher.test', 'publisher.invalid'])('rejects a non-public official host %s', async host => {
    const f = await fixture(); f.source.host = host; f.source.approvedPageUrls = [`https://${host}/episode`];
    await f.save(); await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
  it('fully decodes pixels rather than trusting a PNG header and its declared dimensions', async () => {
    const f = await fixture(); const capture = f.manifest.captures[0];
    const truncated = (await readFile(capture.filePath)).subarray(0, 100);
    expect((await sharp(truncated).metadata()).width).toBe(800);
    await writeFile(capture.filePath, truncated); capture.sha256 = createHash('sha256').update(truncated).digest('hex');
    await f.evidence(capture); await f.save();
    await expect(loadDailyOfficialCaptureBatch(f.binding)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
  });
});
