import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createElectronTestProfile, closeElectronTestSession, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';
let app: ElectronApplication; let page: Page; let profile: ElectronTestProfile; let accountId: string;
test.beforeAll(async () => {
 profile=await createElectronTestProfile('bln-account-safety-e2e-');
 const root=path.join(__dirname,'..');const bootstrap=path.join(profile.root,'safety-main.cjs');
 await fs.writeFile(bootstrap, `
 const electron=require('electron');const root=${JSON.stringify(root)};
 electron.app.setAppPath(root);
 const req=require('node:module').createRequire(root+'/package.json');
 const guard=req(root+'/dist/automation/accountExecutionGuard.js').getAccountExecutionGuard();
 const journal=req(root+'/dist/automation/publicationCommitJournal.js').getPublicationCommitJournal();
 const sessions=req(root+'/dist/browserSessionManager.js').browserSessionManager;
 global.__safetyE2E={guard,journal,opened:0};
 sessions.openForUser=async()=>{global.__safetyE2E.opened++};
 sessions.verifyAccountForUser=async()=>({status:'ready'});
 sessions.resumeAccount=async id=>guard.resume(id,async()=>true);
 guard.pause('safety_fixture','ACCOUNT_PROTECTED');
 req(root+'/dist/main.js');
 `,'utf8');
 app=await electron.launch({args:[bootstrap],cwd:root,timeout:60000,env:{...process.env,...profile.env}});
 page=await waitForMainWindow(app);
 await page.waitForFunction(()=>typeof (window as any).api?.accountSafety==='function');
 accountId=await page.evaluate(async()=>{
  const result=await (window as any).api.addBlogAccount('안전성 검사','별명 호환 검사','safety_fixture','fixture-only',{});
  if(!result.success)throw Error('fixture account failed');return result.account.id;
 });
 // Exercise the production renderer observer and real preload/IPC with an isolated test card.
 await page.evaluate(id=>{
  const card=document.createElement('div');card.className='account-item';card.dataset.accountId=id;card.id='safety-e2e-card';
  card.style.cssText='position:fixed;left:10px;top:10px;z-index:2147483647;background:white;padding:10px';document.body.append(card);
 },accountId);
});
test.afterAll(async()=>{await closeElectronTestSession(app,profile);});
test('persistent stop, manual open/resume, and pending publication reach the real UI over IPC',async()=>{
 const card=page.locator('#safety-e2e-card');const status=card.locator('[role=status]');
 await expect(status).toContainText('보호조치');
 await expect(card.locator('button[data-action=confirm]').first()).toBeHidden();
 await card.getByRole('button',{name:'네이버에서 확인하기',exact:true}).click();
 await expect(status).toContainText('직접 로그인');
 expect(await app.evaluate(()=> (globalThis as any).__safetyE2E.opened)).toBe(1);
 let state=await page.evaluate(id=>(window as any).api.accountSafety(id,'status'),accountId);
 expect(state.state.paused).toBe(true);
 await card.getByRole('button',{name:'확인 후 재개',exact:true}).click();
 await expect(status).toContainText('확인 완료');
 await app.evaluate(()=>{(globalThis as any).__safetyE2E.journal.markSubmitting('safety_fixture','pending-e2e')});
 await card.getByRole('button',{name:'상태 확인',exact:true}).click();
 await expect(status).toContainText('이전 글의 발행 결과');
 await card.getByRole('button',{name:'확인 후 재개',exact:true}).click();
 state=await page.evaluate(id=>(window as any).api.accountSafety(id,'status'),accountId);
 expect(state.state.code).toBe('PUBLISH_OUTCOME_UNKNOWN');
 page.once('dialog',dialog=>void dialog.accept());
 await card.getByRole('button',{name:'발행됨 확인',exact:true}).click();
 await expect(status).toContainText('발행 결과를 기록');
 state=await page.evaluate(id=>(window as any).api.accountSafety(id,'status'),accountId);
 expect(state.state.paused).toBe(false);
 await expect(card.locator('button[data-action=confirm]').first()).toBeHidden();
 expect(await app.evaluate(()=> (globalThis as any).__safetyE2E.journal.getConfirmed('safety_fixture','pending-e2e'))).toEqual({confirmed:true});
 await page.screenshot({path:path.join(__dirname,'..','tmp','account-safety-e2e.png')});
});
