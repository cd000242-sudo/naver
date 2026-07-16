export interface FtcModePreference {
  readonly enabled: boolean;
  readonly preset: string;
  readonly text: string;
}

/**
 * Content-mode changes own only the disclosure ON/OFF default. Wording and
 * preset selection remain user-owned and can change only through their controls.
 */
export function resolveFtcModeTransition(
  current: FtcModePreference,
  nextMode: string,
  presets: Readonly<Record<string, string>>,
): FtcModePreference {
  const preset = current.preset && Object.prototype.hasOwnProperty.call(presets, current.preset)
    ? current.preset
    : 'affiliate';
  const savedText = typeof current.text === 'string' ? current.text : '';
  const text = savedText.trim().length > 0
    ? savedText
    : (presets[preset] || presets['affiliate'] || '');

  return {
    enabled: nextMode === 'affiliate',
    preset,
    text,
  };
}
