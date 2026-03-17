/**
 * 📅 scheduleDistributor.ts — 예약 시간 분산 유틸리티 모듈
 * 
 * [2026-03-17] 신규 생성
 * 
 * 목적: multiAccountManager.ts, continuousPublishing.ts에 복사-붙여넣기된
 *       동일 알고리즘(10분 반올림, ±30% 편차, 충돌 회피)을 단일 모듈로 통합.
 * 
 * 원칙:
 *  - 순수 함수 기반 (DOM 의존성 0)
 *  - 모든 시간은 네이버 서버 예약 호환 (10분 단위)
 *  - scheduleUserModified 플래그로 수동 설정 항목 보호
 */

// ────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────

/** 예약 가능한 항목의 최소 인터페이스 */
export interface ScheduleItem {
  scheduleDate?: string;            // 'YYYY-MM-DD'
  scheduleTime?: string;            // 'HH:mm'
  scheduleUserModified?: boolean;   // 사용자 수동 설정 여부
}

/** 간격 기반 분산 옵션 */
export interface DistributeByIntervalOptions {
  baseDate: string;                 // 시작 날짜 'YYYY-MM-DD'
  baseTime: string;                 // 시작 시간 'HH:mm'
  intervalMinutes: number;          // 평균 간격 (분)
  variancePercent?: number;         // 편차 비율 (기본 0.3 = ±30%)
  minIntervalMinutes?: number;      // 최소 간격 (기본 10)
  roundingMinutes?: number;         // 반올림 단위 (기본 10)
  firstItemRandomOffset?: boolean;  // 첫 항목에 랜덤 오프셋 적용 (기본 false)
}

/** 범위 내 랜덤 분산 옵션 */
export interface DistributeByRandomRangeOptions {
  startDate: string;                // 시작 날짜 'YYYY-MM-DD'
  startTime: string;                // 시작 시간 'HH:mm'
  endDate: string;                  // 종료 날짜 'YYYY-MM-DD'
  endTime: string;                  // 종료 시간 'HH:mm'
  roundingMinutes?: number;         // 반올림 단위 (기본 10)
}

/** 분산 결과 */
export interface ScheduleSlot {
  date: string;   // 'YYYY-MM-DD'
  time: string;   // 'HH:mm'
}

// ────────────────────────────────────────────
// 기본 유틸리티 함수
// ────────────────────────────────────────────

/**
 * 10분 단위 반올림 (네이버 서버 예약 호환)
 * - Math.round로 반올림 (5이상 올림)
 * - 60분 넘기면 시간 +1
 */
export function roundToInterval(date: Date, minutes: number = 10): Date {
  const result = new Date(date);
  const rawMins = result.getMinutes();
  const rounded = Math.round(rawMins / minutes) * minutes;
  // ✅ [2026-03-17 FIX] 60분 넘김 체크를 setMinutes 전에 수행 (더블 인크리먼트 방지)
  if (rounded >= 60) {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  } else {
    result.setMinutes(rounded, 0, 0);
  }
  return result;
}

/**
 * 시작 시간 전용 반올림 (올림 방향)
 * - Math.ceil로 올림 (시작 시간은 위로)
 */
export function ceilToInterval(date: Date, minutes: number = 10): Date {
  const result = new Date(date);
  const rawMins = result.getMinutes();
  const ceiled = Math.ceil(rawMins / minutes) * minutes;
  // ✅ [2026-03-17 FIX] 60분 넘김 체크를 setMinutes 전에 수행 (더블 인크리먼트 방지)
  if (ceiled >= 60) {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  } else {
    result.setMinutes(ceiled, 0, 0);
  }
  return result;
}

/**
 * Date → { date: 'YYYY-MM-DD', time: 'HH:mm' } 변환
 */
export function formatScheduleDateTime(d: Date): ScheduleSlot {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
  };
}

/**
 * 중복 시간 충돌 회피
 * - usedKeys에 이미 있으면 +roundingMinutes씩 밀기
 * - 최대 maxAttempts회 시도
 */
