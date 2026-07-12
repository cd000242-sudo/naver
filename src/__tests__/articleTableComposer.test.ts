// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPendingArticleTablesToGeneratedContent,
  clearPendingArticleTables,
  initArticleTableComposer,
  queueArticleTableForNextGeneratedPost,
  readPendingArticleTables,
} from '../renderer/modules/articleTableComposer';
import type { ArticleTable } from '../renderer/utils/articleTableUtils';

const table: ArticleTable = {
  id: 'manual-cost-table',
  title: 'Cost comparison',
  cells: [
    ['Plan', 'Monthly cost'],
    ['Basic', '10,000'],
    ['Premium', '20,000'],
  ],
  createdAt: 1,
};

describe('article table composer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    clearPendingArticleTables();
  });

  it('queues tables for exactly the next generated article and consumes them atomically', () => {
    queueArticleTableForNextGeneratedPost(table);
    expect(readPendingArticleTables()).toHaveLength(1);

    const result = applyPendingArticleTablesToGeneratedContent({
      bodyPlain: '## Cost guide\nCompare the monthly cost before choosing.',
      headings: [{ title: 'Cost guide', content: 'Compare the monthly cost before choosing.' }],
    });

    expect(result.bodyPlain).toContain('| Plan | Monthly cost |');
    expect(result.headings[0].content).toContain('| Basic | 10,000 |');
    expect(readPendingArticleTables()).toHaveLength(0);
  });

  it('injects one shared launcher into semi-auto, full-auto, continuous, and multi-account surfaces', () => {
    document.body.innerHTML = [
      '<div><textarea id="unified-generated-content"></textarea></div>',
      '<div><button id="full-auto-publish-btn"></button></div>',
      '<div><button id="continuous-open-settings-modal-btn"></button></div>',
      '<div id="multi-account-visible-actions"><button id="ma-start-publish-btn"></button></div>',
    ].join('');

    initArticleTableComposer();

    expect(document.getElementById('article-table-composer-modal')).not.toBeNull();
    expect(document.querySelector('[data-article-table-surface="semi-auto"]')).not.toBeNull();
    expect(document.querySelector('[data-article-table-surface="full-auto"]')).not.toBeNull();
    expect(document.querySelector('[data-article-table-surface="continuous"]')).not.toBeNull();
    const multiAccountLauncher = document.querySelector('[data-article-table-surface="multi-account"]');
    expect(multiAccountLauncher).not.toBeNull();
    expect(multiAccountLauncher?.parentElement?.nextElementSibling?.id).toBe('ma-start-publish-btn');
  });
});
