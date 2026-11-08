import type { RichBlock } from './communityRich.mjs';

/** Anything with the few DOM members the reader uses (a real Node, or a plain object tree in tests). */
export type DomLike = {
    nodeType: number;
    nodeName: string;
    nodeValue?: string | null;
    childNodes: ArrayLike<DomLike>;
    getAttribute?: (name: string) => string | null;
};

export function domToBlocks(root: DomLike): RichBlock[];

type NodeFactory = {
    createElement: (name: string) => any;
    createTextNode: (text: string) => any;
};
export function blocksToDom(blocks: readonly RichBlock[] | null | undefined, doc: NodeFactory, options?: { imageSrc?: (id: string) => string | undefined }): any[];
