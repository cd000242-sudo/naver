import { startSpawnSession, type SpawnSession } from './spawnHelper.js';
import { buildCodexSubscriptionEnv } from './subscriptionEnv.js';
import { cleanAccountLabel, parseCodexQuota, quotaRecord, type AgentOfficialQuota } from './officialQuotaFormat.js';

/** Read-only app-server RPC. No threads, prompts, tools or generation requests. */
export async function readCodexOfficialQuota(cwd: string): Promise<AgentOfficialQuota> {
  const base = { provider:'codex' as const, checkedAt:Date.now(), windows:[] };
  let session: SpawnSession | undefined;
  let buffered = '';
  let account: string | undefined;
  let plan: string | undefined;
  let firstAccount = '';
  let windows: AgentOfficialQuota['windows'] = [];
  let completed = false;
  let finish!: (result: AgentOfficialQuota) => void;
  const result = new Promise<AgentOfficialQuota>(resolve => { finish = resolve; });
  const done = (state: AgentOfficialQuota['state'], message?: string) => {
    if (completed) return;
    completed = true;
    finish({ ...base, state, account, plan, windows:state==='ready'?windows:[], checkedAt:Date.now(), message });
    session?.cancel();
  };
  const send = async (id:number, method:string, params?:unknown) => {
    const outcome = await session?.writeLine(JSON.stringify({id,method,...(params === undefined?{}:{params})}));
    if (outcome !== 'accepted') done('unavailable','Codex 조회 연결을 확인하지 못했습니다.');
  };
  const receive = async (raw:unknown) => {
    const message = quotaRecord(raw);
    if (![1,2,3,4].includes(Number(message.id))) return;
    if (message.error) { done('unavailable','Codex 공식 사용량 조회에 실패했습니다. 로그인과 연결 상태를 확인해 주세요.'); return; }
    const payload = quotaRecord(message.result);
    if (message.id === 1) {
      await session?.writeLine(JSON.stringify({method:'initialized'}));
      await send(2,'account/read',{refreshToken:false});
    } else if (message.id === 2) {
      const identity = quotaRecord(payload.account);
      if (!identity.type) { done('not_logged_in','Codex 로그인이 필요합니다.'); return; }
      if (identity.type !== 'chatgpt') { done('unsupported','API 키 로그인은 ChatGPT 구독 할당량 조회를 지원하지 않습니다.'); return; }
      account = cleanAccountLabel(identity.email); plan = cleanAccountLabel(identity.planType);
      firstAccount = JSON.stringify([identity.email,identity.planType,identity.id]);
      await send(3,'account/rateLimits/read');
    } else if (message.id === 3) {
      windows = parseCodexQuota(payload);
      await send(4,'account/read',{refreshToken:false});
    } else {
      const identity = quotaRecord(payload.account);
      if (firstAccount !== JSON.stringify([identity.email,identity.planType,identity.id])) {
        account = undefined; plan = undefined; done('account_changed','조회 중 계정이 바뀌었습니다. 다시 조회해 주세요.');
      } else done(windows.length ? 'ready':'unavailable', windows.length ? undefined:'공식 응답에 잔여량이 없습니다.');
    }
  };
  let queue = Promise.resolve();
  try {
    session = startSpawnSession({command:'codex',args:['app-server'],provider:'codex',cwd,
      env:buildCodexSubscriptionEnv(),timeoutMs:20000,maxOutputBytes:1024*1024,
      onStdoutChunk(chunk) {
        buffered += chunk;
        if (buffered.length > 1024*1024) { done('unavailable','Codex 조회 응답이 너무 큽니다.'); return; }
        const lines = buffered.split('\n'); buffered = lines.pop() || '';
        for (const line of lines) {
          let parsed:unknown; try { parsed=JSON.parse(line); } catch { continue; }
          queue = queue.then(()=>receive(parsed)).catch(()=>done('unavailable','Codex 조회 연결이 종료되었습니다.'));
        }
      },
    });
    void session.result.then(()=>done('unavailable','Codex 조회 연결이 종료되었습니다.'),()=>done('unavailable','Codex 조회 시간이 초과되었거나 CLI를 실행하지 못했습니다.'));
    await send(1,'initialize',{clientInfo:{name:'better-life-naver-quota',version:'1.0.0'}});
    return await result;
  } finally { session?.cancel(); }
}
