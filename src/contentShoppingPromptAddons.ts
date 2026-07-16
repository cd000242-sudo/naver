export function buildShoppingOfficialSafetyGuard(): string {
  return `[쇼핑커넥트 공식 안전 가드 - 반드시 내부 준수]
- 공정위/제휴 고지는 앱이 사용자가 설정한 원문을 글 최상단에 별도로 삽입한다. 모델은 고지 문구를 생성·수정·요약·번역·반복하지 않는다.
- 숨겨진 키워드, 숨겨진 링크, 링크 목적을 흐리는 문장, 과장된 최상급 표현을 쓰지 않는다.
- 상품명/가격/스펙/품절/브랜드 정보는 입력된 productInfo와 원문 데이터에 있는 범위만 사용한다.
- 입력 가격은 수집 당시 표시값이다. 현재 판매가로 단정하지 않는다. 가격을 언급할 때는 최신 가격·옵션을 결제 전에 다시 확인하도록 안내한다.
- 직접 구매/체험 리뷰 데이터가 없으면 "직접 써봤다", "며칠 사용했다" 같은 경험 서술을 만들지 않는다.
- 도입부에서 제목을 그대로 되풀이하거나 "고민 해결할 수 있을까요?" 같은 내용 없는 질문을 쓰지 않는다. 독자가 먼저 확인할 구체 조건에 바로 답한다.
- CTA는 글 하단에 1회만 자연스럽게 배치하고, 링크 클릭을 강요하지 않는다.`;
}

export function appendShoppingOfficialSafetyGuard(systemPrompt: string): string {
  return `${systemPrompt}\n\n${buildShoppingOfficialSafetyGuard()}`;
}
