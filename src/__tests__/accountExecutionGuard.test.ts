import { afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountExecutionGuard } from '../automation/accountExecutionGuard';
const roots: string[]=[];
const setup=()=>{const storageDir=mkdtempSync(join(tmpdir(),'account-guard-'));roots.push(storageDir);return {storageDir,guard:new AccountExecutionGuard({storageDir})};};
afterEach(()=>{for(const path of roots.splice(0))rmSync(path,{recursive:true,force:true});});
it('persists a hashed, credential-free pause across restarts and keeps accounts separate',()=>{
 const {storageDir,guard}=setup();guard.pause('account-private','ACCOUNT_PROTECTED');
 const file=readdirSync(storageDir)[0];expect(file).toMatch(/^[a-f0-9]{64}\.json$/);expect(readFileSync(join(storageDir,file),'utf8')).not.toContain('account-private');
 const restored=new AccountExecutionGuard({storageDir});expect(()=>restored.assertAllowed('account-private')).toThrow(expect.objectContaining({code:'ACCOUNT_PROTECTED',retryable:false,userActionRequired:true}));expect(()=>restored.assertAllowed('another')).not.toThrow();
});
it('fails closed for invalid state and failed writes',()=>{
 const {storageDir,guard}=setup();guard.pause('one','LOGIN_REQUIRED');writeFileSync(join(storageDir,readdirSync(storageDir)[0]),'{bad');
 expect(new AccountExecutionGuard({storageDir}).getStatus('one')).toMatchObject({paused:true,storageError:true});
 const blocker=join(storageDir,'file');writeFileSync(blocker,'x');const broken=new AccountExecutionGuard({storageDir:blocker});expect(()=>broken.pause('two','LOGIN_CHALLENGE')).toThrow();expect(()=>broken.assertAllowed('two')).toThrow();
});
it('requires successful verification and preserves newer pause when verification returns late',async()=>{
 const {guard,storageDir}=setup();guard.pause('one','LOGIN_REQUIRED');expect(await guard.resume('one',async()=>false)).toBe(false);expect(await guard.resume('one',async()=>{throw Error('secret');})).toBe(false);
 let release!:(v:boolean)=>void;const waiting=guard.resume('one',()=>new Promise(resolve=>{release=resolve;}));guard.pause('one','ACCOUNT_PROTECTED');release(true);expect(await waiting).toBe(false);expect(guard.getStatus('one').code).toBe('ACCOUNT_PROTECTED');
 expect(await guard.resume('one',async()=>true)).toBe(true);expect(new AccountExecutionGuard({storageDir}).getStatus('one').paused).toBe(false);
});
it('rejects same-account concurrency, allows other accounts, and releases after errors',async()=>{
 const {guard}=setup();let release!:()=>void;const running=guard.runExclusive('one',()=>new Promise<void>(resolve=>{release=resolve;}));expect(guard.getStatus('one').busy).toBe(true);
 await expect(guard.runExclusive('one',async()=>1)).rejects.toMatchObject({code:'ACCOUNT_BUSY',retryable:false});expect(await guard.runExclusive('two',async()=>2)).toBe(2);expect(await guard.resume('one',async()=>true)).toBe(false);
 release();await running;await expect(guard.runExclusive('one',async()=>{throw Error('failed');})).rejects.toThrow('failed');expect(guard.getStatus('one').busy).toBe(false);
 guard.pause('one','PUBLISH_OUTCOME_UNKNOWN');const operation=vi.fn();await expect(guard.runExclusive('one',operation)).rejects.toMatchObject({code:'PUBLISH_OUTCOME_UNKNOWN'});expect(operation).not.toHaveBeenCalled();
});
it('rejects blank identity without creating ambiguous shared state',()=>{const {guard}=setup();expect(()=>guard.getStatus(' ')).toThrow();});

it('never releases uncertain publication through ordinary login verification',async()=>{const {guard}=setup();guard.pause('one','PUBLISH_OUTCOME_UNKNOWN');const verify=vi.fn(async()=>true);expect(await guard.resume('one',verify)).toBe(false);expect(verify).not.toHaveBeenCalled();expect(await guard.resumeAfterOutcomeConfirmation('one',verify)).toBe(true);});

it('serializes explicit user login with publishing while preserving a paused state', async () => {
 const {guard}=setup(); guard.pause('one','ACCOUNT_PROTECTED');
 let release!:()=>void;
 const opening=guard.runUserActionExclusive('ONE',()=>new Promise<void>(r=>{release=r;}));
 expect(guard.getStatus('one').busy).toBe(true);
 await expect(guard.runUserActionExclusive('one',async()=>{})).rejects.toMatchObject({code:'ACCOUNT_BUSY'});
 expect(await guard.resume('one',async()=>true)).toBe(false);
 release(); await opening;
 expect(guard.getStatus('one')).toMatchObject({paused:true,code:'ACCOUNT_PROTECTED',busy:false});
 await guard.resume('one',async()=>true);
 const openingReady=guard.runUserActionExclusive('one',()=>new Promise<void>(r=>{release=r;}));
 await expect(guard.runExclusive('one',async()=>1)).rejects.toMatchObject({code:'ACCOUNT_BUSY'});
 release();await openingReady;
 await expect(guard.runUserActionExclusive('one',async()=>{throw Error('closed');})).rejects.toThrow('closed');
 expect(guard.getStatus('one').busy).toBe(false);
});
