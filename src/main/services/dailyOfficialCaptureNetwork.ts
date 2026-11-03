import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { BrowserContext, Page, Route } from 'playwright';

const MAX_BYTES = 20_000_000;
const publicV6 = new BlockList(); publicV6.addSubnet('2000::', 3, 'ipv6');
const reservedV6 = new BlockList();
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16]] as const) reservedV6.addSubnet(network, prefix, 'ipv6');
const review = (): never => { throw new Error('DAILY_CAPTURE_REVIEW_REQUIRED: 허용되지 않은 네트워크 대상입니다.'); };
function publicAddress(address: string): boolean {
  if (isIP(address) === 6) return publicV6.check(address, 'ipv6') && !reservedV6.check(address, 'ipv6');
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31)
    && !(a === 192 && (b === 168 || b === 0)) && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    && !(a === 203 && b === 0 && c === 113);
}
export function waitForCapture<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('DAILY_CANCELLED'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error('DAILY_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** All browser traffic uses DNS-pinned HTTPS. The shared budget is consumed before each chunk is retained. */
async function fetchResource(url: URL, signal: AbortSignal, consume: (length: number) => void): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const addresses = await waitForCapture(lookup(url.hostname, { all: true, verbatim: true }), signal);
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) return review();
  const selected = addresses[0];
  return waitForCapture(new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', signal, timeout: 15_000, family: selected.family,
      lookup: ((_host: string, _options: unknown, callback: (error: null, address: string, family: number) => void) => callback(null, selected.address, selected.family)) as any,
      headers: { Accept: '*/*', 'Accept-Encoding': 'identity', 'User-Agent': 'Mozilla/5.0 OfficialCapture/1.0' },
    }, response => {
      const status = response.statusCode || 0;
      if (status < 200 || status >= 300 || Number(response.headers['content-length'] || 0) > MAX_BYTES
        || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.destroy(); reject(new Error('DAILY_CAPTURE_NETWORK_BLOCKED: 응답·리디렉션·크기를 확인해 주세요.')); return;
      }
      let length = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        try {
          if (signal.aborted) throw signal.reason;
          length += chunk.length;
          if (length > MAX_BYTES) throw new Error('DAILY_CAPTURE_RESPONSE_TOO_LARGE');
          consume(chunk.length); chunks.push(Buffer.from(chunk));
        } catch (error) { response.destroy(); reject(error); }
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status, headers: { 'content-type': String(response.headers['content-type'] || 'application/octet-stream') }, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('DAILY_CAPTURE_NETWORK_TIMEOUT'))); req.end();
  }), signal);
}
export interface DailyCaptureNetworkGuard { assertSafe(): void; dispose(): void }
export async function guardDailyCapturePage(
  context: BrowserContext, page: Page, approvedUrl: string, signal: AbortSignal,
  publicUrl: (value: string) => URL, normalized: (value: string) => string,
): Promise<DailyCaptureNetworkGuard> {
  let requests = 0; let bytes = 0; let blocked: Error | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  const fail = (error: Error) => { blocked ??= error; controller.abort(error); };
  const consume = (length: number) => {
    bytes += length;
    if (bytes > 60_000_000) { const error = new Error('DAILY_CAPTURE_RESPONSE_TOO_LARGE'); fail(error); throw error; }
  };
  const guard = {
    dispose: () => { signal.removeEventListener('abort', abort); controller.abort(new Error('DAILY_CAPTURE_PAGE_CLOSED')); },
    assertSafe: () => {
      if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('DAILY_CANCELLED');
      if (blocked) throw blocked;
      if (normalized(page.url()) !== approvedUrl) return review();
    },
  };
  try {
    await context.route('**/*', async (route: Route) => {
      try {
        if (controller.signal.aborted) throw controller.signal.reason;
        const req = route.request();
        if (++requests > 200 || !['GET', 'HEAD'].includes(req.method()) || req.redirectedFrom()) throw new Error('DAILY_CAPTURE_NETWORK_BLOCKED');
        const url = publicUrl(req.url());
        if (req.isNavigationRequest() && (req.frame() !== page.mainFrame() || normalized(url.toString()) !== approvedUrl)) throw new Error('DAILY_CAPTURE_NETWORK_BLOCKED');
        const response = await fetchResource(url, controller.signal, consume);
        await route.fulfill(response);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('DAILY_CAPTURE_NETWORK_BLOCKED'));
        await route.abort().catch(() => undefined);
      }
    });
    await waitForCapture(page.goto(approvedUrl, { waitUntil: 'networkidle', timeout: 30_000 }), signal);
    guard.assertSafe(); return guard;
  } catch (error) { guard.dispose(); throw error; }
}
