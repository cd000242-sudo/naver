/** 비로그인 방문자가 선명하게 보는 카드 수. */
export declare const FREE_SAMPLE_SIZE: number;

/**
 * 발행본이 하루 고정으로 박아 둔 이름 중 보드에 남은 것을 지키고,
 * 사라진 자리만 보드 발행 순서 앞줄로 메운다.
 */
export declare function repairFreeSample(
    board: { rows?: Array<{ keyword?: string }> } | null | undefined,
    published: readonly string[] | null | undefined,
): string[];
