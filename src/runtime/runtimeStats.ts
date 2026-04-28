// v2.7.27 — Runtime Stats 영구 저장
// 직전 N회 실행에서 freeze(>=5s lag) 횟수를 기록해 다음 시작 시 GPU 가속 결정에 사용.
// 사양 자동 감지 대신 "사용자 환경에서 실제로 응답없음이 발생하는가"를 학습.

import fs from 'fs';
import path from 'path';

interface SessionRecord {
  startedAt: string;     // ISO timestamp
  freezeCount: number;   // 5s 이상 lag 발생 횟수
  severeLagCount: number; // 1s 이상
}

interface StatsFile {
  sessions: SessionRecord[];
}

const STATS_FILE = path.join(process.env.TEMP || '/tmp', 'bln-runtime-stats.json');
const MAX_HISTORY = 5; // 최근 5세션만 보관

let currentSession: SessionRecord = {
  startedAt: new Date().toISOString(),
  freezeCount: 0,
  severeLagCount: 0,
};

function loadStats(): StatsFile {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StatsFile;
      if (parsed && Array.isArray(parsed.sessions)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { sessions: [] };
}

function saveStats(data: StatsFile): void {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch {
    // ignore
  }
}

export function recordFreeze(): void {
  currentSession.freezeCount++;
  persistCurrentSession();
}

export function recordSevereLag(): void {
  currentSession.severeLagCount++;
  // severeLag은 자주 발생할 수 있으므로 매번 디스크 쓰기는 부담. 매 10회마다 flush.
  if (currentSession.severeLagCount % 10 === 0) {
    persistCurrentSession();
  }
}

function persistCurrentSession(): void {
  const data = loadStats();
  // 현재 세션을 가장 마지막 항목으로 갱신 (없으면 push)
  const idx = data.sessions.findIndex((s) => s.startedAt === currentSession.startedAt);
  if (idx >= 0) {
    data.sessions[idx] = currentSession;
  } else {
    data.sessions.push(currentSession);
  }
  // 최근 MAX_HISTORY만 유지
  if (data.sessions.length > MAX_HISTORY) {
    data.sessions = data.sessions.slice(-MAX_HISTORY);
  }
  saveStats(data);
}

// 직전 세션들의 freeze 평균 — 다음 시작 시 GPU 결정용
export function getRecentFreezeAvg(): { avg: number; samples: number } {
  const data = loadStats();
  // 현재 세션은 제외 (방금 시작했으므로 데이터 없음)
  const past = data.sessions.filter((s) => s.startedAt !== currentSession.startedAt);
  if (past.length === 0) return { avg: 0, samples: 0 };
  const total = past.reduce((sum, s) => sum + s.freezeCount, 0);
  return { avg: total / past.length, samples: past.length };
}

export function shouldDisableGpuFromHistory(): boolean {
  const { avg, samples } = getRecentFreezeAvg();
  // 직전 세션이 있고 freeze 평균이 3회 이상이면 GPU 해제 권장
  return samples >= 1 && avg >= 3;
}

export function initSessionTracking(): void {
  currentSession = {
    startedAt: new Date().toISOString(),
    freezeCount: 0,
    severeLagCount: 0,
  };
  persistCurrentSession();
}
