export const FLOW_RESULT_WAIT_TIMEOUT_MS = 240_000;

export function extractCorrelatedFlowImageId(url: string): string | null {
  const match = String(url || '').match(
    /(?:getMediaUrlRedirect\?name=|flow-content\.google\/image\/)([0-9a-fA-F-]{16,})/,
  );
  return match ? match[1] : null;
}

export function isFlowStaticUiAssetUrl(url: string): boolean {
  return /aitestkitchen\/website\/flow\/(?:zero_states|landing_page|banners|changelogs)\/|labs\.google\/fx\/(?:pinhole|icons)\//i.test(
    String(url || ''),
  );
}

export function shouldQuarantineFlowContext(errorMessage: string): boolean {
  return /Timeout.*exceeded|FLOW_PROMPT_INPUT|FLOW_SUBMIT_BUTTON|FLOW_IMAGE_TIMEOUT|intercepts pointer/i.test(
    String(errorMessage || ''),
  );
}
