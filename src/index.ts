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
/**
 * [2026-08-05] 자격증명은 환경변수 전용.
 *
 * 이전에는 개발자 본인의 네이버 계정 ID·비밀번호가 이 파일에 리터럴로 박혀
 * 있었고(2026-01-26 커밋 이후), 이 저장소는 공개(public)다. 게다가
 * package.json build.files의 `dist/**` 규칙으로 `dist/index.js`가 asar에도
 * 들어간다. 값이 없으면 경고만 하고 하드코딩 폴백으로 실행되던 구조라
 * 아무도 문제를 눈치채지 못했다.
 *
 * 이제 환경변수가 없으면 경고가 아니라 실패한다 — 남의 계정으로 조용히
 * 실행되는 경로를 만들지 않는다.
 */
function readCredentialsOrExit(): { naverId: string; naverPassword: string } {
  const naverId = String(process.env.NAVER_ID ?? '').trim();
  const naverPassword = String(process.env.NAVER_PASSWORD ?? '').trim();

  if (!naverId || !naverPassword) {
    console.log(
      boxen(
        chalk.red('❌ 네이버 자격증명이 설정되지 않았습니다.\n\n') +
        chalk.dim('.env 파일에 아래 두 값을 설정한 뒤 다시 실행해주세요.\n') +
        chalk.dim('  NAVER_ID=your-id\n') +
        chalk.dim('  NAVER_PASSWORD=your-password'),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
      )
    );
    process.exit(1);
  }

  return { naverId, naverPassword };
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
    // 2. 자격 증명 로드 (없으면 즉시 종료 — 하드코딩 폴백 없음)
    const { naverId, naverPassword } = readCredentialsOrExit();

    await new Promise(resolve => setTimeout(resolve, 600)); // 부드러운 UX를 위한 짧은 대기
    spinner.succeed(chalk.green('시스템 초기화 완료'));

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
