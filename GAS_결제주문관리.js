// =========================================================================
// ★★★ Leaders Pro — GAS 결제/주문 관리 전체 코드 ★★★
// =========================================================================
//
// 📋 사용법: 이 파일 내용을 GAS 에디터에 통째로 복사-붙여넣기
//
// ⚠️ 주의사항:
//   1. SPREADSHEET_ID를 실제 스프레드시트 ID로 교체
//   2. 스크립트 속성에 TOSS_SECRET_KEY 추가 (설정 → 스크립트 속성)
//   3. 기존 doGet 함수가 있으면 아래 doGet으로 교체
//   4. 기존 코드풀/계정 관련 함수가 있으면 삭제 (여기 통합됨)
//   5. 배포: 배포 → 새 배포 → 웹 앱 → 액세스: 모든 사용자
//
// 📂 자동 생성 시트:
//   - '코드풀'   : 미리 등록한 라이선스 코드 풀
//   - '주문내역'  : 결제 완료된 주문 기록
//   - '네이버계정' : Naver 계정 동기화 기록
//
// =========================================================================


// ★ 여기에 실제 스프레드시트 ID를 넣으세요 ★
var SPREADSHEET_ID = '여기에_스프레드시트_ID_입력';


// ═══════════════════════════════════════════════════════════
//  doGet — 모든 요청의 진입점
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  var action = e.parameter.action || '';

  switch (action) {

    // ── 결제 ──
    case 'confirm-payment':
      return handleConfirmPayment(e);

    // ── 주문 조회 ──
    case 'check-order':
      return handleCheckOrder(e);

    // ── 이메일로 주문 조회 ──
    case 'lookup-by-email':
      return handleLookupByEmail(e);

    // ── 이메일로 코드 발송 ──
    case 'send-code-email':
      return handleSendCodeEmail(e);

    // ── 네이버 계정 대시보드 HTML ──
    case 'naver-dashboard':
      return HtmlService.createHtmlOutputFromFile('NaverDashboard')
        .setTitle('네이버 계정 대시보드')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // ── 네이버 계정 조회 ──
    case 'get-naver-accounts':
      return handleGetNaverAccounts();

    // ── 기본: 기존 라이선스 검증 등 ──
    default:
      return handleDefault(e);
  }
}


