/**
 * 상태판 공용 도구.
 *
 * 하네스가 지켜야 할 것 두 가지:
 *  1. 절대 멈추지 않는다. 외부 호출은 전부 타임아웃을 건다. 상태를 보러 켰는데
 *     하네스가 먼저 매달리면 아무것도 못 본다.
 *  2. 모르는 것과 괜찮은 것을 구분한다. 자격증명이 없어서 못 본 것은 skip 이고,
 *     봤는데 틀린 것이 fail 이다. 이 둘을 섞으면 "다 초록"이 거짓말이 된다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const GAS_URL =
  'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
export const SITE_ORIGIN = 'https://leaderspro.kr';

const DEFAULT_TIMEOUT_MS = 20000;

/** 체크 하나의 결과. status 는 ok / warn / fail / skip 넷뿐이다. */
export function check(id, label, status, detail, hint) {
  return { id, label, status, detail: detail || '', hint: hint || '' };
}

export const ok = (id, label, detail) => check(id, label, 'ok', detail);
export const warn = (id, label, detail, hint) => check(id, label, 'warn', detail, hint);
export const fail = (id, label, detail, hint) => check(id, label, 'fail', detail, hint);
export const skip = (id, label, detail) => check(id, label, 'skip', detail);

/** 타임아웃이 붙은 fetch. 실패를 예외가 아니라 값으로 돌려준다. */
export async function request(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = options.method === 'HEAD' ? '' : await response.text();
    return {
      okStatus: response.ok,
      status: response.status,
      text,
      ms: Date.now() - startedAt,
      contentType: response.headers.get('content-type') || '',
    };
  } catch (error) {
    return {
      okStatus: false,
      status: 0,
      text: '',
      ms: Date.now() - startedAt,
      contentType: '',
      error: error?.name === 'AbortError' ? `${timeoutMs}ms 초과` : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 링크가 살아 있는지 본다. GitHub 릴리스는 HEAD 를 막는 경우가 있어
 * HEAD 가 405/403 이면 Range 로 첫 바이트만 받아 다시 확인한다.
 */
export async function probeLink(url, timeoutMs = 25000) {
  const head = await request(url, { method: 'HEAD', timeoutMs });
  if (head.okStatus) return { alive: true, status: head.status, ms: head.ms };
  if (head.status === 0) return { alive: false, status: 0, ms: head.ms, error: head.error };
  const ranged = await request(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, timeoutMs });
  return {
    alive: ranged.okStatus || ranged.status === 206,
    status: ranged.status || head.status,
    ms: head.ms + ranged.ms,
  };
}

/** GAS GET 액션. 응답이 JSON 이 아닌 경우(로그인 HTML 등)를 따로 알려준다. */
export async function gasGet(action, params = {}, timeoutMs = 25000) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await request(`${GAS_URL}?${query}`, { timeoutMs });
  return parseGasResponse(response);
}

/** GAS POST 액션. 토큰 없이 부르면 Unauthorized 가 정상이다. */
export async function gasPost(payload, timeoutMs = 25000) {
  const response = await request(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    timeoutMs,
  });
  return parseGasResponse(response);
}

function parseGasResponse(response) {
  if (!response.okStatus) {
    return { ...response, json: null, parseError: response.error || `HTTP ${response.status}` };
  }
  const body = response.text.trim();
  // JSONP 응답(콜백 래핑)도 받아 준다. lookup 계열이 이 형태다.
  const unwrapped = /^[A-Za-z_$][\w$]*\s*\(/.test(body) ? body.slice(body.indexOf('(') + 1, body.lastIndexOf(')')) : body;
  try {
    return { ...response, json: JSON.parse(unwrapped), parseError: '' };
  } catch {
    const looksLikeHtml = /^\s*<(?:!doctype|html)/i.test(body);
    return {
      ...response,
      json: null,
      parseError: looksLikeHtml ? 'JSON 이 아니라 HTML 이 왔다(배포/권한 확인)' : 'JSON 파싱 실패',
    };
  }
}

/** 리포지토리 안의 JSON 파일. 없으면 null 을 준다(하네스가 죽으면 안 된다). */
export function readRepoJson(relativePath) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** 리포지토리 안의 텍스트 파일. */
export function readRepoText(relativePath) {
  const path = join(ROOT, relativePath);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function minutesSince(isoLike) {
  const time = new Date(isoLike).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round((Date.now() - time) / 60000);
}

/** 실행 인자 유틸. */
export function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/** 병렬 실행이되, 하나가 터져도 나머지 결과는 살린다. */
export async function collect(entries) {
  const settled = await Promise.allSettled(entries.map((entry) => entry.run()));
  return settled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : fail(entries[index].id, entries[index].label, `점검 자체가 실패했다: ${result.reason?.message || result.reason}`),
  );
}
