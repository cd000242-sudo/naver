/** Normalize and upsert extension drafts without invoking generation or publication. */
export function prepareLdbDrafts(incoming: any[], existing: any[] = []): { posts: any[]; drafts: any[] } {
  if (!Array.isArray(incoming) || !incoming.length || incoming.length > 30) throw new Error('전달할 원고가 없습니다.');
  const drafts = incoming.map((post) => {
    if (!post || !/^ldb_[\p{L}\p{N}_.-]{1,120}$/u.test(post.id || '')
      || typeof post.title !== 'string' || !post.title.trim()
      || typeof post.content !== 'string' || !post.content.trim()
      || post.isPublished === true || post.publishMode !== 'draft') throw new Error('올바른 확장 원고가 아닙니다.');
    const previous = existing.find((value) => value.id === post.id);
    if (previous?.isPublished || previous?.publishedUrl) throw new Error('이미 발행한 원고에는 덮어쓸 수 없습니다.');
    const headings = (Array.isArray(post.headings) ? post.headings : []).map((heading: any) => ({
      title: String(heading?.title || '').trim(), content: String(heading?.content || ''),
    }));
    if (headings.some((heading: any) => !heading.title) || new Set(headings.map((heading: any) => heading.title)).size !== headings.length) {
      throw new Error('소제목이 비어 있거나 중복됩니다. 소제목을 구분한 뒤 다시 보내주세요.');
    }
    if (post.images !== undefined && !Array.isArray(post.images)) throw new Error('이미지 목록이 올바르지 않습니다.');
    const images = (post.images || []).map((image: any) => {
      const source = image?.previewDataUrl || image?.filePath;
      if (typeof source !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/u.test(source)) {
        throw new Error('실제 이미지 데이터가 필요합니다.');
      }
      const isThumbnail = image.isThumbnail === true || ['썸네일', '🖼️ 썸네일', 'thumbnail'].includes(image.heading);
      const headingIndex = headings.findIndex((heading: any) => heading.title === image.heading);
      if (!isThumbnail && headingIndex < 0) throw new Error('이미지에 맞는 소제목을 찾지 못했습니다.');
      return {
        heading: isThumbnail ? '🖼️ 썸네일' : headings[headingIndex].title,
        ...(isThumbnail ? { isThumbnail: true } : { headingIndex }),
        filePath: image.savedToLocal === true ? image.filePath : source, previewDataUrl: source, url: source,
        provider: 'ldb-image-ultra', savedToLocal: image.savedToLocal === true,
      };
    });
    const firstHeading = headings[0]?.title;
    const firstHeadingLine = firstHeading ? post.content.split('\n').findIndex((line: string) => line.includes(firstHeading)) : -1;
    const introduction = headings.length === 0 ? post.content
      : firstHeadingLine > 0 ? post.content.split('\n').slice(0, firstHeadingLine).join('\n').trim() : post.title;
    const structuredContent = {
      _postId: post.id, _source: 'ldb-bridge', _preferBodyPlain: true,
      selectedTitle: post.title, title: post.title, bodyPlain: post.content, content: post.content,
      headings, hashtags: Array.isArray(post.hashtags) ? post.hashtags : [], introduction,
    };
    return {
      ...previous, id: post.id, title: post.title, content: post.content,
      headings, hashtags: structuredContent.hashtags, structuredContent,
      images, imageCount: images.length, isPublished: false, publishMode: 'draft', contentMode: 'custom',
      createdAt: previous?.createdAt || post.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  });
  const draftIds = new Set(drafts.map((post) => post.id));
  if (draftIds.size !== drafts.length) throw new Error('중복된 원고 ID입니다.');
  const persistent = drafts.map((post) => ({ ...post, images: post.images.map(({ previewDataUrl, url, ...image }: any) => image) }));
  return { drafts, posts: [...persistent, ...existing.filter((post) => !draftIds.has(post.id))].slice(0, 100) };
}

export interface LdbDraftReceiverDeps {
  read: () => any[];
  write: (posts: any[]) => void;
  display: (post: any) => Promise<void> | void;
}

/** Serialize deliveries so two clicks cannot interleave article/image state. */
export function createLdbDraftReceiver(deps: LdbDraftReceiverDeps): (posts: any[]) => Promise<number> {
  let tail: Promise<unknown> = Promise.resolve();
  return (incoming) => {
    const next = tail.then(async () => {
      const { posts, drafts } = prepareLdbDrafts(incoming, deps.read());
      deps.write(posts);
      await deps.display(drafts[0]);
      return drafts.length;
    });
    tail = next.catch(() => undefined);
    return next;
  };
}
