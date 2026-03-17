/**
 * 📅 scheduleDistributor.test.cjs — 예약 시간 분산 모듈 단위 테스트
 * 
 * [2026-03-17] 신규 생성
 * 
 * 실행: node src/tests/scheduleDistributor.test.cjs
 * (순수 함수 기반이므로 Electron 없이 Node.js로 직접 테스트 가능)
 */

const assert = require('assert');

// ────────────────────────────────────────────
// scheduleDistributor.ts의 순수 함수를 CJS로 재구현 (동일 알고리즘)
// TS 모듈은 ESM이므로, 테스트용으로 알고리즘을 직접 포팅
// ────────────────────────────────────────────

function roundToInterval(date, minutes = 10) {
  const result = new Date(date);
  const rawMins = result.getMinutes();
  const rounded = Math.round(rawMins / minutes) * minutes;
  if (rounded >= 60) {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  } else {
    result.setMinutes(rounded, 0, 0);
  }
  return result;
}

function ceilToInterval(date, minutes = 10) {
  const result = new Date(date);
  const rawMins = result.getMinutes();
  const ceiled = Math.ceil(rawMins / minutes) * minutes;
  if (ceiled >= 60) {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  } else {
    result.setMinutes(ceiled, 0, 0);
  }
  return result;
}

