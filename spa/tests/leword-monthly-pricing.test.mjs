import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function load(path, hooks) {
 const url = new URL(path, import.meta.url);
 const code = ts.transpileModule(fs.readFileSync(url,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
 const output={exports:{}};
 new Function('require','module','exports',code)((id)=>{
  if(id==='react'&&hooks)return hooks;
  if(id.endsWith('/siteOps'))return {fetchSiteContent:()=>Promise.resolve(null)};
  if(id==='./StoreStyles')return {default:()=>null};
  if(id.startsWith('.')){for(const ext of ['','.tsx','.ts']){const resolved=new URL(id+ext,url);if(fs.existsSync(resolved)&&fs.statSync(resolved).isFile())return load(resolved);}}
  return require(id);
 },output,output.exports);
 return output.exports;
}
const catalog=load('../src/lib/productCatalog.ts');
const product=id=>catalog.PRODUCTS.find(p=>p.id===id);
test('LEWORD monthly is 19,900 including VAT while other published prices remain unchanged',()=>{
 assert.deepEqual(product('leword').prices,{monthly:19900,yearly:150000,lifetime:750000});
 assert.equal(catalog.productCardAmount(product('leword'),'monthly'),19900);
 assert.equal(catalog.productCardAmount(product('leword'),'yearly'),165000);
 assert.equal(catalog.productCardAmount(product('leword'),'lifetime'),825000);
 assert.equal(catalog.productCardAmount(product('naver'),'monthly'),31900);
 assert.equal(catalog.productCardAmount(product('all'),'monthly'),55000);
});
test('mixed checkout charges VAT per product without adding VAT twice to LEWORD monthly',()=>{
 const total=['leword','naver','orbit'].reduce((sum,id)=>sum+catalog.productCardAmount(product(id),'monthly'),0);
 assert.equal(total,94700);
 const patched=catalog.applyStoreOverrides({leword:{prices:{monthly:25000,yearly:150000,lifetime:750000}}});
 assert.equal(catalog.productCardAmount(patched.find(p=>p.id==='leword'),'monthly'),25000);
});
function render(cart=[],payOpen=false,term='monthly'){
 let index=0;const effects=[];
 const hooks={...React,useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useState:initial=>{const i=index++;return [i===0?term:i===1?cart:i===3?payOpen:typeof initial==='function'?initial():initial,()=>{}];}};
 const Store=load('../src/components/store/ProductStore.tsx',hooks).default;
 let pick;const html=renderToStaticMarkup(React.createElement(Store,{onPick:p=>{pick=p;}}));
 for(const effect of effects)effect();
 return {html,pick};
}
test('store passes the actual card amount and explains automatic card versus manual bank renewal',()=>{
 const {html,pick}=render(['leword','naver'],true);
 assert.equal(pick.amount,48900);assert.equal(pick.amountCard,51800);
 assert.match(html,/19,900/);assert.match(html,/부가세 포함/);
 assert.match(html,/30일마다 자동결제/);assert.match(html,/자동출금 없음/);assert.match(html,/수동 갱신/);
 assert.match(html,/51,800/);
});
test('LEWORD monthly primary price remains monthly instead of only a daily equivalent',()=>{
 const {html}=render();
 const leword=html.slice(html.indexOf('<h3><span aria-hidden="true" style="color:#f0b53f">'));
 assert.match(leword,/<b>19,900<\/b><i>원 \/ 월<\/i>/);
});

test('LEWORD monthly is an independent cart selection in both directions',()=>{
 let index=0;const states=[];
 const hooks={...React,useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const at=index++;if(!(at in states))states[at]=typeof initial==='function'?initial():initial;return [states[at],next=>{states[at]=typeof next==='function'?next(states[at]):next;}];}};
 const Store=load('../src/components/store/ProductStore.tsx',hooks).default;
 const buttons=()=>{index=0;const list=[];const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='button'&&String(node.props.className).startsWith('st-buy'))list.push(node);React.Children.forEach(node.props?.children,walk);};walk(Store({}));return list;};
 buttons()[1].props.onClick();assert.deepEqual(states[1],['naver']);
 buttons()[3].props.onClick();assert.deepEqual(states[1],['leword']);
 buttons()[1].props.onClick();assert.deepEqual(states[1],['naver']);
});
test('monthly subscription checkout requires explicit consent before immediate recurring card charge',()=>{
 const {html}=render(['leword'],true);
 assert.match(html,/type="checkbox"/);assert.match(html,/첫 결제는 즉시/);
 assert.match(html,/href="\/lookup"/);assert.match(html,/19,900원/);
 assert.match(html,/class="st-pay-opt" disabled=""/);
});

test('bank transfer LEWORD order shows 19,900 including VAT and explicitly requires manual renewal',()=>{
 const hooks={...React,useEffect:()=>{},useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial})};
 const Bank=load('../src/pages/BankOrderPage.tsx',hooks).default;
 const {MemoryRouter}=require('react-router-dom');
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:['/bank-order?items=leword&term=monthly']},React.createElement(Bank)));
 assert.match(html,/19,900/);assert.match(html,/합계 \(부가세 포함\)/);
 assert.match(html,/30일 이용 후 수동 갱신/);assert.match(html,/자동출금되지 않습니다/);
});

test('card callback cannot run without recurring consent and accepts it after checking',()=>{
 for(const consent of [false,true]){
  let index=0;let paid=0;
  const hooks={...React,useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const at=index++;return [at===1?['leword']:at===3?true:at===4?'member@example.com':at===6?consent:typeof initial==='function'?initial():initial,()=>{}];}};
  const Store=load('../src/components/store/ProductStore.tsx',hooks).default;
  let card;const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='button'&&node.props.className==='st-pay-opt')card=node;React.Children.forEach(node.props?.children,walk);};
  walk(Store({onCardPay:()=>paid++}));card.props.onClick();assert.equal(paid,consent?1:0);
 }
});
test('unchanged cart does not notify the parent on every render',()=>{
 let index=0;const slots=[];let pending=[];let calls=0;
 const changed=(left,right)=>!left||left.length!==right.length||left.some((item,i)=>!Object.is(item,right[i]));
 const hooks={...React,useState:initial=>{const at=index++;if(!(at in slots))slots[at]=typeof initial==='function'?initial():initial;return [slots[at],()=>{}];},useMemo:(fn,deps)=>{const at=index++;if(!slots[at]||changed(slots[at].deps,deps))slots[at]={deps,value:fn()};return slots[at].value;},useEffect:(fn,deps)=>{const at=index++;if(!slots[at]||changed(slots[at].deps,deps)){slots[at]={deps};pending.push(fn);}}};
 const Store=load('../src/components/store/ProductStore.tsx',hooks).default;
 const onPick=()=>calls++;
 for(let i=0;i<3;i++){index=0;pending=[];Store({onPick});for(const effect of pending)effect();}
 assert.equal(calls,1);
});
