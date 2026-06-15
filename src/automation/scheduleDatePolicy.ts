export function validateScheduleDate(scheduleDate: string, now: Date = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduleDate)) {
    throw new Error('날짜 형식이 올바르지 않습니다. (예: 2025-02-01 14:30)');
  }

  const scheduleTime = new Date(scheduleDate.replace(' ', 'T'));

  if (scheduleTime <= now) {
    throw new Error('예약 날짜는 현재 시각보다 미래여야 합니다.');
  }

  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  if (scheduleTime > oneYearLater) {
    throw new Error('예약 날짜는 1년 이내로 설정해야 합니다.');
  }
}