export function resolveTimeConflict(
  date: Date,
  usedKeys: Set<string>,
  roundingMinutes: number = 10,
  maxAttempts: number = 6
): Date {
  let result = new Date(date);
  let timeKey = result.toISOString();
  let attempts = 0;

  while (usedKeys.has(timeKey) && attempts < maxAttempts) {
    const newMins = result.getMinutes() + roundingMinutes;
    // ✅ [2026-03-17 FIX] 60분 넘김 체크를 setMinutes 전에 수행
    if (newMins >= 60) {
      result.setMinutes(newMins - 60, 0, 0);
      result.setHours(result.getHours() + 1);
    } else {
      result.setMinutes(newMins, 0, 0);
    }
    timeKey = result.toISOString();
    attempts++;
  }

  return result;
}

// ────────────────────────────────────────────
// 핵심 분산 함수
// ────────────────────────────────────────────

/**
 * 간격 기반 시간 분산 (핵심 알고리즘)
 * 
 * multiAccountManager.ts L2598-2665, continuousPublishing.ts L1394-1437에서 추출.
 * 
 * @param count - 생성할 시간 슬롯 수
 * @param options - 분산 옵션 (시작 날짜/시간, 간격, 편차)
 * @param existingUsedKeys - 이미 배정된 시간 키 (수동 설정 항목과의 충돌 회피용)
 * @returns ScheduleSlot[] — date/time 배열
 */
export function distributeByInterval(
  count: number,
  options: DistributeByIntervalOptions,
  existingUsedKeys?: Set<string>
): ScheduleSlot[] {
  if (count <= 0) return [];

  const {
    baseDate,
    baseTime,
    intervalMinutes,
    variancePercent = 0.3,
    minIntervalMinutes = 10,
    roundingMinutes = 10,
  } = options;

  // 시작 시간 올림 처리
  const baseDateTime = ceilToInterval(new Date(`${baseDate}T${baseTime}`), roundingMinutes);
  const usedKeys = new Set<string>(existingUsedKeys || []);
  const results: ScheduleSlot[] = [];

  let prevTime = baseDateTime;

  const firstItemRandomOffset = options.firstItemRandomOffset ?? false;

  for (let i = 0; i < count; i++) {
    let scheduledTime: Date;

    if (i === 0) {
      scheduledTime = new Date(prevTime);
      // ✅ [2026-03-17] 원래 continuousPublishing.ts 동작 복원: 첫 항목에 랜덤 오프셋
      if (firstItemRandomOffset) {
        const maxOffset10 = Math.max(1, Math.floor(intervalMinutes * 0.2 / roundingMinutes));
        const randomOffset = Math.floor(Math.random() * (maxOffset10 + 1));
        scheduledTime = new Date(scheduledTime.getTime() + randomOffset * roundingMinutes * 60000);
      }
    } else {
      // 간격 + ±variancePercent 랜덤 편차
      const maxVariance = Math.max(minIntervalMinutes, intervalMinutes * variancePercent);
      const variance = Math.random() * maxVariance * 2 - maxVariance;
      const actualInterval = Math.max(minIntervalMinutes, intervalMinutes + variance);
      scheduledTime = new Date(prevTime.getTime() + actualInterval * 60000);
    }

    // 반올림
    scheduledTime = roundToInterval(scheduledTime, roundingMinutes);

    // 충돌 회피
    scheduledTime = resolveTimeConflict(scheduledTime, usedKeys, roundingMinutes);
    usedKeys.add(scheduledTime.toISOString());

    const slot = formatScheduleDateTime(scheduledTime);
    results.push(slot);
    prevTime = scheduledTime;
  }

  return results;
}

/**
 * 범위 내 랜덤 분산 (Stratified Sampling + 충돌 회피)
 * 
 * [2026-03-17 FIX] 순수 랜덤 → 구간 분할 방식으로 변경.
 * 전체 범위를 N등분하고, 각 구간에서 1개씩 랜덤 선택.
 * → 20개/4시간(24슬롯) 같은 밀집 상황에서도 시간이 골고루 분산.
 * 
 * @param count - 생성할 시간 슬롯 수
 * @param options - 시작~종료 범위
 * @returns ScheduleSlot[] — 시간순 정렬된 date/time 배열
 */