function formatScheduleDateTime(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function resolveTimeConflict(date, usedKeys, roundingMinutes = 10, maxAttempts = 6) {
  let result = new Date(date);
  let timeKey = result.toISOString();
  let attempts = 0;
  while (usedKeys.has(timeKey) && attempts < maxAttempts) {
    const newMins = result.getMinutes() + roundingMinutes;
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

function distributeByInterval(count, options, existingUsedKeys) {
  if (count <= 0) return [];
  const {
    baseDate, baseTime, intervalMinutes,
    variancePercent = 0.3, minIntervalMinutes = 10,
    roundingMinutes = 10, firstItemRandomOffset = false,
  } = options;

  const baseDateTime = ceilToInterval(new Date(`${baseDate}T${baseTime}`), roundingMinutes);
  const usedKeys = new Set(existingUsedKeys || []);
  const results = [];
  let prevTime = baseDateTime;

  for (let i = 0; i < count; i++) {
    let scheduledTime;
    if (i === 0) {
      scheduledTime = new Date(prevTime);
      if (firstItemRandomOffset) {
        const maxOffset10 = Math.max(1, Math.floor(intervalMinutes * 0.2 / roundingMinutes));
        const randomOffset = Math.floor(Math.random() * (maxOffset10 + 1));
        scheduledTime = new Date(scheduledTime.getTime() + randomOffset * roundingMinutes * 60000);
      }
    } else {
      const maxVariance = Math.max(minIntervalMinutes, intervalMinutes * variancePercent);
      const variance = Math.random() * maxVariance * 2 - maxVariance;
      const actualInterval = Math.max(minIntervalMinutes, intervalMinutes + variance);
      scheduledTime = new Date(prevTime.getTime() + actualInterval * 60000);
    }
    scheduledTime = roundToInterval(scheduledTime, roundingMinutes);
    scheduledTime = resolveTimeConflict(scheduledTime, usedKeys, roundingMinutes);
    usedKeys.add(scheduledTime.toISOString());
    results.push(formatScheduleDateTime(scheduledTime));
    prevTime = scheduledTime;
  }
  return results;
}

function distributeByRandomRange(count, options) {
  if (count <= 0) return [];
  const { startDate, startTime, endDate, endTime, roundingMinutes = 10 } = options;
  const startMs = new Date(`${startDate}T${startTime}`).getTime();
  const endMs = new Date(`${endDate}T${endTime}`).getTime();
  const rangeMs = endMs - startMs;
  if (rangeMs <= 0) return [];

  const usedKeys = new Set();
  const times = [];
  const segmentMs = rangeMs / count;

  for (let i = 0; i < count; i++) {
    const segStart = startMs + segmentMs * i;
    const segEnd = startMs + segmentMs * (i + 1);
    const raw = new Date(segStart + Math.floor(Math.random() * (segEnd - segStart)));
    let rounded = roundToInterval(raw, roundingMinutes);
    rounded = resolveTimeConflict(rounded, usedKeys, roundingMinutes);
    usedKeys.add(rounded.toISOString());
    times.push(rounded);
  }

  times.sort((a, b) => a.getTime() - b.getTime());
  return times.map(formatScheduleDateTime);
}

function distributeWithProtection(items, options, logger) {
  const log = logger || (() => {});
  const userModifiedItems = items.filter(item => item.scheduleUserModified);
  const autoDistributeItems = items.filter(item => !item.scheduleUserModified);

  if (autoDistributeItems.length >= 2) {
    const usedKeys = new Set();
    userModifiedItems.forEach(item => {
      if (item.scheduleDate && item.scheduleTime) {
        usedKeys.add(new Date(`${item.scheduleDate}T${item.scheduleTime}`).toISOString());
      }
    });
    const firstAuto = autoDistributeItems[0];
    const effectiveOptions = {
      ...options,
      baseDate: firstAuto.scheduleDate || options.baseDate,
      baseTime: firstAuto.scheduleTime || options.baseTime,
    };
    const distributed = distributeByInterval(autoDistributeItems.length, effectiveOptions, usedKeys);
    autoDistributeItems.forEach((item, idx) => {
      item.scheduleDate = distributed[idx].date;
      item.scheduleTime = distributed[idx].time;
    });
    log(`📅 분산 완료: ${autoDistributeItems.length}개`, 'info');
  }
  return items;
}

// ────────────────────────────────────────────
// 테스트 실행
// ────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n📅 scheduleDistributor 단위 테스트');
console.log('─'.repeat(50));

// ─── roundToInterval ───
console.log('\n🔹 roundToInterval');

test('23분 → 20분 반올림', () => {
  const result = roundToInterval(new Date('2026-03-17T09:23:00'));
  assert.strictEqual(result.getMinutes(), 20);
  assert.strictEqual(result.getSeconds(), 0);
});

test('25분 → 30분 반올림', () => {
  const result = roundToInterval(new Date('2026-03-17T09:25:00'));
  assert.strictEqual(result.getMinutes(), 30);
});

test('55분 → 60분 → 시간 넘김', () => {
  const result = roundToInterval(new Date('2026-03-17T09:55:00'));
  assert.strictEqual(result.getMinutes(), 0);
  assert.strictEqual(result.getHours(), 10);
});

test('정각(00분)은 그대로', () => {
  const result = roundToInterval(new Date('2026-03-17T09:00:00'));
  assert.strictEqual(result.getMinutes(), 0);
  assert.strictEqual(result.getHours(), 9);
});

test('초/밀리초 초기화', () => {
  const result = roundToInterval(new Date('2026-03-17T09:20:45.123'));
  assert.strictEqual(result.getSeconds(), 0);
  assert.strictEqual(result.getMilliseconds(), 0);
});

// ─── ceilToInterval ───
console.log('\n🔹 ceilToInterval');

test('23분 → 30분 올림', () => {
  const result = ceilToInterval(new Date('2026-03-17T09:23:00'));
  assert.strictEqual(result.getMinutes(), 30);
});

test('20분(정확 경계) → 20분 유지', () => {
  const result = ceilToInterval(new Date('2026-03-17T09:20:00'));
  assert.strictEqual(result.getMinutes(), 20);
});

test('51분 → 60분 → 시간 넘김', () => {
  const result = ceilToInterval(new Date('2026-03-17T09:51:00'));
  assert.strictEqual(result.getMinutes(), 0);
  assert.strictEqual(result.getHours(), 10);
});

test('정각(00분)은 그대로', () => {
  const result = ceilToInterval(new Date('2026-03-17T09:00:00'));
  assert.strictEqual(result.getMinutes(), 0);
  assert.strictEqual(result.getHours(), 9);
});

// ─── formatScheduleDateTime ───
console.log('\n🔹 formatScheduleDateTime');

test('날짜/시간 포맷 변환', () => {
  const result = formatScheduleDateTime(new Date('2026-03-17T09:30:00'));
  assert.strictEqual(result.date, '2026-03-17');
  assert.strictEqual(result.time, '09:30');
});

test('한 자리 월/일 제로패딩', () => {
  const result = formatScheduleDateTime(new Date('2026-01-05T08:00:00'));
  assert.strictEqual(result.date, '2026-01-05');
  assert.strictEqual(result.time, '08:00');
});

// ─── resolveTimeConflict ───
console.log('\n🔹 resolveTimeConflict');

test('충돌 없으면 원본 반환', () => {
  const usedKeys = new Set();
  const original = new Date('2026-03-17T09:30:00');
  const result = resolveTimeConflict(original, usedKeys);
  assert.strictEqual(result.getTime(), original.getTime());
});

test('충돌 있으면 +10분 밀기', () => {
  const conflictTime = new Date('2026-03-17T09:30:00');
  const usedKeys = new Set([conflictTime.toISOString()]);
  const result = resolveTimeConflict(new Date(conflictTime), usedKeys);
  assert.strictEqual(result.getMinutes(), 40);
});

test('연속 충돌 시 다중 밀기', () => {
  const t1 = new Date('2026-03-17T09:30:00');
  const t2 = new Date('2026-03-17T09:40:00');
  const usedKeys = new Set([t1.toISOString(), t2.toISOString()]);
  const result = resolveTimeConflict(new Date(t1), usedKeys);
  assert.strictEqual(result.getMinutes(), 50);
});

test('최대 6회 시도 후 중단', () => {
  // 09:00~10:00 범위의 모든 10분 슬롯을 점유
  const baseDate = new Date('2026-03-17T09:00:00');
  const usedKeys = new Set();
  for (let m = 0; m <= 60; m += 10) {
    const d = new Date(baseDate.getTime() + m * 60000);
    usedKeys.add(d.toISOString());
  }
  // 6회 시도해도 빈 슬롯 찾기 어려운 경우 — 에러 없이 반환
  const result = resolveTimeConflict(new Date(baseDate), usedKeys);
  assert.ok(result instanceof Date);
  assert.ok(!isNaN(result.getTime()), 'Invalid Date 반환');
});

// ─── distributeByInterval ───
console.log('\n🔹 distributeByInterval');

test('count=0이면 빈 배열', () => {
  const result = distributeByInterval(0, { baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60 });
  assert.strictEqual(result.length, 0);
});

test('count=1이면 하나만 반환', () => {
  const result = distributeByInterval(1, { baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60 });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].time, '09:00');
});

test('count=5이면 5개 반환 + 시간순 정렬', () => {
  const result = distributeByInterval(5, { baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60 });
  assert.strictEqual(result.length, 5);
  // 시간순 정렬 확인
  for (let i = 1; i < result.length; i++) {
    const prev = new Date(`${result[i - 1].date}T${result[i - 1].time}`);
    const curr = new Date(`${result[i].date}T${result[i].time}`);
    assert.ok(curr.getTime() >= prev.getTime(), `${result[i - 1].time} → ${result[i].time} 순서 오류`);
  }
});

test('모든 시간이 10분 단위', () => {
  const result = distributeByInterval(10, { baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 30 });
  result.forEach(slot => {
    const mins = parseInt(slot.time.split(':')[1]);
    assert.strictEqual(mins % 10, 0, `${slot.time}은 10분 단위가 아님`);
  });
});

test('시작 시간이 23분이면 30분으로 올림', () => {
  const result = distributeByInterval(1, { baseDate: '2026-03-17', baseTime: '09:23', intervalMinutes: 60 });
  assert.strictEqual(result[0].time, '09:30');
});

test('최소 간격 10분 보장', () => {
  const result = distributeByInterval(5, {
    baseDate: '2026-03-17', baseTime: '09:00',
    intervalMinutes: 5, // 5분 간격 요청 → 최소 10분으로 보장
    minIntervalMinutes: 10,
  });
  for (let i = 1; i < result.length; i++) {
    const prev = new Date(`${result[i - 1].date}T${result[i - 1].time}`);
    const curr = new Date(`${result[i].date}T${result[i].time}`);
    const diffMin = (curr.getTime() - prev.getTime()) / 60000;
    assert.ok(diffMin >= 10, `간격 ${diffMin}분 < 10분 (${result[i - 1].time} → ${result[i].time})`);
  }
});

test('firstItemRandomOffset=true 시 첫 항목이 baseTime 이후', () => {
  // 100번 시도해서 최소 1번은 오프셋이 적용되는지 확인
  let hasOffset = false;
  for (let trial = 0; trial < 100; trial++) {
    const result = distributeByInterval(1, {
      baseDate: '2026-03-17', baseTime: '09:00',
      intervalMinutes: 360,
      firstItemRandomOffset: true,
    });
    if (result[0].time !== '09:00') {
      hasOffset = true;
      break;
    }
  }
  assert.ok(hasOffset, '100회 시도 중 첫 항목 오프셋이 한 번도 적용되지 않음');
});

test('existingUsedKeys 충돌 회피', () => {
  const baseTime = new Date('2026-03-17T09:00:00');
  const usedKeys = new Set([baseTime.toISOString()]);
  const result = distributeByInterval(1, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60
  }, usedKeys);
  assert.notStrictEqual(result[0].time, '09:00', '충돌 회피 실패');
});

