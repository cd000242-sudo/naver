/**
 * diagnosticsBuffer.ts — 페이지 콘솔/네트워크/에러 링버퍼
 * ✅ [v1.4.54] 실패 순간 "직전 N초 동안 무슨 일이 있었는지" 재구성
 *
 * 사용법: browserSessionManager에서 page 생성 직후 attachDiagnostics(page) 호출
 * 덤프 시점에 buf.snapshot() 으로 지난 이벤트 전체 추출
 */

import type { Page } from 'puppeteer';
import { scrubText } from './privacyScrubber.js';

export interface ConsoleEntry {
  ts: number;
  level: 'log' | 'warn' | 'error' | 'debug' | 'info' | 'verbose';
  text: string;
  source?: string;
}

export interface NetworkEntry {
  ts: number;
  url: string;
  method: string;
  status?: number;
  duration?: number;
  resourceType: string;
  failed?: boolean;
}

export interface PageErrorEntry {
  ts: number;
  message: string;
  stack?: string;
}

class RingBuffer<T> {
  private buf: T[] = [];
  constructor(private readonly capacity: number) {}
  push(item: T): void {
    if (this.buf.length >= this.capacity) this.buf.shift();
    this.buf.push(item);
  }
  snapshot(): T[] {
    return [...this.buf];
  }
  clear(): void {
    this.buf = [];
  }
}

export class DiagnosticsBuffer {
  readonly console = new RingBuffer<ConsoleEntry>(200);
  readonly network = new RingBuffer<NetworkEntry>(300);
  readonly pageErrors = new RingBuffer<PageErrorEntry>(50);

  /** events.log 형태로 시간순 결합 출력 */
  toEventLog(): string {
    const all: Array<{ ts: number; line: string }> = [];

    for (const e of this.console.snapshot()) {
      all.push({
        ts: e.ts,
        line: `[${formatTime(e.ts)}] [CON:${e.level}] ${truncate(e.text, 800)}`,
      });
    }
    for (const e of this.network.snapshot()) {
      const statusStr = e.failed ? 'FAILED' : e.status ?? '?';
      const durStr = e.duration != null ? `${e.duration}ms` : '';
      all.push({
        ts: e.ts,
        line: `[${formatTime(e.ts)}] [NET:${e.resourceType}] ${e.method} ${e.url} → ${statusStr} ${durStr}`.trim(),
      });
    }
    for (const e of this.pageErrors.snapshot()) {
      all.push({
        ts: e.ts,
        line: `[${formatTime(e.ts)}] [ERR] ${e.message}${e.stack ? '\n    ' + e.stack.split('\n').slice(1, 4).join('\n    ') : ''}`,
      });
    }

    all.sort((a, b) => a.ts - b.ts);
    return all.map((e) => e.line).join('\n');
  }

  clear(): void {
    this.console.clear();
    this.network.clear();
    this.pageErrors.clear();
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.substring(0, n) + '...[truncated]' : s;
}

// 페이지 → 버퍼 매핑 (page 객체는 고유 ID가 없어 WeakMap 사용)
const pageBufferMap = new WeakMap<Page, DiagnosticsBuffer>();

/**
 * 페이지에 진단 훅을 부착합니다. 이후 발생하는 모든 console/network/error
 * 이벤트가 링 버퍼에 누적됩니다.
 *
 * 멱등 — 같은 page에 두 번 호출해도 안전 (기존 버퍼 반환).
 */
export function attachDiagnostics(page: Page): DiagnosticsBuffer {
  const existing = pageBufferMap.get(page);
  if (existing) return existing;

  const buf = new DiagnosticsBuffer();
  pageBufferMap.set(page, buf);

  // 콘솔 이벤트
  try {
    page.on('console', (msg) => {
      try {
        const rawText = msg.text();
        const { text } = scrubText(rawText);
        buf.console.push({
          ts: Date.now(),
          level: (msg.type() as ConsoleEntry['level']) || 'log',
          text,
          source: msg.location()?.url,
        });
      } catch {
        /* 버퍼 수집 실패는 조용히 무시 (자동화 흐름 방해 금지) */
      }
    });
  } catch {}

  // 페이지 JS 에러
  try {
    page.on('pageerror', (err: unknown) => {
      try {
        const e = err as Error;
        const { text: safeMsg } = scrubText(e?.message || '');
        buf.pageErrors.push({
          ts: Date.now(),
          message: safeMsg,
          stack: e?.stack,
        });
      } catch {}
    });
  } catch {}

  // 네트워크 요청 — request에서 시작시간 기록만
  const pendingRequests = new Map<string, { start: number; method: string; type: string }>();
  try {
    page.on('request', (req) => {
      try {
        const url = req.url();
        pendingRequests.set(url, {
          start: Date.now(),
          method: req.method(),
          type: req.resourceType(),
        });
      } catch {}
    });

    page.on('response', (res) => {
      try {
        const url = res.url();
        const pending = pendingRequests.get(url);
        const duration = pending ? Date.now() - pending.start : undefined;
        pendingRequests.delete(url);

        const { text: safeUrl } = scrubText(url);
        buf.network.push({
          ts: Date.now(),
          url: safeUrl,
          method: pending?.method || res.request().method(),
          status: res.status(),
          resourceType: pending?.type || res.request().resourceType(),
          duration,
        });
      } catch {}
    });

    page.on('requestfailed', (req) => {
      try {
        const url = req.url();
        const pending = pendingRequests.get(url);
        const duration = pending ? Date.now() - pending.start : undefined;
        pendingRequests.delete(url);

        const { text: safeUrl } = scrubText(url);
        buf.network.push({
          ts: Date.now(),
          url: safeUrl,
          method: pending?.method || req.method(),
          status: 0,
          resourceType: pending?.type || req.resourceType(),
          duration,
          failed: true,
        });
      } catch {}
    });
  } catch {}

  return buf;
}

/** 페이지의 진단 버퍼를 가져옵니다. 없으면 undefined. */
export function getDiagnosticsBuffer(page: Page): DiagnosticsBuffer | undefined {
  return pageBufferMap.get(page);
}
