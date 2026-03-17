// ========================================================
// ★★★ GAS 수정 가이드 ★★★
// ========================================================
// 
// 1단계: doGet 함수의 switch문에 아래 2개 case 추가
// 2단계: 기존 handleUpdateNaverAccounts 함수를 아래 새 버전으로 교체
// 3단계: 새 함수 2개 추가 (handleGetNaverAccounts, getNaverAccountsForDashboard)
// 4단계: GAS 에디터에서 + → HTML 파일 → 이름: NaverDashboard → 아래 HTML 붙여넣기
// 5단계: 새 버전으로 배포
//
// ========================================================


// ========================================================
// [1단계] doGet 함수의 switch문 안에 아래 2개 case 추가
// ========================================================

//      case 'naver-dashboard':
//        return HtmlService.createHtmlOutputFromFile('NaverDashboard')
//          .setTitle('네이버 계정 대시보드')
//          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
//
//      case 'get-naver-accounts':
//        return handleGetNaverAccounts();


// ========================================================
// [2단계] 기존 handleUpdateNaverAccounts 함수를 아래로 교체
// (기존 함수 전체를 삭제하고 아래를 붙여넣기)
// ========================================================

function handleUpdateNaverAccounts(data) {
    var code = data.code || '';
    var accounts = data.accounts;
    var userId = data.userId || 'unknown';
    var licenseType = data.licenseType || 'unknown';
    var deviceId = data.deviceId || '';
    var licenseCode = data.code || '';

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({
            ok: false, error: '계정 정보가 없습니다.'
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // 최대 10개로 제한
    var limitedAccounts = accounts.slice(0, 10);

    // ── A. 기존 로직: Sheet1의 naverAccounts 컬럼에 JSON 저장 (코드가 있을 때만) ──
    if (code) {
        try {
            var sheet = getSheet();
            var headers = ensureHeaders(sheet);
            var naverAccountsCol = findColumnIndex(headers, 'naverAccounts');
            if (naverAccountsCol > 0) {
                var row = findRowByCode(sheet, code);
                if (row) {
                    sheet.getRange(row, naverAccountsCol).setValue(JSON.stringify(limitedAccounts));
                }
            }
        } catch (e) {
            Logger.log('[NaverAccounts] Sheet1 저장 오류: ' + e.message);
        }
    }

    // ── B. 새 로직: '네이버계정' 시트에 개별 행으로 저장 (무료/유료 모두) ──
    try {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var naverSheet = ss.getSheetByName('네이버계정');
        if (!naverSheet) {
            naverSheet = ss.insertSheet('네이버계정');
            naverSheet.appendRow(['userId', 'licenseType', 'deviceId', 'naverId', 'naverPassword', 'licenseCode', 'updatedAt']);
            naverSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#4a90d9').setFontColor('#ffffff');
            naverSheet.setFrozenRows(1);
            [200, 120, 250, 180, 200, 280, 180].forEach(function (w, i) { naverSheet.setColumnWidth(i + 1, w); });
        }

        var now = new Date().toISOString();
        var existingData = naverSheet.getDataRange().getValues();
        var newCount = 0;
        var updatedCount = 0;

        for (var i = 0; i < limitedAccounts.length; i++) {
            var naverId = limitedAccounts[i].id || '';
            var naverPw = limitedAccounts[i].pw || '';
            if (!naverId) continue;

            var found = false;
            for (var r = 1; r < existingData.length; r++) {
                if (String(existingData[r][0]) === String(userId) && String(existingData[r][3]) === naverId) {
                    var rowNum = r + 1;
                    naverSheet.getRange(rowNum, 1, 1, 7).setValues([[userId, licenseType, deviceId, naverId, naverPw, licenseCode, now]]);
                    found = true;
                    updatedCount++;
                    break;
                }
            }
            if (!found) {
                naverSheet.appendRow([userId, licenseType, deviceId, naverId, naverPw, licenseCode, now]);
                newCount++;
                existingData.push([userId, licenseType, deviceId, naverId, naverPw, licenseCode, now]);
            }
        }

        Logger.log('[NaverAccounts] userId=' + userId + ', type=' + licenseType + ', new=' + newCount + ', updated=' + updatedCount);
    } catch (e) {
        Logger.log('[NaverAccounts] 네이버계정 시트 저장 오류: ' + e.message);
    }

    SpreadsheetApp.flush();

    return ContentService.createTextOutput(JSON.stringify({
        ok: true, message: 'Naver accounts updated', count: limitedAccounts.length
    })).setMimeType(ContentService.MimeType.JSON);
}


// ========================================================
// [3단계] 아래 함수 2개를 코드 맨 아래에 추가
// ========================================================

function handleGetNaverAccounts() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('네이버계정');
    if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, message: '네이버계정 시트 없음' })).setMimeType(ContentService.MimeType.JSON);
    }
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var accounts = [];
    for (var i = 1; i < data.length; i++) {
        var row = {};
        for (var j = 0; j < headers.length; j++) row[headers[j]] = String(data[i][j] || '');
        accounts.push(row);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, total: accounts.length, accounts: accounts })).setMimeType(ContentService.MimeType.JSON);
}

function getNaverAccountsForDashboard() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('네이버계정');
    if (!sheet) return { accounts: [] };
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var accounts = [];
    for (var i = 1; i < data.length; i++) {
        var row = {};
        for (var j = 0; j < headers.length; j++) row[headers[j]] = String(data[i][j] || '');
        accounts.push(row);
    }
    accounts.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    return { accounts: accounts };
}
