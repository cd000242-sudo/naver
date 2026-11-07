/**
 * [2026-11-07 owner] Saving a GPT Image 2.6 animated GIF.
 *
 * writeImageFile crops and resizes with sharp, which keeps only the first frame. A GIF is therefore
 * written as the exact bytes the API returned (preserveBytes) with a .gif extension. Over Naver's 20MB single-image
 * limit, or when the API did not return a GIF at all, it throws before anything reaches the disk — the file is never
 * quietly recoded to JPEG/PNG.
 */
import { assertGifSavable } from './animatedGifPolicy.js';
import { writeImageFile } from './imageUtils.js';

export async function writeAnimatedGifFile(
  buffer: Buffer,
  heading?: string,
  postTitle?: string,
  postId?: string,
): ReturnType<typeof writeImageFile> {
  assertGifSavable(buffer);
  return writeImageFile(buffer, 'gif', heading, postTitle, postId, { preserveBytes: true });
}
