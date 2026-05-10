# P0 #4 — main.ts IPC 이주 마이그레이션 플랜

**기준일:** 2026-04-28 / **현재 상태:** main.ts에 94개 IPC 잔존, main/ipc/에 161개 분리 / **registerOnce 가드:** ✅ 적용 완료 (v2.7.28)

## 잔존 94개 채널 namespace별 분류

| Namespace | 개수 | 채널 (대표) | 이주 대상 파일 | 위험도 |
|---|---|---|---|---|
| **batch 1: 단일/독립** | 8 | `leword:launch` `free:activate` `apiKey:validate` `login:success` `window:focus` `network:optimize` `localFolder:resizeImage` `openImagesFolder` | 신규 `appHandlers.ts` | 🟢 LOW |
| **batch 2: app/cache** | 2 | `app:getCacheSize` `app:clearCache` | 위 동일 | 🟢 LOW |
| **batch 3: file:*** | 7 | `file:checkExists` `file:readDir` `file:deleteFolder` `file:deleteFile` `file:readDirWithStats` `file:getStats` `file:exists` | 기존 `systemHandlers.ts` 확장 | 🟢 LOW |
| **batch 4: dialog:*** | 2 | `dialog:selectVideoFile` `dialog:showOpenDialog` | 기존 `systemHandlers.ts` 확장 | 🟢 LOW |
| **batch 5: media:*** | 3 | `media:listMp4Files` `media:convertMp4ToGif` `media:createKenBurnsVideo` | 신규 `mediaHandlers.ts` | 🟡 MED (ffmpeg-static 의존) |
| **batch 6: thumbnail:*** | 5 | `thumbnail:generateSvg` `thumbnail:getStyles` `thumbnail:getCategories` `thumbnail:createProductThumbnail` `thumbnail:saveToLocal` | 신규 `thumbnailHandlers.ts` | 🟡 MED |
| **batch 7: trend:*** | 6 | `trend:startMonitoring` `stopMonitoring` `getStatus` `setAlertEnabled` `getCurrentTrends` `setInterval` | 기존 `analyticsHandlers.ts` 확장 | 🟡 MED (TrendMonitor 인스턴스 공유) |
| **batch 8: aiAssistant:*** | 4 | `chat` `getWelcome` `clearChat` `runAutoFix` | 기존 `miscHandlers.ts` 확장 | 🟡 MED (masterAgent 의존) |
| **batch 9: datalab:*** | 3 | `getTrendSummary` `getSearchTrend` `getRelatedKeywords` | 기존 `analyticsHandlers.ts` 확장 | 🟡 MED |
| **batch 10: license:*** | 3 | `checkStatus` `get` `register` | 기존 `authHandlers.ts` 확장 | 🟡 MED |
| **batch 11: schedule:*** | 4 | `getAll` `remove` `reschedule` `retry` | 기존 `scheduleHandlers.ts` 확장 | 🟡 MED |
| **batch 12: analytics:*** | 8 | `addPost` `startTracking` `stopTracking` `getStatus` `getAllPosts` `getAnalytics` `updateMetrics` `removePost` | 기존 `analyticsHandlers.ts` 확장 | 🟡 MED |
| **batch 13: blog:*** | 2 | `blog:getRecentPosts` `blog:fetchCategories` | 기존 `blogHandlers.ts` 확장 | 🟠 HIGH (NaverBlogAutomation 인스턴스 의존) |
| **batch 14: gemini:*** | 2 | `gemini:test10x` `gemini:generateVeoVideo` | 기존 `apiHandlers.ts` 확장 | 🟠 HIGH |
| **batch 15: image:*** | 12 | `downloadAndSave` `collectFromUrl` `collectFromShopping` `matchToHeadings` `downloadAndSaveMultiple` `searchNaver` 외 | 기존 `imageHandlers.ts` 확장 | 🟠 HIGH (다수 의존) |
| **batch 16: library:*** | 15 | `getCategories` `deleteImage` `collectImages` `batchCollect` `getStats` `getImages` 외 | 신규 `libraryHandlers.ts` | 🟠 HIGH |
| **batch 17: multiAccount:*** | 2 | `publish` `cancel` | 신규 `multiAccountHandlers.ts` | 🔴 CRITICAL (BlogAccountManager + 다발행) |
| **batch 18: automation:*** | 6 | `syncImageManager` `closeBrowser` `run` `cancel` `resetImageState` `generateContent` | 신규 `automationHandlers.ts` (가장 핵심) | 🔴 CRITICAL (NaverBlogAutomation 핵심 흐름) |
| **batch 19: 미분류** | 4 | `quit-confirm-response`(on) `search-images-for-headings` `auto-collect-images` `apply-image-placements` | 케이스별 분류 | 🟡 MED |

## 권고 진행 순서 (안전 → 위험)

1. **🟢 LOW batch (1·2·3·4)** — 단일 함수 호출 핸들러 19개. `appHandlers.ts` 신규 + `systemHandlers.ts` 확장. 회귀 가능성 거의 없음
2. **🟡 MED batch (5~12)** — 외부 인스턴스 의존이지만 명확한 deps 주입 패턴 가능. 35개
3. **🟠 HIGH batch (13~16)** — image/library/blog 등 도메인 핵심. 회귀 시 발행 흐름 영향. 31개
4. **🔴 CRITICAL batch (17·18)** — 다계정/automation. 별도 단계로 운영. 8개
5. **batch 19** — 케이스별 분류 후 합류. 4개

## 이번 라운드 산출물 (v2.7.28)

- ✅ `src/main/ipc/registerOnce.ts` — 이중 등록 가드 monkey-patch
- ✅ `main.ts` 최상단 import 적용 → 266개 IPC 모두 자동 보호
- ✅ `npx tsc --noEmit` 0 에러

## 다음 라운드 권고 (v2.7.29)

- batch 1+2+3+4 (총 19개) 일괄 이주 → main.ts 약 600줄 감축
- 각 batch 이주 후 vitest 회귀 테스트 + electron 부트 smoke
- 이중 등록 경고 로그가 0건이어야 함 (registerOnce 가드 검증)
