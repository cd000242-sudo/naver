/**
 * ✅ [2026-01-25 모듈화] 날짜/스케줄 유틸리티
 * 
 * 날짜 형식 변환, 스케줄 시간 관련 함수들
 */

// ============================================
// 날짜 형식 변환
// ============================================

/**
 * datetime-local 형식(2025-01-15T14:30)을 YYYY-MM-DD HH:mm 형식으로 변환
 */
export function convertDatetimeLocalToScheduleFormat(datetimeLocalValue: string): string {
    if (!datetimeLocalValue) return '';
    return datetimeLocalValue.replace('T', ' ');
}

/**
 * 입력 필드에서 스케줄 날짜 가져오기
 */
export function getScheduleDateFromInput(inputId: string): string | undefined {
    const scheduleInput = document.getElementById(inputId) as HTMLInputElement;
    if (!scheduleInput || !scheduleInput.value) return undefined;

    // data-formatted-date가 있으면 사용 (확인 버튼으로 저장됨)
    return scheduleInput.dataset.formattedDate || convertDatetimeLocalToScheduleFormat(scheduleInput.value);
}

// ============================================
// 스케줄 시간 추천
// ============================================

/**
 * 추천 스케줄 시간 생성 (현재 시간 + 2~4시간)
 */
export function getRecommendedScheduleTime(): string {
    const now = new Date();
    const hoursToAdd = 2 + Math.random() * 2; // 2-4시간 사이
    const minutesToAdd = Math.floor(Math.random() * 6) * 10; // 0, 10, 20, 30, 40, 50 (10분 단위)

    const recommendedTime = new Date(now.getTime() + (hoursToAdd * 60 * 60 * 1000) + (minutesToAdd * 60 * 1000));

    // 날짜 시간 형식으로 변환
    const year = recommendedTime.getFullYear();
    const month = String(recommendedTime.getMonth() + 1).padStart(2, '0');
    const day = String(recommendedTime.getDate()).padStart(2, '0');
    const hours = String(recommendedTime.getHours()).padStart(2, '0');
    // 10분 단위로 올림 (네이버 서버 예약 제한)
    const rawMinutes = recommendedTime.getMinutes();
    const minutes = String(Math.ceil(rawMinutes / 10) * 10 % 60).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
