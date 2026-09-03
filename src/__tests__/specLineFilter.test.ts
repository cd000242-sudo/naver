import { describe, expect, it } from 'vitest';

import { dropRegulatorySpecLines, isRegulatorySpecLine } from '../crawler/specLineFilter';

/** [2026-09-03 사장님 발행글 실측] KC 인증번호·제조국·약관이 본문에 실렸다 — 재료에서 지운다. */
describe('제공고시 행 필터', () => {
  const spec = [
    '구성: (그레이)본체+다리',
    '규격: 210x256x277(mm) / 1.5kg',
    '전원: 220, 60Hz / 23W',
    '품명 / 모델명: 공기압 다리 마사지기 에어웨이브 / DR-5180, DR-5401, DR-5800',
    'KC 인증정보: HU071627-18006F, HU072737-20002C / R-REI-DrW-DR-5200',
    '에너지소비효율등급: 해당사항 없음',
    '동일 모델의 출시연월: 2019년 11월',
    '제조자(사): 닥터웰',
    '제조국: 중국산(닥터웰)',
    '품질보증기준: 본 제품은 공정거래위원회 고시 소비자분쟁해결기준에 의거하여 보상받을 수 있습니다.',
    '거래에 관한 약관의 내용 또는 확인할 수 있는 방법: 상품상세 페이지 및 페이지 하단의 이용약관 링크',
    'A/S 책임자와 전화번호: 닥터웰 고객센터 1588-0000',
  ].join('\n');

  it('인증·제조국·약관·AS 행은 지우고 구성·규격·전원·출시연월은 남긴다', () => {
    const { text, dropped } = dropRegulatorySpecLines(spec);
    expect(dropped).toBe(8);
    expect(text).toContain('구성: (그레이)본체+다리');
    expect(text).toContain('규격: 210x256x277(mm) / 1.5kg');
    expect(text).toContain('전원: 220, 60Hz / 23W');
    expect(text).toContain('출시연월: 2019년 11월');
    expect(text).not.toMatch(/KC|HU071627|에너지소비효율|제조자|제조국|소비자분쟁해결기준|이용약관|A\/S|DR-5401/u);
  });

  it('값에 인증번호·약관 문구가 있으면 키가 낯설어도 지운다', () => {
    expect(isRegulatorySpecLine('기타: R-REI-DrW-DR-5200')).toBe(true);
    expect(isRegulatorySpecLine('안내: 공정거래위원회 고시에 따라 보상')).toBe(true);
    expect(isRegulatorySpecLine('색상: 그레이')).toBe(false);
  });
});
