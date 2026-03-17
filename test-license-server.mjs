// test-license-server.mjs
const testLicenseServer = async () => {
    const url = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

    const body = {
        action: 'register',
        appId: 'com.ridernam.naver.automation',
        licenseCode: 'TEST-CODE-12345678',
        userId: 'test_user',
        userPassword: 'test_password',
        email: 'test@test.com',
        deviceId: 'test-device-001',
        appVersion: '1.0.17'
    };

    console.log('Request URL:', url);
    console.log('Request Body:', JSON.stringify(body, null, 2));
    console.log('');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        console.log('Response Status:', response.status, response.statusText);

        const text = await response.text();
        console.log('Response Body (first 500 chars):');
        console.log(text.substring(0, 500));
        console.log('');

        // JSON 파싱 시도
        try {
            const json = JSON.parse(text);
            console.log('Parsed JSON:', JSON.stringify(json, null, 2));
        } catch (parseError) {
            console.log('JSON parse failed:', parseError.message);
            console.log('Response is NOT valid JSON');
        }
    } catch (error) {
        console.error('Fetch Error:', error.message);
    }
};

testLicenseServer();
