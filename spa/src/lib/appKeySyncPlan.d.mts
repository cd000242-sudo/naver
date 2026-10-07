export const APP_KEY_FIELDS: readonly string[];
export function planKeySync(input: {
  siteKeys?: Record<string, string | undefined>;
  siteSavedAt?: string;
  sitePending?: boolean;
  appKeys?: Record<string, string | undefined>;
  appSavedAt?: string;
}): { nextSite: Record<string, string | undefined>; siteChanged: boolean; toApp: Record<string, string>; appChanged: boolean; siteNewer: boolean };