// ═══════════════════════════════════════════════════════════
//  doPost — POST 요청 처리
// ═══════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || '';

    switch (action) {
      case 'update-naver-accounts':
        return handleUpdateNaverAccounts(data);

      default:
        return ContentService.createTextOutput(JSON.stringify({
          ok: false, error: 'Unknown POST action: ' + action
        })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, error: 'POST 처리 오류: ' + err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}


// ═══════════════════════════════════════════════════════════
//  기본 핸들러 (기존 라이선스 검증 등 — 필요시 기존 코드로 교체)
// ═══════════════════════════════════════════════════════════

function handleDefault(e) {
  var callback = e.parameter.callback || '';
  var response = { ok: false, error: 'Unknown action' };

  if (callback) {
    return jsonpResponse(callback, response);
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}


// ═══════════════════════════════════════════════════════════
//  JSONP 응답 헬퍼
// ═══════════════════════════════════════════════════════════

function jsonpResponse(callback, data) {
  var json = JSON.stringify(data);
  var output = callback + '(' + json + ')';
  return ContentService.createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


// ═══════════════════════════════════════════════════════════
// ▣ 시트 헬퍼
// ═══════════════════════════════════════════════════════════

function getOrderSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('주문내역');
  if (!sheet) {
    sheet = ss.insertSheet('주문내역');
    sheet.appendRow([
      'orderId', 'paymentKey', 'amount', 'email',
      'productType', 'productName', 'licenseCode',
      'status', 'createdAt'
    ]);
    sheet.getRange(1, 1, 1, 9)
      .setFontWeight('bold')
      .setBackground('#c9a84c')
      .setFontColor('#0a0a0f');
    sheet.setFrozenRows(1);
    [280, 280, 100, 220, 100, 180, 300, 80, 180].forEach(function (w, i) {
      sheet.setColumnWidth(i + 1, w);
    });
  }
  return sheet;
}


// ═══════════════════════════════════════════════════════════
// ▣ 1. confirm-payment — Toss 결제 확인 + 코드 발급 + 주문 저장
// ═══════════════════════════════════════════════════════════

function handleConfirmPayment(e) {
  var callback = e.parameter.callback || 'callback';
  var paymentKey = e.parameter.paymentKey || '';
  var orderId = e.parameter.orderId || '';
  var amount = Number(e.parameter.amount) || 0;
  var email = e.parameter.email || '';

  if (!paymentKey || !orderId || !amount) {
    return jsonpResponse(callback, { ok: false, error: '결제 정보가 올바르지 않습니다.' });
  }

  // ── 금액 → 상품 매핑 (Leaders Pro 4단계) ──
  var PRODUCT_MAP = {
    50000:   { type: '1개월',  name: 'Leaders Pro 1개월',  poolType: null },
    120000:  { type: '3개월',  name: 'Leaders Pro 3개월',  poolType: null },
    400000:  { type: '1년',   name: 'Leaders Pro 1년',   poolType: 'yearly' },
    2000000: { type: '영구제',  name: 'Leaders Pro 영구제',  poolType: 'lifetime' }
  };

  var product = PRODUCT_MAP[amount];
  if (!product) {
    return jsonpResponse(callback, {
      ok: false, error: '올바르지 않은 결제 금액입니다: ' + amount + '원'
    });
  }

  // ── Toss Payments 결제 승인 ──
  try {
    var TOSS_SECRET_KEY = PropertiesService.getScriptProperties().getProperty('TOSS_SECRET_KEY');
    var authHeader = 'Basic ' + Utilities.base64Encode(TOSS_SECRET_KEY + ':');

    var response = UrlFetchApp.fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': authHeader },
      payload: JSON.stringify({
        paymentKey: paymentKey,
        orderId: orderId,
        amount: amount
      }),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
      Logger.log('[결제실패] ' + JSON.stringify(result));
      return jsonpResponse(callback, {
        ok: false,
        error: result.message || '결제 승인에 실패했습니다.'
      });
    }
  } catch (err) {
    Logger.log('[결제오류] ' + err.message);
    return jsonpResponse(callback, { ok: false, error: '결제 서버 연결 오류: ' + err.message });
  }

  // ── 라이선스 코드 발급 ──
  var code = '';

  if (product.poolType) {
    // 코드풀에서 꺼내기 (1년, 영구제)
    var codeResult = getAvailableCode(product.poolType);
    if (!codeResult.ok) {
      code = generateLicenseCode(); // 소진 시 자동 생성
    } else {
      code = codeResult.code;
    }
  } else {
    // 1개월, 3개월 → 자동 생성
    code = generateLicenseCode();
  }

  // ── 주문내역 저장 ──
  try {
    var orderSheet = getOrderSheet();
    orderSheet.appendRow([
      orderId, paymentKey, amount, email,
      product.type, product.name, code,
      'completed', new Date().toISOString()
    ]);
    SpreadsheetApp.flush();
  } catch (saveErr) {
    Logger.log('[주문저장오류] ' + saveErr.message);
  }

  // ── 이메일 발송 ──
  if (email) {
    try {
      sendLicenseEmail(email, code, product.name);
    } catch (emailErr) {
      Logger.log('[이메일발송오류] ' + emailErr.message);
    }
  }

  Logger.log('[결제성공] orderId=' + orderId + ', code=' + code + ', product=' + product.name);

  return jsonpResponse(callback, {
    ok: true,
    code: code,
    product: product.name
  });
}


// ═══════════════════════════════════════════════════════════
// ▣ 2. check-order — 주문번호로 코드 재조회
// ═══════════════════════════════════════════════════════════

function handleCheckOrder(e) {
  var callback = e.parameter.callback || 'callback';
  var orderId = e.parameter.orderId || '';

  if (!orderId) {
    return jsonpResponse(callback, { ok: false, error: '주문번호를 입력해주세요.' });
  }

  try {
    var sheet = getOrderSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === orderId.trim()) {
        return jsonpResponse(callback, {
          ok: true,
          code: String(data[i][6]),
          product: String(data[i][5]),
          date: String(data[i][8])
        });
      }
    }

    return jsonpResponse(callback, { ok: false, error: '해당 주문번호를 찾을 수 없습니다.' });
  } catch (err) {
    return jsonpResponse(callback, { ok: false, error: '서버 오류: ' + err.message });
  }
}


