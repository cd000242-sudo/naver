export interface LewordReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

function normalizedName(asset: LewordReleaseAsset): string {
  return String(asset.name || '').toLowerCase();
}

function isUsableAsset(asset: LewordReleaseAsset): boolean {
  const name = normalizedName(asset);
  return Boolean(asset.browser_download_url) && !name.endsWith('.blockmap') && name.includes('leword');
}

function scoreWindowsAsset(asset: LewordReleaseAsset): number {
  const name = normalizedName(asset);
  if (!isUsableAsset(asset)) return 0;
  if (/\.exe$/i.test(name) && /setup/.test(name)) return 100;
  if (/\.exe$/i.test(name) && /portable/.test(name)) return 90;
  if (/\.exe$/i.test(name)) return 80;
  if (/\.zip$/i.test(name) && /(setup|portable|win|windows)/.test(name)) return 70;
  return 0;
}

function scoreMacAsset(asset: LewordReleaseAsset, arch: string): number {
  const name = normalizedName(asset);
  if (!isUsableAsset(asset)) return 0;
  const archBonus = arch && name.includes(arch.toLowerCase()) ? 8 : 0;
  if (/\.dmg$/i.test(name)) return /universal/.test(name) ? 120 : 100 + archBonus;
  if (/\.zip$/i.test(name) && /(mac|darwin|universal|arm64|x64)/.test(name)) return (/universal/.test(name) ? 95 : 90) + archBonus;
  return 0;
}

export function selectLewordReleaseAsset(
  assets: ReadonlyArray<LewordReleaseAsset> | undefined,
  platform: string = process.platform,
  arch: string = process.arch
): LewordReleaseAsset | null {
  const scorer = platform === 'darwin' ? (asset: LewordReleaseAsset) => scoreMacAsset(asset, arch) : platform === 'win32' ? scoreWindowsAsset : () => 0;
  let best: LewordReleaseAsset | null = null;
  let bestScore = 0;

  for (const asset of assets || []) {
    const score = scorer(asset);
    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }

  return best;
}

export function isDirectLaunchLewordAsset(asset: LewordReleaseAsset | null, platform: string = process.platform): boolean {
  return platform === 'win32' && Boolean(asset?.name && /\.exe$/i.test(asset.name));
}
