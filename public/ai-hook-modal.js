// ✅ AI 추천 후킹문구 모달 로직
(function () {
    // 행동 유발형 후킹문구 대량 목록 (40개)
    const aiHookingPhrases = [
        // 🔥 긴급성/희소성 (10개)
        { category: '긴급성', text: "🔥 오늘만 이 가격! 내일은 정가로 돌아갑니다" },
        { category: '긴급성', text: "⚡ 품절 전 마지막 기회! 지금 바로 확인하세요" },
        { category: '긴급성', text: "⏰ 할인 마감 D-1! 후회하기 전에 클릭하세요" },
        { category: '긴급성', text: "🎁 한정 수량 100개! 놓치면 다음 기회는 없어요" },
        { category: '긴급성', text: "💥 재입고 불가! 지금 아니면 구할 수 없습니다" },
        { category: '긴급성', text: "🚨 마감 3시간 전! 서두르세요" },
        { category: '긴급성', text: "⚠️ 이번 주 금요일까지만! 기회를 잡으세요" },
        { category: '긴급성', text: "🔥 선착순 50명 한정! 빨리 확인하세요" },
        { category: '긴급성', text: "⏳ 오늘 자정 마감! 더 이상 기다리지 마세요" },
        { category: '긴급성', text: "💨 지금 안 사면 후회합니다! 진심이에요" },
        // 💰 가격/혜택 (10개)
        { category: '가격', text: "💰 최대 50% 할인! 조금이라도 싸게 사세요" },
        { category: '가격', text: "🔖 쿠폰 받고 더 싸게! 지금 확인하세요" },
        { category: '가격', text: "📦 무료배송 + 사은품까지! 혜택 놓치지 마세요" },
        { category: '가격', text: "💸 이 가격에 이 퀄리티? 직접 확인해보세요" },
        { category: '가격', text: "🎉 오늘 구매하면 추가 10% 할인!" },
        { category: '가격', text: "💵 가격 비교 끝! 여기가 진짜 최저가예요" },
        { category: '가격', text: "🏷️ 적립금 5천원 지급! 구매 즉시 사용 가능" },
        { category: '가격', text: "🎀 1+1 이벤트 진행 중! 지금 확인하세요" },
        { category: '가격', text: "💳 카드 할인까지! 더 저렴하게 구매하세요" },
        { category: '가격', text: "🛍️ 세트 구매 시 30% 추가 할인!" },
        // ⭐ 신뢰/후기 (10개)
        { category: '신뢰', text: "⭐ 후기 5,000개 돌파! 사람들이 인정한 제품" },
        { category: '신뢰', text: "👍 써본 사람만 아는 진짜! 직접 확인하세요" },
        { category: '신뢰', text: "🏆 1위에는 이유가 있어요, 클릭해서 확인!" },
        { category: '신뢰', text: "💯 재구매율 95%! 한번 쓰면 또 찾게 됩니다" },
        { category: '신뢰', text: "✅ 수만 명이 선택한 인기 상품! 이유가 있어요" },
        { category: '신뢰', text: "🥇 실시간 판매 1위! 지금 바로 확인하세요" },
        { category: '신뢰', text: "📊 평점 4.9점! 믿고 구매하세요" },
        { category: '신뢰', text: "🌟 인플루언서 추천 상품! 직접 확인하세요" },
        { category: '신뢰', text: "📸 실제 사용 후기 보러가기! 솔직 리뷰" },
        { category: '신뢰', text: "👨‍👩‍👧‍👦 가족 모두 만족! 검증된 품질이에요" },
        // 👆 행동 유도 (10개)
        { category: '행동', text: "👆 고민만 하다 품절됩니다! 지금 클릭하세요" },
        { category: '행동', text: "🛒 장바구니 담고 할인받자! 링크 바로가기" },
        { category: '행동', text: "✅ 1분이면 끝! 간편하게 구매하세요" },
        { category: '행동', text: "🎯 결정 장애 끝! 이거 하나면 됩니다" },
        { category: '행동', text: "👀 구경만 해도 득템! 지금 확인하세요" },
        { category: '행동', text: "🔗 클릭 한 번으로 최저가 확인! 바로가기" },
        { category: '행동', text: "📱 터치 한 번이면 끝! 지금 구매하세요" },
        { category: '행동', text: "✨ 인생템 발견! 저도 3개 더 샀어요" },
        { category: '행동', text: "💖 요즘 저 없으면 안 되는 템이에요" },
        { category: '행동', text: "🙌 안 사면 후회! 저는 벌써 재구매했어요" },
    ];

    document.addEventListener('DOMContentLoaded', function () {
        const aiBtn = document.getElementById('ai-recommend-hook-btn');
        const modal = document.getElementById('ai-hook-modal');
        const hookList = document.getElementById('ai-hook-list');
        const closeBtn = document.getElementById('ai-hook-modal-close');
        const hookInput = document.getElementById('shopping-banner-hook');
        const mainText = document.getElementById('shopping-banner-main-text');

        if (!aiBtn || !modal || !hookList) return;

        // 문구 목록 생성
        let currentCategory = '';
        aiHookingPhrases.forEach((item, index) => {
            // 카테고리 구분선
            if (item.category !== currentCategory) {
                currentCategory = item.category;
                const categoryLabel = document.createElement('div');
                const categoryColors = {
                    '긴급성': '#E53A40',
                    '가격': '#03C75A',
                    '신뢰': '#3B82F6',
                    '행동': '#8B5CF6'
                };
                categoryLabel.style.cssText = `
                    padding: 0.5rem 1rem;
                    margin-top: ${index === 0 ? '0' : '1rem'};
                    background: ${categoryColors[item.category] || '#666'};
                    color: white;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 0.85rem;
                `;
                categoryLabel.textContent = {
                    '긴급성': '🔥 긴급성/희소성',
                    '가격': '💰 가격/혜택',
                    '신뢰': '⭐ 신뢰/후기',
                    '행동': '👆 행동 유도'
                }[item.category] || item.category;
                hookList.appendChild(categoryLabel);
            }

            // 문구 버튼
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = item.text;
            btn.style.cssText = `
                width: 100%;
                padding: 0.875rem 1rem;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                color: #e5e5e5;
                font-size: 0.95rem;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s;
            `;
            btn.onmouseover = () => {
                btn.style.background = 'rgba(139, 92, 246, 0.2)';
                btn.style.borderColor = 'rgba(139, 92, 246, 0.5)';
            };
            btn.onmouseout = () => {
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.borderColor = 'rgba(255,255,255,0.1)';
            };
            btn.onclick = () => {
                hookInput.value = item.text;
                if (mainText) mainText.textContent = item.text;
                modal.style.display = 'none';
            };
            hookList.appendChild(btn);
        });

        // 모달 열기
        aiBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
        });

        // 모달 닫기
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
})();