// ═══════════════════════════════════════════════════════════
// ▣ 3. lookup-by-email — 이메일로 전체 주문 목록 조회
// ═══════════════════════════════════════════════════════════

function handleLookupByEmail(e) {
  var callback = e.parameter.callback || 'callback';
  var email = e.parameter.email || '';

  if (!email) {
    return jsonpResponse(callback, { ok: false, error: '이메일을 입력해주세요.' });
  }

  try {
    var sheet = getOrderSheet();
    var data = sheet.getDataRange().getValues();
    var orders = [];

    for (var i = 1; i < data.length; i++) {
      var rowEmail = String(data[i][3]).trim().toLowerCase();
      if (rowEmail === email.trim().toLowerCase()) {
        orders.push({
          orderId: String(data[i][0]),
          product: String(data[i][5]),
          code: String(data[i][6]),
          date: String(data[i][8])
        });
      }
    }

    if (orders.length === 0) {
      return jsonpResponse(callback, {
        ok: false, error: '해당 이메일로 등록된 주문이 없습니다.'
      });
    }

    orders.sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    return jsonpResponse(callback, { ok: true, orders: orders });
  } catch (err) {
    return jsonpResponse(callback, { ok: false, error: '서버 오류: ' + err.message });
  }
}


// ═══════════════════════════════════════════════════════════
// ▣ 4. send-code-email — 라이선스 코드 이메일 발송
// ═══════════════════════════════════════════════════════════

function handleSendCodeEmail(e) {
  var callback = e.parameter.callback || 'callback';
  var email = e.parameter.email || '';
  var code = e.parameter.code || '';
  var product = e.parameter.product || 'Leaders Pro';

  if (!email || !code) {
    return jsonpResponse(callback, { ok: false, error: '이메일 또는 코드가 없습니다.' });
  }

  try {
    sendLicenseEmail(email, code, product);
    return jsonpResponse(callback, { ok: true });
  } catch (err) {
    return jsonpResponse(callback, { ok: false, error: '이메일 발송 실패: ' + err.message });
  }
}


// ═══════════════════════════════════════════════════════════
// ▣ 5. 이메일 발송 헬퍼 (Leaders Pro 브랜드 HTML)
// ═══════════════════════════════════════════════════════════

function sendLicenseEmail(email, code, productName) {
  var subject = '🎉 [Leaders Pro] 라이선스 코드가 발급되었습니다';
  var htmlBody = ''
    + '<div style="max-width:520px;margin:0 auto;font-family:\'Apple SD Gothic Neo\',sans-serif;background:#0a0a0f;border-radius:16px;overflow:hidden;border:1px solid rgba(201,168,76,0.3);">'
    + '  <div style="background:linear-gradient(135deg,#c9a84c,#e8d48b);padding:28px 32px;text-align:center;">'
    + '    <h1 style="margin:0;font-size:22px;color:#0a0a0f;font-weight:800;">👑 Leaders Pro</h1>'
    + '    <p style="margin:6px 0 0;color:rgba(10,10,15,0.7);font-size:13px;">프리미엄 자동화 솔루션</p>'
    + '  </div>'
    + '  <div style="padding:32px;">'
    + '    <p style="color:#e8e6e3;font-size:15px;margin:0 0 8px;">결제가 완료되었습니다! 🎉</p>'
    + '    <p style="color:#8a8686;font-size:13px;margin:0 0 24px;">상품: <strong style="color:#c9a84c;">' + productName + '</strong></p>'
    + '    <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">'
    + '      <p style="color:#8a8686;font-size:12px;margin:0 0 8px;letter-spacing:1px;">라이선스 코드</p>'
    + '      <p style="color:#c9a84c;font-size:20px;font-weight:800;letter-spacing:2px;margin:0;font-family:monospace;">' + code + '</p>'
    + '    </div>'
    + '    <div style="background:rgba(68,215,182,0.06);border:1px solid rgba(68,215,182,0.15);border-radius:8px;padding:14px;margin-bottom:24px;">'
    + '      <p style="color:#44d7b6;font-size:13px;font-weight:600;margin:0 0 4px;">💡 사용 방법</p>'
    + '      <p style="color:#8a8686;font-size:12px;margin:0;line-height:1.6;">Leaders Pro 앱 실행 → 라이선스 등록 → 위 코드 입력</p>'
    + '    </div>'
    + '    <div style="text-align:center;">'
    + '      <a href="https://open.kakao.com/o/sPcaslwh" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#FEE500,#F5D100);color:#3C1E1E;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">💬 카카오톡 문의</a>'
    + '    </div>'
    + '  </div>'
    + '  <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">'
    + '    <p style="color:#555;font-size:11px;margin:0;">© 2026 Leaders Pro. All rights reserved.</p>'
    + '  </div>'
    + '</div>';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });

  Logger.log('[이메일발송] to=' + email + ', code=' + code);
}


