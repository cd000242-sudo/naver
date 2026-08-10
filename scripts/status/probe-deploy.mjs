/**
 * 배포·자동화 파이프라인 점검.
 *
 * Vultr 를 걷어내고 전부 GitHub Actions + GAS + Pages 로 옮긴 뒤로는
 * **크론이 멈추는 것**이 곧 사이트가 낡는 것이다. 그런데 크론 실패는
 * 화면 어디에도 안 나온다. 여기서 워크플로 최근 결과를 직접 물어본다.
 *
 * gh CLI 가 없거나 로그인 안 돼 있으면 skip 이다. 못 본 것을 통과로 적지 않는다.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fail, minutesSince, ok, probeLink, request, skip, warn } from './lib.mjs';

const run = promisify(execFile);
const REPO = 'cd000242-sudo/naver';
const SITE = 'https://leaderspro.kr';

/** 방문자가 실제로 여는 경로들. 하나라도 죽으면 그 기능은 없는 것이다. */
async function checkLivePages() {
  const paths = ['/', '/leword', '/products', '/pricing', '/download', '/community', '/reviews'];
  const results = await Promise.all(paths.map((path) => probeLink(`${SITE}${path}`, 15000)));
  const dead = paths.filter((_, index) => !results[index].alive);
  return dead.length === 0
    ? ok('deploy.pages', '라이브 페이지', `${paths.length}개 경로 전부 200`)
    : fail('deploy.pages', '라이브 페이지', `죽은 경로: ${dead.join(', ')}`);
}

/** 배포본 스냅샷의 나이. 로컬 파일이 아무리 새것이어도 배포가 안 되면 소용없다. */
async function checkLiveSnapshotAge() {
  const response = await request(`${SITE}/data/source-signals.json?cb=${Date.now()}`, { timeoutMs: 20000 });
  if (!response.okStatus) return fail('deploy.snapshot', '배포본 스냅샷', response.error || `HTTP ${response.status}`);
  let updatedAt;
  try {
    updatedAt = JSON.parse(response.text).updatedAt;
  } catch {
    return fail('deploy.snapshot', '배포본 스냅샷', 'JSON 파싱 실패');
  }
  const ageMin = minutesSince(updatedAt);
  if (ageMin === null) return fail('deploy.snapshot', '배포본 스냅샷', 'updatedAt 이 없다');
  // GitHub 스케줄러는 */15 로 걸어도 실제로는 20~40분씩 밀린다(실측). 90분을 넘으면
  // 지연이 아니라 고장으로 본다.
  if (ageMin > 90) {
    return fail('deploy.snapshot', '배포본 스냅샷', `${ageMin}분 전`, '크론 또는 Pages 배포가 멈췄다');
  }
  return ageMin > 45
    ? warn('deploy.snapshot', '배포본 스냅샷', `${ageMin}분 전 — 스케줄러 지연 구간`)
    : ok('deploy.snapshot', '배포본 스냅샷', `${ageMin}분 전`);
}

async function ghJson(args) {
  const { stdout } = await run('gh', args, { timeout: 25000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/** 데이터 갱신·배포 워크플로의 최근 결론. */
async function checkWorkflows() {
  const workflows = ['refresh-public-data.yml', 'deploy-pages.yml'];
  const results = [];
  for (const workflow of workflows) {
    let runs;
    try {
      runs = await ghJson([
        'run', 'list', '--repo', REPO, '--workflow', workflow,
        '--limit', '5', '--json', 'conclusion,status,createdAt',
      ]);
    } catch (error) {
      results.push(skip(`deploy.${workflow}`, `워크플로 ${workflow}`, `gh 조회 실패: ${String(error?.message || error).split('\n')[0]}`));
      continue;
    }
    if (!Array.isArray(runs) || runs.length === 0) {
      results.push(warn(`deploy.${workflow}`, `워크플로 ${workflow}`, '최근 실행 기록이 없다'));
      continue;
    }
    const latest = runs[0];
    const ageMin = minutesSince(latest.createdAt);
    const failures = runs.filter((entry) => entry.conclusion === 'failure').length;
    const label = `최근 ${runs.length}회 중 실패 ${failures}회 · 마지막 ${ageMin}분 전 (${latest.conclusion || latest.status})`;
    if (latest.conclusion === 'failure' && failures >= 3) {
      results.push(fail(`deploy.${workflow}`, `워크플로 ${workflow}`, label, '연속 실패 중 — 자동 갱신이 멈췄다'));
    } else if (failures > 0) {
      results.push(warn(`deploy.${workflow}`, `워크플로 ${workflow}`, label));
    } else {
      results.push(ok(`deploy.${workflow}`, `워크플로 ${workflow}`, label));
    }
  }
  return results;
}

/** 죽은 서버 주소가 코드에 남아 있는지. 남아 있으면 언젠가 그 경로로 다시 샌다. */
async function checkDeadServerRefs() {
  try {
    const { stdout } = await run(
      'git',
      ['grep', '-l', '-e', '141.164.59.17', '-e', 'api.leword.app', '--', 'spa/src', 'admin', 'scripts'],
      { timeout: 20000, windowsHide: true },
    );
    const files = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    return files.length === 0
      ? ok('deploy.dead-server', '죽은 서버 참조', '없음')
      : warn('deploy.dead-server', '죽은 서버 참조', `${files.length}개 파일에 남아 있다: ${files.slice(0, 4).join(', ')}`);
  } catch (error) {
    // git grep 은 일치가 없으면 exit 1 이다. 이건 정상(=참조 없음)이다.
    if (error?.code === 1) return ok('deploy.dead-server', '죽은 서버 참조', '없음');
    return skip('deploy.dead-server', '죽은 서버 참조', `git grep 실패: ${String(error?.message || error).split('\n')[0]}`);
  }
}

export const deployProbe = {
  id: 'deploy',
  title: '배포 · 자동화',
  async run() {
    const settled = await Promise.allSettled([
      checkLivePages(),
      checkLiveSnapshotAge(),
      checkWorkflows(),
      checkDeadServerRefs(),
    ]);
    return settled.flatMap((entry, index) => {
      if (entry.status !== 'fulfilled') {
        return [fail(`deploy.probe-${index}`, '배포 점검', `점검이 실패했다: ${entry.reason?.message || entry.reason}`)];
      }
      return Array.isArray(entry.value) ? entry.value : [entry.value];
    });
  },
};

export default deployProbe;
