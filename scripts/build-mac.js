#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const productName = packageJson.build?.productName || packageJson.name || 'Electron App';
const outputDir = packageJson.build?.directories?.output || 'release';
const artifactPrefix = productName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || packageJson.name || 'app';

function has(flag) {
  return argv.includes(flag);
}

function getOption(name, fallback) {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const prefix = name + '=';
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function printHelp() {
  console.log([
    `${productName} macOS builder`,
    '',
    'Usage:',
    '  npm run dist:mac',
    '  npm run dist:mac:unsigned',
    '  npm run dist:mac:arm64',
    '  npm run dist:mac:arm64:unsigned',
    '  npm run dist:mac:x64',
    '  npm run dist:mac:universal',
    '  npm run dist:mac:universal:unsigned',
    '',
    'Options:',
    '  --arch arm64|x64|universal   macOS architecture to build',
    '  --unsigned                   build without Developer ID signing for local tests',
    '  --publish                    upload dmg/zip/latest-mac.yml to configured GitHub Release',
    '',
    'Output:',
    `  ${outputDir}/${artifactPrefix}-<version>-universal.dmg`,
    `  ${outputDir}/${artifactPrefix}-<version>-universal.zip`,
    `  ${outputDir}/${artifactPrefix}-<version>-arm64.dmg`,
    `  ${outputDir}/${artifactPrefix}-<version>-x64.dmg`
  ].join('\n'));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function rgbaToPng(width, height, rgba) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function icoEntryToPng(ico, entryOffset) {
  const width = ico[entryOffset] || 256;
  const height = ico[entryOffset + 1] || 256;
  const byteLength = ico.readUInt32LE(entryOffset + 8);
  const imageOffset = ico.readUInt32LE(entryOffset + 12);
  const image = ico.subarray(imageOffset, imageOffset + byteLength);
  if (image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { width, height, png: Buffer.from(image) };
  }

  const headerSize = image.readUInt32LE(0);
  const dibWidth = image.readInt32LE(4);
  const dibHeight = image.readInt32LE(8);
  const bitCount = image.readUInt16LE(14);
  const compression = image.readUInt32LE(16);
  if (headerSize !== 40 || bitCount !== 32 || compression !== 0) {
    throw new Error(`Unsupported ICO bitmap: header=${headerSize}, bits=${bitCount}, compression=${compression}`);
  }

  const actualWidth = Math.abs(dibWidth);
  const actualHeight = Math.abs(dibHeight) / 2;
  const pixelsOffset = headerSize;
  const srcStride = actualWidth * 4;
  const rgba = Buffer.alloc(actualWidth * actualHeight * 4);
  let hasAlpha = false;

  for (let y = 0; y < actualHeight; y++) {
    const sourceY = dibHeight > 0 ? actualHeight - 1 - y : y;
    for (let x = 0; x < actualWidth; x++) {
      const src = pixelsOffset + sourceY * srcStride + x * 4;
      const dst = (y * actualWidth + x) * 4;
      rgba[dst] = image[src + 2];
      rgba[dst + 1] = image[src + 1];
      rgba[dst + 2] = image[src];
      rgba[dst + 3] = image[src + 3];
      if (rgba[dst + 3] !== 0) hasAlpha = true;
    }
  }

  if (!hasAlpha) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }

  return { width: actualWidth, height: actualHeight, png: rgbaToPng(actualWidth, actualHeight, rgba) };
}

function createIcnsFromIco(source, target) {
  const ico = fs.readFileSync(source);
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error(`Not an ICO file: ${source}`);
  }
  const count = ico.readUInt16LE(4);
  if (count < 1) throw new Error(`ICO has no images: ${source}`);

  let bestOffset = 6;
  let bestScore = 0;
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const width = ico[entryOffset] || 256;
    const height = ico[entryOffset + 1] || 256;
    const score = width * height;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = entryOffset;
    }
  }

  const { width, png } = icoEntryToPng(ico, bestOffset);
  const type = width >= 1024 ? 'ic10' : width >= 512 ? 'ic09' : width >= 256 ? 'ic08' : width >= 128 ? 'ic07' : 'is32';
  const entry = Buffer.alloc(8 + png.length);
  entry.write(type, 0, 4, 'ascii');
  entry.writeUInt32BE(entry.length, 4);
  png.copy(entry, 8);

  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(header.length + entry.length, 4);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([header, entry]));
}

function ensureMacIcon() {
  const target = path.join(root, 'build', 'icon.icns');
  if (fs.existsSync(target)) return;
  const candidates = [
    path.join(root, 'build', 'icon.ico'),
    path.join(root, 'assets', 'LEADERNA_.ico'),
    path.join(root, 'assets', '256.ico')
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error('No source icon found for macOS. Expected build/icon.ico or assets/*.ico.');
  }
  createIcnsFromIco(source, target);
  console.log(`Created ${path.relative(root, target)} from ${path.relative(root, source)}`);
}

function run(command, args, env = process.env) {
  console.log('\n$ ' + [command, ...args].join(' '));
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (has('--help') || has('-h')) {
  printHelp();
  process.exit(0);
}

ensureMacIcon();

if (process.platform !== 'darwin') {
  console.error([
    'macOS packages must be built on a Mac.',
    '',
    'Use a MacBook or Mac mini with Node installed, then run:',
    '  npm ci',
    '  npm run dist:mac:unsigned',
    '',
    'For a signed customer release, configure Apple Developer ID signing and run:',
    '  npm run dist:mac'
  ].join('\n'));
  process.exit(2);
}

const arch = getOption('--arch', 'universal');
if (!['arm64', 'x64', 'universal'].includes(arch)) {
  console.error('Invalid --arch value: ' + arch);
  process.exit(1);
}

const env = { ...process.env };
if (has('--unsigned')) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.warn('Building unsigned macOS package. Gatekeeper will warn users on first launch.');
}

run('npm', ['run', 'build'], env);

const builderArgs = ['electron-builder', '--mac', 'dmg', 'zip'];
if (arch === 'universal') {
  builderArgs.push('--universal');
} else {
  builderArgs.push('--' + arch);
}
if (has('--publish')) {
  builderArgs.push('--publish', 'always');
}

run('npx', builderArgs, env);