// ═══════════════════════════════════════════════════════════
// ▣ 6. 라이선스 코드 자동 생성 (코드풀 소진 시 폴백)
// ═══════════════════════════════════════════════════════════

function generateLicenseCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var segments = [];
  for (var s = 0; s < 4; s++) {
    var seg = '';
    for (var c = 0; c < 4; c++) {
      seg += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(seg);
  }
  return 'LP-' + segments.join('-');
}


// ═══════════════════════════════════════════════════════════
// ▣ 7. 코드풀 관리 — initCodePool (처음 한 번 ▶실행)
// ═══════════════════════════════════════════════════════════

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

  var existing = sheet.getDataRange().getValues();
  var existingCodes = {};
  for (var i = 1; i < existing.length; i++) {
    existingCodes[String(existing[i][0]).toUpperCase()] = true;
  }

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


// ═══════════════════════════════════════════════════════════
// ▣ 8. 코드풀에서 코드 꺼내기 (발급 후 행 삭제)
// ═══════════════════════════════════════════════════════════

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

      sheet.deleteRow(rowNum);
      SpreadsheetApp.flush();

      Logger.log('[코드풀] 발급 완료: ' + code + ' (' + typeLabel + ') → 행 삭제됨');
      return { ok: true, code: code };
    }
  }

  return { ok: false, error: typeLabel + ' 코드가 모두 소진되었습니다.' };
}


// ═══════════════════════════════════════════════════════════
// ▣ 9. 네이버 계정 업데이트 (앱→서버 동기화)
// ═══════════════════════════════════════════════════════════

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

  var limitedAccounts = accounts.slice(0, 10);

  // A. Sheet1 naverAccounts 컬럼 저장 (코드 있을 때)
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

  // B. '네이버계정' 시트에 개별 행 저장
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

    Logger.log('[NaverAccounts] userId=' + userId + ', new=' + newCount + ', updated=' + updatedCount);
  } catch (e) {
    Logger.log('[NaverAccounts] 시트 저장 오류: ' + e.message);
  }

  SpreadsheetApp.flush();

  return ContentService.createTextOutput(JSON.stringify({
    ok: true, message: 'Naver accounts updated', count: limitedAccounts.length
  })).setMimeType(ContentService.MimeType.JSON);
}


// ═══════════════════════════════════════════════════════════
// ▣ 10. 네이버 계정 조회
// ═══════════════════════════════════════════════════════════

function handleGetNaverAccounts() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('네이버계정');
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, message: '네이버계정 시트 없음'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var accounts = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = String(data[i][j] || '');
    accounts.push(row);
  }
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, total: accounts.length, accounts: accounts
  })).setMimeType(ContentService.MimeType.JSON);
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


// ═══════════════════════════════════════════════════════════
// ▣ 11. 기존 라이선스 시트 헬퍼 (이미 있으면 아래 삭제)
// ═══════════════════════════════════════════════════════════
// ★ 기존 GAS에 getSheet, ensureHeaders, findColumnIndex, findRowByCode가
//    이미 있으면 아래 섹션은 삭제하세요. 없으면 그대로 두세요.

function getSheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Sheet1') ||
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
}

function ensureHeaders(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.map(function (h) { return String(h).trim(); });
}

function findColumnIndex(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) return i + 1;
  }
  return -1;
}

function findRowByCode(sheet, code) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var codeCol = -1;
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).trim() === 'code' || String(headers[j]).trim() === 'licenseCode') {
      codeCol = j;
      break;
    }
  }
  if (codeCol === -1) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][codeCol]).trim() === code.trim()) return i + 1;
  }
  return null;
}
