import { describe, expect, it } from 'vitest';
import { evaluate, type EvaluationInput } from '../content/qualityEvaluator';

const seoBody = `
The key answer is that a support fund account error should be checked in this order: account holder, account number, bank app status, and returned deposit history.
For readers who only need the conclusion, the fastest path is to compare the application page with the bank app before submitting the same form again.

I compared 12 recent account-error cases and the pattern was consistent.
In 8 cases the problem was a name mismatch, in 3 cases the account number had one wrong digit, and in 1 case the deposit was returned after 4 days.
The official application page and the bank app must show the same account holder name, because even a small spacing difference can delay the payment.

Account error check table:
item | what to check | next action
account holder | same name on both screens | correct the saved account
account number | no missing digit | copy again from the bank app
returned deposit | return after 3-5 days | contact the support desk
document status | submitted or missing | upload the missing file first

The exception is simple.
If the support fund account error appears after the payment date, do not submit a new application immediately.
First check whether the money was returned, because duplicate submission can make the review longer.

Compared with a general application delay, an account error leaves a clearer trail.
The bank app shows whether the account is active, while the application page shows whether the submitted holder name is accepted.
That difference is useful because the user can identify the exact correction point instead of guessing.

Checklist before reapplying:
1. Check the account holder name in the bank app.
2. Compare the account number with the application page.
3. Look for a returned deposit notice after 3 days.
4. Confirm whether any document is marked missing.
5. Save a screenshot before contacting the support desk.

FAQ
Q. What should be checked first for a support fund account error?
A. The account holder name should be checked first, because most payment blocks start when the application name and bank name do not match.

Q. Can the user apply again right away?
A. Reapplying is not the first step. The safer order is to check the returned deposit and correct the account information first.

Q. When does the user need support-center help?
A. The user should ask for help when the bank app is correct but the application page still rejects the account after one correction.
`.trim();

const homefeedBody = `
Honestly, I thought this was just another small form mistake.
But when I watched one application get delayed for 4 days because of one account-name spacing issue, it felt very different.
That is the moment most people miss.

I checked 12 cases and the frustrating part was not the system itself.
The real problem was that the user could not tell whether the account number, the holder name, or the returned deposit was blocking the payment.
It is a tiny detail, but it makes people open the same page again and again.

The useful clue was simple.
When the bank app and the application page showed the same holder name, the case moved forward faster.
When even one digit or one spacing mark was different, the page looked normal but the deposit still came back.

Here is the quick check I would save for later.
- bank app holder name
- account number copied from the bank app
- returned deposit notice after 3 days
- missing document status
- support desk message before applying again

This is why I would not rush to submit the same form twice.
First, I would fix the account information and wait for the return trail.
Then I would contact the support desk with a screenshot, because that gives the user one clear story instead of a guess.

Have you ever had a payment delayed even though the screen looked complete?
That small mismatch is exactly the kind of thing worth checking before the next application.
`.trim();

const mateBody = `
Support fund account errors are usually caused by a mismatch between the application account and the real bank account.
The first answer is simple: check the account holder name, account number, returned deposit, and missing-document status before applying again.

Account error decision table:
criterion | meaning | action
holder name mismatch | payment can be blocked | correct the saved account
wrong digit | deposit may return | copy from the bank app again
returned deposit | the payment already failed | wait for the return notice
missing document | the account may not be the only issue | upload the document first

The most important criterion is the holder name.
If the application page and bank app show different names, the payment can fail even when the account number looks correct.

The second criterion is the returned deposit record.
If the payment has already returned after 3 to 5 days, the user should correct the account before submitting the same request again.

The practical exception is duplicate submission.
Submitting again before checking the returned deposit can make the review harder to track.

FAQ
Q. What is the first thing to check?
A. The first thing to check is whether the account holder name on the application page matches the bank app.

Q. What if the account looks correct?
A. If the account looks correct, the user should check returned deposit history and missing-document status.

Q. What is the safest next action?
A. The safest next action is to correct the account, save a screenshot, and contact the support desk only if the rejection remains.
`.trim();

const accountEvidence = `
This is a first-party review of 12 recent support fund account error cases.
In 8 cases the account holder name did not match, in 3 cases the account number had one wrong digit, and in 1 case the deposit returned after 4 days.
The official application page and the bank app should show the same holder name.
A returned deposit may appear after 3-5 days, and the review found a returned-deposit notice after 3 days in the relevant case.
The source recommends checking the holder name, account number, returned deposit, and missing-document status before submitting again.
Duplicate submission can make the review harder to track, while a screenshot helps the support desk inspect the remaining rejection.
`.trim();

const run = (input: EvaluationInput) => evaluate(input);

describe('90-point golden quality targets', () => {
  it('SEO mode rewards answer-first evidence-rich durable content above 90', () => {
    const result = run({
      mode: 'seo',
      contentMode: 'seo',
      title: 'Support fund account error: holder name and returned deposit checks',
      primaryKeyword: 'support fund account error',
      secondaryKeywords: ['account holder mismatch', 'returned deposit', 'missing document'],
      headings: [
        { title: 'Check the account holder name first' },
        { title: 'Compare returned deposit and missing document status' },
        { title: 'Use the checklist before reapplying' },
        { title: 'FAQ about support fund account error' },
      ],
      body: seoBody,
      rawText: accountEvidence,
      groundingText: accountEvidence,
      firstPartyEvidenceAvailable: true,
    });

    expect(result.modeScore.score).toBeGreaterThanOrEqual(90);
    expect(result.finalScore).toBeGreaterThanOrEqual(90);
    expect(result.decision).toBe('pass');
  });

  it('Homefeed mode rewards human continuity and stop-scroll readability above 90', () => {
    const result = run({
      mode: 'homefeed',
      contentMode: 'homefeed',
      title: 'Support fund account error: check the holder name first',
      primaryKeyword: 'support fund account error',
      headings: [
        { title: 'The small mismatch most people miss' },
        { title: 'Why the deposit comes back even when the page looks complete' },
        { title: 'The quick check I would save before reapplying' },
      ],
      body: homefeedBody.replace(
        'Honestly, I thought this was just another small form mistake.',
        'Honestly, I thought this support fund account error was just another small form mistake. The useful check is the account holder name.',
      ),
      rawText: accountEvidence,
      groundingText: accountEvidence,
      firstPartyEvidenceAvailable: true,
    });

    expect(result.modeScore.score).toBeGreaterThanOrEqual(90);
    expect(result.humanlikeScore.score).toBeGreaterThanOrEqual(90);
    expect(result.finalScore).toBeGreaterThanOrEqual(90);
    expect(result.decision).toBe('pass');
  });

  it('Mate mode rewards citeable answer atoms and decision tables above 90', () => {
    const result = run({
      mode: 'mate',
      contentMode: 'mate',
      title: 'Support fund account error decision criteria and safe next action',
      primaryKeyword: 'support fund account error',
      headings: [
        { title: 'The first answer is holder-name matching' },
        { title: 'Returned deposit changes the next action' },
        { title: 'FAQ with safe decision criteria' },
      ],
      body: mateBody,
      rawText: accountEvidence,
      groundingText: accountEvidence,
    });

    expect(result.modeScore.score).toBeGreaterThanOrEqual(90);
    expect(result.finalScore).toBeGreaterThanOrEqual(90);
    expect(result.decision).toBe('pass');
  });
});
