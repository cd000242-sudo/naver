#!/usr/bin/env node
/**
 * 관리자 패널 로그인 자격 설정
 *
 * 왜 스크립트로 두는가:
 *   admin/index.html 의 ADMIN_ID_HASH / ADMIN_PW_HASH 가 빈 문자열이라
 *   sha256(입력) === '' 비교가 절대 참이 될 수 없고, 그래서 아무도 로그인할 수 없다.
 *   해시를 직접 파일에 적으려면 비밀번호를 어딘가에 적어야 하는데, 이 스크립트를
 *   쓰면 비밀번호가 터미널 밖으로 나가지 않는다(채팅·로그·커밋 어디에도 안 남는다).
 *
 * 알고 있어야 할 것:
 *   이건 클라이언트 검사다. 개발자도구에서 sessionStorage 를 직접 세팅하면 우회된다.
 *   즉 이 값은 "남이 못 들어오게" 하는 장치가 아니라 "내가 들어가게" 하는 장치다.
 *   실제 방어는 GAS 백엔드가 해야 한다.
 *
 * 사용:
 *   node scripts/set-admin-login.mjs <아이디> <비밀번호>
 *   node scripts/set-admin-login.mjs --check          현재 설정 여부만 확인
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'admin', 'index.html');

const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

const args = process.argv.slice(2);
const html = readFileSync(TARGET, 'utf8');

const currentId = (html.match(/const ADMIN_ID_HASH = '([^']*)'/) || [])[1];
const currentPw = (html.match(/const ADMIN_PW_HASH = '([^']*)'/) || [])[1];

if (args[0] === '--check' || args.length === 0) {
  console.log('관리자 로그인 설정 상태');
  console.log(`  아이디 해시   ${currentId ? '설정됨' : '비어 있음 → 로그인 불가'}`);
  console.log(`  비밀번호 해시 ${currentPw ? '설정됨' : '비어 있음 → 로그인 불가'}`);
  if (args.length === 0) {
    console.log('\n설정하려면: node scripts/set-admin-login.mjs <아이디> <비밀번호>');
  }
  process.exit(0);
}

const [id, password] = args;
if (!id || !password) {
  console.error('아이디와 비밀번호를 모두 주세요: node scripts/set-admin-login.mjs <아이디> <비밀번호>');
  process.exit(2);
}
if (password.length < 8) {
  // 공개 파일에 해시가 실리므로 짧은 비밀번호는 사전공격으로 금방 뚫린다.
  console.error('비밀번호는 8자 이상으로 해주세요. 해시가 공개 파일에 실리기 때문입니다.');
  process.exit(2);
}

const next = html
  .replace(/const ADMIN_ID_HASH = '[^']*'/, `const ADMIN_ID_HASH = '${sha256(id)}'`)
  .replace(/const ADMIN_PW_HASH = '[^']*'/, `const ADMIN_PW_HASH = '${sha256(password)}'`);

if (next === html) {
  console.error('ADMIN_ID_HASH / ADMIN_PW_HASH 를 찾지 못했습니다. admin/index.html 구조를 확인하세요.');
  process.exit(1);
}

writeFileSync(TARGET, next, 'utf8');
console.log('설정 완료. 비밀번호는 파일에 남지 않고 해시만 기록됐습니다.');
console.log('배포 후 https://leaderspro.kr/admin/ 에서 로그인하세요.');
