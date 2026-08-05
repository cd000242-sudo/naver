import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05 배치 4b] 홈판 life·fashion·it 신규격 계약.
 *
 * 비평서 실측: 세 파일 모두 6불릿 구판으로, GAMMA-7 재진술("첫 화면에는…")과
 * 무보정 수준의 뭉뚱그림만 있었다. food·travel 모범 규격(멈춤 만들기·우선 배치·
 * 분기·사실 규율·카테고리 고유 금지)으로 재작성. 초안 → 적대검증 → 재대조 통과본.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const life = read('homefeed/life.prompt');
const fashion = read('homefeed/fashion.prompt');
const it_ = read('homefeed/it.prompt');
const ALL: Array<[string, string]> = [['life', life], ['fashion', fashion], ['it', it_]];

describe('배치 4b 공통 — 형식·우선 선언·안전 골격', () => {
  it.each(ALL)('%s: LF 전용 + 분량 대역(≤62행)', (_n, p) => {
    expect(p).not.toMatch(/\r/);
    expect(p.split('\n').length).toBeLessThanOrEqual(62);
  });

  it.each(ALL)('%s: ★ 선언이 food·travel 축자 규격이다', (_n, p) => {
    expect(p).toMatch(/★ base\.prompt \[SECTION -2\] 자료 외 사실 금지·경험 권한이 이 파일보다 항상 우선한다\./);
    expect(p).toMatch(/아래 지시는 전부 "입력에 그 재료가 있을 때"만 발동하며, 재료가 없으면 그 대목을 비운다\./);
  });

  it.each(ALL)('%s: 세운 질문에는 첫 화면 안에서 바로 답한다', (_n, p) => {
    expect(p).toMatch(/세운 질문에는 첫 화면 안에서 바로 답한다\./);
  });

  it.each(ALL)('%s: 분기 폴백이 base 구조로 닫힌다', (_n, p) => {
    expect(p).toMatch(/분기하지 않고 base 구조를 그대로 따른다\./);
  });

  it.each(ALL)('%s: 제3자 후기 attribution 골격', (_n, p) => {
    expect(p).toMatch(/"후기에서\s*반복된 얘기는 ○○"처럼 누구의 경험인지 밝혀 옮길 수 있다\./);
    expect(p).toMatch(/작성자 경험으로\s*바꾸지 않는다\./);
  });

  it.each(ALL)('%s: 확립 원칙 금지 패턴 부재', (_n, p) => {
    expect(p).not.toMatch(/첫 화면에는/); // GAMMA-7 재진술 개시형 (구판 지문)
    expect(p).not.toMatch(/preWritingAnalysis/i);
    expect(p).not.toMatch(/반드시/); // 압력 꼬리
    expect(p).not.toMatch(/없으면[^\n]*(로 안내한다|로 대체한다|로 채운다|채워 넣는다)/); // 변환 의무
  });
});

describe('배치 4b — life 고유 계약', () => {
  it('멈춤 훅과 구매 분기 날조 앵커', () => {
    expect(life).toMatch(/"나도 이거 헷갈렸는데 \/\s*이 지출 아까웠는데"/);
    expect(life).toMatch(/입력에 있는 조건에서 맞는 대상과 맞지 않는 조건을/);
    expect(life).toMatch(/맞지 않는 조건은 형식상 만들지 않고\s*입력에 근거가 있을 때만 쓴다\./);
  });

  it('체험 수치·합산 날조 금지', () => {
    expect(life).toMatch(/별점, 재구매·재방문 의사, 가성비 수치를 임의로 만들지 않는다\./);
    expect(life).toMatch(/임의로 합산하거나 "연간 ○○원" 식으로 환산하지/);
  });

  it('구매 단정·절박감 금지', () => {
    expect(life).toMatch(/"이건 사야 해", "무조건 이득", "안 사면 손해"/);
    expect(life).toMatch(/품절·특가 마감·한정 수량·가격 인상 예고/);
  });

  it('base 중복 금지열·라우팅 괄호·오류 열거가 제거됐다', () => {
    expect(life).not.toMatch(/내돈내산|써보니|직접 비교/); // base:120 위임 확정
    expect(life).not.toMatch(/상품 리뷰가 이 경로/);
    expect(life).not.toMatch(/문화/); // 매핑 부재 열거 삭제
  });
});

describe('배치 4b — fashion 고유 계약', () => {
  it('멈춤 훅과 경험 날조 금지(현행 원문 계승)', () => {
    expect(fashion).toMatch(/"내 체형에도 맞나 \/\s*내 피부에도 되나"/);
    expect(fashion).toMatch(/근거가 없으면 내돈내산·실착·하루 종일 유지·세탁 후 변화 같은 경험을 만들지 않는다\./);
  });

  it('사이즈 환산·균형 날조 금지 + 코디 목록 조건', () => {
    expect(fashion).toMatch(/호수·cm·권장 체중을 임의로 환산하거나/);
    expect(fashion).toMatch(/균형을 맞추려고 만들지 않는다\./);
    expect(fashion).toMatch(/코디 목록/);
    expect(fashion).not.toMatch(/코디 정리/); // 비실존 조어 교체 확인
  });

  it('체형 비하 프레임·효능 단정 금지 (효능 언급은 금지 불릿에만)', () => {
    expect(fashion).toMatch(/"커버해야 할 체형", "숨겨야 할 부위"/);
    expect(fashion).toMatch(/미백·주름 개선·자외선 차단 같은 기능성 표시는 입력에 있는 표시\s*범위 그대로만 옮기고/);
    expect(fashion).not.toMatch(/효능은 입력에 표시된 범위 그대로만 옮긴다/); // 분기 내부 중복 삭제
    expect((fashion.match(/효능/g) || []).length).toBeLessThanOrEqual(2);
  });
});

describe('배치 4b — it 고유 계약', () => {
  it('멈춤 훅과 확인값 규율(현행 축자 계승)', () => {
    expect(it_).toMatch(/되나 \/ 바꿀 때가 됐나/);
    expect(it_).toMatch(/모델명, 버전, 가격, 사양, 호환성은 입력 자료에서 확인된 값만 쓴다\./);
  });

  it('확인처 폴백이 base:13과 충돌하지 않는다', () => {
    expect(it_).toMatch(/없으면 "공식 안내에서 확인"을 넘는 구체 확인처를\s*만들지 않는다\./);
  });

  it('체감 날조·스펙 환산 금지', () => {
    expect(it_).toMatch(/"확 빨라졌다", "쾌적해졌다"/);
    expect(it_).toMatch(/스펙 숫자에서 체감을\s*만들어내지 않는다\./);
    expect(it_).toMatch(/세대 간 개선율, "체감 2배", 배터리 시간\s*환산 같은 계산을 입력에 없는 채로 새로 만들지 않고/);
  });

  it('출시 조급감 금지 + 단점 형식화 금지', () => {
    expect(it_).toMatch(/"곧 단종", "지금 아니면 이 가격에 못 산다"/);
    expect(it_).toMatch(/단점·주의점을 형식상 만들지 않고 실제 근거가 있을 때만 설명한다\./);
  });

  it('base 재진술·무근거 추가가 제거됐다', () => {
    expect(it_).not.toMatch(/벤치마크/); // base:11 재진술 불릿 삭제
    expect(it_).not.toMatch(/출시 시점/); // 무근거 추가 제거 ("출시일" 표기는 허용)
  });
});
