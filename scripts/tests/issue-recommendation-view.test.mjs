import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIssueRelation, classifyIssuePublication } from '../../spa/src/lib/issueRecommendationGate.mjs';
test('legacy snapshots cannot revive unrelated issue candidates', () => {
  assert.equal(inspectIssueRelation('오늘의 운세', '오늘의 월드뉴스').related, false);
  assert.equal(inspectIssueRelation('리리아 3.5', '리리아나 보넷').related, false);
  assert.equal(inspectIssueRelation('리리아 3.5', '리리아3.5 설치').related, true);
});
test('unmeasured demand is observation, never a recommendation', () => {
  assert.equal(classifyIssuePublication({keyword:'리리아3.5 설치',issue:'리리아 3.5',hasLiveDemand:false}).status, 'observe');
});
