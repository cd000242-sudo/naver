// test-license-already-registered.mjs
// 이미 등록된 라이선스 코드로 register 액션 테스트

const testAlreadyRegistered = async () => {
    const url = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

    // 실제 90일 또는 1년 라이선스 코드 형식으로 테스트
    // (패널에서 생성된 코드와 유사한 형식)
    const body = {
        action: 'register',
        appId: 'com.ridernam.naver.automation',
        licenseCode: '리더-TEST-LICENSE-CODE', // 실제 코드 형식
        userId: 'testuser123',
        userPassword: 'testpassword',
        email: 'test@example.com',
        deviceId: 'device-test-001',
        appVersion: '1.0.17'
    };

    console.log('=== Register 액션 테스트 ===');
    console.log('Request:', JSON.stringify(body, null, 2));
    console.log('');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        console.log('Response Status:', response.status, response.statusText);

        const text = await response.text();
        console.log('');
        console.log('=== Raw Response ===');
        console.log(text);
        console.log('');

        // JSON 파싱 시도
        try {
            const json = JSON.parse(text);
            console.log('=== Parsed JSON ===');
            console.log(JSON.stringify(json, null, 2));
        } catch (parseError) {
            console.log('!!! JSON PARSE ERROR !!!');
            console.log('Error:', parseError.message);
            console.log('');
            console.log('This is the PROBLEM! Response is NOT valid JSON.');
            console.log('First 200 chars:', text.substring(0, 200));
        }
    } catch (error) {
        console.error('Fetch Error:', error.message);
    }
};

testAlreadyRegistered();