export function distributeByRandomRange(
  count: number,
  options: DistributeByRandomRangeOptions
): ScheduleSlot[] {
  if (count <= 0) return [];

  const { startDate, startTime, endDate, endTime, roundingMinutes = 10 } = options;
  const startMs = new Date(`${startDate}T${startTime}`).getTime();
  const endMs = new Date(`${endDate}T${endTime}`).getTime();
  const rangeMs = endMs - startMs;

  if (rangeMs <= 0) return [];

  const usedKeys = new Set<string>();
  const times: Date[] = [];

  // ✅ 구간 분할 (Stratified Sampling): 범위를 N등분하여 각 구간에서 1개씩 선택
  const segmentMs = rangeMs / count;

  for (let i = 0; i < count; i++) {
    const segStart = startMs + segmentMs * i;
    const segEnd = startMs + segmentMs * (i + 1);
    const raw = new Date(segStart + Math.floor(Math.random() * (segEnd - segStart)));
    let rounded = roundToInterval(raw, roundingMinutes);

    // ✅ 충돌 회피: 같은 10분 슬롯에 이미 배정되었으면 밀기
    rounded = resolveTimeConflict(rounded, usedKeys, roundingMinutes);
    usedKeys.add(rounded.toISOString());
    times.push(rounded);
  }

  // 시간순 정렬 (충돌 회피로 순서가 바뀔 수 있으므로)
  times.sort((a, b) => a.getTime() - b.getTime());

  return times.map(formatScheduleDateTime);
}

/**
 * per-item 보호 분산 (다중계정 풀오토 전용)
 * 
 * scheduleUserModified === true인 항목은 보존,
 * 나머지만 자동 분산. 수동 항목 시간과의 충돌도 회피.
 * 
 * @param items - QueueItem 배열 (원본 mutate)
 * @param options - 분산 옵션
 * @param logger - 선택적 로그 콜백
 * @returns 분산된 items 배열 (동일 참조)
 */
export function distributeWithProtection<T extends ScheduleItem>(
  items: T[],
  options: DistributeByIntervalOptions,
  logger?: (msg: string, level: 'info' | 'warn') => void
): T[] {
  const log = logger || (() => {});

  const userModifiedItems = items.filter(item => item.scheduleUserModified);
  const autoDistributeItems = items.filter(item => !item.scheduleUserModified);

  // 수동 설정 항목 로그
  if (userModifiedItems.length > 0) {
    log(`🔒 수동 예약 ${userModifiedItems.length}개 항목 보호 (자동 분산 제외)`, 'info');
    userModifiedItems.forEach(item => {
      console.log(`  🔒 ${item.scheduleDate} ${item.scheduleTime} (수동)`);
    });
  }

  // 자동 분산 대상이 2개 이상일 때만 분산
  if (autoDistributeItems.length >= 2) {
    // 수동 설정 항목의 시간을 충돌 회피 키로 수집
    const usedKeys = new Set<string>();
    userModifiedItems.forEach(item => {
      if (item.scheduleDate && item.scheduleTime) {
        usedKeys.add(new Date(`${item.scheduleDate}T${item.scheduleTime}`).toISOString());
      }
    });

    // 자동 분산 대상의 기준 시간 결정
    const firstAuto = autoDistributeItems[0];
    const effectiveOptions: DistributeByIntervalOptions = {
      ...options,
      baseDate: firstAuto.scheduleDate || options.baseDate,
      baseTime: firstAuto.scheduleTime || options.baseTime,
    };

    const distributed = distributeByInterval(autoDistributeItems.length, effectiveOptions, usedKeys);

    // 결과 적용
    autoDistributeItems.forEach((item, idx) => {
      item.scheduleDate = distributed[idx].date;
      item.scheduleTime = distributed[idx].time;
      console.log(`[Schedule] ${idx + 1}번째: ${distributed[idx].date} ${distributed[idx].time} (자동)`);
    });

    log(`📅 예약 시간 분산 완료: ${autoDistributeItems.length}개 항목 (${effectiveOptions.baseTime} 시작, ${options.intervalMinutes}분 간격)`, 'info');
  } else if (autoDistributeItems.length === 1) {
    console.log('[Schedule] 자동 분산 대상 1개 → 분산 불필요');
  } else {
    log(`📅 모든 예약 항목이 수동 설정됨 → 자동 분산 건너뜀`, 'info');
  }

  return items;
}
