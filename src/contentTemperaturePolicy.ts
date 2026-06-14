const PROMPT_TEMPERATURE_BY_MODE: Record<string, number> = {
  seo: 0.5,
  mate: 0.45,
  homefeed: 0.7,
  'traffic-hunter': 0.9,
  affiliate: 0.5,
  custom: 0.7,
  business: 0.6,
};

export function resolvePromptTemperature(contentMode: string | undefined): number {
  return PROMPT_TEMPERATURE_BY_MODE[String(contentMode || '').trim()] ?? 0.5;
}
