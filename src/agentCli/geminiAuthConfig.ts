// Gemini CLI auth-method configuration.
//
// The gemini CLI has no dedicated `login` command and no env var that selects the
// "Login with Google" (oauth-personal) method. With no method configured it only prints
// "Please set an Auth method ... GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI,
// GOOGLE_GENAI_USE_GCA". Forcing GOOGLE_GENAI_USE_GCA selects the Google Code Assist path,
// which is token/enterprise-oriented and returns "IneligibleTierError: This client is no
// longer supported for Gemini Code Assist for individuals" for personal accounts.
//
// The correct personal-subscription path is oauth-personal (LOGIN_WITH_GOOGLE), which is
// only selectable via ~/.gemini/settings.json (security.auth.selectedType). This module
// merge-writes that setting so login and generation both use the user's OAuth subscription.

import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';

const GEMINI_DIR = '.gemini';
const SETTINGS_FILE = 'settings.json';
const OAUTH_PERSONAL = 'oauth-personal';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ensure the Gemini CLI is configured for oauth-personal ("Login with Google").
 * Merge-writes ~/.gemini/settings.json, preserving any existing keys, and is idempotent
 * (returns early when the auth method is already oauth-personal). Best-effort: never throws
 * — a config-write failure must not block the login/generation attempt itself.
 */
export async function ensureGeminiOAuthPersonalConfig(): Promise<void> {
  try {
    const dir = join(homedir(), GEMINI_DIR);
    const file = join(dir, SETTINGS_FILE);

    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(file, 'utf-8');
      const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
      if (isPlainObject(parsed)) settings = parsed;
    } catch {
      // Missing or unparseable settings → start from an empty object.
      settings = {};
    }

    const security = isPlainObject(settings.security) ? settings.security : {};
    const auth = isPlainObject(security.auth) ? security.auth : {};
    if (auth.selectedType === OAUTH_PERSONAL) return; // already correct — no write needed

    const next = {
      ...settings,
      security: {
        ...security,
        auth: { ...auth, selectedType: OAUTH_PERSONAL },
      },
    };
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // Config setup is best-effort; the caller proceeds regardless.
  }
}