// ─── distributeByRandomRange ───
console.log('\n🔹 distributeByRandomRange');

test('count=0이면 빈 배열', () => {
  const result = distributeByRandomRange(0, {
    startDate: '2026-03-17', startTime: '09:00',
    endDate: '2026-03-17', endTime: '18:00',
  });
  assert.strictEqual(result.length, 0);
});

test('역방향 범위(end < start)면 빈 배열', () => {
  const result = distributeByRandomRange(5, {
    startDate: '2026-03-17', startTime: '18:00',
    endDate: '2026-03-17', endTime: '09:00',
  });
  assert.strictEqual(result.length, 0);
});

test('5개 생성 + 시간순 정렬', () => {
  const result = distributeByRandomRange(5, {
    startDate: '2026-03-17', startTime: '09:00',
    endDate: '2026-03-17', endTime: '18:00',
  });
  assert.strictEqual(result.length, 5);
  for (let i = 1; i < result.length; i++) {
    const prev = new Date(`${result[i - 1].date}T${result[i - 1].time}`);
    const curr = new Date(`${result[i].date}T${result[i].time}`);
    assert.ok(curr.getTime() >= prev.getTime(), '시간순 정렬 위반');
  }
});

test('모든 시간이 범위 내 10분 단위', () => {
  const result = distributeByRandomRange(20, {
    startDate: '2026-03-17', startTime: '09:00',
    endDate: '2026-03-17', endTime: '18:00',
  });
  result.forEach(slot => {
    const mins = parseInt(slot.time.split(':')[1]);
    assert.strictEqual(mins % 10, 0, `${slot.time}은 10분 단위가 아님`);
  });
});

