const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/ProductsPage-DJlGdC4z.js","assets/router-BCNeJdl_.js","assets/ZoomableImage-DQiVDARe.js","assets/DetailPage-CLYURiup.js","assets/LewordDetailPage-CvvV3RwK.js","assets/LewordPage-Br8wT_tP.js","assets/OrbitPage-v4Ex5bw9.js","assets/PricingPage-BvALJe7u.js","assets/pricingSchedule-D-ZZfyYx.js","assets/DownloadPage-CkeWGwAF.js","assets/ChatbotsPage-DWEX3hmZ.js","assets/ReviewsPage-DHCEu79A.js","assets/privacy-CSCQpxLw.js","assets/CommunityPage-DIwSw6Ps.js","assets/LookupPage-BUQz9D1h.js","assets/RefundPage-Cw2HDTkP.js","assets/LegalLayout-WfVqpyZp.js","assets/TermsPage-B1usqYkS.js","assets/PrivacyPage-D4vdaV5m.js","assets/BankOrderPage-DDpPKwaf.js","assets/NotFoundPage-DPEAqIBu.js"])))=>i.map(i=>d[i]);
import{c,r as Ne,u as M,N as Y,L as R,O as $e,b as Oe,a as x,R as Me,B as De}from"./router-BCNeJdl_.js";(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const p of i.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&a(p)}).observe(document,{childList:!0,subtree:!0});function n(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(o){if(o.ep)return;o.ep=!0;const i=n(o);fetch(o.href,i)}})();var we={exports:{}},D={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Ue=c,Fe=Symbol.for("react.element"),We=Symbol.for("react.fragment"),Ve=Object.prototype.hasOwnProperty,qe=Ue.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,Be={key:!0,ref:!0,__self:!0,__source:!0};function ve(t,r,n){var a,o={},i=null,p=null;n!==void 0&&(i=""+n),r.key!==void 0&&(i=""+r.key),r.ref!==void 0&&(p=r.ref);for(a in r)Ve.call(r,a)&&!Be.hasOwnProperty(a)&&(o[a]=r[a]);if(t&&t.defaultProps)for(a in r=t.defaultProps,r)o[a]===void 0&&(o[a]=r[a]);return{$$typeof:Fe,type:t,key:i,ref:p,props:o,_owner:qe.current}}D.Fragment=We;D.jsx=ve;D.jsxs=ve;we.exports=D;var e=we.exports,F={},G=Ne;F.createRoot=G.createRoot,F.hydrateRoot=G.hydrateRoot;const Ke="modulepreload",He=function(t){return"/"+t},X={},I=function(r,n,a){let o=Promise.resolve();if(n&&n.length>0){document.getElementsByTagName("link");const p=document.querySelector("meta[property=csp-nonce]"),s=p?.nonce||p?.getAttribute("nonce");o=Promise.allSettled(n.map(u=>{if(u=He(u),u in X)return;X[u]=!0;const h=u.endsWith(".css"),l=h?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${u}"]${l}`))return;const g=document.createElement("link");if(g.rel=h?"stylesheet":Ke,h||(g.as="script"),g.crossOrigin="",g.href=u,s&&g.setAttribute("nonce",s),document.head.appendChild(g),h)return new Promise((v,y)=>{g.addEventListener("load",v),g.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${u}`)))})}))}function i(p){const s=new Event("vite:preloadError",{cancelable:!0});if(s.payload=p,window.dispatchEvent(s),!s.defaultPrevented)throw p}return o.then(p=>{for(const s of p||[])s.status==="rejected"&&i(s.reason);return r().catch(i)})},Ye=[{to:"/",label:"홈"},{to:"/leword",label:"LEWORD"},{to:"/chatbots",label:"무료 챗봇"},{to:"/products",label:"제품정보"},{to:"/pricing",label:"구매"},{to:"/reviews",label:"후기"},{to:"/community",label:"커뮤니티"},{to:"/download",label:"다운로드"},{to:"/lookup",label:"주문조회"}];function Ge(){const[t,r]=c.useState(!1),[n,a]=c.useState(!1),o=M(),i=o.pathname==="/index.html"?"/":o.pathname.replace(/\.html$/,"").replace(/\/$/,"")||"/",p=s=>s==="/"?i==="/":i===s;return c.useEffect(()=>{const s=()=>r(window.scrollY>50);return window.addEventListener("scroll",s,{passive:!0}),()=>window.removeEventListener("scroll",s)},[]),e.jsx("nav",{className:t?"navbar scrolled":"navbar",style:{position:"fixed",top:0,left:0,right:0,zIndex:999,background:t?"rgba(10,10,15,0.96)":"rgba(10,10,15,0.85)",backdropFilter:"blur(16px)",borderBottom:t?"1px solid rgba(124,58,237,0.15)":"1px solid rgba(255,255,255,0.04)",transition:"all 0.3s"},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs(Y,{to:"/",style:{display:"flex",alignItems:"center",gap:10,fontWeight:800,fontSize:18,color:"#fff"},children:[e.jsx("img",{src:"/favicon-32x32.png",alt:"","aria-hidden":"true",style:{width:32,height:32,borderRadius:8,display:"block"}}),e.jsx("span",{children:"Leaders Pro"})]}),e.jsxs("button",{"aria-label":n?"메뉴 닫기":"메뉴 열기","aria-expanded":n,onClick:()=>a(s=>!s),style:{display:"none",background:"transparent",border:"none",cursor:"pointer",flexDirection:"column",gap:5,padding:6},className:"nav-hamburger",children:[e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}}),e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}}),e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}})]}),e.jsx("div",{className:n?"nav-links mobile-open":"nav-links",style:{display:"flex",gap:8},children:Ye.map(s=>{const u=p(s.to);return e.jsx(Y,{to:s.to,className:u?"nav-link-active":void 0,"aria-current":u?"page":void 0,onClick:()=>a(!1),style:()=>({padding:"8px 16px",color:n?u?"#F4D03F":"rgba(255,255,255,0.92)":u?"#A78BFA":"#a0a0b0",background:n&&u?"rgba(244,208,63,0.14)":u?"rgba(124,58,237,0.1)":"transparent",fontSize:14,fontWeight:n?800:500,borderRadius:8,transition:"all 0.2s"}),children:s.label},s.to)})})]})})}function Xe(){return e.jsx("footer",{style:{padding:"60px 24px 40px",background:"#06060a",borderTop:"1px solid rgba(255,255,255,0.04)"},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto",textAlign:"center"},children:[e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:10,fontWeight:800,fontSize:18,marginBottom:20,color:"#fff"},children:[e.jsx("img",{src:"/favicon-32x32.png",alt:"","aria-hidden":"true",style:{width:32,height:32,borderRadius:8,display:"block"}}),e.jsx("span",{children:"Leaders Pro"})]}),e.jsxs("div",{style:{display:"flex",gap:24,justifyContent:"center",flexWrap:"wrap",marginBottom:20},children:[e.jsx(R,{to:"/terms",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"이용약관"}),e.jsx(R,{to:"/refund",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"환불정책"}),e.jsx(R,{to:"/privacy",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"개인정보처리방침"}),e.jsx(R,{to:"/chatbots",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"무료 챗봇"}),e.jsx(R,{to:"/lookup",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"주문 조회"}),e.jsx("a",{href:"mailto:cd000242@gmail.com",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"고객 문의"})]}),e.jsxs("div",{style:{color:"#a0a0b0",fontSize:12,lineHeight:1.7,marginBottom:20},children:[e.jsx("p",{children:"상호: Leaders Pro | 대표: 박성현 | 사업자등록번호: 515-97-01802"}),e.jsx("p",{children:"주소: 경남 김해시 장유로334번길9 107동 3105호"}),e.jsx("p",{children:"이메일: tjdgus24280@naver.com | 전화: 010-7545-1645"})]}),e.jsx("p",{style:{color:"rgba(160,160,176,0.5)",fontSize:12},children:"© 2026 Leaders Pro. All rights reserved."})]})})}const je="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec";let L=null;const ke="leaderspro.siteContent.cache.v2",Je=60*1e3,Ze=2500;function J(t=Je){try{const r=localStorage.getItem(ke);if(!r)return null;const n=JSON.parse(r);return!n?.content||t>0&&Date.now()-Number(n.savedAt||0)>t?null:n.content}catch{return null}}function Qe(t){try{localStorage.setItem(ke,JSON.stringify({savedAt:Date.now(),content:t}))}catch{}}async function Se(){const t=J();if(t)return t;if(L)return L;const r=J(0),n=new AbortController,a=window.setTimeout(()=>n.abort(),Ze);return L=fetch(`${je}?action=site-content`,{cache:"default",signal:n.signal}).then(o=>o.json()).then(o=>{if(o&&(o.ok||o.success)&&o.content){const i=o.content;return Qe(i),i}return null}).catch(o=>(console.warn("[site-content] load failed",o),L=null,r)).finally(()=>{window.clearTimeout(a)}),L}function et(t){const r=window;if("requestIdleCallback"in r){r.requestIdleCallback(t,{timeout:2500});return}window.setTimeout(t,900)}function tt(t){try{et(()=>{try{const r=sessionStorage.getItem("lp_admin_logged_in")==="1"||sessionStorage.getItem("admin_auth")==="1",n=localStorage.getItem("lp_analytics_exclude")==="1"||r,a=t||location.pathname,o=`lp_pageview_dedupe:${a}`,i=Date.now(),p=Number(sessionStorage.getItem(o)||0);if(i-p<30*60*1e3)return;sessionStorage.setItem(o,String(i));const s={action:"analytics-hit",type:"pageview",path:a,title:document.title,referrer:document.referrer||"",visitorId:Z(localStorage,"lp_visitor_id","v_"),sessionId:Z(sessionStorage,"lp_session_id","s_"),isInternal:n,userAgent:navigator.userAgent,timestamp:new Date().toISOString()};fetch(je,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(s),keepalive:!0}).catch(()=>{})}catch{}})}catch{}}function Z(t,r,n){try{const a=t.getItem(r);if(a)return a;const o=new Uint8Array(12);crypto.getRandomValues(o);const i=n+Array.from(o).map(p=>p.toString(16).padStart(2,"0")).join("");return t.setItem(r,i),i}catch{return n+Math.random().toString(36).slice(2)}}const C={title:"배경음악",videoId:"f4jS6yW83MU",playlistId:"RDf4jS6yW83MU",startSec:16,audioUrl:"",enabled:!0},W="lp_music_time",V="lp_music_time_ts",Q="lp_music_volume";let ee=0;function rt(t){const r=t||{},n=Number(r.startSec);return{title:String(r.title||C.title),videoId:String(r.videoId||C.videoId),playlistId:String(r.playlistId||C.playlistId),startSec:Number.isFinite(n)&&n>=0?n:C.startSec,audioUrl:String(r.audioUrl||""),enabled:r.enabled!==!1}}function ot(t){try{const r=parseFloat(localStorage.getItem(W)||"0"),n=parseInt(localStorage.getItem(V)||"0",10);if(r>0&&n>0&&Date.now()-n<30*60*1e3)return r}catch{}return t}function nt(){const t=c.useRef(null),r=c.useRef(null),n=c.useRef(""),a=c.useRef(null),[o,i]=c.useState(C),[p,s]=c.useState(!1),[u,h]=c.useState(!1),[l,g]=c.useState(!1),[v,y]=c.useState(!1),[f,_]=c.useState(C.title);n.current||(ee+=1,n.current=`lpm-yt-player-${ee}`),c.useEffect(()=>{let j=!1;const b=()=>{Se().then(d=>{if(j)return;const m=rt(d?.theme?.music);i(m),_(m.title)})},w=window,E=w.requestIdleCallback?w.requestIdleCallback(b,{timeout:4e3}):window.setTimeout(b,2500);return()=>{j=!0,w.cancelIdleCallback&&typeof E=="number"?w.cancelIdleCallback(E):window.clearTimeout(E)}},[]),c.useEffect(()=>{if(!o.enabled||o.audioUrl)return;const j=()=>s(!0),b=window,w="requestIdleCallback"in b?b.requestIdleCallback(j,{timeout:9e3}):window.setTimeout(j,7e3);return()=>{"cancelIdleCallback"in b&&typeof w=="number"?b.cancelIdleCallback(w):window.clearTimeout(w)}},[o.audioUrl,o.enabled]),c.useEffect(()=>{if(!o.enabled||o.audioUrl||!p)return;if(window.YT&&window.YT.Player){h(!0);return}let j=!1;if(!document.querySelector('script[src*="youtube.com/iframe_api"]')){const E=document.createElement("script");E.src="https://www.youtube.com/iframe_api",document.head.appendChild(E)}const w=()=>{j||h(!0)};return window.onYouTubeIframeAPIReady=w,()=>{j=!0,window.onYouTubeIframeAPIReady===w&&(window.onYouTubeIframeAPIReady=void 0)}},[o.audioUrl,o.enabled,p]),c.useEffect(()=>{if(!u||o.audioUrl||!o.enabled||a.current)return;const j=t.current;if(!j)return;j.replaceChildren();const b=document.createElement("div");return b.id=n.current,j.appendChild(b),a.current=new window.YT.Player(b.id,{videoId:o.videoId,playerVars:{autoplay:1,start:Math.floor(ot(o.startSec)),listType:"playlist",list:o.playlistId,controls:0,disablekb:1,fs:0,modestbranding:1,rel:0},events:{onReady:w=>{const E=parseInt(localStorage.getItem(Q)||"40",10);w.target.setVolume(isNaN(E)?40:E);try{w.target.playVideo()}catch{}},onStateChange:w=>{window.YT&&(w.data===window.YT.PlayerState.PLAYING?(g(!0),_(o.title||C.title)):w.data===window.YT.PlayerState.PAUSED&&g(!1))},onError:w=>{console.warn("[MusicPlayer] YouTube error:",w?.data);try{a.current?.nextVideo()}catch{}}}}),()=>{const w=a.current;a.current=null;try{w?.destroy?.()}catch{}try{j.replaceChildren()}catch{}}},[u,o.audioUrl,o.enabled,o.playlistId,o.startSec,o.title,o.videoId]),c.useEffect(()=>{if(o.audioUrl){_(o.title);try{const j=parseInt(localStorage.getItem(Q)||"40",10);r.current&&(r.current.volume=(isNaN(j)?40:j)/100)}catch{}}},[o.audioUrl,o.title]),c.useEffect(()=>{const j=()=>{try{if(o.audioUrl&&r.current){r.current.play().catch(()=>{});return}a.current?.playVideo?.()}catch{}["click","touchstart","scroll","keydown","mousemove"].forEach(b=>document.removeEventListener(b,j))};return["click","touchstart","scroll","keydown","mousemove"].forEach(b=>document.addEventListener(b,j,{once:!0,passive:!0})),()=>{["click","touchstart","scroll","keydown","mousemove"].forEach(b=>document.removeEventListener(b,j))}},[o.audioUrl]),c.useEffect(()=>{const j=window.setInterval(()=>{try{if(o.audioUrl){const w=r.current?.currentTime||0;w>0&&(localStorage.setItem(W,String(w)),localStorage.setItem(V,String(Date.now())));return}if(!a.current?.getCurrentTime)return;const b=a.current.getCurrentTime();b>0&&(localStorage.setItem(W,String(b)),localStorage.setItem(V,String(Date.now())))}catch{}},5e3);return()=>window.clearInterval(j)},[o.audioUrl]);const k=()=>{if(o.audioUrl){const j=r.current;if(!j)return;l?(j.pause(),g(!1)):j.play().then(()=>g(!0)).catch(()=>{}),y(!0);return}if(!a.current){s(!0),y(!0);return}try{l?a.current.pauseVideo():a.current.playVideo()}catch{}};return o.enabled?e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
                @media (max-width: 768px) {
                    .lp-music-player { right: 12px !important; bottom: 186px !important; }
                    .lp-music-button {
                        width: 46px !important;
                        min-width: 46px !important;
                        height: 46px !important;
                        padding: 0 !important;
                        border-radius: 50% !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-music-button span:last-child { display: none !important; }
                }
            `}),e.jsx("div",{ref:t,style:{position:"fixed",top:-9999,left:-9999,width:1,height:1,opacity:0,pointerEvents:"none"}}),o.audioUrl&&e.jsx("audio",{ref:r,src:o.audioUrl,loop:!0,onPlay:()=>g(!0),onPause:()=>g(!1),style:{display:"none"}}),e.jsxs("div",{className:"lp-music-player",style:{position:"fixed",bottom:200,right:24,zIndex:1e4,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,pointerEvents:"none"},children:[v&&e.jsxs("div",{style:{background:"rgba(18,18,26,0.95)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:16,width:240,pointerEvents:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},children:[e.jsx("div",{style:{fontSize:11,color:"#ffd700",fontWeight:800,letterSpacing:0},children:"재생 목록"}),e.jsx("button",{onClick:()=>y(!1),style:{background:"transparent",border:"none",color:"#a0a0b0",cursor:"pointer",fontSize:16},children:"x"})]}),e.jsxs("div",{style:{background:"rgba(255,215,0,0.06)",borderRadius:10,padding:10,marginBottom:12},children:[e.jsx("div",{style:{fontSize:10,color:"#a0a0b0",marginBottom:2},children:"지금 재생"}),e.jsx("div",{style:{fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:f})]}),e.jsx("button",{onClick:k,style:{width:"100%",padding:10,borderRadius:10,background:"linear-gradient(135deg, #c9a84c, #d4a012)",color:"#1a0a2e",fontWeight:800,fontSize:14,border:"none",cursor:"pointer"},children:l?"일시정지":"재생"}),e.jsx("div",{style:{fontSize:10,color:"rgba(255,255,255,0.5)",textAlign:"center",marginTop:8},children:"관리자 사이트 편집에서 음악을 바꿀 수 있습니다."})]}),e.jsxs("button",{className:"lp-music-button",onClick:()=>{y(j=>!j),l||k()},title:"음악 플레이어",style:{pointerEvents:"auto",background:"linear-gradient(135deg, rgba(255,183,197,0.25), rgba(201,168,76,0.25))",border:"1px solid rgba(255,183,197,0.5)",backdropFilter:"blur(12px)",borderRadius:28,padding:"10px 16px",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(255,107,138,0.2)"},children:[e.jsx("span",{style:{fontSize:16},children:l?"일시정지":"재생"}),e.jsx("span",{children:"음악"})]})]})]}):null}function at(){return c.useEffect(()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;let t=!1;const r=()=>{if(t)return;const o=document.getElementById("lpm-summer-particles");if(!o||o.children.length>0)return;const i=window.innerWidth<768?8:14;for(let p=0;p<i;p++){const s=document.createElement("div"),u=Math.random()<.45,h=Math.random()*100,l=100+Math.random()*20,g=14+Math.random()*20,v=-Math.random()*g,y=u?3:5;Object.assign(s.style,{position:"absolute",width:y+"px",height:y+"px",borderRadius:"50%",background:u?"radial-gradient(circle at 30% 30%, #ffffff 0%, #fff2cc 60%, rgba(255,242,204,0) 100%)":"radial-gradient(circle at 30% 30%, #ffffff 0%, #ffd966 60%, rgba(255,217,102,0) 100%)",boxShadow:u?"0 0 6px rgba(255,242,204,0.5)":"0 0 10px rgba(255,217,102,0.55), 0 0 20px rgba(255,217,102,0.3)",opacity:"0",left:h+"%",top:l+"vh",animation:`lpmSunFloat ${g}s linear infinite`,animationDelay:v+"s"}),o.appendChild(s)}},n=window,a=n.requestIdleCallback?n.requestIdleCallback(r,{timeout:2500}):window.setTimeout(r,1800);return()=>{t=!0,n.cancelIdleCallback&&typeof a=="number"?n.cancelIdleCallback(a):window.clearTimeout(a)}},[]),e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
                @keyframes lpmSunFloat {
                    0%   { opacity: 0; transform: translate(0, 0) scale(0.6); }
                    10%  { opacity: 0.85; }
                    50%  { transform: translate(25px, -40vh) scale(1); }
                    90%  { opacity: 0.5; }
                    100% { opacity: 0; transform: translate(60px, -110vh) scale(0.4); }
                }
                @keyframes lpmWaveSlide {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-30px); }
                }
                .lpm-wave-1 { animation: lpmWaveSlide 14s ease-in-out infinite; }
                .lpm-wave-2 { animation: lpmWaveSlide 22s ease-in-out infinite reverse; opacity: 0.7; }
                .lpm-wave-3 { animation: lpmWaveSlide 30s ease-in-out infinite; opacity: 0.5; }
            `}),e.jsx("div",{id:"lpm-summer-particles",style:{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,overflow:"hidden"}})]})}function it(){const t={position:"fixed",right:24,zIndex:10001,display:"flex",alignItems:"center",gap:10,padding:"12px 20px",borderRadius:50,backdropFilter:"blur(16px)",textDecoration:"none",fontFamily:"inherit",minWidth:160,transition:"transform .2s, box-shadow .2s"};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
                @media (max-width: 768px) {
                    .lp-float-link {
                        right: 10px !important;
                        width: 42px !important;
                        min-width: 42px !important;
                        height: 42px !important;
                        padding: 0 !important;
                        border-radius: 50% !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-float-link span { display: none !important; }
                    .lp-float-link > div { width: 26px !important; height: 26px !important; }
                    .lp-float-chat { bottom: calc(14px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-room { bottom: calc(66px + env(safe-area-inset-bottom)) !important; }
                    .lp-float-youtube { bottom: calc(118px + env(safe-area-inset-bottom)) !important; }
                }

                @media (max-width: 420px) {
                    .lp-float-link {
                        right: 8px !important;
                        width: 38px !important;
                        min-width: 38px !important;
                        height: 38px !important;
                    }
                    .lp-float-link > div { width: 24px !important; height: 24px !important; font-size: 12px !important; }
                }
            `}),e.jsxs("a",{className:"lp-float-link lp-float-chat",href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener",title:"1:1 카카오톡 문의",style:{...t,bottom:20,background:"rgba(60,29,0,0.92)",border:"1px solid rgba(254,229,0,0.45)",boxShadow:"0 6px 24px rgba(0,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#fee500",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:"💬"}),e.jsx("span",{style:{color:"#fee500",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"1:1 문의"})]}),e.jsxs("a",{className:"lp-float-link lp-float-room",href:"https://open.kakao.com/o/gQ1jRBwh",target:"_blank",rel:"noopener",title:"단톡방 바로가기",style:{...t,bottom:80,background:"rgba(254,229,0,0.95)",border:"1px solid rgba(60,29,0,0.5)",boxShadow:"0 6px 24px rgba(0,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#1a0a10",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:"👥"}),e.jsx("span",{style:{color:"#1a0a10",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"단톡방 바로가기"})]}),e.jsxs("a",{className:"lp-float-link lp-float-youtube",href:"https://www.youtube.com/@leadernam-s5e",target:"_blank",rel:"noopener",title:"공식 유튜브 채널",style:{...t,bottom:140,background:"rgba(255,0,0,0.92)",border:"1px solid rgba(255,100,100,0.5)",boxShadow:"0 6px 24px rgba(255,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#fff",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#ff0000",fontWeight:900},children:"▶"}),e.jsx("span",{style:{color:"#fff",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"유튜브 채널"})]})]})}function te(t="auto"){const r=window.matchMedia("(prefers-reduced-motion: reduce)").matches;window.scrollTo({top:0,left:0,behavior:r?"auto":t}),document.documentElement.scrollTop=0,document.body.scrollTop=0}function st(t){return t.button!==0||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey}function lt(t){const r=t.getAttribute("href"),n=t.getAttribute("target");if(!r||n||r.startsWith("#")||r.startsWith("mailto:")||r.startsWith("tel:"))return!1;let a;try{a=new URL(r,window.location.href)}catch{return!1}return a.origin!==window.location.origin?!1:a.pathname!==window.location.pathname||a.search!==window.location.search||a.hash===""}function ct(){const t=M();return c.useEffect(()=>("scrollRestoration"in window.history&&(window.history.scrollRestoration="manual"),()=>{"scrollRestoration"in window.history&&(window.history.scrollRestoration="auto")}),[]),c.useEffect(()=>{window.requestAnimationFrame(()=>te("auto"))},[t.pathname,t.search]),c.useEffect(()=>{const r=n=>{if(n.defaultPrevented||st(n))return;const a=n.target;if(!(a instanceof Element))return;const o=a.closest("a[href]");o instanceof HTMLAnchorElement&&lt(o)&&window.requestAnimationFrame(()=>te("auto"))};return document.addEventListener("click",r,!0),()=>document.removeEventListener("click",r,!0)},[]),null}function dt(){const r=M().pathname.replace(/\/$/,"")||"/",n=r==="/leword"||r==="/leword.html";return e.jsxs(e.Fragment,{children:[e.jsx(ct,{}),e.jsx(Ge,{}),e.jsx("main",{style:{minHeight:"100vh",paddingTop:n?72:0,background:n?"#07090d":void 0},children:e.jsx($e,{})}),!n&&e.jsx(Xe,{}),!n&&e.jsx(at,{}),!n&&e.jsx(nt,{}),!n&&e.jsx(it,{})]})}function pt(){const t=c.useRef(null);return c.useEffect(()=>{const r=t.current;if(!r||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const n=navigator.connection;if(n?.saveData||/2g/i.test(n?.effectiveType||""))return;const a=r.getContext("2d");if(!a)return;const o=a;let i=0,p=0,s=1;const u=[];function h(){r&&(s=Math.min(window.devicePixelRatio||1,1),i=window.innerWidth,p=window.innerHeight,r.width=Math.floor(i*s),r.height=Math.floor(p*s),r.style.width=`${i}px`,r.style.height=`${p}px`,o.setTransform(s,0,0,s,0,0))}h(),window.addEventListener("resize",h);function l(){return{x:Math.random()*i,y:Math.random()*p,size:Math.random()*2+.5,speedY:-(Math.random()*.3+.1),speedX:(Math.random()-.5)*.2,opacity:Math.random()*.5+.1,gold:Math.random()>.3}}const g=window.innerWidth<768?10:navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4?20:34;for(let k=0;k<g;k++)u.push(l());let v=0,y=!document.hidden;function f(){if(y){o.clearRect(0,0,i,p);for(const k of u)k.y+=k.speedY,k.x+=k.speedX,k.opacity+=(Math.random()-.5)*.01,k.opacity=Math.max(.05,Math.min(.6,k.opacity)),k.y<-10&&(k.y=p+10,k.x=Math.random()*i),o.beginPath(),o.arc(k.x,k.y,k.size,0,Math.PI*2),o.fillStyle=k.gold?`rgba(201, 168, 76, ${k.opacity})`:`rgba(255, 255, 255, ${k.opacity*.4})`,o.fill();v=requestAnimationFrame(f)}}function _(){y=!document.hidden,y&&!v&&f(),y||(cancelAnimationFrame(v),v=0)}return f(),document.addEventListener("visibilitychange",_),()=>{cancelAnimationFrame(v),window.removeEventListener("resize",h),document.removeEventListener("visibilitychange",_)}},[]),e.jsx("canvas",{ref:t,style:{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}})}const ht="https://141.164.59.17.sslip.io",ut=2500,_e="leaderspro.home.sourceSignals.v1",B=[{id:"naver",label:"네이버",accent:"#2ed36f",description:"실시간 검색과 블로그 수요"},{id:"daum",label:"다음",accent:"#4d93ff",description:"생활/뉴스 검색 신호"},{id:"nate",label:"네이트",accent:"#ff6b6b",description:"이슈와 방송 검색 흐름"},{id:"zum",label:"줌",accent:"#f4c95d",description:"포털 이슈 보조 신호"},{id:"policy",label:"정책",accent:"#44d7b6",description:"지원금과 공공 알림"},{id:"issue",label:"이슈",accent:"#c084fc",description:"방송/연예/스포츠 흐름"}],gt=[{id:"fallback-golden-1",rank:1,keyword:"소상공인 지원금 신청",grade:"SS",publicSearchVolumeLabel:"수요 검증 중",publicDocumentCountLabel:"경쟁도 잠금",publicReason:"정책 수요와 검색 전환 가능성이 함께 있는 키워드입니다."},{id:"fallback-golden-2",rank:2,keyword:"장마 대비 준비물",grade:"S",publicSearchVolumeLabel:"시즌 상승",publicDocumentCountLabel:"문서수 확인 중",publicReason:"계절 이슈와 구매 의도가 동시에 붙는 롱테일 키워드입니다."},{id:"fallback-golden-3",rank:3,keyword:"오늘 방송 출연진",grade:"S",publicSearchVolumeLabel:"실시간 반응",publicDocumentCountLabel:"경쟁도 확인 중",publicReason:"방송 직후 빠르게 검색량이 붙는 이슈형 키워드입니다."}],mt={naver:["소상공인 지원금 신청","장마 대비 준비물","여름 전기요금 절약","청년 월세 지원 조건","오늘 방송 출연진","냉방병 증상","근로장려금 지급일","서울 무료 전시","주말 갈만한곳","아이폰 배터리 교체"],daum:["경제 뉴스 정리","폭염주의보 지역","대출 금리 비교","교통 통제 구간","야구 경기 일정","공모주 청약 일정","환율 전망","아파트 실거래가","태풍 경로","건강검진 대상자"],nate:["드라마 출연진","예능 방송 시간","배우 근황","공식입장 정리","스포츠 인터뷰","연예 뉴스 반응","축구 대표팀 명단","영화 결말 해석","콘서트 예매 일정","프로필 나이"],zum:["근처 맛집 추천","제주 숙소 가격","항공권 특가","가전 할인","병원 예약 방법","여행 준비물","주차장 위치","공연 티켓 예매","보험료 비교","이사 비용"],policy:["근로장려금 지급일","청년 월세 지원 조건","소상공인 정책자금 신청","에너지바우처 신청 대상","문화누리카드 사용처","기초연금 수급자격","주거급여 신청 조건","국민내일배움카드 신청","출산지원금 지역별 조회","보조금24 숨은 지원금"],issue:["드라마 결말 해석","출연진 공식입장","대표팀 경기 결과","방송 장면 논란","연예인 근황 반응","사건 타임라인 정리","콘서트 예매 일정","영화 쿠키영상 여부","스포츠 하이라이트","후속 방송 일정"]};function T(t,r){const n=String(t||"").trim();if(!n)return r;const a=(n.match(/\?/g)||[]).length;return/[�]|占|揶|醫|怨|筌|嚥|媛|덈떎|섏|ㅼ/.test(n)||a>=Math.max(3,Math.ceil(n.length/5))?r:n}function Ie(t){return mt[t.id].map((r,n)=>({id:`fallback-${t.id}-${n+1}`,keyword:r,title:r,description:t.id==="policy"?"정책 수집 연결 대기 중에도 검색 의도가 분명한 신청·대상형 후보입니다.":t.id==="issue"?"이슈 수집 연결 대기 중에도 글 구조가 분명한 타임라인·반응형 후보입니다.":`${t.label} 연결 대기 중 표시되는 저경쟁 후보입니다.`,priority:100-n,source:t.id}))}function Ee(t){return t.map(r=>r.items.length>0?r:{...r,items:Ie(r)})}function ft(){try{const t=window.localStorage.getItem(_e);if(!t)return null;const r=JSON.parse(t),n=K(r);return n.some(a=>a.items.length>0)?{lanes:Ee(n),updatedAt:r.updatedAt}:null}catch{return null}}function xt(t){try{window.localStorage.setItem(_e,JSON.stringify({updatedAt:t.updatedAt,lanes:K(t)}))}catch{}}function $(t,r=900){let n=!1;const a=()=>{n||t()},o=window,i=o.requestIdleCallback?o.requestIdleCallback(a,{timeout:r}):window.setTimeout(a,Math.min(r,700));return()=>{n=!0,o.cancelIdleCallback&&typeof i=="number"?o.cancelIdleCallback(i):window.clearTimeout(i)}}function q(t="loading"){const r=ft(),n=r?.lanes||B.map(a=>({...a,items:Ie(a)}));return{status:t,golden:gt,lanes:n,updatedAt:r?.updatedAt,boardCount:n.reduce((a,o)=>a+o.items.length,0),boardTarget:120,lockedCount:0,running:!1,fallbackUsed:!0}}async function bt(t){const r=new AbortController,n=window.setTimeout(()=>r.abort(),ut);try{const a=await fetch(ht+t,{cache:"no-store",signal:r.signal});if(!a.ok)throw new Error("LEWORD API "+a.status);return await a.json()}finally{window.clearTimeout(n)}}function K(t){const r=Array.isArray(t?.lanes)?t.lanes:[];return B.map(n=>{const a=r.find(i=>i.id===n.id),o=Array.isArray(a?.items)?a.items:[];return{...n,items:o.slice(0,10)}})}async function yt(){const t=q("error"),r=await bt("/v1/public/source-signals?limit=60"),n=Ee(K(r));return n.some(o=>o.items.length>0)?(xt(r),{status:"ready",golden:t.golden,lanes:n,updatedAt:r?.updatedAt,boardCount:n.reduce((o,i)=>o+i.items.length,0),boardTarget:120,lockedCount:0,running:!1,fallbackUsed:!!(r?.fallbackUsed||!r)}):t}const wt={naver:t=>`https://search.naver.com/search.naver?query=${encodeURIComponent(t)}`,daum:t=>`https://search.daum.net/search?w=tot&q=${encodeURIComponent(t)}`,nate:t=>`https://search.nate.com/search/all.html?q=${encodeURIComponent(t)}`,zum:t=>`https://search.zum.com/search.zum?query=${encodeURIComponent(t)}`,policy:t=>`https://www.korea.kr/search?srchKeyword=${encodeURIComponent(t)}`,issue:t=>`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(t)}`};function N(t,r){const n=r.trim();return wt[t](n||"LEWORD")}function U(t){return Array.from(new Set(t.map(r=>r.trim()).filter(Boolean)))}function ze(t){return U(t.replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(r=>r.length>=2).slice(0,5))}function z(t,r){return r.some(n=>n.test(t))}function vt(t){return U((t.match(/[0-9]+(?:\.[0-9]+)?\s?(?:회|명|위|년|월|일|%|G|차|억|만)?/gi)||[]).slice(0,3))}function jt(t,r){const n=new Set(["네이버","다음","네이트","실시간","검색어","포착","상승","중인","바로","정밀","분석","확인","하세요","키워드","후보","후보입니다","뉴스","이슈","저경쟁","표시되는","연결","대기","Pro","pro","빅키워드는","하위","의도로","쪼개서","엔진에서","검증합니다","검색량과","문서수를","넘겨"]),a=o=>o.replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(i=>i.length>=2&&!n.has(i));return U([...a(t),...a(r)]).slice(0,8)}function kt(t,r){return t==="policy"?"policy":t==="issue"?"issue":z(r,[/지원금|장려금|월세|급여|연금|정책|신청|대상|서류|지급|환급|세금|고용/])?"policy":z(r,[/최저임금|임금|시급|월급|노동|노사|경영계|금리|환율|투자|주가|반도체|경제|공모주|아파트|부동산|대출|수익|실적|물가|가격/])?"money":z(r,[/드라마|예능|방송|출연|OST|배우|결혼|열애|콘서트|프로필|영화|SNL|전참시|스타|연예/])?"entertainment":z(r,[/홈런|경기|월드컵|축구|야구|대표팀|감독|선수|순위|결승|리그|로또/])?"sports":z(r,[/화재|태풍|폭염|살인|사건|사고|통제|지진|피해|실종|부상|특보|위험/])?"incident":z(r,[/맛집|숙소|항공권|할인|예약|병원|보험|비용|주차|공연|티켓|여행/])?"commerce":z(r,[/장관|정부|회의|지역|공식|발표|공공|한중|정상/])?"public":"general"}function St(t){return{policy:{audience:"내가 받을 수 있는지 불안한 신청자",searchIntent:"대상, 기한, 준비물, 놓치면 손해 보는 조건을 빠르게 확인",tension:"신청 대상과 제외 조건이 헷갈리는 지점",proofNeed:"공식 출처와 실제 신청 전 체크할 조건",answerFrame:"대상 여부를 먼저 판별하고 다음 행동을 제시",hookAngle:"놓치면 손해 보는 조건을 먼저 꺼내기",bridgeAngle:"대상자 판별표와 신청 순서"},issue:{audience:"왜 갑자기 떴는지 맥락이 궁금한 검색자",searchIntent:"무슨 일이 있었는지, 공식입장과 반응, 다음 일정까지 한 번에 확인",tension:"속보와 짧은 반응은 많지만 흐름이 한눈에 정리되지 않는 지점",proofNeed:"최초 포착 시점, 확인된 사실, 공식입장, 반응 변화",answerFrame:"왜 떴는지와 현재 확인된 사실을 먼저 분리",hookAngle:"논란보다 확인된 흐름과 반전 포인트를 먼저 보여주기",bridgeAngle:"타임라인, 공식입장, 반응, 후속 일정"},money:{audience:"내 돈과 지역 영향이 궁금한 검색자",searchIntent:"뉴스 제목보다 실제 영향, 수혜·피해 변수, 다음 확인 포인트를 파악",tension:"큰 뉴스와 내 생활 사이의 연결고리가 보이지 않는 지점",proofNeed:"수치, 지역, 기업, 정책 변수를 나눠 보는 근거",answerFrame:"왜 중요한지보다 나에게 어떤 영향인지 먼저 설명",hookAngle:"숫자 뒤에 숨은 실제 영향으로 시작하기",bridgeAngle:"지역 영향, 산업 영향, 개인 선택 기준"},entertainment:{audience:"방송을 놓쳤거나 맥락이 궁금한 시청자",searchIntent:"누가 왜 화제인지, 어떤 장면과 연결되는지, 다시 볼 이유를 확인",tension:"짧은 화제어만 보고는 맥락을 알기 어려운 지점",proofNeed:"방송 장면, 인물 관계, 공개된 발언을 분리한 정리",answerFrame:"인물보다 장면과 반응을 먼저 연결",hookAngle:"화제 장면의 숨은 맥락으로 클릭 유도",bridgeAngle:"인물, 장면, 반응, 다음 회차"},sports:{audience:"결과보다 의미와 다음 경우의 수가 궁금한 팬",searchIntent:"점수나 기록이 순위, 일정, 다음 변수에 어떤 영향을 주는지 확인",tension:"기록은 보이지만 다음 판도가 헷갈리는 지점",proofNeed:"기록, 순위, 일정, 경우의 수를 한 화면에서 비교",answerFrame:"결과보다 다음 변수와 영향부터 정리",hookAngle:"기록 뒤에 바뀐 판도를 앞세우기",bridgeAngle:"결과, 순위, 다음 일정, 경우의 수"},incident:{audience:"현재 상황과 내 주변 영향이 먼저 궁금한 검색자",searchIntent:"위치, 피해, 교통·안전 영향, 지금 해야 할 행동을 확인",tension:"속보는 많지만 현재 기준 정보가 흩어진 지점",proofNeed:"시간대별 상황, 위치, 공식 발표, 행동 요령",answerFrame:"현재 상황과 안전 확인 포인트를 먼저 제시",hookAngle:"지금 확인해야 할 위험 신호로 시작하기",bridgeAngle:"현재 상황, 위치, 피해, 대응"},commerce:{audience:"돈과 시간을 낭비하기 싫은 비교 검색자",searchIntent:"가격보다 실패하지 않는 선택 기준과 확인 순서를 찾음",tension:"광고성 정보가 많아 실제 판단 기준이 흐려지는 지점",proofNeed:"가격, 위치, 조건, 후기 신뢰도를 나눠 보는 기준",answerFrame:"추천보다 선택 기준과 피해야 할 조건을 먼저 제시",hookAngle:"실패 방지 기준으로 후킹",bridgeAngle:"가격, 위치, 조건, 대안 비교"},public:{audience:"정책·공공 이슈의 실제 의미가 궁금한 검색자",searchIntent:"발표 내용이 누구에게 어떤 영향을 주는지 확인",tension:"공식 발표와 실제 체감 사이의 간극",proofNeed:"발표 주체, 대상, 일정, 후속 변수를 분리한 근거",answerFrame:"발표 요약보다 영향 받는 사람을 먼저 설명",hookAngle:"공식 발표 뒤 달라지는 점으로 시작하기",bridgeAngle:"대상, 영향, 일정, 후속 조치"},general:{audience:"짧은 화제어의 맥락을 빠르게 알고 싶은 검색자",searchIntent:"왜 뜨는지, 지금 무엇을 보면 되는지 확인",tension:"검색량은 붙었지만 정리된 답이 부족한 지점",proofNeed:"원인, 핵심 사실, 다음 확인 포인트",answerFrame:"핵심 사실과 검색자가 취할 다음 행동을 먼저 제시",hookAngle:"사람들이 놓치는 첫 질문으로 시작하기",bridgeAngle:"원인, 핵심, 다음 검색어"}}[t]}function H(t,r){const n=T(r.keyword||r.title,t.label),a=T(r.description||r.title,t.description),o=`${n} ${a}`,i=jt(n,a),p=vt(n),s=kt(t.id,o),u=St(s),h=i.slice(0,Math.min(3,Math.max(1,i.length))).join(" ")||n;return{keyword:n,core:h,laneId:t.id,laneLabel:t.label,category:s,entities:i,numbers:p,...u}}function _t(t,r,n=0){const a=ze(t),o=t.includes(r.core.split(" ")[0]||r.core),i=/(놓치|진짜|갑자기|헷갈|먼저|숨은|피해야|바뀐|왜|전|후|실제|갈리는)/.test(t),p=t.includes("확인")||t.includes("정리")||t.includes("판별")||t.includes("기준")||t.includes("답"),s=t.length>=24&&t.length<=58?24:t.length>=16?16:8,u=Math.min(26,a.length*5+(r.numbers.length?4:0)),h=i?18:8,l=p?16:8,g=o?9:4,v=t.length>72?8:0;return Math.min(99,Math.max(62,39+s+u+h+l+g+n-v))}function A(t,r,n,a,o,i=0){return{label:t,tag:r,reason:n,title:a,score:_t(t,o,i)}}function It(t,r){return t.category===r.category?`${r.core} 주제로 ${t.bridgeAngle} 확장`:t.laneId==="policy"||r.category==="policy"?`${r.core} 주제를 대상·조건 글로 연결`:t.category==="issue"||r.category==="issue"?`${r.core} 주제를 타임라인·반응 글로 연결`:t.category==="money"||r.category==="money"?`${r.core} 주제를 영향·수혜 변수로 연결`:t.category==="entertainment"||r.category==="entertainment"?`${r.core} 주제를 인물·장면 반응으로 연결`:`${r.core} 주제를 후속 검색 의도로 연결`}function Ae(t,r){return t.entities.some(a=>r.entities.includes(a))?!0:t.category==="general"||r.category==="general"?!1:t.category===r.category}function Ce(t,r,n,a){const i=a.filter(s=>s.id!==n.id).map(s=>H(r,s)).filter(s=>s.keyword!==t.keyword).filter(s=>Ae(t,s)).slice(0,5).map((s,u)=>A(`${t.core} → ${It(t,s)}`,u===0?"허브 연결":"내부링크",`같은 ${r.label} 흐름에서 넘어갈 다음 글감입니다. 단순 나열보다 검색자의 다음 질문을 받습니다.`,`${t.keyword} 글 하단에서 ${s.keyword}로 자연스럽게 연결`,t,4-u)),p=t.category==="issue"?[A(`${t.core} 타임라인 → 공식입장 → 반응 변화`,"이슈 허브","이슈형 글은 시간순 정리, 공식 확인, 반응 변화가 분리돼야 오래 읽힙니다.","타임라인 글에서 공식입장 글과 반응 분석 글로 연결",t,5),A(`${t.core} 팩트체크 → 쟁점 비교 → 후속 일정`,"후속 검색","추측성 글을 피하고 다음에 검색할 질문을 미리 받아 내부 순환을 만듭니다.","확인된 사실과 다음 발표 가능성을 묶는 구조",t,4),A(`${t.keyword} 관련 인물·장면·반응 키워드 묶음`,"확장 묶음","하나의 이슈를 인물, 장면, 반응으로 쪼개면 저경쟁 롱테일을 더 많이 확보할 수 있습니다.","관련 인물, 원인 장면, 댓글 반응을 각각 후속 글로 분리",t,3)]:[A(`${t.core} 기본 이해 → ${t.proofNeed} → 다음 행동`,"허브 구조","한 글에 답을 몰아넣지 않고 입문, 근거, 행동 글로 쪼개 주제 권위를 쌓습니다.",`${t.bridgeAngle} 3단 내부 링크 구조`,t,3),A(`${t.keyword} 이후 사람들이 다시 검색할 질문 묶음`,"후속 검색","검색자가 다음에 칠 질문을 미리 받아 체류와 재방문을 만듭니다.",`${t.searchIntent} 다음 단계 설계`,t,2)];return[...i,...p].slice(0,5)}function Te(t){return(t.core||t.keyword).replace(/\s+/g," ").trim()}function O(t,r){const n=t.replace(/\s+/g," ").trim(),a=r.replace(/\s+/g," ").trim();return!n||!a?n||a:n.endsWith(a)||ze(a).length===1&&n.includes(a)?"":`${n} ${a}`}function Re(t,r,n){const a=new Set;return r.map(o=>({...o,label:o.label.replace(/[→:]+/g," ").replace(/\s+/g," ").trim()})).filter(o=>o.label.length>=4).filter(o=>{const i=o.label.replace(/\s+/g,"");return a.has(i)?!1:(a.add(i),!0)}).map(o=>A(o.label,o.tag,o.reason,o.title,t,o.bias||0)).sort((o,i)=>i.score-o.score).slice(0,n)}function Et(t,r){const n=r.match(/([가-힣]{2,5})\s*감독/);return n?`${n[1]} 감독`:Te(t)}function zt(t,r,n){const a=Te(t),o=`${t.keyword} ${t.core} ${t.entities.join(" ")} ${r.description||""}`,i=t.category==="sports"&&/축구|월드컵|대표팀|감독|선임|사퇴|대한축구협회|KFA|홍명보/.test(o),p=/감독|선임|사퇴|경질|후임|후보/.test(o),s=/최저임금|임금|시급|월급|노동계|경영계|노사/.test(o),u=[],h=(l,g,v,y,f=4)=>{const _=O(a,l);_&&u.push({label:_,tag:g,reason:v,title:y,bias:f})};if(i&&p){const l=Et(t,o);u.push({label:O(l,"다음 감독 후보")||`${l} 후임 후보`,tag:"후임 의문",reason:"사퇴·선임 이슈 뒤에 바로 이어지는 검색 의도입니다.",title:"후임 후보와 선임 기준을 별도 글감으로 확장",bias:10},{label:O(l,"선임 과정")||`${l} 선임 배경`,tag:"선임 과정",reason:"왜 선임됐는지, 절차에 문제가 있었는지를 찾는 후속 검색입니다.",title:"선임 배경, 의사결정 주체, 논란 지점을 분리",bias:9},{label:O(l,"사퇴 이유")||`${l} 거취 이유`,tag:"사퇴 이유",reason:"뉴스 제목보다 원인과 책임 소재를 확인하려는 의도입니다.",title:"사퇴 요구가 나온 배경과 남은 변수 정리",bias:8},{label:"대한축구협회 감독 선임 과정",tag:"기관 쟁점",reason:"개인 이슈에서 축구협회 의사결정 구조로 확장되는 가지입니다.",title:"협회 절차와 책임론을 독립 글감으로 분리",bias:7},{label:"대표팀 선수 기용 논란",tag:"선수 기용",reason:"감독 이슈는 전술·선발·교체 판단으로 후속 검색이 이어집니다.",title:"선발, 교체, 전술 선택을 검색자가 궁금해하는 순서로 정리",bias:6},{label:"월드컵 예선 대표팀 전술 변화",tag:"경기 변수",reason:"사퇴나 경질 이슈 이후 다음 경기 영향까지 확인하려는 검색입니다.",title:"다음 경기와 예선 경우의 수로 연결",bias:5})}else s?[["월급 차이","월급 환산","시급 격차가 실제 월급과 연봉에 어떻게 반영되는지 찾는 검색입니다.","시급, 월급, 연봉 환산을 표로 정리"],["노동계 경영계 입장","입장 비교","누가 왜 다른 금액을 주장하는지 확인하려는 의도입니다.","노동계 요구와 경영계 반박을 분리"],["결정 과정","심의 절차","최저임금위원회 결정 흐름을 알고 싶은 후속 검색입니다.","회의 일정, 표결, 공익위원 변수를 정리"],["소상공인 영향","현장 영향","인건비와 고용 부담을 실제 생활 영향으로 연결하는 검색입니다.","자영업자, 아르바이트, 고용 변수를 비교"],["내년 최저임금 전망","전망 수요","격차 뉴스 이후 최종 금액과 적용 시기를 찾는 검색입니다.","최종 고시, 적용일, 예상 월급으로 연결"],["산입범위 계산","계산 기준","상여금·수당 포함 여부를 확인하려는 실무형 검색입니다.","산입범위와 제외 항목을 예시로 정리"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,9-f)):t.category==="policy"?[["대상","대상 확인","신청자가 가장 먼저 확인하는 조건입니다.","대상 조건과 제외 조건 분리"],["신청방법","신청 절차","실제 행동으로 이어지는 정보형 검색입니다.","신청 위치, 준비 순서, 주의사항 정리"],["필요서류","준비물","신청 전 체크리스트 수요가 붙는 가지입니다.","서류와 증빙 기준을 표로 정리"],["조회","조회 의도","내 상태를 확인하려는 직접 검색입니다.","조회 경로와 결과 해석을 분리"],["제외대상","실패 방지","탈락 조건을 먼저 확인하려는 불안 검색입니다.","대상자와 제외자를 한 화면에서 비교"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,8-f)):t.category==="commerce"?[["후기","구매 검증","구매 전 실제 후기를 확인하려는 의도입니다.","장점보다 실패 조건을 먼저 정리"],["가격","가격 비교","구매 전환 직전의 핵심 검색입니다.","가격대, 구성, 대체 상품 비교"],["비교","대안 비교","비슷한 제품 사이에서 선택하려는 검색입니다.","누구에게 맞는지 기준으로 분리"],["단점","리스크 확인","광고보다 실제 단점을 찾는 의도입니다.","단점과 피해야 할 조건 정리"],["대체품","대체 수요","품절·비싸짐 이후 대체 상품을 찾는 흐름입니다.","대체 제품군과 구매 포인트 정리"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,7-f)):t.category==="entertainment"?[["출연진","인물 확장","방송·드라마 검색에서 가장 빠른 후속 의도입니다.","등장인물과 실제 배우 정보를 분리"],["몇부작","편성 의문","시청 전 전체 분량과 일정을 확인하려는 검색입니다.","방송 일정과 회차 정보를 정리"],["결말","해석 수요","시청 후 바로 붙는 스포일러·해석 검색입니다.","결말과 복선 해석을 나눠 정리"],["재방송","다시보기","놓친 시청자가 바로 행동하는 검색입니다.","재방송 시간과 OTT 경로를 정리"],["시청률","반응 확인","화제성의 크기를 확인하려는 검색입니다.","시청률 변화와 반응 포인트 연결"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,7-f)):t.category==="sports"?[["일정","다음 경기","결과 확인 뒤 바로 이어지는 경기 일정 검색입니다.","일정, 중계, 상대 전력을 분리"],["중계","시청 행동","실시간 시청으로 이어지는 전환형 검색입니다.","중계 채널과 시작 시간을 정리"],["순위","순위 변수","결과가 순위와 경우의 수에 미치는 영향을 찾습니다.","순위표와 남은 경기 변수를 연결"],["하이라이트","영상 수요","경기 직후 가장 빠르게 붙는 재확인 검색입니다.","득점 장면과 논란 장면을 분리"],["엔트리","선수 명단","누가 뛰는지 확인하는 실시간 의도입니다.","선발, 교체, 부상 변수를 정리"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,7-f)):t.category==="incident"?[["현재상황","현재 상황","속보 뒤 지금 기준 정보를 확인하려는 검색입니다.","시간대별 상황과 공식 발표 분리"],["원인","원인 추적","사건의 배경과 책임 소재를 확인하려는 의도입니다.","원인, 피해, 후속 조치를 분리"],["위치","위치 확인","내 주변 영향 여부를 확인하려는 검색입니다.","위치, 통제, 우회 정보를 정리"],["피해","피해 규모","피해 범위와 현재 대응을 확인하는 흐름입니다.","피해 규모와 복구 상황 정리"],["대응방법","행동 요령","지금 무엇을 해야 하는지 찾는 의도입니다.","행동 순서와 주의사항을 정리"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,7-f)):[["전말","사건 전말","짧은 화제어 뒤 전체 맥락을 알고 싶은 검색입니다.","배경, 현재 반응, 남은 쟁점 분리"],["이유","발생 이유","왜 떴는지를 먼저 확인하려는 검색입니다.","원인과 반응을 시간순으로 정리"],["공식입장","공식 확인","추측보다 확인된 내용을 찾는 의도입니다.","공식 발표와 미확인 주장을 분리"],["타임라인","흐름 정리","무슨 일이 어떤 순서로 벌어졌는지 찾습니다.","처음 발생부터 현재까지 정리"],["후속 발표","다음 변수","지금 이후 무엇이 바뀌는지 확인하려는 검색입니다.","다음 일정과 영향 범위를 연결"]].forEach(([l,g,v,y],f)=>h(l,g,v,y,7-f));return Re(t,u,6)}function At(t,r,n,a){const o=`${t.keyword} ${t.core} ${t.entities.join(" ")} ${n.description||""}`,i=a.filter(h=>h.id!==n.id).map(h=>H(r,h)).filter(h=>h.keyword!==t.keyword).filter(h=>Ae(t,h)).slice(0,4).map((h,l)=>({label:h.keyword,tag:l===0?"같은 흐름":"연결 검색",reason:`${r.label}에서 함께 뜨는 검색 흐름입니다.`,title:`${t.keyword} 글에서 ${h.keyword}로 자연스럽게 내부 연결`,bias:5-l})),s=U((o.match(/[가-힣]{2,5}/g)||[]).filter(h=>!["검색어","검색량","문서수","실시간","후보","뉴스","정리","확인","대한민국"].includes(h)).slice(0,6)).filter(h=>!t.keyword.includes(h)||h.length>=3).slice(0,3).map((h,l)=>({label:`${h} 관련 쟁점`,tag:"인물·기관",reason:"본문에서 별도 소제목으로 분리할 수 있는 연결 대상입니다.",title:`${h}가 이 흐름에서 왜 검색되는지 분리`,bias:3-l})),u=Ce(t,r,n,a).map(h=>({label:h.label.replace(/.*?→\s*/,""),tag:h.tag,reason:h.reason,title:h.title,bias:1}));return Re(t,[...i,...s,...u],5)}function Ct(t,r,n){const a=H(t,r),o=zt(a,r),i=At(a,t,r,n),p=Ce(a,t,r,n).sort((s,u)=>u.score-s.score);return[{label:"다음 검색 의문",desc:"선택한 실시간 키워드에서 검색자가 바로 이어서 칠 만한 확장 키워드입니다.",items:o},{label:"문맥 확장 가지",desc:"같은 흐름의 인물·기관·후속 쟁점을 묶어 자동화 글감으로 바로 넘길 수 있게 정리합니다.",items:i},{label:"연결 이슈 클러스터",desc:"주변 실시간 흐름을 후속 글감으로 연결해 큰 키워드까지 권위를 쌓습니다.",items:p}]}function Tt({lane:t,item:r,items:n}){if(!r)return e.jsxs("aside",{className:"source-insight-panel source-insight-panel-empty",children:[e.jsx("strong",{children:"키워드 전략 대기"}),e.jsxs("p",{children:[t.label," 원본이 들어오면 다음 검색 의문과 연결 이슈 마인드맵을 표시합니다."]})]});const a=T(r.keyword||r.title,t.label),o=T(r.description||r.title,t.description),i=N(t.id,a),p=Ct(t,r,n),s=(p[0]?.items||[]).slice(0,4),u=(p[1]?.items||[]).slice(0,3),h=(p[2]?.items||[]).slice(0,3);return e.jsxs("aside",{className:"source-insight-panel source-insight-panel-rich",style:{borderColor:t.accent+"66"},children:[e.jsxs("div",{className:"source-insight-head",children:[e.jsxs("div",{children:[e.jsx("span",{style:{color:t.accent},children:"선택 키워드 마인드맵"}),e.jsx("strong",{children:a})]}),e.jsx("a",{href:i,target:"_blank",rel:"noreferrer",children:"검색결과"})]}),e.jsx("p",{className:"source-insight-desc",children:o}),e.jsxs("div",{className:"source-strategy-grid","aria-label":`${a} 키워드 전략`,children:[e.jsxs("section",{className:"source-strategy-card source-strategy-card-main",children:[e.jsxs("div",{className:"source-strategy-card-head",children:[e.jsx("strong",{children:p[0].label}),e.jsx("small",{children:p[0].desc})]}),e.jsx("div",{className:"source-idea-list",children:s.map(l=>e.jsxs("a",{className:"source-idea-card",href:N(t.id,l.label),target:"_blank",rel:"noreferrer",children:[e.jsx("span",{children:l.tag}),e.jsx("strong",{children:l.label}),e.jsxs("small",{children:["확장 적합도 ",l.score]}),e.jsx("p",{children:l.title})]},l.label))})]}),e.jsxs("section",{className:"source-strategy-card",children:[e.jsxs("div",{className:"source-strategy-card-head",children:[e.jsx("strong",{children:p[1].label}),e.jsx("small",{children:p[1].desc})]}),e.jsx("div",{className:"source-question-list",children:u.map(l=>e.jsxs("a",{href:N(t.id,l.label),target:"_blank",rel:"noreferrer",children:[e.jsx("span",{children:l.tag}),e.jsx("strong",{children:l.label}),e.jsx("small",{children:l.reason})]},l.label))})]}),e.jsxs("section",{className:"source-strategy-card",children:[e.jsxs("div",{className:"source-strategy-card-head",children:[e.jsx("strong",{children:p[2].label}),e.jsx("small",{children:p[2].desc})]}),e.jsx("div",{className:"source-cluster-core",style:{borderColor:t.accent,color:t.accent},children:a}),e.jsx("div",{className:"source-cluster-list",children:h.length===0?e.jsx("p",{children:"주변 실시간 키워드가 쌓이면 내부 링크용 클러스터를 자동으로 묶습니다."}):h.map(l=>e.jsxs("a",{href:N(t.id,l.label),target:"_blank",rel:"noreferrer",children:[e.jsx("span",{children:l.tag}),e.jsx("strong",{children:l.label})]},l.label))})]})]})]})}function Rt(t){if(!t)return"실시간 대기";const r=new Date(t);return Number.isNaN(r.getTime())?"실시간 갱신":new Intl.DateTimeFormat("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(r)}function Pt(t){const r=String(t||"").trim();return/^(data:image\/|https?:\/\/|\/images\/|\/)/i.test(r)?r.replace(/["\\\r\n]/g,""):""}const Lt=[{src:"/images/pricing-proof/adsense-10000-month.jpg",alt:"애드센스 이번 달 US$1만 예상 수입 인증",title:"이번 달 US$1만",desc:"애드센스 예상 수입이 크게 상승한 실제 성과 화면입니다.",metric:"월 수익"},{src:"/images/pricing-proof/adsense-daily-100.jpg",alt:"애드센스 오늘 US$100 이상 수익 인증",title:"오늘 US$100+",desc:"하루 수익이 눈에 보이게 올라온 운영 성과입니다.",metric:"일 수익"},{src:"/images/pricing-proof/adsense-28days-931.jpg",alt:"애드센스 최근 28일 US$931 성과 인증",title:"최근 28일 US$931",desc:"월간 운영 성과가 누적되는 흐름을 보여줍니다.",metric:"28일 성과"},{src:"/images/pricing-proof/adsense-today-95.jpg",alt:"애드센스 오늘 US$95.57 수익 인증",title:"오늘 US$95.57",desc:"당일 수익까지 바로 확인되는 성과 화면입니다.",metric:"당일 수익"},{src:"/images/pricing-proof/adsense-small-start.jpg",alt:"애드센스 초기 블로그 수익 상승 사례",title:"작은 블로그도 수익 흐름 확인",desc:"초기 운영 단계에서도 수익 변화를 확인한 사례입니다.",metric:"시작 사례"}],re=[{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg",alt:"네이버 블로그 방문횟수 9,177 성과 화면",title:"방문횟수 9,177 돌파",desc:"2월 15일 기준 방문 지표가 크게 상승한 실제 성과 화면입니다.",metric:"방문 9,177"},{src:"/images/proof-user/fast/KakaoTalk_20260310_002438127-fast.jpg",alt:"조회수 19,896 공감 213 성과 화면",title:"조회수 19,896 인증",desc:"조회수와 공감수가 함께 쌓인 고성과 요약 화면입니다.",metric:"조회 19,896"},{src:"/images/proof-user/fast/KakaoTalk_20260309_163736774-fast.jpg",alt:"카카오톡 사용자 조회수 10,003 인증 대화",title:"하루 만명 조회 인증",desc:"실사용자가 공유한 조회수 10,003 성과 인증 대화입니다.",metric:"조회 10,003"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_06-fast.jpg",alt:"블로그 예상수익 12,978원 성과 화면",title:"예상수익 상승",desc:"네이버 리워드 예상수익 그래프와 일별 수익 내역입니다.",metric:"₩12,978"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_04-fast.jpg",alt:"오늘 조회수 1,514 성과 화면",title:"오늘 조회수 1,514",desc:"실시간 조회수와 공감, 댓글이 함께 잡힌 운영 성과입니다.",metric:"조회 1,514"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_02-fast.jpg",alt:"오늘 조회수 1,187 성과 화면",title:"오늘 조회수 1,187",desc:"하루 조회 흐름이 빠르게 올라간 블로그 통계 화면입니다.",metric:"조회 1,187"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_05-fast.jpg",alt:"조회수 1,122와 방문 분석 성과 화면",title:"조회수 1,122 기록",desc:"방문 분석 그래프에서 우상향 흐름을 확인할 수 있는 화면입니다.",metric:"조회 1,122"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_03-fast.jpg",alt:"오늘 조회수 836 성과 화면",title:"오늘 조회수 836",desc:"조회수와 오늘 지표가 함께 표시된 네이버 통계 인증입니다.",metric:"조회 836"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_01-fast.jpg",alt:"조회수 그래프 5,928 성과 화면",title:"조회 그래프 급상승",desc:"1,062에서 5,928까지 상승한 추세가 보이는 그래프입니다.",metric:"5,928"},{src:"/images/proof-user/fast/KakaoTalk_20260309_164704537-fast.jpg",alt:"카카오톡 사용자 프로그램 사용 후기와 공감수 인증",title:"사용자 반응 인증",desc:"프로그램 사용 후 생긴 성과를 사용자가 직접 공유한 대화입니다.",metric:"공감 213"},{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252-fast.jpg",alt:"네이버 블로그 일간현황 조회수 상승 성과 화면",title:"방문자 상승 흐름",desc:"콘텐츠 발행 후 일간 지표가 누적되는 실제 성과 화면입니다.",metric:"조회수 80"}];function oe(){const[t,r]=c.useState(0),[n,a]=c.useState(()=>q("loading")),[o,i]=c.useState("naver"),[p,s]=c.useState(""),[u,h]=c.useState(null),[l,g]=c.useState(!1);c.useEffect(()=>{const d=document.title;return document.title="리더스프로 | Leaders Pro 네이버 자동화 툴 · AI 블로그 자동 발행",()=>{document.title=d}},[]),c.useEffect(()=>{const d=new IntersectionObserver(m=>{m.forEach((S,P)=>{S.isIntersecting&&(S.target.style.transitionDelay=`${P*.08}s`,S.target.classList.add("visible"),d.unobserve(S.target))})},{threshold:.1});return document.querySelectorAll(".fade-in").forEach(m=>d.observe(m)),()=>d.disconnect()},[]),c.useEffect(()=>{let d=!0;const m=$(()=>{yt().then(S=>{d&&a(S)}).catch(()=>{d&&a(q("error"))})},1100);return()=>{d=!1,m()}},[]),c.useEffect(()=>{let d=!0;const m=$(()=>{Se().then(S=>{d&&h(S)})},1400);return()=>{d=!1,m()}},[]),c.useEffect(()=>$(()=>g(!0),1700),[]);const v=Rt(n.updatedAt),y=n.status==="ready"?"LIVE":n.status==="error"?"FAST FALLBACK":"LOADING",f=n.lanes.find(d=>d.id===o)||n.lanes[0]||{...B[0],items:[]},_=f.items.slice(0,10),k=_.find(d=>T(d.keyword||d.title,f.label)===p)||_[0]||null,j=d=>{i(d),s("")},b=c.useMemo(()=>{const d=(u?.hero?.proofs||[]).filter(S=>!!S?.src).map(S=>({src:String(S.src||""),alt:S.alt,title:S.title,desc:S.desc,metric:S.metric})),m=d.length>0?d:re;return[...Lt,...m].filter((S,P,Pe)=>Pe.findIndex(Le=>Le.src===S.src)===P)},[u]),w=b[t%b.length]||re[0],E=u?.theme?.productsBgImage||u?.theme?.pricingBgImage||"";return c.useEffect(()=>{const d=Pt(E);if(!d)return;const m=document.body.style.background,S=document.body.style.backgroundAttachment;return document.body.style.background=`linear-gradient(180deg, rgba(10,10,15,0.10) 0%, rgba(10,10,15,0.25) 50%, rgba(10,10,15,0.45) 100%), url("${d}") center top / cover no-repeat, var(--bg-dark)`,document.body.style.backgroundAttachment="scroll",()=>{document.body.style.background=m,document.body.style.backgroundAttachment=S}},[E]),c.useEffect(()=>{if(b.length<=1||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const d=window.setInterval(()=>{r(m=>(m+1)%b.length)},4200);return()=>window.clearInterval(d)},[b.length]),c.useEffect(()=>{if(b.length<=1)return;const d=b[(t+1)%b.length];if(d?.src)return $(()=>{const m=new Image;m.decoding="async",m.src=d.src},1200)},[t,b]),e.jsxs(e.Fragment,{children:[l&&e.jsx(pt,{}),e.jsxs("section",{className:"home-hero",style:{minHeight:"calc(100vh - 80px)",display:"grid",gridTemplateColumns:"minmax(0, 980px) minmax(280px, 360px)",columnGap:24,rowGap:14,padding:"76px 24px 28px",maxWidth:1412,margin:"0 auto",position:"relative",zIndex:1,alignItems:"stretch",justifyContent:"center"},children:[e.jsxs("div",{className:"hero-eyebrow",children:[e.jsx("span",{style:{width:8,height:8,borderRadius:"50%",background:"var(--gold-primary)",boxShadow:"0 0 8px var(--gold-primary)"}}),e.jsx("span",{children:"PREMIUM AUTOMATION"})]}),e.jsx("div",{className:"hero-content",children:e.jsxs("div",{className:"hero-realtime-board","aria-label":"실시간 검색어",children:[e.jsxs("div",{className:"hero-realtime-head",children:[e.jsx("span",{children:y}),e.jsx("strong",{children:"실시간 검색어"}),e.jsx("small",{children:v})]}),e.jsx("div",{className:"hero-source-tabs",role:"tablist","aria-label":"홈 실시간 소스 선택",children:n.lanes.map(d=>{const m=d.id===f.id;return e.jsxs("button",{type:"button",role:"tab","aria-selected":m,className:`hero-source-tab${m?" active":""}`,onClick:()=>j(d.id),style:{borderColor:m?d.accent:"rgba(255,255,255,0.13)",color:m?"#061018":"rgba(255,255,255,0.74)",background:m?d.accent:"rgba(255,255,255,0.045)"},children:[e.jsx("span",{style:{background:m?"#061018":d.accent}}),e.jsx("strong",{children:d.label}),e.jsx("small",{children:d.items.length})]},d.id)})}),e.jsxs("div",{className:"hero-source-panel",style:{borderColor:f.accent+"66",background:"linear-gradient(135deg, "+f.accent+"16, rgba(255,255,255,0.035))"},children:[e.jsxs("div",{className:"hero-source-panel-head",children:[e.jsx("span",{style:{background:f.accent}}),e.jsxs("div",{children:[e.jsx("strong",{children:f.label}),e.jsx("p",{children:f.description})]}),e.jsxs("small",{children:[_.length,"개 표시"]})]}),e.jsxs("div",{className:"hero-source-body",children:[e.jsxs("div",{className:"hero-source-list-shell",children:[e.jsx("div",{className:"hero-source-list",children:_.length===0?e.jsxs("article",{className:"hero-source-empty",children:[e.jsx("strong",{children:"원본 수집 중"}),e.jsxs("p",{children:[f.label," 원본에서 확인된 실시간 항목만 표시합니다."]})]}):_.map((d,m)=>{const S=T(d.keyword||d.title,f.label),P=T(d.description||d.title,f.description);return e.jsxs("article",{className:`hero-source-row${k===d?" active":""}`,children:[e.jsxs("button",{type:"button",className:"hero-source-row-main",onClick:()=>s(S),children:[e.jsx("span",{children:m+1}),e.jsxs("div",{children:[e.jsx("strong",{children:S}),e.jsx("p",{children:P})]}),e.jsx("small",{children:d.priority||"LIVE"})]}),e.jsx("a",{className:"hero-source-row-search",href:N(f.id,S),target:"_blank",rel:"noreferrer",children:"검색"})]},d.id||`${f.id}-hero-${S}-${m}`)})}),_.length>5&&e.jsx("span",{className:"hero-source-scroll-hint","aria-hidden":"true",children:e.jsx("span",{})})]}),e.jsx(Tt,{lane:f,item:k,items:_})]})]})]})}),e.jsxs("div",{className:"hero-proof-stage","aria-label":"실제 사용자 성과 이미지",children:[e.jsxs("div",{className:"proof-summary",children:[e.jsx("span",{children:w.metric||"성과 인증"}),e.jsx("strong",{children:w.title||"실제 운영 성과"}),e.jsx("small",{children:w.desc||"사용자가 직접 확인한 성과 이미지를 순서대로 보여줍니다."})]}),e.jsx("div",{className:"proof-image-shell",children:e.jsx("img",{src:w.src,alt:w.alt||w.title||"Leaders Pro 사용자 성과 이미지",loading:"eager",decoding:"async",className:"proof-image active"},`${w.src}-${t}`)}),e.jsx("div",{className:"proof-dots",role:"tablist","aria-label":"성과 이미지 선택",children:b.map((d,m)=>e.jsx("button",{type:"button",className:m===t%b.length?"active":"",onClick:()=>r(m),"aria-label":`${m+1}번째 성과 이미지 보기`,"aria-selected":m===t%b.length},`${d.src}-dot-${m}`))})]}),e.jsx("div",{className:"hero-action-strip","aria-label":"홈 빠른 이동",children:[{to:"/leword",label:"황금키워드 보러가기",desc:"실시간 황금키워드를 바로 확인",tone:"gold"},{to:"/chatbots",label:"무료 챗봇 사용하러가기",desc:"질문하고 아이디어 바로 받기",tone:"cyan"},{to:"/pricing",label:"자동화 구매하러가기",desc:"발행 자동화를 바로 시작",tone:"green"}].map((d,m)=>e.jsxs(R,{to:d.to,className:`hero-action-button ${d.tone}`,style:{animationDelay:`${m*.14}s`},children:[e.jsx("strong",{children:d.label}),e.jsx("span",{children:d.desc})]},d.to))})]}),e.jsx("style",{children:`
                .hero-eyebrow {
                    grid-column: 1 / -1;
                    justify-self: center;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 16px;
                    background: rgba(201, 168, 76, 0.1);
                    border: 1px solid rgba(201, 168, 76, 0.3);
                    border-radius: 50px;
                    color: var(--gold-primary);
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 2px;
                }

                .hero-realtime-board {
                    width: 100%;
                    min-height: 0;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    display: grid;
                    grid-template-rows: auto auto minmax(0, 1fr);
                    gap: 16px;
                    margin: 0;
                    padding: 18px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(8,15,24,0.62);
                    backdrop-filter: blur(16px);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.22);
                }

                .hero-realtime-head {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }

                .hero-realtime-head span {
                    flex: 0 0 auto;
                    padding: 6px 10px;
                    border-radius: 999px;
                    background: rgba(68,215,182,0.14);
                    color: #44d7b6;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                }

                .hero-realtime-head strong {
                    color: #fff;
                    font-size: 14px;
                    font-weight: 900;
                }

                .hero-realtime-head small {
                    margin-left: auto;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .hero-source-tabs {
                    display: flex;
                    flex-wrap: nowrap;
                    align-items: center;
                    gap: 7px;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }

                .hero-source-tabs::-webkit-scrollbar {
                    display: none;
                }

                .hero-source-tab {
                    min-height: 38px;
                    flex: 0 0 auto;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.13);
                    border-radius: 999px;
                    font: inherit;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .hero-source-tab:hover,
                .hero-source-tab.active {
                    transform: translateY(-1px);
                }

                .hero-source-tab span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex: 0 0 auto;
                }

                .hero-source-tab strong {
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-tab small {
                    min-width: 18px;
                    padding: 2px 5px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.16);
                    font-size: 11px;
                    font-weight: 900;
                    text-align: center;
                }

                .hero-source-panel {
                    min-height: 0;
                    height: 100%;
                    display: grid;
                    grid-template-rows: auto minmax(0, 1fr);
                    align-content: start;
                    gap: 12px;
                    padding: 14px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .hero-source-panel-head {
                    display: grid;
                    grid-template-columns: 12px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .hero-source-panel-head > span {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                }

                .hero-source-panel-head strong {
                    display: block;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }

                .hero-source-panel-head p {
                    margin: 3px 0 0;
                    color: rgba(255,255,255,0.60);
                    font-size: 12px;
                    line-height: 1.38;
                }

                .hero-source-panel-head small {
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-list {
                    display: grid;
                    align-content: start;
                    gap: 7px;
                    height: 100%;
                    max-height: 100%;
                    min-height: 0;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    padding-right: 10px;
                    scrollbar-gutter: stable;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(68,215,182,0.95) rgba(255,255,255,0.12);
                }

                .hero-source-list::-webkit-scrollbar,
                .source-insight-panel::-webkit-scrollbar {
                    width: 11px;
                }

                .hero-source-list::-webkit-scrollbar-track,
                .source-insight-panel::-webkit-scrollbar-track {
                    border-radius: 999px;
                    background: rgba(255,255,255,0.12);
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
                }

                .hero-source-list::-webkit-scrollbar-thumb,
                .source-insight-panel::-webkit-scrollbar-thumb {
                    border: 2px solid rgba(13,28,42,0.96);
                    border-radius: 999px;
                    background: linear-gradient(180deg, #44d7b6, #2f8cff);
                    box-shadow: 0 0 14px rgba(68,215,182,0.38);
                }

                .hero-source-list::-webkit-scrollbar-thumb:hover,
                .source-insight-panel::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #65ffd9, #59a8ff);
                }

                .hero-source-list-shell {
                    position: relative;
                    min-width: 0;
                    height: 100%;
                    min-height: 0;
                }

                .hero-source-scroll-hint {
                    position: absolute;
                    top: 8px;
                    right: 2px;
                    bottom: 8px;
                    width: 12px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background: rgba(255,255,255,0.13);
                    box-shadow: inset 0 0 0 1px rgba(6,13,22,0.68), 0 0 18px rgba(68,215,182,0.20);
                    pointer-events: none;
                    z-index: 3;
                }

                .hero-source-scroll-hint span {
                    position: absolute;
                    left: 2px;
                    right: 2px;
                    top: 8px;
                    height: 34%;
                    border-radius: 999px;
                    background: linear-gradient(180deg, #65ffd9, #2f8cff);
                    box-shadow: 0 0 12px rgba(68,215,182,0.50);
                    animation: sourceScrollHint 2.8s ease-in-out infinite;
                }

                @keyframes sourceScrollHint {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(18px); }
                }

                .hero-source-empty {
                    min-height: 96px;
                    display: grid;
                    align-content: center;
                    gap: 6px;
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px dashed rgba(255,255,255,0.16);
                    background: rgba(255,255,255,0.035);
                }

                .hero-source-empty strong {
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                }

                .hero-source-empty p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .hero-source-row {
                    min-height: 48px;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 46px;
                    align-items: center;
                    gap: 6px;
                    padding: 0;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.045);
                    overflow: hidden;
                }

                .hero-source-row-main {
                    min-width: 0;
                    width: 100%;
                    height: 100%;
                    display: grid;
                    grid-template-columns: 30px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 9px;
                    padding: 7px 8px 7px 10px;
                    border: 0;
                    background: transparent;
                    color: inherit;
                    text-align: left;
                    font: inherit;
                    cursor: pointer;
                }

                .hero-source-row-main > span {
                    width: 26px;
                    height: 26px;
                    border-radius: 999px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.10);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 900;
                }

                .hero-source-row strong {
                    display: block;
                    min-width: 0;
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.28;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hero-source-row p {
                    margin: 2px 0 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 11px;
                    line-height: 1.3;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hero-source-row-main > small {
                    color: rgba(255,255,255,0.56);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-row-search {
                    width: 40px;
                    min-height: 32px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 6px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.14);
                    color: rgba(255,255,255,0.74);
                    text-decoration: none;
                    font-size: 11px;
                    font-weight: 900;
                }

                .hero-source-body,
                .home-source-body {
                    display: grid;
                    grid-template-columns: minmax(330px, 0.82fr) minmax(0, 1.18fr);
                    gap: 12px;
                    align-items: start;
                    min-height: 0;
                    height: 100%;
                }

                .hero-source-row,
                .home-source-row {
                    color: inherit;
                    text-decoration: none;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .hero-source-row:hover,
                .hero-source-row.active,
                .home-source-row:hover,
                .home-source-row.active {
                    transform: translateY(-1px);
                    border-color: rgba(255,255,255,0.24);
                    background: rgba(255,255,255,0.085);
                }

                .source-insight-panel {
                    min-width: 0;
                    height: 100%;
                    min-height: 0;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    scrollbar-gutter: stable;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(68,215,182,0.95) rgba(255,255,255,0.12);
                    display: grid;
                    gap: 10px;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(5,10,18,0.35);
                }

                .source-insight-panel-empty {
                    min-height: 180px;
                    align-content: center;
                    border-style: dashed;
                }

                .source-insight-panel-empty strong {
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                }

                .source-insight-panel-empty p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .source-insight-head {
                    display: flex;
                    align-items: start;
                    justify-content: space-between;
                    gap: 10px;
                }

                .source-insight-head span {
                    display: block;
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-insight-head strong {
                    display: block;
                    max-width: 310px;
                    margin-top: 3px;
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                    line-height: 1.25;
                    max-height: 38px;
                    overflow: hidden;
                }

                .source-insight-head a {
                    flex: 0 0 auto;
                    padding: 6px 9px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.16);
                    color: rgba(255,255,255,0.84);
                    text-decoration: none;
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-insight-desc {
                    margin: 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 11px;
                    line-height: 1.45;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .source-insight-panel-rich {
                    align-content: start;
                }

                .source-strategy-grid {
                    min-height: 0;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                    align-content: start;
                }

                .source-strategy-card {
                    min-width: 0;
                    display: grid;
                    gap: 8px;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.04);
                }

                .source-strategy-card-main {
                    grid-column: 1 / -1;
                }

                .source-strategy-card-head {
                    display: grid;
                    gap: 3px;
                }

                .source-strategy-card-head strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 950;
                }

                .source-strategy-card-head small {
                    color: rgba(255,255,255,0.56);
                    font-size: 10px;
                    line-height: 1.35;
                }

                .source-idea-list {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 6px;
                }

                .source-idea-card,
                .source-question-list a,
                .source-cluster-list a {
                    min-width: 0;
                    display: grid;
                    gap: 4px;
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.10);
                    background: rgba(7,13,20,0.35);
                    color: inherit;
                    text-decoration: none;
                }

                .source-idea-card span,
                .source-question-list span,
                .source-cluster-list span {
                    color: #44d7b6;
                    font-size: 10px;
                    font-weight: 950;
                }

                .source-idea-card strong,
                .source-question-list strong,
                .source-cluster-list strong {
                    color: #fff;
                    font-size: 11px;
                    font-weight: 900;
                    line-height: 1.25;
                    min-height: 28px;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }

                .source-idea-card small,
                .source-question-list small {
                    color: rgba(255,255,255,0.58);
                    font-size: 10px;
                    line-height: 1.25;
                }

                .source-idea-card p {
                    margin: 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 10px;
                    line-height: 1.3;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .source-question-list,
                .source-cluster-list {
                    display: grid;
                    gap: 6px;
                }

                .source-cluster-core {
                    min-height: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 7px 9px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.18);
                    background: rgba(255,255,255,0.055);
                    font-size: 11px;
                    font-weight: 950;
                    line-height: 1.2;
                    text-align: center;
                }

                .source-cluster-list p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 10px;
                    line-height: 1.45;
                }

                .source-publish-guide {
                    display: grid;
                    gap: 7px;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(68,215,182,0.22);
                    background: rgba(68,215,182,0.08);
                }

                .source-publish-guide strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 950;
                }

                .source-publish-guide div {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 6px;
                }

                .source-publish-guide span {
                    min-width: 0;
                    padding: 7px 8px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.72);
                    font-size: 10px;
                    font-weight: 850;
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .source-mindmap {
                    display: grid;
                    gap: 10px;
                }

                .source-mindmap-core {
                    min-height: 42px;
                    max-height: 42px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 9px 11px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.18);
                    background: rgba(255,255,255,0.055);
                    font-size: 12px;
                    font-weight: 900;
                    text-align: center;
                    line-height: 1.25;
                    overflow: hidden;
                }

                .source-mindmap-branches {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 7px;
                }

                .source-mindmap-branch {
                    min-width: 0;
                    display: grid;
                    gap: 5px;
                    padding: 8px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.045);
                }

                .source-mindmap-branch span {
                    color: rgba(255,255,255,0.88);
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-mindmap-branch a,
                .source-expansion-chips a {
                    min-width: 0;
                    color: rgba(255,255,255,0.62);
                    text-decoration: none;
                    font-size: 10px;
                    font-weight: 800;
                    line-height: 1.25;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .source-mindmap-branch a:hover,
                .source-expansion-chips a:hover,
                .source-insight-head a:hover {
                    color: #fff;
                    border-color: rgba(255,255,255,0.28);
                }

                .source-expansion-box {
                    display: grid;
                    gap: 8px;
                }

                .source-expansion-box > strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 900;
                }

                .source-expansion-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    max-height: 64px;
                    overflow-y: auto;
                }

                .source-expansion-chips a {
                    max-width: 100%;
                    padding: 6px 8px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.13);
                    background: rgba(255,255,255,0.045);
                }


                .hero-live-rack {
                    margin-top: 22px;
                    display: grid;
                    gap: 12px;
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(9,14,22,0.64);
                    backdrop-filter: blur(14px);
                }

                .hero-live-rack-main {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }

                .hero-live-rack-main span {
                    flex: 0 0 auto;
                    padding: 5px 9px;
                    border-radius: 999px;
                    background: rgba(68,215,182,0.14);
                    color: #44d7b6;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                }

                .hero-live-rack-main strong {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #fff;
                    font-size: 14px;
                }

                .hero-live-rack-main small {
                    flex: 0 0 auto;
                    color: rgba(255,255,255,0.54);
                    font-size: 12px;
                }

                .hero-live-rack-lanes {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 7px;
                }

                .hero-live-rack-lanes span {
                    padding: 5px 9px;
                    border: 1px solid;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 800;
                    background: rgba(255,255,255,0.04);
                }

                .hero-content {
                    width: 100%;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    justify-self: stretch;
                    align-self: stretch;
                    display: grid;
                    text-align: center;
                    position: relative;
                    z-index: 3;
                }

                .hero-action-strip {
                    grid-column: 1 / -1;
                    width: 100%;
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                }

                .hero-action-button {
                    position: relative;
                    min-height: 82px;
                    display: grid;
                    align-content: center;
                    gap: 7px;
                    padding: 16px 18px;
                    border-radius: 8px;
                    border: 3px solid rgba(255,255,255,0.30);
                    background: linear-gradient(135deg, rgba(1,5,10,0.98), rgba(10,18,30,0.96));
                    color: #fff;
                    text-decoration: none;
                    text-align: left;
                    overflow: hidden;
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12);
                    animation: heroActionPulse 2.7s ease-in-out infinite;
                    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
                }

                .hero-action-button::before {
                    content: '';
                    position: absolute;
                    inset: -2px;
                    background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.18) 45%, transparent 62%);
                    transform: translateX(-120%);
                    animation: heroActionShine 3.6s ease-in-out infinite;
                    pointer-events: none;
                }

                .hero-action-button:hover {
                    transform: translateY(-3px) scale(1.015);
                    border-color: rgba(255,255,255,0.52);
                    box-shadow: 0 30px 68px rgba(0,0,0,0.62), 0 0 34px rgba(225,177,44,0.24);
                }

                .hero-action-button strong,
                .hero-action-button span {
                    position: relative;
                    z-index: 1;
                }

                .hero-action-button strong {
                    color: #fff;
                    font-size: 17px;
                    font-weight: 950;
                    line-height: 1.28;
                }

                .hero-action-button span {
                    color: rgba(255,255,255,0.70);
                    font-size: 14px;
                    font-weight: 800;
                    line-height: 1.35;
                }

                .hero-action-button.gold {
                    border-color: rgba(225,177,44,0.95);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(225,177,44,0.34);
                }

                .hero-action-button.cyan {
                    border-color: rgba(64,210,255,0.88);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(64,210,255,0.26);
                }

                .hero-action-button.green {
                    border-color: rgba(68,215,182,0.88);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(68,215,182,0.26);
                }

                @keyframes heroActionPulse {
                    0%, 100% { transform: translateY(0); filter: brightness(1); }
                    50% { transform: translateY(-2px); filter: brightness(1.16); }
                }

                @keyframes heroActionShine {
                    0%, 38% { transform: translateX(-120%); }
                    62%, 100% { transform: translateX(120%); }
                }



                .home-live-section {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 76px 24px 88px;
                    position: relative;
                    z-index: 1;
                }

                .home-live-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    align-items: flex-end;
                    margin-bottom: 24px;
                }

                .home-live-header h2 {
                    margin: 10px 0 8px;
                    color: var(--text-primary);
                    font-size: clamp(28px, 4vw, 44px);
                    line-height: 1.18;
                    letter-spacing: 0;
                }

                .home-live-header p {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 15px;
                    line-height: 1.6;
                }

                .home-live-status {
                    display: grid;
                    gap: 4px;
                    min-width: 138px;
                    padding: 12px 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(68,215,182,0.28);
                    background: rgba(68,215,182,0.08);
                    text-align: right;
                }

                .home-live-status strong {
                    color: #44d7b6;
                    font-size: 13px;
                    font-weight: 900;
                }

                .home-live-status span {
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                }

                .home-live-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 22px;
                }

                .home-live-metrics div {
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.10);
                    background: rgba(255,255,255,0.04);
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 12px;
                }

                .home-live-metrics strong {
                    color: #fff;
                    font-size: 28px;
                    font-weight: 900;
                }

                .home-live-metrics span {
                    color: var(--text-secondary);
                    font-size: 13px;
                    font-weight: 700;
                }

                .home-live-grid {
                    display: grid;
                    grid-template-columns: minmax(260px, 0.95fr) minmax(420px, 1.5fr) minmax(260px, 0.9fr);
                    gap: 18px;
                    align-items: stretch;
                }

                .home-live-group {
                    min-width: 0;
                    display: grid;
                    align-content: start;
                    gap: 12px;
                }

                .home-live-group-title {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    min-height: 30px;
                    gap: 12px;
                }

                .home-live-group-title span {
                    color: #fff;
                    font-weight: 900;
                    font-size: 15px;
                }

                .home-live-group-title a,
                .home-live-group-title small {
                    color: var(--gold-primary);
                    font-size: 12px;
                    font-weight: 800;
                    text-decoration: none;
                    white-space: nowrap;
                }

                .home-golden-list {
                    display: grid;
                    gap: 12px;
                }

                .home-golden-card,
                .home-source-panel,
                .home-proof-card {
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(12,18,28,0.72);
                    box-shadow: 0 18px 46px rgba(0,0,0,0.18);
                }

                .home-golden-card {
                    min-height: 142px;
                    display: grid;
                    grid-template-columns: 52px minmax(0, 1fr);
                    gap: 12px;
                    padding: 16px;
                }

                .home-golden-rank {
                    width: 44px;
                    height: 44px;
                    border-radius: 8px;
                    background: rgba(244,201,93,0.14);
                    color: #f4c95d;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 900;
                    font-size: 13px;
                }

                .home-golden-card strong {
                    display: block;
                    color: #fff;
                    font-size: 16px;
                    line-height: 1.35;
                    margin-bottom: 7px;
                }

                .home-golden-card p {
                    margin: 0 0 10px;
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                    line-height: 1.55;
                }

                .home-golden-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .home-golden-meta span {
                    padding: 4px 7px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.07);
                    color: rgba(255,255,255,0.74);
                    font-size: 11px;
                    font-weight: 800;
                }

                .home-source-tabs {
                    display: flex;
                    flex-wrap: nowrap;
                    gap: 6px;
                    align-items: center;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }

                .home-source-tabs::-webkit-scrollbar {
                    display: none;
                }

                .home-source-tab {
                    min-height: 42px;
                    flex: 0 0 auto;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 9px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.045);
                    font: inherit;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .home-source-tab:hover,
                .home-source-tab.active {
                    transform: translateY(-1px);
                    background: rgba(255,255,255,0.09);
                }

                .home-source-tab span,
                .home-source-panel-head > span {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    flex: 0 0 auto;
                }

                .home-source-tab strong {
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-source-tab small {
                    min-width: 18px;
                    padding: 2px 5px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.10);
                    color: rgba(255,255,255,0.72);
                    font-size: 11px;
                    font-weight: 900;
                    text-align: center;
                }

                .home-source-panel {
                    min-height: 364px;
                    padding: 16px;
                    display: grid;
                    align-content: start;
                    gap: 14px;
                }

                .home-source-panel-head {
                    display: grid;
                    grid-template-columns: 12px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 10px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .home-source-panel-head strong {
                    display: block;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }

                .home-source-panel-head p {
                    margin: 3px 0 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.4;
                }

                .home-source-panel-head small {
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-source-list {
                    display: grid;
                    gap: 10px;
                }

                .home-source-row {
                    min-height: 72px;
                    display: grid;
                    grid-template-columns: 38px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 11px;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(5,10,18,0.34);
                }

                .home-source-row-rank {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.09);
                    color: #fff;
                    font-size: 12px;
                    font-weight: 900;
                }

                .home-source-row strong {
                    display: block;
                    color: #fff;
                    font-size: 15px;
                    line-height: 1.34;
                    letter-spacing: 0;
                    overflow-wrap: anywhere;
                }

                .home-source-row p {
                    margin: 5px 0 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .home-source-row > small {
                    padding: 5px 7px;
                    border-radius: 999px;
                    background: rgba(244,201,93,0.12);
                    color: #f4c95d;
                    font-size: 11px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-proof-card {
                    overflow: hidden;
                }

                .home-proof-card img {
                    width: 100%;
                    height: 255px;
                    display: block;
                    object-fit: contain;
                    background: rgba(0,0,0,0.28);
                    padding: 12px;
                }

                .home-proof-card div {
                    padding: 16px;
                }

                .home-proof-card span {
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                }

                .home-proof-card strong {
                    display: block;
                    margin: 6px 0;
                    color: #fff;
                    font-size: 17px;
                    line-height: 1.35;
                }

                .home-proof-card p {
                    margin: 0;
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                    line-height: 1.55;
                }

                .hero-proof-stage {
                    position: relative;
                    width: 100%;
                    min-height: 0;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                    overflow: hidden;
                    border-radius: 8px;
                    opacity: 0.92;
                    pointer-events: auto;
                }

                .hero-proof-stage::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 8px;
                    border: 1px solid rgba(201,168,76,0.28);
                    background:
                        linear-gradient(135deg, rgba(12,18,28,0.78), rgba(5,8,12,0.52)),
                        linear-gradient(90deg, rgba(244,201,93,0.10), rgba(68,215,182,0.08));
                    box-shadow: 0 26px 90px rgba(0,0,0,0.30);
                    pointer-events: none;
                    z-index: -2;
                }

                .proof-summary {
                    position: absolute;
                    left: 16px;
                    top: 16px;
                    width: calc(100% - 32px);
                    display: grid;
                    gap: 6px;
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(8,13,18,0.78);
                    backdrop-filter: blur(14px);
                    z-index: 4;
                    box-shadow: 0 18px 46px rgba(0,0,0,0.26);
                }

                .proof-summary span {
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                }

                .proof-summary strong {
                    color: #fff;
                    font-size: 18px;
                    line-height: 1.35;
                }

                .proof-summary small {
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .proof-image-shell {
                    width: 100%;
                    height: 390px;
                    position: relative;
                    z-index: 1;
                    overflow: hidden;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background:
                        linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
                        #080d12;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 26px 90px rgba(0,0,0,0.34);
                }

                .proof-image {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    object-position: center;
                    padding: 18px;
                    opacity: 0;
                    transform: translateX(22px) scale(0.985);
                    transition: opacity 0.52s ease, transform 0.52s ease;
                }

                .proof-image.active {
                    opacity: 1;
                    transform: translateX(0) scale(1);
                }

                .proof-dots {
                    position: absolute;
                    left: 50%;
                    bottom: 22px;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    z-index: 5;
                }

                .proof-dots button {
                    width: 9px;
                    height: 9px;
                    border: 0;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.32);
                    cursor: pointer;
                    transition: width 0.2s ease, background 0.2s ease;
                }

                .proof-dots button.active {
                    width: 28px;
                    background: #f4c95d;
                }

                @media (max-width: 1080px) {
                    .home-live-grid {
                        grid-template-columns: 1fr;
                    }

                    .home-source-panel {
                        min-height: 320px;
                    }
                }

                @media (max-width: 900px) {
                    .hero-realtime-board {
                        width: 100%;
                        height: auto;
                    }

                    .hero-realtime-primary h1 {
                        font-size: clamp(34px, 8vw, 56px);
                    }

                    .home-hero {
                        grid-template-columns: 1fr !important;
                        gap: 18px !important;
                        min-height: auto !important;
                        padding: 92px 18px 44px !important;
                    }

                    .hero-proof-stage {
                        display: flex;
                        height: auto;
                        min-height: 430px;
                    }

                    .proof-image-shell {
                        width: 100%;
                        height: 330px;
                    }
                }

                @media (max-width: 640px) {
                    .home-hero {
                        width: 100%;
                        padding: 82px 12px 34px !important;
                    }

                    .hero-realtime-board {
                        height: auto;
                        padding: 12px;
                        gap: 12px;
                        background: rgba(8,15,24,0.78);
                    }

                    .hero-realtime-head {
                        align-items: flex-start;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .hero-realtime-head small {
                        margin-left: 0;
                    }

                    .hero-source-panel {
                        min-height: 0;
                        padding: 12px;
                        height: auto;
                        overflow: visible;
                    }

                    .hero-source-body {
                        grid-template-columns: 1fr;
                        height: auto;
                    }

                    .hero-source-list {
                        max-height: 310px;
                    }

                    .source-insight-panel {
                        display: grid;
                        height: auto;
                        max-height: none;
                        overflow: visible;
                        padding: 12px;
                    }

                    .source-insight-head {
                        display: grid;
                        gap: 8px;
                    }

                    .source-insight-head strong {
                        max-width: none;
                        max-height: none;
                        font-size: 16px;
                    }

                    .source-insight-head a {
                        justify-self: start;
                        min-height: 34px;
                        display: inline-flex;
                        align-items: center;
                    }

                    .source-insight-desc {
                        -webkit-line-clamp: unset;
                        font-size: 12px;
                    }

                    .source-strategy-grid {
                        grid-template-columns: 1fr;
                    }

                    .hero-action-strip {
                        grid-template-columns: 1fr;
                        margin: 0 auto;
                        gap: 10px;
                    }

                    .hero-action-button {
                        width: 100%;
                        justify-self: start;
                        min-height: 72px;
                        padding: 14px 18px;
                    }

                    .hero-action-button strong {
                        font-size: 18px;
                    }

                    .hero-source-panel-head {
                        grid-template-columns: 12px minmax(0, 1fr);
                    }

                    .hero-source-panel-head small {
                        grid-column: 2;
                    }

                    .hero-source-row {
                        grid-template-columns: minmax(0, 1fr) 42px;
                        align-items: start;
                        min-height: 64px;
                    }

                    .hero-source-row-main {
                        grid-template-columns: 28px minmax(0, 1fr);
                        align-items: start;
                    }

                    .hero-source-row-main > small {
                        grid-column: 2;
                        justify-self: start;
                    }

                    .hero-source-row-search {
                        width: 36px;
                        min-height: 30px;
                        margin: 8px 5px 0 0;
                    }

                    .hero-source-row strong,
                    .hero-source-row p {
                        white-space: normal;
                    }

                    .hero-live-rack-main {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    .hero-live-rack-main strong {
                        white-space: normal;
                    }

                    .home-live-section {
                        margin: 14px 12px 0;
                        padding: 18px 12px 28px;
                    }

                    .home-live-header {
                        display: grid;
                        align-items: start;
                        gap: 12px;
                    }

                    .home-live-status {
                        width: 100%;
                        text-align: left;
                        grid-template-columns: 1fr 1fr;
                    }

                    .home-live-metrics {
                        grid-template-columns: 1fr 1fr;
                        gap: 10px;
                    }

                    .home-source-tabs {
                        flex-wrap: nowrap;
                        overflow-x: auto;
                        padding-bottom: 2px;
                        scrollbar-width: none;
                    }

                    .home-source-tabs::-webkit-scrollbar {
                        display: none;
                    }

                    .home-source-tab {
                        flex: 0 0 auto;
                    }

                    .home-source-panel {
                        min-height: 0;
                        padding: 14px;
                    }

                    .home-source-panel-head {
                        grid-template-columns: 12px minmax(0, 1fr);
                    }

                    .home-source-panel-head small {
                        grid-column: 2;
                    }

                    .home-source-row {
                        grid-template-columns: 34px minmax(0, 1fr);
                    }

                    .home-source-row > small {
                        grid-column: 2;
                        justify-self: start;
                    }

                    .home-golden-card {
                        grid-template-columns: 1fr;
                        padding: 14px;
                        gap: 12px;
                    }

                    .home-golden-card > span {
                        width: max-content;
                    }

                    .hero-proof-stage {
                        min-height: 380px;
                        margin-top: 0;
                        padding: 10px;
                    }

                    .hero-proof-stage::before {
                        inset: 0;
                    }

                    .proof-summary {
                        display: grid;
                        left: 10px;
                        top: 10px;
                        width: calc(100% - 20px);
                        padding: 10px;
                    }

                    .proof-summary strong {
                        font-size: 14px;
                    }

                    .proof-summary small {
                        font-size: 11px;
                    }

                    .proof-image-shell {
                        height: 250px;
                        margin-top: 96px;
                    }

                    .proof-image {
                        padding: 10px;
                    }

                    .proof-dots {
                        bottom: 16px;
                    }
                }

                @media (max-width: 420px) {
                    .hero-source-tabs,
                    .home-source-tabs {
                        gap: 6px;
                    }

                    .hero-source-tab {
                        min-height: 36px;
                        padding: 7px 9px;
                    }

                    .hero-source-row {
                        grid-template-columns: 1fr;
                    }

                    .hero-source-row-search {
                        justify-self: start;
                        margin: 8px 0 0;
                        width: auto;
                        min-width: 44px;
                        padding: 0 12px;
                    }

                    .home-live-status,
                    .home-live-metrics {
                        grid-template-columns: 1fr;
                    }

                    .hero-action-button strong {
                        font-size: 16px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .hero-action-button,
                    .hero-action-button::before {
                        animation: none;
                    }
                }
            `})]})}const ne=c.lazy(()=>I(()=>import("./ProductsPage-DJlGdC4z.js"),__vite__mapDeps([0,1,2]))),ae=c.lazy(()=>I(()=>import("./DetailPage-CLYURiup.js"),__vite__mapDeps([3,1]))),ie=c.lazy(()=>I(()=>import("./LewordDetailPage-CvvV3RwK.js"),__vite__mapDeps([4,1,2]))),se=c.lazy(()=>I(()=>import("./LewordPage-Br8wT_tP.js"),__vite__mapDeps([5,1]))),le=c.lazy(()=>I(()=>import("./OrbitPage-v4Ex5bw9.js"),__vite__mapDeps([6,1,2]))),ce=c.lazy(()=>I(()=>import("./PricingPage-BvALJe7u.js"),__vite__mapDeps([7,1,8]))),de=c.lazy(()=>I(()=>import("./DownloadPage-CkeWGwAF.js"),__vite__mapDeps([9,1,2]))),pe=c.lazy(()=>I(()=>import("./ChatbotsPage-DWEX3hmZ.js"),__vite__mapDeps([10,1]))),he=c.lazy(()=>I(()=>import("./ReviewsPage-DHCEu79A.js"),__vite__mapDeps([11,1,12]))),ue=c.lazy(()=>I(()=>import("./CommunityPage-DIwSw6Ps.js"),__vite__mapDeps([13,1,12]))),ge=c.lazy(()=>I(()=>import("./LookupPage-BUQz9D1h.js"),__vite__mapDeps([14,1]))),me=c.lazy(()=>I(()=>import("./RefundPage-Cw2HDTkP.js"),__vite__mapDeps([15,1,16]))),fe=c.lazy(()=>I(()=>import("./TermsPage-B1usqYkS.js"),__vite__mapDeps([17,1,16]))),xe=c.lazy(()=>I(()=>import("./PrivacyPage-D4vdaV5m.js"),__vite__mapDeps([18,1,16]))),be=c.lazy(()=>I(()=>import("./BankOrderPage-DDpPKwaf.js"),__vite__mapDeps([19,1,8]))),Nt=c.lazy(()=>I(()=>import("./NotFoundPage-DPEAqIBu.js"),__vite__mapDeps([20,1])));function $t(){return e.jsx("div",{style:{minHeight:"70vh",display:"grid",placeItems:"center",color:"rgba(255,255,255,0.62)",fontSize:14},children:"불러오는 중..."})}function ye(){return c.useEffect(()=>{window.location.replace("/admin/")},[]),e.jsx("div",{style:{minHeight:"100vh",display:"grid",placeItems:"center",background:"#0a0a0f",color:"#f8fafc",padding:24},children:e.jsxs("div",{style:{width:"min(420px, 100%)",border:"1px solid rgba(201,168,76,0.36)",borderRadius:18,padding:28,background:"rgba(255,255,255,0.04)",textAlign:"center"},children:[e.jsx("h1",{style:{margin:"0 0 10px",color:"#f5d76e",fontSize:24},children:"관리자 페이지로 이동 중"}),e.jsx("p",{style:{margin:"0 0 20px",color:"rgba(255,255,255,0.68)",lineHeight:1.6},children:"잠시 후 관리자 전용 패널이 열립니다."}),e.jsx("a",{href:"/admin/",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:44,padding:"0 18px",borderRadius:12,background:"#d8b441",color:"#111827",fontWeight:900,textDecoration:"none"},children:"바로 열기"})]})})}function Ot(){const t=M();return c.useEffect(()=>{tt(t.pathname+t.search)},[t.pathname,t.search]),e.jsx(c.Suspense,{fallback:e.jsx($t,{}),children:e.jsxs(Oe,{children:[e.jsx(x,{path:"/admin",element:e.jsx(ye,{})}),e.jsx(x,{path:"/admin.html",element:e.jsx(ye,{})}),e.jsxs(x,{element:e.jsx(dt,{}),children:[e.jsx(x,{path:"/",element:e.jsx(oe,{})}),e.jsx(x,{path:"/index.html",element:e.jsx(oe,{})}),e.jsx(x,{path:"/products",element:e.jsx(ne,{})}),e.jsx(x,{path:"/products.html",element:e.jsx(ne,{})}),e.jsx(x,{path:"/detail",element:e.jsx(ae,{})}),e.jsx(x,{path:"/detail.html",element:e.jsx(ae,{})}),e.jsx(x,{path:"/leword-detail",element:e.jsx(ie,{})}),e.jsx(x,{path:"/leword-detail.html",element:e.jsx(ie,{})}),e.jsx(x,{path:"/leword",element:e.jsx(se,{})}),e.jsx(x,{path:"/leword.html",element:e.jsx(se,{})}),e.jsx(x,{path:"/orbit",element:e.jsx(le,{})}),e.jsx(x,{path:"/orbit.html",element:e.jsx(le,{})}),e.jsx(x,{path:"/pricing",element:e.jsx(ce,{})}),e.jsx(x,{path:"/pricing.html",element:e.jsx(ce,{})}),e.jsx(x,{path:"/download",element:e.jsx(de,{})}),e.jsx(x,{path:"/download.html",element:e.jsx(de,{})}),e.jsx(x,{path:"/chatbots",element:e.jsx(pe,{})}),e.jsx(x,{path:"/chatbots.html",element:e.jsx(pe,{})}),e.jsx(x,{path:"/reviews",element:e.jsx(he,{})}),e.jsx(x,{path:"/reviews.html",element:e.jsx(he,{})}),e.jsx(x,{path:"/community",element:e.jsx(ue,{})}),e.jsx(x,{path:"/community.html",element:e.jsx(ue,{})}),e.jsx(x,{path:"/lookup",element:e.jsx(ge,{})}),e.jsx(x,{path:"/lookup.html",element:e.jsx(ge,{})}),e.jsx(x,{path:"/refund",element:e.jsx(me,{})}),e.jsx(x,{path:"/refund.html",element:e.jsx(me,{})}),e.jsx(x,{path:"/terms",element:e.jsx(fe,{})}),e.jsx(x,{path:"/terms.html",element:e.jsx(fe,{})}),e.jsx(x,{path:"/privacy",element:e.jsx(xe,{})}),e.jsx(x,{path:"/privacy.html",element:e.jsx(xe,{})}),e.jsx(x,{path:"/bank-order",element:e.jsx(be,{})}),e.jsx(x,{path:"/bank-order.html",element:e.jsx(be,{})}),e.jsx(x,{path:"*",element:e.jsx(Nt,{})})]})]})})}F.createRoot(document.getElementById("root")).render(e.jsx(Me.StrictMode,{children:e.jsx(De,{children:e.jsx(Ot,{})})}));export{pt as P,Se as f,e as j};
