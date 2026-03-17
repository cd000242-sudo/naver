// ================================================
// ★★★ GAS 라이선스 코드 풀 관리 ★★★
// ================================================
//
// [사용 방법]
// 1. GAS 에디터에 이 코드를 붙여넣기
// 2. initCodePool() 함수를 ▶ 한 번 실행 → "코드풀" 시트에 12개 코드 자동 입력
// 3. confirm-payment 핸들러에서 getAvailableCode() 호출
// 4. 코드 추가: "코드풀" 시트에 직접 행 추가 (코드, 유형 입력)
// 5. 한번 보여준 코드는 시트에서 자동 삭제됨
//
// ================================================


// ========================================================
// [1] initCodePool — 처음 한 번만 실행
// ========================================================
function initCodePool() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('코드풀');

    if (!sheet) {
        sheet = ss.insertSheet('코드풀');
        sheet.appendRow(['코드', '유형']);
        sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#4a90d9').setFontColor('#ffffff');
        sheet.setFrozenRows(1);
        sheet.setColumnWidth(1, 320);
        sheet.setColumnWidth(2, 100);
    }

    // 중복 방지
    var existing = sheet.getDataRange().getValues();
    var existingCodes = {};
    for (var i = 1; i < existing.length; i++) {
        existingCodes[String(existing[i][0]).toUpperCase()] = true;
    }

    // ═══ 1년권 9개 ═══
    var yearlyCodes = [
        'leader-D0YF-3JRU-DKZ6-DUZ7',
        'leader-NIRJ-46VA-W6AN-TX6J',
        'leader-6FY3-BZP1-6WEW-3CQM',
        'leader-MB9J-6A5D-4C6K-D3K9',
        'leader-6ZGD-M5WZ-Y79B-8ILP',
        'leader-7EPP-F4Z3-J489-8VE8',
        'leader-C4K6-PLTL-5AXI-9X65',
        'leader-TYFX-3TRX-DZ51-N4PF',
        'leader-PVEI-A1AE-XAXY-NX9D',
    ];

    // ═══ 영구제 3개 ═══
    var lifetimeCodes = [
        'Leader-DV3Z-HBO4-XHQY-Y30D',
        'Leader-4M4E-02XN-9P5J-BLB3',
        'Leader-E2CD-9QJO-BK6L-24LI',
    ];

    var count = 0;
    yearlyCodes.forEach(function (code) {
        if (!existingCodes[code.toUpperCase()]) { sheet.appendRow([code, '1년권']); count++; }
    });
    lifetimeCodes.forEach(function (code) {
        if (!existingCodes[code.toUpperCase()]) { sheet.appendRow([code, '영구제']); count++; }
    });

    Logger.log('✅ 코드풀 초기화 완료: ' + count + '개 추가됨');
    SpreadsheetApp.flush();
}


// ========================================================
// [2] getAvailableCode — 결제 성공 시 호출
// 미사용 코드 1개 반환 후 해당 행 삭제
// ========================================================
function getAvailableCode(productType) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('코드풀');
    if (!sheet) return { ok: false, error: '코드풀 시트가 없습니다.' };

    var typeLabel = productType === 'lifetime' ? '영구제' : '1년권';
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
        if (String(data[i][1]).trim() === typeLabel) {
            var code = String(data[i][0]);
            var rowNum = i + 1;

            // ★ 코드를 꺼낸 후 해당 행 삭제 (한번 보여주면 사라짐)
            sheet.deleteRow(rowNum);
            SpreadsheetApp.flush();

            Logger.log('[코드풀] 발급 완료: ' + code + ' (' + typeLabel + ') → 행 삭제됨');
            return { ok: true, code: code };
        }
    }

    return { ok: false, error: typeLabel + ' 코드가 모두 소진되었습니다. 관리자에게 문의하세요.' };
}


// ========================================================
// [3] confirm-payment 핸들러에 연동하는 방법
// ========================================================
// 기존 handleConfirmPayment 함수 안에서:
//
//   // amount로 상품 유형 판단
//   var productType = (amount == 1500000) ? 'lifetime' : 'yearly';
//
//   // 코드풀에서 1개 꺼내기 (자동 삭제됨)
//   var codeResult = getAvailableCode(productType);
//   if (!codeResult.ok) {
//     return jsonpResponse(callback, { ok: false, error: codeResult.error });
//   }
//
//   // 발급된 코드 반환
//   return jsonpResponse(callback, {
//     ok: true,
//     code: codeResult.code,
//     product: productType === 'lifetime' ? 'Better Life 영구제' : 'Better Life 1년권'
//   });
