// src/crawler/shared/naverApiCredentials.ts
// Naver Open API key-pair collection from env — single source of truth.
// Third consumer (docCapture) triggered the extraction rule: previously
// duplicated in naverApiSource.ts and newsOgImageSource.ts.
// Env is populated by applyConfigToEnv; masked/corrupted values (non-ASCII)
// are rejected so a broken key never reaches a fetch header (ByteString crash).

const HEADER_SAFE = /^[\x21-\x7E]+$/;

export interface NaverKeyPair {
  id: string;
  secret: string;
  label: string;
}

function cleanEnv(v: string | undefined): string {
  const s = String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
  return s && HEADER_SAFE.test(s) ? s : '';
}

/** NAVER_CLIENT_* + NAVER_DATALAB_* pairs including _2.._10 rotations. */
export function collectNaverKeyPairs(): NaverKeyPair[] {
  const pairs: NaverKeyPair[] = [];
  const bases: Array<[string, string, string]> = [
    ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER'],
    ['NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET', 'DATALAB'],
  ];
  for (const [idKey, secretKey, label] of bases) {
    const id = cleanEnv(process.env[idKey]);
    const secret = cleanEnv(process.env[secretKey]);
    if (id && secret) pairs.push({ id, secret, label: `${label}#1` });
    for (let i = 2; i <= 10; i++) {
      const id2 = cleanEnv(process.env[`${idKey}_${i}`]);
      const secret2 = cleanEnv(process.env[`${secretKey}_${i}`]);
      if (id2 && secret2) pairs.push({ id: id2, secret: secret2, label: `${label}#${i}` });
    }
  }
  return pairs;
}

/**
 * Call a Naver Open API JSON endpoint trying each key pair until one works.
 * Returns null when no pair succeeds (caller degrades gracefully).
 */
export async function fetchNaverOpenApi<T>(url: string): Promise<T | null> {
  for (const pair of collectNaverKeyPairs()) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': pair.id,
          'X-Naver-Client-Secret': pair.secret,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${pair.label})`);
      return (await res.json()) as T;
    } catch (error) {
      console.warn(`[NaverApi] 실패 (${pair.label}): ${(error as Error).message}`);
    }
  }
  return null;
}