test('20개/4시간 실사용 시나리오: 중복 없음', () => {
  // 사용자 보고 시나리오: 20개 글, 14:00~18:00 (24개 슬롯)
  const result = distributeByRandomRange(20, {
    startDate: '2026-03-17', startTime: '14:00',
    endDate: '2026-03-17', endTime: '18:00',
  });
  assert.strictEqual(result.length, 20);
  // 모든 시간이 유니크해야 함
  const timeKeys = result.map(s => `${s.date} ${s.time}`);
  const unique = new Set(timeKeys);
  assert.strictEqual(unique.size, 20, `중복 발생: ${timeKeys.join(', ')}`);
});

test('10개/2시간 밀집 시나리오: 중복 없음', () => {
  const result = distributeByRandomRange(10, {
    startDate: '2026-03-17', startTime: '09:00',
    endDate: '2026-03-17', endTime: '11:00',
  });
  assert.strictEqual(result.length, 10);
  const timeKeys = result.map(s => `${s.date} ${s.time}`);
  const unique = new Set(timeKeys);
  assert.strictEqual(unique.size, 10, `중복 발생: ${timeKeys.join(', ')}`);
});

// ─── distributeWithProtection ───
console.log('\n🔹 distributeWithProtection');

test('수동 설정 항목 보호', () => {
  const items = [
    { scheduleDate: '2026-03-17', scheduleTime: '10:00', scheduleUserModified: true },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00', scheduleUserModified: false },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00', scheduleUserModified: false },
  ];
  distributeWithProtection(items, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60,
  });
  // 수동 설정 항목은 변경되지 않아야 함
  assert.strictEqual(items[0].scheduleDate, '2026-03-17');
  assert.strictEqual(items[0].scheduleTime, '10:00');
});

