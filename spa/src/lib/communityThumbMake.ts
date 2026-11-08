/**
 * The thumbnail that goes with a post (forum contract 1115 section A): made from the FIRST picture of a rich post.
 * A new post: from the picture the writer just attached. An edit: nothing when the first picture is unchanged and a
 * thumbnail is already stored (the server keeps it); otherwise made from the new first picture, which may be an old
 * one that is read back from the server. Returns undefined whenever no thumbnail should be sent.
 */
import type { UploadImage } from './communityApi';
import type { PostItem } from './communityData';
import { THUMB_ID, planThumb } from './communityThumb.mjs';
import { encodeThumbFromSource } from './communityThumbEncode';
import { fetchPostImage } from './communityPostImage';
import type { RichBlock } from './communityRich.mjs';

type Input = { blocks: RichBlock[]; images: UploadImage[]; editing?: PostItem };

export async function buildThumb({ blocks, images, editing }: Input): Promise<string | undefined> {
    const plan = planThumb({
        blocks,
        attachedIds: images.map((image) => image.id),
        editingPostId: editing?.id ?? '',
        originalFirstId: editing?.imageIds[0] ?? '',
        hadThumb: editing?.thumbId === THUMB_ID,
    });
    if (plan.action === 'none') return undefined;
    if (plan.action === 'attached') {
        const picture = images.find((image) => image.id === plan.id);
        return picture ? encodeThumbFromSource(`data:${picture.mime};base64,${picture.data}`) : undefined;
    }
    // An old picture of the post being edited: it is read back (usually from memory, the editor just showed it).
    if (!editing) return undefined;
    const read = await fetchPostImage(editing.id, plan.id);
    return read.ok ? encodeThumbFromSource(read.src) : undefined;
}
