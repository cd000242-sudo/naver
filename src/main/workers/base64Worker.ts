// src/main/workers/base64Worker.ts
// [SPEC-FREEZE-GUARD-001-P2 R1 / v2.10.260] Base64 디코딩 워커 스크립트
//
// 책임: 메인 스레드의 동기 `Buffer.from(b64, 'base64')` 호출(perf-summary #1)을
//       워커 스레드로 분리한다. 이 파일은 dist에 별도 .js로 컴파일되어
//       Worker 생성자에서 실행된다.
//
// 프로토콜:
//   요청 (parent → worker): { id: string; b64: string }
//   응답 (worker → parent): { id, ok: true,  buffer: ArrayBuffer }   // transferList로 zero-copy
//                          { id, ok: false, error: string }
//
// 본 파일은 호출 0건 단계(R1 인프라)에서 작성한다. 호출 지점 교체는 R2~R5.

import { parentPort } from 'worker_threads';

interface DecodeRequest {
  id: string;
  b64: string;
}

interface DecodeResponseOk {
  id: string;
  ok: true;
  buffer: ArrayBuffer;
}

interface DecodeResponseErr {
  id: string;
  ok: false;
  error: string;
}

type DecodeResponse = DecodeResponseOk | DecodeResponseErr;

if (!parentPort) {
  // 워커 스크립트가 메인 스레드에서 require/import된 경우 — 즉시 차단.
  // tests/스크립트가 잘못 호출하는 회귀를 막는다.
  throw new Error('[base64Worker] parentPort 없음 — 메인 스레드에서 직접 실행 금지');
}

const port = parentPort;

port.on('message', (msg: DecodeRequest): void => {
  const id = msg && typeof msg.id === 'string' ? msg.id : 'unknown';
  try {
    if (!msg || typeof msg.b64 !== 'string') {
      const errResp: DecodeResponseErr = { id, ok: false, error: 'input is not a string' };
      port.postMessage(errResp);
      return;
    }
    const buf = Buffer.from(msg.b64, 'base64');
    // Buffer는 underlying ArrayBuffer 위의 view. transferList에 슬라이스 사본을 넣어
    // pool 측에서 새 ArrayBuffer를 받게 한다.
    // (ownership 전이 후 본 워커에서 buf 참조 시 detached — 즉시 응답하므로 안전)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const okResp: DecodeResponseOk = { id, ok: true, buffer: ab };
    port.postMessage(okResp, [ab]);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const errResp: DecodeResponseErr = { id, ok: false, error };
    port.postMessage(errResp);
  }
});