test('자동 분산 항목에 새 시간 적용', () => {
  const items = [
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
  ];
  distributeWithProtection(items, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60,
  });
  // 최소 2개 이상은 서로 다른 시간
  const times = items.map(i => i.scheduleTime);
  const unique = new Set(times);
  assert.ok(unique.size >= 2, `모든 항목이 같은 시간: ${times.join(', ')}`);
});

test('자동 1개면 분산 안 함', () => {
  const items = [
    { scheduleDate: '2026-03-17', scheduleTime: '09:00', scheduleUserModified: true },
    { scheduleDate: '2026-03-17', scheduleTime: '11:00' },
  ];
  const original = items[1].scheduleTime;
  distributeWithProtection(items, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60,
  });
  assert.strictEqual(items[1].scheduleTime, original, '자동 1개인데 변경됨');
});

test('수동 항목과 시간 충돌 회피', () => {
  const items = [
    { scheduleDate: '2026-03-17', scheduleTime: '09:00', scheduleUserModified: true },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
  ];
  distributeWithProtection(items, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60,
  });
  // 자동 분산 항목이 수동 설정 시간(09:00)과 같으면 안 됨
  const autoTimes = [items[1].scheduleTime, items[2].scheduleTime];
  // 첫 번째 자동 항목은 09:00을 피해야 함
  assert.notStrictEqual(autoTimes[0], '09:00',
    '수동 항목(09:00)과 충돌 회피 실패');
});

test('logger 호출 확인', () => {
  const logs = [];
  const items = [
    { scheduleDate: '2026-03-17', scheduleTime: '09:00', scheduleUserModified: true },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
    { scheduleDate: '2026-03-17', scheduleTime: '09:00' },
  ];
  distributeWithProtection(items, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60,
  }, (msg, level) => logs.push({ msg, level }));
  assert.ok(logs.length >= 1, '로그가 호출되지 않음');
  assert.ok(logs.some(l => l.msg.includes('보호') || l.msg.includes('분산')), '로그에 보호/분산 키워드 없음');
});

// ─── 엣지 케이스 ───
console.log('\n🔹 엣지 케이스');

test('음수 count → 빈 배열', () => {
  assert.strictEqual(distributeByInterval(-1, { baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 60 }).length, 0);
  assert.strictEqual(distributeByRandomRange(-1, { startDate: '2026-03-17', startTime: '09:00', endDate: '2026-03-17', endTime: '18:00' }).length, 0);
});

test('자정 넘김 (23:50 + 30분 간격)', () => {
  const result = distributeByInterval(3, {
    baseDate: '2026-03-17', baseTime: '23:50', intervalMinutes: 30,
  });
  assert.strictEqual(result.length, 3);
  // 마지막 항목은 다음 날이어야 함
  assert.strictEqual(result[result.length - 1].date, '2026-03-18');
});

test('대량 생성 (100개) 성능', () => {
  const start = Date.now();
  const result = distributeByInterval(100, {
    baseDate: '2026-03-17', baseTime: '09:00', intervalMinutes: 10,
  });
  const elapsed = Date.now() - start;
  assert.strictEqual(result.length, 100);
  assert.ok(elapsed < 1000, `100개 생성에 ${elapsed}ms (1초 초과)`);
});

// ─── 결과 출력 ───
console.log('\n' + '─'.repeat(50));
console.log(`📊 결과: ${passed} passed, ${failed} failed (총 ${passed + failed}개)`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 모든 테스트 통과!\n');
}
