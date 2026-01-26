import 'dotenv/config';
import { NaverBlogAutomation } from './naverBlogAutomation.js';
import chalk from 'chalk';
import ora from 'ora';
import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';

/**
 * 🎨 고급스러운 시작 로고 출력
 */
function printBanner() {
  console.clear();
  const title = figlet.textSync('Naver Auto', { font: 'Slant' });
  console.log(gradient.pastel.multiline(title));
  console.log(chalk.dim('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.cyan('   🚀 High-Performance Blog Automation System'));
  console.log(chalk.dim('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

/**
 * ⚠️ 환경 변수 검증 및 경고 메시지 UI
 */
function checkCredentials(id?: string, pw?: string): boolean {
  if (!id || !pw || id === 'tjdgus24280') {
    console.log(
      boxen(
        chalk.yellow('⚠️  주의: 환경변수가 설정되지 않았거나 기본값을 사용 중입니다.\n') +
        chalk.dim('보안을 위해 .env 파일에 NAVER_ID와 NAVER_PASSWORD를 설정해주세요.'),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
      )
    );
    return false;
  }
  return true;
}

/**
 * 🚀 메인 실행 로직
 */
async function main(): Promise<void> {
  printBanner();

  // 1. 초기화 단계
  const spinner = ora({
    text: '시스템 리소스를 초기화하는 중...',
    color: 'cyan',
    spinner: 'dots'
  }).start();

  try {
    // 2. 환경 변수 로드
    const naverId = process.env.NAVER_ID ?? 'tjdgus24280';
    const naverPassword = process.env.NAVER_PASSWORD ?? '@Qkrtjdgus123';

    await new Promise(resolve => setTimeout(resolve, 600)); // 부드러운 UX를 위한 짧은 대기
    spinner.succeed(chalk.green('시스템 초기화 완료'));

    // 3. 자격 증명 상태 확인
    checkCredentials(process.env.NAVER_ID, process.env.NAVER_PASSWORD);

    // 4. 자동화 인스턴스 생성
    spinner.start('브라우저 엔진을 예열 중입니다...');

    const automation = new NaverBlogAutomation({
      naverId,
      naverPassword,
      headless: false,
      slowMo: 20,
    });

    spinner.succeed(chalk.green('브라우저 엔진 준비 완료'));

    // 5. 실행
    console.log(chalk.dim('\n  ▶ 자동화 작업을 시작합니다...\n'));

    const startTime = Date.now();
    await automation.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // 6. 성공 마무리
    console.log('\n' + boxen(
      chalk.green(`✅ 작업이 성공적으로 완료되었습니다!\n`) +
      chalk.dim(`⏱️ 소요 시간: ${duration}초`),
      { padding: 1, borderStyle: 'double', borderColor: 'green' }
    ));

  } catch (error) {
    // 7. 에러 핸들링 (고급스럽게)
    spinner.fail(chalk.red('작업 중 치명적인 오류가 발생했습니다.'));

    console.error(
      boxen(
        chalk.red('❌ ERROR REPORT\n\n') +
        chalk.white(error instanceof Error ? error.message : String(error)),
        { padding: 1, borderStyle: 'classic', borderColor: 'red' }
      )
    );
    process.exitCode = 1;
  }
}

// 🎬 진입점
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.bgRed.white(' CRITICAL FAILURE '), error);
    process.exit(1);
  });
}
