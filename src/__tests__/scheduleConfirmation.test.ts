import { expect, it, vi } from 'vitest';
import { waitForScheduleConfirmation } from '../automation/scheduleConfirmation';
const ready = { url:'https://blog.naver.com/PostWriteForm.naver?blogId=one', notices:['예약 발행이 완료되었습니다.'] };
it('requires a new explicit reservation completion notification', async () => {
 const read=vi.fn().mockResolvedValueOnce({...ready,notices:[]}).mockResolvedValue(ready);
 await expect(waitForScheduleConfirmation(read,[],async()=>{})).resolves.toBeUndefined();
 expect(read).toHaveBeenCalledTimes(2);
});
it.each([
 {...ready,notices:[]},
 {...ready,notices:['예약발행']},
 {...ready,notices:['예약 발행이 완료되지 않았습니다.']},
 {...ready,url:'https://blog.naver.com.attacker.test/'},
 {...ready,notices:['예약 발행이 완료되었습니다.','발행 실패']},
])('never treats a click, unchanged page, foreign URL or rejection as confirmation', async value => {
 const read=vi.fn().mockResolvedValue(value);
 await expect(waitForScheduleConfirmation(read,[],async()=>{})).rejects.toMatchObject({code:'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN'});
 // [2026-10-08] The wait grew from ~6s to ~30s (Naver closes the editor late); still bounded.
 expect(read.mock.calls.length).toBeLessThanOrEqual(61);
});
it('does not reuse stale success text from before the click', async () => {
 await expect(waitForScheduleConfirmation(async()=>ready,ready.notices,async()=>{})).rejects.toThrow('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN');
});
it('a lost browser response keeps publication unknown', async () => {
 await expect(waitForScheduleConfirmation(async()=>{throw Error('target closed');},[],async()=>{})).rejects.toMatchObject({code:'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN'});
});
