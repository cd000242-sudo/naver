#!/usr/bin/env node
/**
 * 공유 카드 이미지 정규화.
 *
 * 왜 필요한가:
 *   생성기가 뱉는 크기는 매번 다르다(이번엔 1712x931). 카카오·페북·트위터는
 *   1200x630 을 기준으로 잘라내고 줄이는데, 비율이 어긋나면 아래쪽 한글이
 *   잘리거나 뭉개진다. 힘들게 뽑은 글자가 카드에서 안 읽히면 소용이 없다.
 *
 *   그리고 8장을 손으로 리사이즈하면 한 장은 반드시 다르게 된다.
 *
 * 하는 일:
 *   src/og/*.jpg|png  →  public/og/*.jpg  (정확히 1200x630, 품질 82, progressive)
 *   - 비율이 다르면 **가운데가 아니라 아래쪽을 살려서** 자른다. 글자가 하단에 있다.
 *   - 원본이 1200x630 보다 작으면 경고한다(늘리면 흐려진다).
 *
 * 사용:
 *   node scripts/build-og-images.mjs
 *   node scripts/build-og-images.mjs --check   파일만 점검하고 쓰지 않는다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'src-og');
const OUT_DIR = path.join(ROOT, 'public', 'og');

const WIDTH = 1200;
const HEIGHT = 630;

/** 있어야 하는 8장. 빠지면 그 페이지는 기본 카드로 떨어지므로 반드시 알린다. */
const REQUIRED = [
  ['home.jpg', '홈 — 매일 자리 있는 키워드만'],
  ['leword.jpg', '/leword — 지금 비어 있는 상위 자리'],
  ['pricing.jpg', '/pricing — 올인원 하나로 전부'],
  ['download.jpg', '/download — 설치하고 바로 시작'],
  ['products.jpg', '/products — 발굴부터 발행까지 한 흐름'],
  ['chatbots.jpg', '/chatbots — 물어보면 바로 답이 옵니다'],
  ['orbit.jpg', '/orbit — 네이버 밖에서 들어오는 유입'],
  ['leword-detail.jpg', '/leword-detail — 검색결과를 열어보고 고릅니다'],
];

const checkOnly = process.argv.includes('--check');

function findSource(name) {
  const base = name.replace(/\.jpg$/, '');
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const candidate = path.join(SRC_DIR, base + ext);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`원본 폴더가 없습니다: ${SRC_DIR}`);
    console.error('생성한 이미지 8장을 이 폴더에 넣고 다시 실행하세요.');
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('='.repeat(72));
  console.log(`공유 카드 정규화 — ${WIDTH}x${HEIGHT}`);
  console.log('='.repeat(72));

  const missing = [];
  let written = 0;

  for (const [name, label] of REQUIRED) {
    const source = findSource(name);
    if (!source) {
      missing.push(`${name}  (${label})`);
      console.log(`  없음  ${name.padEnd(20)} ${label}`);
      continue;
    }

    const meta = await sharp(source).metadata();
    const small = (meta.width || 0) < WIDTH || (meta.height || 0) < HEIGHT;

    if (!checkOnly) {
      await sharp(source)
        .resize(WIDTH, HEIGHT, {
          fit: 'cover',
          // 글자가 아래에 있으므로 잘릴 때 위쪽을 버린다. 가운데 기준으로
          // 자르면 하단 한글이 먼저 날아간다.
          position: 'bottom',
        })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toFile(path.join(OUT_DIR, name));
      written += 1;
    }

    const out = path.join(OUT_DIR, name);
    const size = fs.existsSync(out) ? (fs.statSync(out).size / 1024).toFixed(0) + 'KB' : '-';
    console.log(
      `  OK    ${name.padEnd(20)} ${String(meta.width)}x${String(meta.height)} → ${WIDTH}x${HEIGHT}  ${size}`
      + (small ? '   ⚠️ 원본이 작아 흐려질 수 있음' : ''),
    );
  }

  /*
   * 홈은 프리렌더 라우트가 아니라 index.html 을 직접 쓴다.
   * 그래서 여기서 갈아 끼운다 — **파일이 실제로 만들어졌을 때만.**
   * 미리 바꿔 두면 이미지가 없는 동안 404 카드가 서빙된다.
   *
   * index.html 은 프리렌더의 템플릿이기도 하다. 전용 이미지가 없는 라우트
   * (후기·약관 등)는 이 값을 물려받으므로, 홈 카드가 기본값 노릇을 한다.
   */
  const homeOut = path.join(OUT_DIR, 'home.jpg');
  if (!checkOnly && fs.existsSync(homeOut)) {
    const indexPath = path.join(ROOT, 'index.html');
    const before = fs.readFileSync(indexPath, 'utf8');
    const after = before
      .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1https://leaderspro.kr/og/home.jpg$2')
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, '$1https://leaderspro.kr/og/home.jpg$2');
    if (after !== before) {
      fs.writeFileSync(indexPath, after, 'utf8');
      console.log('  index.html 의 홈 카드를 og/home.jpg 로 교체');
    }
  }

  console.log('-'.repeat(72));
  if (missing.length > 0) {
    console.log(`빠진 파일 ${missing.length}장 — 해당 페이지는 기본 카드로 떨어집니다:`);
    missing.forEach((m) => console.log('  · ' + m));
  } else {
    console.log(`8장 전부 준비됨${checkOnly ? ' (점검만 함)' : ` · ${written}장 생성`}`);
  }
  process.exit(missing.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('실패:', error.message);
  process.exit(1);
});
