import { it, expect } from 'vitest';
import { classifyPublishFailure } from '../automation/publishFailureClassifier';
import { AutomationError, classifyErrorMessage } from '../errors/AutomationError';
import { AccountExecutionGuardError, ACCOUNT_PAUSE_CODES } from '../automation/accountExecutionGuard';
it('keeps typed account stops ahead of misleading browser/timeout text',()=>{
 for(const code of ACCOUNT_PAUSE_CODES){
  const error=new AccountExecutionGuardError(code,'Protocol error: target closed timeout');
  expect(classifyPublishFailure(error)).toEqual({code,retryable:false,userActionRequired:true});
  const converted=AutomationError.fromError(error);expect(converted.code).toBe(code);expect(converted.retryable).toBe(false);expect(converted.userActionRequired).toBe(true);
  expect(classifyPublishFailure(converted)).toEqual({code,retryable:false,userActionRequired:true});
 }
});
it('recognizes Korean account protection before generic retryable messages',()=>{
 for(const text of ['계정 보호조치로 로그인 실패 timeout','보호 조치 해제가 필요합니다','비정상적인 활동으로 이용이 제한되었습니다']){
  expect(classifyPublishFailure(text)).toEqual({code:'ACCOUNT_PROTECTED',retryable:false,userActionRequired:true});
  expect(classifyErrorMessage(text)).toBe('ACCOUNT_PROTECTED');
 }
});
it('does not reclassify a busy account as retryable unknown',()=>{expect(classifyPublishFailure(new AccountExecutionGuardError('ACCOUNT_BUSY'))).toEqual({code:'ACCOUNT_BUSY',retryable:false,userActionRequired:false});});

it('preserves non-retryable stops after IPC string serialization', () => {
  for (const code of [...ACCOUNT_PAUSE_CODES, 'ACCOUNT_BUSY'] as const) {
    const message = new AccountExecutionGuardError(code).message;
    expect(classifyPublishFailure(message)).toMatchObject({ code, retryable: false });
  }
});
