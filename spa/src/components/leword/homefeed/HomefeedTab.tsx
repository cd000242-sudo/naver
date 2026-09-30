import HomefeedBenchmarkBoard from './HomefeedBenchmarkBoard';

/**
 * /leword?tab=homefeed — 리더남 홈판 추천 소재 · 제목.
 *
 * 사장님(2026-09-30): "기존 신호 작성 도구 저거 없애고 리더남 홈판 추천 소재 및 제목으로 해 달라".
 * 예전엔 '채널 벤치마크 추천' 과 '기존 신호 · 작성 도구'(STORY RADAR v2.0, 앱 브리지) 두 화면을 버튼으로 오갔다.
 * 이제 벤치마크 채널에서 모은 추천 소재와 소재별 홈판 제목만 보여 준다. 예전 화면의 부품 파일
 * (HomefeedCard · HomefeedDetail · HomefeedTitlesDraft …)은 지우지 않고 남겨 뒀다 — 되살릴 때 입구만 다시 달면 된다.
 */
export default function HomefeedTab() {
    return <HomefeedBenchmarkBoard />;
}
