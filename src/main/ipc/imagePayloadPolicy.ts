// src/main/ipc/imagePayloadPolicy.ts
// 저장하기 전에 "정말 이미지 바이트인가"를 판정한다.
//
// [2026-09-08 사용자 실측] 위키미디어가 User-Agent 없는 요청에 126바이트 텍스트
// ("Please set a user-agent and respect our robot policy ...")를 200으로 돌려줬고,
// image:downloadAndSave 가 그 본문을 그대로 .jpg 로 저장했다. 발행 단계에서
// 네이버 에디터가 이 파일을 거부해 3회 재시도 뒤 IMAGE_INSERTION_FAILED 로
// 발행 전체가 중단됐다. 깨진 파일은 발행이 아니라 다운로드 단계에서 잘라낸다.

import { sniffImageExtension } from './imageExtensionPolicy.js';

/** 이 크기 미만이면 실제 이미지가 아니라 에러 본문일 가능성이 높다. */
export const MIN_IMAGE_BYTES = 1024;

/**
 * 네이버가 받는 확장자는 아니지만 "이미지이긴 한" 포맷.
 * [2026-09-08] 수집 폴더 실측에서 뉴스사 AVIF 7개가 정상 저장돼 있었다.
 * 여기서 거부하면 종전에 쓰이던 이미지를 새로 버리게 되므로 통과시킨다.
 * (네이버가 받는 확장자로 바꾸는 일은 저장 확장자 정책의 몫이다.)
 */
function isIsoBmffImage(buffer: Buffer): boolean {
    if (buffer.length < 16) return false;
    if (buffer.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
    const brand = buffer.subarray(8, 12).toString('latin1');
    return ['avif', 'avis', 'heic', 'heix', 'heif', 'mif1', 'msf1'].includes(brand);
}

/** 저장 확장자와 무관하게 "이미지 바이트인가"만 본다. */
export function looksLikeImageBytes(buffer: Buffer): boolean {
    return Boolean(sniffImageExtension(buffer)) || isIsoBmffImage(buffer);
}

export type ImagePayloadVerdict = { ok: true } | { ok: false; reason: string };

/**
 * 저장 가능한 이미지 바이트인지 판정한다.
 * remote=true(원격 다운로드)면 매직 바이트까지 요구한다 — 원격 응답은 에러 페이지가
 * 200으로 오는 경우가 흔하다. 로컬/data URL 은 크기만 본다(사용자가 고른 파일이므로).
 */
export function verifyImagePayload(buffer: Buffer | null | undefined, remote: boolean): ImagePayloadVerdict {
    if (!buffer || buffer.length === 0) {
        return { ok: false, reason: '내용이 비어 있습니다.' };
    }
    if (buffer.length < MIN_IMAGE_BYTES) {
        const preview = buffer.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ').trim();
        return { ok: false, reason: `이미지가 아니라 ${buffer.length}바이트 응답이 왔습니다. (${preview})` };
    }
    if (remote && !looksLikeImageBytes(buffer)) {
        return { ok: false, reason: '이미지 형식이 아닌 응답입니다. (매직 바이트 불일치)' };
    }
    return { ok: true };
}
