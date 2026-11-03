import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { getDailyOfficialCaptureBatchDirectory, type DailyOfficialCaptureInput } from '../main/services/dailyOfficialCapture.js';

const mocks = vi.hoisted(() => ({ launch: vi.fn(), lookup: vi.fn(), request: vi.fn() }));
vi.mock('../automation/browserAdapter.js', () => ({ launchAdaptedBrowser: mocks.launch }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { ensureDailyOfficialCaptureBatch } from '../main/services/dailyOfficialCaptureProducer.js';

let root: string;
let input: DailyOfficialCaptureInput;
let directory: string;
let plan: any;
let images: Buffer[];
let browserClosed: ReturnType<typeof vi.fn>;
let goto: ReturnType<typeof vi.fn>;
let screenshot: ReturnType<typeof vi.fn>;
let currentUrl: string;
let routeHandler: (route: any) => Promise<void>;
let responseStatus: number;
let responseHeaders: Record<string, string>;
let responseBody: Buffer;

async function savePlan() { await writeFile(path.join(directory, 'capture-plan.json'), JSON.stringify(plan)); }
async function noManifest() { await expect(access(path.join(directory, 'manifest.json'))).rejects.toThrow(); }

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), 'daily-producer-'));
  input = { userDataDir: root, jobId: 'job-1', accountId: 'account-1', blogId: 'blog-1', categoryId: '1',
    captureCategory: 'issue', sourceUrl: 'https://capture-fixture.org/article', title: 'Fixture article', headings: ['First', 'Second', 'Third', 'Fourth'] };
  directory = getDailyOfficialCaptureBatchDirectory(root, input.jobId);
  await mkdir(directory, { recursive: true });
  const evidence = path.join(root, 'operator-evidence.txt');
  await writeFile(evidence, 'Operator reviewed fixture ownership and source pages.');
  const reviewedAt = '2026-01-01T00:00:00.000Z';
  const pages = Array.from({ length: 5 }, (_, i) => `https://capture-fixture.org/scene-${i}`);
  await writeFile(path.join(root, 'daily-official-sources.json'), JSON.stringify({ schema: 1, sources: [{
    id: 'fixture', verified: true, publisher: 'Fixture publisher', captureCategory: 'issue', host: 'capture-fixture.org',
    reviewedBy: 'fixture-operator', reviewedAt, verificationUrl: 'https://capture-fixture.org/about', verificationEvidence: evidence, approvedPageUrls: pages,
  }] }));
  const { userDataDir: _, ...binding } = input;
  plan = { schema: 1, ...binding, review: { decision: 'approved', reviewedBy: 'fixture-operator', reviewedAt }, captures: pages.map((pageUrl, slotIndex) => ({
    slotIndex, heading: slotIndex ? input.headings[slotIndex - 1] : input.title, pageUrl, sourceApprovalId: 'fixture', scene: `Fixture reviewed scene ${slotIndex}`,
    clip: { x: 0, y: 0, width: 800, height: 600 }, rightsReview: { decision: 'approved', basis: 'owned', reviewedBy: 'fixture-operator', reviewedAt,
      note: 'Operator owns these test fixture scenes.', evidenceUrl: 'https://capture-fixture.org/rights' },
  })) };
  images = [];
  for (let i = 0; i < 5; i++) images.push(await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30 * i, g: 70, b: 100 } } }).png().toBuffer());
  browserClosed = vi.fn(async () => {});
  currentUrl = 'about:blank';
  screenshot = vi.fn(async () => images[Number(currentUrl.split('-').at(-1))]);
  goto = vi.fn(async (url: string) => {
    const route = { request: () => ({ url: () => url, method: () => 'GET', isNavigationRequest: () => true,
      redirectedFrom: () => null, frame: () => page.mainFrame() }),
      fulfill: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    await routeHandler(route);
    if (route.abort.mock.calls.length) throw new Error('Request blocked');
    currentUrl = url;
  });
  const frame = {};
  const page = { goto, url: () => currentUrl, mainFrame: () => frame, screenshot,
    locator: () => ({ waitFor: vi.fn(async () => {}), boundingBox: vi.fn(async () => ({ x: 0, y: 0, width: 800, height: 600 })), screenshot }),
    waitForTimeout: vi.fn(async () => {}), close: vi.fn(async () => {}), setDefaultTimeout: vi.fn(), on: vi.fn() };
  const context = { route: vi.fn(async (_: string, handler: typeof routeHandler) => { routeHandler = handler; }),
    routeWebSocket: vi.fn(async () => {}), newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  mocks.launch.mockResolvedValue({ raw: { newContext: vi.fn(async () => context) }, close: browserClosed });
  mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  responseStatus = 200;
  responseHeaders = { 'content-type': 'text/html' };
  responseBody = Buffer.from('<html>Own fixture only</html>');
  mocks.request.mockImplementation((_url: URL, _options: unknown, callback: (response: any) => void) => {
    const request = new EventEmitter() as any;
    request.destroy = vi.fn((error?: Error) => { if (error) request.emit('error', error); });
    request.end = () => {
      const response = Readable.from([responseBody]) as any;
      response.statusCode = responseStatus;
      response.headers = responseHeaders;
      callback(response);
    };
    return request;
  });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('daily official capture producer', () => {
  it('holds without an operator-reviewed plan and never opens a browser', async () => {
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_PLAN_REQUIRED');
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it('captures reviewed scenes, validates actual files, and reuses the completed batch', async () => {
    await savePlan();
    const result = await ensureDailyOfficialCaptureBatch(input);
    expect(result).toHaveLength(5);
    expect(result.every(image => image.provider === 'collected' && image.disableTextOverlay)).toBe(true);
    expect(result[0].isThumbnail).toBe(true);
    expect(browserClosed).toHaveBeenCalledOnce();
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    expect(manifest.captures[0].capturedAt).toMatch(/^\d{4}-/);
    expect(manifest.captures[0].captureMethod).toBe('page-screenshot');
    expect(await ensureDailyOfficialCaptureBatch(input)).toEqual(result);
    expect(mocks.launch).toHaveBeenCalledOnce();
    const options = mocks.request.mock.calls[0][1];
    const resolved = vi.fn(); options.lookup('capture-fixture.org', {}, resolved);
    expect(resolved).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(options.family).toBe(4);
  });
  it('captures an approved selector instead of a fixed region', async () => {
    delete plan.captures[0].clip; plan.captures[0].selector = '#own-fixture';
    await savePlan();
    expect(await ensureDailyOfficialCaptureBatch(input)).toHaveLength(5);
  });
  it.each(['schema', 'headings', 'rights-note', 'rights-time', 'rights-basis', 'selector-and-clip', 'selector-too-long', 'scene', 'duplicate-scene', 'video', 'http', 'literal-ip', 'private-host'])('holds invalid %s plans before launch', async kind => {
    if (kind === 'schema') plan.schema = 2;
    if (kind === 'headings') plan.headings = ['Wrong heading'];
    if (kind === 'rights-note') plan.captures[0].rightsReview.note = '';
    if (kind === 'rights-time') plan.captures[0].rightsReview.reviewedAt = 'unknown';
    if (kind === 'rights-basis') plan.captures[0].rightsReview.basis = 'public-on-internet';
    if (kind === 'selector-and-clip') plan.captures[0].selector = '#also';
    if (kind === 'selector-too-long') { delete plan.captures[0].clip; plan.captures[0].selector = 'x'.repeat(501); }
    if (kind === 'scene') plan.captures[0].scene = null;
    if (kind === 'duplicate-scene') plan.captures[1].scene = plan.captures[0].scene;
    if (kind === 'video') plan.captures[0].captureMethod = 'video-frame';
    if (kind === 'http') plan.captures[0].pageUrl = 'http://capture-fixture.org/scene-0';
    if (kind === 'literal-ip') plan.captures[0].pageUrl = 'https://127.0.0.1/scene-0';
    if (kind === 'private-host') plan.captures[0].pageUrl = 'https://device.local/scene-0';
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_');
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it.each(['rights', 'binding', 'page', 'review', 'slots', 'clip'])('rejects invalid %s before browser launch', async kind => {
    if (kind === 'rights') plan.captures[0].rightsReview.decision = 'pending';
    if (kind === 'binding') plan.accountId = 'other-account';
    if (kind === 'page') plan.captures[0].pageUrl = 'https://capture-fixture.org/unapproved';
    if (kind === 'review') plan.review.decision = 'pending';
    if (kind === 'slots') plan.captures[4].slotIndex = 3;
    if (kind === 'clip') plan.captures[0].clip.width = 100000;
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    expect(mocks.launch).not.toHaveBeenCalled();
    await noManifest();
  });
  it('requires the original source approval evidence', async () => {
    await savePlan();
    await rm(path.join(root, 'operator-evidence.txt'));
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it('does not publish duplicate screenshots', async () => {
    images = images.map(() => images[0]);
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    await noManifest();
    expect(browserClosed).toHaveBeenCalledOnce();
  });
  it('blocks private DNS destinations before fetching', async () => {
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(screenshot).not.toHaveBeenCalled();
    await noManifest();
  });
  it.each(['10.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '198.18.0.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:0000::1', '2001:db8::1', '2002:7f00:1::1'])('blocks reserved address %s', async address => {
    mocks.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('accepts a pinned public IPv6 address', async () => {
    mocks.lookup.mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }]);
    await savePlan();
    expect(await ensureDailyOfficialCaptureBatch(input)).toHaveLength(5);
    expect(mocks.request.mock.calls[0][1].family).toBe(6);
  });
  it.each(['declared-size', 'stream-size', 'compressed'])('blocks %s responses', async kind => {
    if (kind === 'declared-size') responseHeaders['content-length'] = '20000001';
    if (kind === 'stream-size') responseBody = Buffer.alloc(20000001);
    if (kind === 'compressed') responseHeaders['content-encoding'] = 'gzip';
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow();
    expect(screenshot).not.toHaveBeenCalled();
    await noManifest();
  });
  it('does not replace an invalid existing manifest or open a browser', async () => {
    await savePlan();
    await writeFile(path.join(directory, 'manifest.json'), '{}');
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(await readFile(path.join(directory, 'manifest.json'), 'utf8')).toBe('{}');
  });
  it('honors cancellation while checking an existing batch', async () => {
    await savePlan(); await ensureDailyOfficialCaptureBatch(input);
    const controller = new AbortController();
    const pending = ensureDailyOfficialCaptureBatch(input, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('DAILY_CANCELLED');
    expect(mocks.launch).toHaveBeenCalledOnce();
  });
  it('does not accept a screenshot when an unsafe resource starts after navigation settles', async () => {
    await savePlan();
    screenshot.mockImplementationOnce(async () => {
      mocks.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
      await routeHandler({ request: () => ({ url: () => 'https://capture-fixture.org/late-resource', method: () => 'GET',
        redirectedFrom: () => null, isNavigationRequest: () => false }), fulfill: vi.fn(), abort: vi.fn(async () => {}) });
      return images[0];
    });
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_REVIEW_REQUIRED');
    await noManifest();
  });
  it('aborts all page fetches when concurrent response chunks exceed the shared budget', async () => {
    await savePlan();
    screenshot.mockImplementationOnce(async () => {
      responseBody = Buffer.alloc(16_000_000);
      await Promise.all(Array.from({ length: 5 }, (_, index) => routeHandler({
        request: () => ({ url: () => `https://capture-fixture.org/asset-${index}`, method: () => 'GET', redirectedFrom: () => null, isNavigationRequest: () => false }),
        fulfill: vi.fn(async () => {}), abort: vi.fn(async () => {}),
      })));
      return images[0];
    });
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow('DAILY_CAPTURE_RESPONSE_TOO_LARGE');
    expect(mocks.request.mock.calls.slice(1).every(call => call[1].signal.aborted)).toBe(true);
    await noManifest();
  });
  it('rejects malformed image bytes before exposing a manifest', async () => {
    images[0] = Buffer.from('not an image'); await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow();
    await noManifest();
  });
  it('blocks redirect responses rather than following them', async () => {
    responseStatus = 302;
    await savePlan();
    await expect(ensureDailyOfficialCaptureBatch(input)).rejects.toThrow();
    expect(screenshot).not.toHaveBeenCalled();
    await noManifest();
  });
  it('honors pre-aborted jobs without launching', async () => {
    await savePlan();
    const controller = new AbortController(); controller.abort();
    await expect(ensureDailyOfficialCaptureBatch(input, { signal: controller.signal })).rejects.toThrow('DAILY_CANCELLED');
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it('closes its private browser when canceled mid-capture', async () => {
    await savePlan();
    const controller = new AbortController();
    screenshot.mockImplementationOnce(async () => { controller.abort(); return images[0]; });
    await expect(ensureDailyOfficialCaptureBatch(input, { signal: controller.signal })).rejects.toThrow('DAILY_CANCELLED');
    await noManifest();
    expect(browserClosed).toHaveBeenCalled();
  });
});
