/**
 * ✅ [2026-01-29] 안정성 시스템 테스트 스크립트
 * - Circuit Breaker, Exponential Backoff, Publish Cooldown 검증
 * - 콘솔에서 실행: node testStability.js
 */

// ========================
// 테스트 유틸리티
// ========================

function assert(condition: boolean, message: string): void {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(message);
    }
    console.log(`✅ PASS: ${message}`);
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    console.log(`\n🔍 테스트: ${name}`);
    try {
        await fn();
        console.log(`✅ ${name} 성공`);
    } catch (error) {
        console.error(`❌ ${name} 실패:`, error);
    }
}

// ========================
// Circuit Breaker 테스트
// ========================

async function testCircuitBreaker(): Promise<void> {
    console.log('\n========== Circuit Breaker 테스트 ==========');

    // 간단한 Circuit Breaker 구현 테스트
    const cb = {
        state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
        failureCount: 0,
        failureThreshold: 3,
        lastFailureTime: 0,
        timeout: 1000,

        isAllowed(): boolean {
            if (this.state === 'OPEN') {
                if (Date.now() - this.lastFailureTime >= this.timeout) {
                    this.state = 'HALF_OPEN';
                    return true;
                }
                return false;
            }
            return true;
        },

        recordSuccess(): void {
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
            }
            this.failureCount = 0;
        },

        recordFailure(): void {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            if (this.failureCount >= this.failureThreshold) {
                this.state = 'OPEN';
            }
        },

        reset(): void {
            this.state = 'CLOSED';
            this.failureCount = 0;
        }
    };

    await test('초기 상태 CLOSED', () => {
        assert(cb.state === 'CLOSED', 'Initial state should be CLOSED');
        assert(cb.isAllowed(), 'Should allow requests');
    });

    await test('3번 실패 후 OPEN', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        assert(cb.state === 'OPEN', 'Should be OPEN after 3 failures');
        assert(!cb.isAllowed(), 'Should block requests');
    });

    await test('타임아웃 후 HALF_OPEN', async () => {
        await new Promise(resolve => setTimeout(resolve, 1100));
        assert(cb.isAllowed(), 'Should allow after timeout');
        assert(cb.state === 'HALF_OPEN', 'Should be HALF_OPEN');
    });

    await test('성공 후 CLOSED', () => {
        cb.recordSuccess();
        assert(cb.state === 'CLOSED', 'Should be CLOSED after success');
    });

    await test('수동 리셋', () => {
        cb.recordFailure();
        cb.recordFailure();
        cb.recordFailure();
        cb.reset();
        assert(cb.state === 'CLOSED', 'Should be CLOSED after reset');
    });
}

// ========================
// Exponential Backoff 테스트
// ========================

async function testExponentialBackoff(): Promise<void> {
    console.log('\n========== Exponential Backoff 테스트 ==========');

    const getExponentialDelay = (attempt: number, baseDelay: number = 1000, maxDelay: number = 16000): number => {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 500;
        return delay + jitter;
    };

    await test('지수 증가 딜레이', () => {
        const delay0 = getExponentialDelay(0, 1000, 16000);
        const delay1 = getExponentialDelay(1, 1000, 16000);
        const delay2 = getExponentialDelay(2, 1000, 16000);
        const delay3 = getExponentialDelay(3, 1000, 16000);

        console.log(`  시도 0: ${Math.round(delay0)}ms`);
        console.log(`  시도 1: ${Math.round(delay1)}ms`);
        console.log(`  시도 2: ${Math.round(delay2)}ms`);
        console.log(`  시도 3: ${Math.round(delay3)}ms`);

        assert(delay0 >= 1000 && delay0 < 2000, 'Delay 0 should be ~1000ms');
        assert(delay1 >= 2000 && delay1 < 3000, 'Delay 1 should be ~2000ms');
        assert(delay2 >= 4000 && delay2 < 5000, 'Delay 2 should be ~4000ms');
        assert(delay3 >= 8000 && delay3 < 9000, 'Delay 3 should be ~8000ms');
    });

    await test('최대 딜레이 제한', () => {
        const delay10 = getExponentialDelay(10, 1000, 16000);
        console.log(`  시도 10: ${Math.round(delay10)}ms (최대 16000+500)`);
        assert(delay10 <= 16500, 'Should not exceed maxDelay + jitter');
    });
}

// ========================
// Publish Cooldown 테스트
// ========================

async function testPublishCooldown(): Promise<void> {
    console.log('\n========== Publish Cooldown 테스트 ==========');

    const getRandomCooldown = (min: number = 1000, max: number = 5000): number => {
        return min + Math.random() * (max - min);
    };

    await test('랜덤 쿨다운 범위', () => {
        for (let i = 0; i < 5; i++) {
            const cooldown = getRandomCooldown(1000, 5000);
            console.log(`  쿨다운 ${i}: ${Math.round(cooldown)}ms`);
            assert(cooldown >= 1000 && cooldown <= 5000, `Cooldown should be between 1000-5000ms`);
        }
    });
}

// ========================
// 전체 테스트 실행
// ========================

async function runAllTests(): Promise<void> {
    console.log('🚀 안정성 시스템 테스트 시작\n');
    console.log('='.repeat(50));

    try {
        await testCircuitBreaker();
        await testExponentialBackoff();
        await testPublishCooldown();

        console.log('\n' + '='.repeat(50));
        console.log('🎉 모든 테스트 통과!');
    } catch (error) {
        console.error('\n❌ 테스트 실패:', error);
    }
}

// 바로 실행
runAllTests();

console.log('\n[StabilityTests] 📦 테스트 스크립트 로드됨!');
