/**
 * 앱 ↔ 사이트 API 키 맞추기 판정(순수 함수) — 2026-10-07 사장님 "둘이 한 몸이 되어야 정상".
 * 칸마다: 한쪽에만 있으면 없는 쪽으로 · 둘 다 있는데 다르면 마지막에 저장한 쪽이 이긴다(사장님 결정).
 * 사이트에서 앱이 꺼져 있을 때 저장했으면(sitePending) 사이트가 나중으로 본다. 앱 저장 시각을 모르면(옛 앱) 앱 값을 기준으로.
 * 앱에 없는 사이트 전용 칸(쿠팡 · AI 키 등)은 건드리지 않는다.
 */

/** 앱 설정과 겹치는 8칸 — 앱 src/utils/api-key-sync.ts 의 API_KEY_FIELD_MAP 과 같은 목록(쌍둥이). */
export const APP_KEY_FIELDS = Object.freeze(['openApiId', 'openApiSecret', 'apihubKeyId', 'apihubKey', 'searchAdLicense', 'searchAdSecret', 'searchAdCustomer', 'youtubeKey']);

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const time = (iso) => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? t : 0; };

export function planKeySync({ siteKeys = {}, siteSavedAt = '', sitePending = false, appKeys = {}, appSavedAt = '' }) {
  const siteNewer = Boolean(sitePending) || (time(appSavedAt) > 0 && time(siteSavedAt) > time(appSavedAt));
  const nextSite = { ...siteKeys };
  const toApp = {};
  let siteChanged = false;
  for (const field of APP_KEY_FIELDS) {
    const s = clean(siteKeys[field]);
    const a = clean(appKeys[field]);
    if (!s && !a) continue;
    if (s && !a) { toApp[field] = s; continue; }
    if (!s && a) { nextSite[field] = a; siteChanged = true; continue; }
    if (s === a) continue;
    if (siteNewer) toApp[field] = s;
    else { nextSite[field] = a; siteChanged = true; }
  }
  return { nextSite, siteChanged, toApp, appChanged: Object.keys(toApp).length > 0, siteNewer };
}
