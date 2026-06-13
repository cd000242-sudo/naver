import{c as a,r as Ze,u as fe,N as ye,L as v,O as nt,d as Je,b as at,a as y,R as st,B as lt}from"./router-BCNeJdl_.js";(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const s of i)if(s.type==="childList")for(const p of s.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&n(p)}).observe(document,{childList:!0,subtree:!0});function o(i){const s={};return i.integrity&&(s.integrity=i.integrity),i.referrerPolicy&&(s.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?s.credentials="include":i.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function n(i){if(i.ep)return;i.ep=!0;const s=o(i);fetch(i.href,s)}})();var et={exports:{}},oe={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var dt=a,ct=Symbol.for("react.element"),pt=Symbol.for("react.fragment"),gt=Object.prototype.hasOwnProperty,xt=dt.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,ht={key:!0,ref:!0,__self:!0,__source:!0};function tt(t,r,o){var n,i={},s=null,p=null;o!==void 0&&(s=""+o),r.key!==void 0&&(s=""+r.key),r.ref!==void 0&&(p=r.ref);for(n in r)gt.call(r,n)&&!ht.hasOwnProperty(n)&&(i[n]=r[n]);if(t&&t.defaultProps)for(n in r=t.defaultProps,r)i[n]===void 0&&(i[n]=r[n]);return{$$typeof:ct,type:t,key:s,ref:p,props:i,_owner:xt.current}}oe.Fragment=pt;oe.jsx=tt;oe.jsxs=tt;et.exports=oe;var e=et.exports,ge={},ve=Ze;ge.createRoot=ve.createRoot,ge.hydrateRoot=ve.hydrateRoot;const mt=[{to:"/",label:"홈"},{to:"/leword",label:"LEWORD"},{to:"/chatbots",label:"무료 챗봇"},{to:"/products",label:"제품정보"},{to:"/pricing",label:"구매"},{to:"/reviews",label:"후기"},{to:"/community",label:"커뮤니티"},{to:"/download",label:"다운로드"},{to:"/lookup",label:"주문조회"}];function bt(){const[t,r]=a.useState(!1),[o,n]=a.useState(!1),i=fe(),s=i.pathname==="/index.html"?"/":i.pathname.replace(/\.html$/,"").replace(/\/$/,"")||"/",p=c=>c==="/"?s==="/":s===c;return a.useEffect(()=>{const c=()=>r(window.scrollY>50);return window.addEventListener("scroll",c,{passive:!0}),()=>window.removeEventListener("scroll",c)},[]),e.jsx("nav",{className:t?"navbar scrolled":"navbar",style:{position:"fixed",top:0,left:0,right:0,zIndex:999,background:t?"rgba(10,10,15,0.96)":"rgba(10,10,15,0.85)",backdropFilter:"blur(16px)",borderBottom:t?"1px solid rgba(124,58,237,0.15)":"1px solid rgba(255,255,255,0.04)",transition:"all 0.3s"},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs(ye,{to:"/",style:{display:"flex",alignItems:"center",gap:10,fontWeight:800,fontSize:18,color:"#fff"},children:[e.jsx("span",{style:{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg, #f5c842, #d4a012)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#1a1a2e"},children:"👑"}),e.jsx("span",{children:"Leaders Pro"})]}),e.jsxs("button",{"aria-label":o?"메뉴 닫기":"메뉴 열기","aria-expanded":o,onClick:()=>n(c=>!c),style:{display:"none",background:"transparent",border:"none",cursor:"pointer",flexDirection:"column",gap:5,padding:6},className:"nav-hamburger",children:[e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}}),e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}}),e.jsx("span",{style:{display:"block",width:20,height:2,background:"#fff"}})]}),e.jsx("div",{className:o?"nav-links mobile-open":"nav-links",style:{display:"flex",gap:8},children:mt.map(c=>{const m=p(c.to);return e.jsx(ye,{to:c.to,className:m?"nav-link-active":void 0,"aria-current":m?"page":void 0,onClick:()=>n(!1),style:()=>({padding:"8px 16px",color:o?m?"#F4D03F":"rgba(255,255,255,0.92)":m?"#A78BFA":"#a0a0b0",background:o&&m?"rgba(244,208,63,0.14)":m?"rgba(124,58,237,0.1)":"transparent",fontSize:14,fontWeight:o?800:500,borderRadius:8,transition:"all 0.2s"}),children:c.label},c.to)})})]})})}function ft(){return e.jsx("footer",{style:{padding:"60px 24px 40px",background:"#06060a",borderTop:"1px solid rgba(255,255,255,0.04)"},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto",textAlign:"center"},children:[e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:10,fontWeight:800,fontSize:18,marginBottom:20,color:"#fff"},children:[e.jsx("span",{style:{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg, #f5c842, #d4a012)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#1a1a2e"},children:"👑"}),e.jsx("span",{children:"Leaders Pro"})]}),e.jsxs("div",{style:{display:"flex",gap:24,justifyContent:"center",flexWrap:"wrap",marginBottom:20},children:[e.jsx(v,{to:"/terms",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"이용약관"}),e.jsx(v,{to:"/refund",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"환불정책"}),e.jsx(v,{to:"/privacy",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"개인정보처리방침"}),e.jsx(v,{to:"/chatbots",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"무료 챗봇"}),e.jsx(v,{to:"/lookup",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"주문 조회"}),e.jsx("a",{href:"mailto:cd000242@gmail.com",style:{color:"#a0a0b0",fontSize:14,textDecoration:"none"},children:"고객 문의"})]}),e.jsxs("div",{style:{color:"#a0a0b0",fontSize:12,lineHeight:1.7,marginBottom:20},children:[e.jsx("p",{children:"상호: Leaders Pro | 대표: 박성현 | 사업자등록번호: 515-97-01802"}),e.jsx("p",{children:"주소: 경남 김해시 장유로334번길9 107동 3105호"}),e.jsx("p",{children:"이메일: tjdgus24280@naver.com | 전화: 010-7545-1645"})]}),e.jsx("p",{style:{color:"rgba(160,160,176,0.5)",fontSize:12},children:"© 2026 Leaders Pro. All rights reserved."})]})})}const ut="f4jS6yW83MU",jt="RDf4jS6yW83MU",yt=16,xe="lp_music_time",he="lp_music_time_ts",vt="lp_music_volume";function wt(){try{const t=parseFloat(localStorage.getItem(xe)||"0"),r=parseInt(localStorage.getItem(he)||"0");if(t>0&&r>0&&Date.now()-r<30*60*1e3)return t}catch{}return yt}function kt(){const t=a.useRef(null),[r,o]=a.useState(!1),[n,i]=a.useState(!1),[s,p]=a.useState(!1),[c,m]=a.useState("Summer Vibes");a.useEffect(()=>{if(window.YT&&window.YT.Player){o(!0);return}if(!document.querySelector('script[src*="youtube.com/iframe_api"]')){const d=document.createElement("script");d.src="https://www.youtube.com/iframe_api",document.head.appendChild(d)}window.onYouTubeIframeAPIReady=()=>o(!0)},[]),a.useEffect(()=>{!r||t.current||!document.getElementById("lpm-yt-player")||(t.current=new window.YT.Player("lpm-yt-player",{videoId:ut,playerVars:{autoplay:1,start:Math.floor(wt()),listType:"playlist",list:jt,controls:0,disablekb:1,fs:0,modestbranding:1,rel:0},events:{onReady:d=>{const f=parseInt(localStorage.getItem(vt)||"40");d.target.setVolume(isNaN(f)?40:f);try{d.target.playVideo()}catch{}},onStateChange:d=>{if(window.YT)if(d.data===window.YT.PlayerState.PLAYING){i(!0);try{const f=d.target.getVideoData();f&&f.title&&m(f.title)}catch{}}else d.data===window.YT.PlayerState.PAUSED&&i(!1)},onError:d=>{console.warn("[MusicPlayer] YT Error:",d?.data);try{t.current?.nextVideo()}catch{}}}}))},[r]),a.useEffect(()=>{const l=()=>{try{t.current?.playVideo()}catch{}["click","touchstart","scroll","keydown","mousemove"].forEach(d=>document.removeEventListener(d,l))};return["click","touchstart","scroll","keydown","mousemove"].forEach(d=>document.addEventListener(d,l,{once:!0,passive:!0})),()=>{["click","touchstart","scroll","keydown","mousemove"].forEach(d=>document.removeEventListener(d,l))}},[]),a.useEffect(()=>{const l=setInterval(()=>{try{if(!t.current?.getCurrentTime)return;const f=t.current.getCurrentTime();f>0&&(localStorage.setItem(xe,String(f)),localStorage.setItem(he,String(Date.now())))}catch{}},500),d=()=>{try{if(!t.current?.getCurrentTime)return;const f=t.current.getCurrentTime();f>0&&(localStorage.setItem(xe,String(f)),localStorage.setItem(he,String(Date.now())))}catch{}};return window.addEventListener("pagehide",d,{passive:!0}),window.addEventListener("beforeunload",d,{passive:!0}),()=>{clearInterval(l),window.removeEventListener("pagehide",d),window.removeEventListener("beforeunload",d)}},[]);const u=()=>{if(t.current)try{n?t.current.pauseVideo():t.current.playVideo()}catch{}};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
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
            `}),e.jsx("div",{id:"lpm-yt-player",style:{position:"fixed",top:-9999,left:-9999,width:1,height:1,opacity:0,pointerEvents:"none"}}),e.jsxs("div",{className:"lp-music-player",style:{position:"fixed",bottom:200,right:24,zIndex:1e4,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,pointerEvents:"none"},children:[s&&e.jsxs("div",{style:{background:"rgba(18,18,26,0.95)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:16,width:240,pointerEvents:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.4)"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},children:[e.jsx("div",{style:{fontSize:11,color:"#ffd700",fontWeight:800,letterSpacing:1},children:"♪ PLAYLIST"}),e.jsx("button",{onClick:()=>p(!1),style:{background:"transparent",border:"none",color:"#a0a0b0",cursor:"pointer",fontSize:16},children:"✕"})]}),e.jsxs("div",{style:{background:"rgba(255,215,0,0.06)",borderRadius:10,padding:10,marginBottom:12},children:[e.jsx("div",{style:{fontSize:10,color:"#a0a0b0",marginBottom:2},children:"NOW PLAYING"}),e.jsxs("div",{style:{fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:["🎵 ",c]})]}),e.jsx("button",{onClick:u,style:{width:"100%",padding:10,borderRadius:10,background:"linear-gradient(135deg, #c9a84c, #d4a012)",color:"#1a0a2e",fontWeight:800,fontSize:14,border:"none",cursor:"pointer"},children:n?"⏸ 일시정지":"▶ 재생"}),e.jsx("div",{style:{fontSize:10,color:"rgba(255,255,255,0.5)",textAlign:"center",marginTop:8},children:"🔄 Radio 자동재생"})]}),e.jsxs("button",{className:"lp-music-button",onClick:()=>p(l=>!l),title:"🌸 음악 플레이어",style:{pointerEvents:"auto",background:"linear-gradient(135deg, rgba(255,183,197,0.25), rgba(201,168,76,0.25))",border:"1px solid rgba(255,183,197,0.5)",backdropFilter:"blur(12px)",borderRadius:28,padding:"10px 16px",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontWeight:700,fontSize:13,boxShadow:"0 4px 20px rgba(255,107,138,0.2)"},children:[e.jsx("span",{style:{fontSize:16},children:n?"⏸":"♪"}),e.jsx("span",{children:"Music"})]})]})]})}function St(){return a.useEffect(()=>{const t=document.getElementById("lpm-summer-particles");if(!t||t.children.length>0)return;const r=window.innerWidth<768?14:22;for(let o=0;o<r;o++){const n=document.createElement("div"),i=Math.random()<.45,s=Math.random()*100,p=100+Math.random()*20,c=12+Math.random()*18,m=-Math.random()*c,u=i?3:5;Object.assign(n.style,{position:"absolute",width:u+"px",height:u+"px",borderRadius:"50%",background:i?"radial-gradient(circle at 30% 30%, #ffffff 0%, #fff2cc 60%, rgba(255,242,204,0) 100%)":"radial-gradient(circle at 30% 30%, #ffffff 0%, #ffd966 60%, rgba(255,217,102,0) 100%)",boxShadow:i?"0 0 6px rgba(255,242,204,0.5)":"0 0 10px rgba(255,217,102,0.55), 0 0 20px rgba(255,217,102,0.3)",opacity:"0",left:s+"%",top:p+"vh",animation:`lpmSunFloat ${c}s linear infinite`,animationDelay:m+"s"}),t.appendChild(n)}},[]),e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
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
            `}),e.jsx("div",{id:"lpm-summer-particles",style:{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,overflow:"hidden"}})]})}function zt(){const t={position:"fixed",right:24,zIndex:10001,display:"flex",alignItems:"center",gap:10,padding:"12px 20px",borderRadius:50,backdropFilter:"blur(16px)",textDecoration:"none",fontFamily:"inherit",minWidth:160,transition:"transform .2s, box-shadow .2s"};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:`
                @media (max-width: 768px) {
                    .lp-float-link {
                        right: 12px !important;
                        width: 46px !important;
                        min-width: 46px !important;
                        height: 46px !important;
                        padding: 0 !important;
                        border-radius: 50% !important;
                        justify-content: center !important;
                        gap: 0 !important;
                    }
                    .lp-float-link span { display: none !important; }
                    .lp-float-link > div { width: 28px !important; height: 28px !important; }
                    .lp-float-chat { bottom: 18px !important; }
                    .lp-float-room { bottom: 74px !important; }
                    .lp-float-youtube { bottom: 130px !important; }
                }
            `}),e.jsxs("a",{className:"lp-float-link lp-float-chat",href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener",title:"1:1 카카오톡 문의",style:{...t,bottom:20,background:"rgba(60,29,0,0.92)",border:"1px solid rgba(254,229,0,0.45)",boxShadow:"0 6px 24px rgba(0,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#fee500",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:"💬"}),e.jsx("span",{style:{color:"#fee500",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"1:1 문의"})]}),e.jsxs("a",{className:"lp-float-link lp-float-room",href:"https://open.kakao.com/o/gQ1jRBwh",target:"_blank",rel:"noopener",title:"단톡방 바로가기",style:{...t,bottom:80,background:"rgba(254,229,0,0.95)",border:"1px solid rgba(60,29,0,0.5)",boxShadow:"0 6px 24px rgba(0,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#1a0a10",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:"👥"}),e.jsx("span",{style:{color:"#1a0a10",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"단톡방 바로가기"})]}),e.jsxs("a",{className:"lp-float-link lp-float-youtube",href:"https://www.youtube.com/@leadernam-s5e",target:"_blank",rel:"noopener",title:"공식 유튜브 채널",style:{...t,bottom:140,background:"rgba(255,0,0,0.92)",border:"1px solid rgba(255,100,100,0.5)",boxShadow:"0 6px 24px rgba(255,0,0,0.35)"},children:[e.jsx("div",{style:{width:26,height:26,background:"#fff",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#ff0000",fontWeight:900},children:"▶"}),e.jsx("span",{style:{color:"#fff",fontWeight:800,fontSize:13,whiteSpace:"nowrap"},children:"유튜브 채널"})]})]})}function we(t="auto"){const r=window.matchMedia("(prefers-reduced-motion: reduce)").matches;window.scrollTo({top:0,left:0,behavior:r?"auto":t}),document.documentElement.scrollTop=0,document.body.scrollTop=0}function Nt(t){return t.button!==0||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey}function Tt(t){const r=t.getAttribute("href"),o=t.getAttribute("target");if(!r||o||r.startsWith("#")||r.startsWith("mailto:")||r.startsWith("tel:"))return!1;let n;try{n=new URL(r,window.location.href)}catch{return!1}return n.origin!==window.location.origin?!1:n.pathname!==window.location.pathname||n.search!==window.location.search||n.hash===""}function Lt(){const t=fe();return a.useEffect(()=>("scrollRestoration"in window.history&&(window.history.scrollRestoration="manual"),()=>{"scrollRestoration"in window.history&&(window.history.scrollRestoration="auto")}),[]),a.useEffect(()=>{window.requestAnimationFrame(()=>we("auto"))},[t.pathname,t.search]),a.useEffect(()=>{const r=o=>{if(o.defaultPrevented||Nt(o))return;const n=o.target;if(!(n instanceof Element))return;const i=n.closest("a[href]");i instanceof HTMLAnchorElement&&Tt(i)&&window.requestAnimationFrame(()=>we("auto"))};return document.addEventListener("click",r,!0),()=>document.removeEventListener("click",r,!0)},[]),null}function Ft(){const r=fe().pathname.replace(/\/$/,"")||"/",o=r==="/leword"||r==="/leword.html";return e.jsxs(e.Fragment,{children:[e.jsx(Lt,{}),e.jsx(bt,{}),e.jsx("main",{style:{minHeight:"100vh",paddingTop:o?72:0,background:o?"#07090d":void 0},children:e.jsx(nt,{})}),!o&&e.jsx(ft,{}),!o&&e.jsx(St,{}),!o&&e.jsx(kt,{}),!o&&e.jsx(zt,{})]})}function ne(){const t=a.useRef(null);return a.useEffect(()=>{const r=t.current;if(!r)return;const o=r.getContext("2d");if(!o)return;let n=0,i=0;const s=[];function p(){r&&(n=r.width=window.innerWidth,i=r.height=window.innerHeight*3)}p(),window.addEventListener("resize",p);function c(){return{x:Math.random()*n,y:Math.random()*i,size:Math.random()*2+.5,speedY:-(Math.random()*.3+.1),speedX:(Math.random()-.5)*.2,opacity:Math.random()*.5+.1,gold:Math.random()>.3}}for(let l=0;l<80;l++)s.push(c());let m=0;function u(){if(o){o.clearRect(0,0,n,i);for(const l of s)l.y+=l.speedY,l.x+=l.speedX,l.opacity+=(Math.random()-.5)*.01,l.opacity=Math.max(.05,Math.min(.6,l.opacity)),l.y<-10&&(l.y=i+10,l.x=Math.random()*n),o.beginPath(),o.arc(l.x,l.y,l.size,0,Math.PI*2),o.fillStyle=l.gold?`rgba(201, 168, 76, ${l.opacity})`:`rgba(255, 255, 255, ${l.opacity*.4})`,o.fill();m=requestAnimationFrame(u)}}return u(),()=>{cancelAnimationFrame(m),window.removeEventListener("resize",p)}},[]),e.jsx("canvas",{ref:t,style:{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}})}function ee({target:t,label:r}){const o=a.useRef(null),[n,i]=a.useState(0);return a.useEffect(()=>{const s=o.current;if(!s)return;const p=new IntersectionObserver(c=>{c.forEach(m=>{if(m.isIntersecting){let u=0;const l=Math.ceil(t/60),d=setInterval(()=>{u+=l,u>=t&&(u=t,clearInterval(d)),i(u)},30);p.unobserve(s)}})},{threshold:.5});return p.observe(s),()=>p.disconnect()},[t]),e.jsxs("div",{ref:o,style:{textAlign:"center",padding:"0 24px"},children:[e.jsx("div",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,background:"linear-gradient(135deg, var(--gold-primary), var(--gold-light))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4,fontVariantNumeric:"tabular-nums"},children:n.toLocaleString()}),e.jsx("div",{style:{color:"var(--text-secondary)",fontSize:13,letterSpacing:1},children:r})]})}function ke(){return a.useEffect(()=>{const t=document.title;return document.title="리더스프로 | Leaders Pro 네이버 자동화 툴 · AI 블로그 자동 발행",()=>{document.title=t}},[]),a.useEffect(()=>{const t=new IntersectionObserver(r=>{r.forEach((o,n)=>{o.isIntersecting&&(o.target.style.transitionDelay=`${n*.08}s`,o.target.classList.add("visible"),t.unobserve(o.target))})},{threshold:.1});return document.querySelectorAll(".fade-in").forEach(r=>t.observe(r)),()=>t.disconnect()},[]),e.jsxs(e.Fragment,{children:[e.jsx(ne,{}),e.jsxs("section",{className:"home-hero",style:{minHeight:"100vh",display:"grid",gridTemplateColumns:"minmax(0, 1fr) minmax(0, 1fr)",gap:40,padding:"120px 24px 60px",maxWidth:1280,margin:"0 auto",position:"relative",zIndex:1,alignItems:"center"},children:[e.jsxs("div",{className:"hero-content",children:[e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 16px",background:"rgba(201, 168, 76, 0.1)",border:"1px solid rgba(201, 168, 76, 0.3)",borderRadius:50,fontSize:12,fontWeight:800,letterSpacing:2,color:"var(--gold-primary)",marginBottom:24},children:[e.jsx("span",{style:{width:8,height:8,borderRadius:"50%",background:"var(--gold-primary)",boxShadow:"0 0 8px var(--gold-primary)"}}),e.jsx("span",{children:"PREMIUM AUTOMATION"})]}),e.jsxs("h1",{style:{fontSize:"clamp(40px, 6vw, 64px)",fontWeight:900,lineHeight:1.2,letterSpacing:"-2px",marginBottom:20},children:["매일 100건,",e.jsx("br",{}),e.jsx("span",{style:{background:"linear-gradient(135deg, var(--gold-primary), var(--gold-light))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"사람이 쓴 것처럼."})]}),e.jsxs("p",{style:{fontSize:18,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:32},children:["키워드만 넣으면 AI가 글 · 이미지 · 발행까지 자동으로.",e.jsx("br",{}),"블로그 10개를 혼자 운영하는 분들의 ",e.jsx("strong",{style:{color:"var(--text-primary)"},children:"비밀 무기"}),"."]}),e.jsxs("div",{style:{display:"flex",flexWrap:"wrap",alignItems:"center",gap:24},children:[e.jsxs(v,{to:"/pricing",style:{display:"inline-flex",alignItems:"center",gap:8,padding:"16px 32px",background:"linear-gradient(135deg, var(--gold-primary), var(--gold-light))",color:"#1a1a2e",borderRadius:12,fontWeight:800,fontSize:16,textDecoration:"none",boxShadow:"0 8px 24px rgba(201, 168, 76, 0.4)"},children:[e.jsx("span",{children:"지금 자동화 시작하기"}),e.jsxs("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M5 12h14"}),e.jsx("path",{d:"m12 5 7 7-7 7"})]})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx("div",{style:{display:"flex"},children:[{bg:"linear-gradient(135deg, #667eea, #764ba2)",letter:"J"},{bg:"linear-gradient(135deg, #f093fb, #f5576c)",letter:"K"},{bg:"linear-gradient(135deg, #4facfe, #00f2fe)",letter:"L"}].map((t,r)=>e.jsx("div",{style:{width:32,height:32,borderRadius:"50%",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:13,border:"2px solid var(--bg-dark)",marginLeft:r===0?0:-10},children:t.letter},r))}),e.jsx("span",{style:{color:"var(--text-secondary)",fontSize:13},children:"2,800+명이 사용 중"})]})]})]}),e.jsxs("div",{className:"hero-robot-stage",children:[e.jsx("div",{className:"robot-ambient robot-ambient-main"}),e.jsx("div",{className:"robot-ambient robot-ambient-blue"}),e.jsx("div",{className:"robot-orbit robot-orbit-one"}),e.jsx("div",{className:"robot-orbit robot-orbit-two"}),e.jsx("div",{className:"robot-gridline"}),e.jsxs("div",{className:"robot-chip robot-chip-top",children:[e.jsx("span",{}),e.jsx("b",{children:"AUTO PILOT READY"})]}),e.jsxs("div",{className:"robot-chip robot-chip-left",children:[e.jsx("b",{children:"127K"}),e.jsx("span",{children:"누적 발행"})]}),e.jsxs("div",{className:"robot-chip robot-chip-right",children:[e.jsx("b",{children:"AI + CTA"}),e.jsx("span",{children:"글·이미지·발행"})]}),e.jsx("iframe",{src:"https://my.spline.design/nexbotrobotcharacterconcept-mQLqodza99cchehegYbwsdiu/",title:"3D Robot",frameBorder:"0",width:"100%",height:"500",allowFullScreen:!0,loading:"lazy",className:"hero-robot-frame"}),e.jsx("div",{className:"robot-scanline"}),e.jsxs("div",{className:"robot-console",children:[e.jsx("span",{children:"LIVE OPS"}),e.jsx("strong",{children:"Keyword → Draft → Image → Publish"}),e.jsx("small",{children:"queue stable · multi account · 99% uptime"})]})]})]}),e.jsxs("section",{style:{padding:"40px 24px",maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-around",alignItems:"center",flexWrap:"wrap",gap:24,position:"relative",zIndex:1,borderTop:"1px solid var(--border-glass)",borderBottom:"1px solid var(--border-glass)"},children:[e.jsx(ee,{target:127e3,label:"누적 발행"}),e.jsx("div",{style:{width:1,height:40,background:"var(--border-glass)"}}),e.jsx(ee,{target:2847,label:"활성 사용자"}),e.jsx("div",{style:{width:1,height:40,background:"var(--border-glass)"}}),e.jsx(ee,{target:99,label:"가동률 %"}),e.jsx("div",{style:{width:1,height:40,background:"var(--border-glass)"}}),e.jsx(ee,{target:15e3,label:"일일 자동 발행"})]}),e.jsx("section",{className:"section",children:e.jsxs("div",{className:"section-inner",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("span",{className:"section-tag",children:"EXPLORE"}),e.jsx("h2",{className:"section-title",children:"원하는 정보를 빠르게 확인하세요"}),e.jsx("p",{className:"section-desc",children:"각 페이지에서 상세 정보를 확인할 수 있습니다"})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:24,maxWidth:1e3,margin:"0 auto"},children:[{to:"/products",emoji:"🚀",title:"제품 소개",desc:`Leaders Pro의 강력한 블로그 자동화 기능을
자세히 확인하세요`,cta:"자세히 보기 →"},{to:"/pricing",emoji:"💰",title:"구매",desc:`올인원 기간권 선택 및
토스페이먼츠 안전 결제`,cta:"가격표 보기 →",highlight:!0,badge:"💳 결제"},{to:"/reviews",emoji:"⭐",title:"후기 & FAQ",desc:`실제 사용자들의 생생한 후기와
자주 묻는 질문 모음`,cta:"후기 보기 →"},{to:"/community",emoji:"👥",title:"커뮤니티",desc:`공지사항, 수익 인증,
활용 팁 확인`,cta:"커뮤니티 →"},{to:"/download",emoji:"📥",title:"다운로드",desc:`구매 후 비밀번호 입력으로
최신 버전 다운로드`,cta:"다운로드 →"},{to:"/lookup",emoji:"🔍",title:"주문 조회",desc:`이메일 또는 주문번호로
구매 내역 확인`,cta:"조회하기 →"}].map(t=>e.jsxs(v,{to:t.to,className:"fade-in",style:{textDecoration:"none",background:"var(--bg-card)",border:t.highlight?"1px solid var(--border-gold)":"1px solid var(--border-glass)",borderRadius:"var(--radius-lg)",padding:"36px 28px",backdropFilter:"blur(20px)",transition:"all 0.3s",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",cursor:"pointer",position:"relative",overflow:"hidden"},onMouseEnter:r=>{r.currentTarget.style.borderColor="var(--border-gold)",r.currentTarget.style.transform="translateY(-4px)",r.currentTarget.style.boxShadow=t.highlight?"0 12px 40px rgba(201,168,76,0.25)":"0 12px 40px rgba(201,168,76,0.15)"},onMouseLeave:r=>{r.currentTarget.style.borderColor=t.highlight?"var(--border-gold)":"var(--border-glass)",r.currentTarget.style.transform="none",r.currentTarget.style.boxShadow="none"},children:[t.badge&&e.jsx("div",{style:{position:"absolute",top:12,right:12,background:"linear-gradient(135deg, var(--gold-primary), var(--gold-light))",color:"#000",fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20},children:t.badge}),e.jsx("div",{style:{fontSize:40,marginBottom:16},children:t.emoji}),e.jsx("h3",{style:{fontSize:19,fontWeight:700,color:"var(--text-primary)",marginBottom:8},children:t.title}),e.jsx("p",{style:{fontSize:13,color:"var(--text-secondary)",lineHeight:1.6,marginBottom:16,whiteSpace:"pre-line"},children:t.desc}),e.jsx("span",{style:{color:"var(--gold-primary)",fontSize:13,fontWeight:600},children:t.cta})]},t.to))})]})}),e.jsx("section",{className:"section",children:e.jsxs("div",{className:"section-inner",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("span",{className:"section-tag",children:"TESTIMONIALS"}),e.jsx("h2",{className:"section-title",children:"실제 사용자들의 이야기"}),e.jsx("p",{className:"section-desc",children:"Leaders Pro를 경험한 분들의 생생한 후기"})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:24,maxWidth:1e3,margin:"0 auto"},children:[{quote:e.jsxs(e.Fragment,{children:["블로그 10개를 혼자 운영하는데, ",e.jsx("strong",{style:{color:"var(--text-primary)"},children:"리더스 프로 없었으면 불가능"}),"했어요. 출근 전에 키워드만 세팅하면 퇴근할 때 50건이 올라가 있습니다."]}),bg:"linear-gradient(135deg, #667eea, #764ba2)",letter:"K",name:"K 대표",meta:"마케팅 에이전시 · 10개월 사용"},{quote:e.jsxs(e.Fragment,{children:["쿠팡 파트너스 블로그를 4개 돌리고 있는데, 쇼핑 커넥트 기능으로 ",e.jsx("strong",{style:{color:"var(--text-primary)"},children:"월 수익이 3배"})," 뛰었어요. AI가 생성한 리뷰 글이 정말 자연스러워요."]}),bg:"linear-gradient(135deg, #f093fb, #f5576c)",letter:"P",name:"P님",meta:"제휴 마케터 · 6개월 사용"},{quote:e.jsxs(e.Fragment,{children:["글로벌 블로그 5개를 Leaders Orbit으로 운영 중입니다. ",e.jsx("strong",{style:{color:"var(--text-primary)"},children:"애드센스 승인이 2주 만에"})," 떨어졌고, 지금은 월 $400 이상 벌고 있어요."]}),bg:"linear-gradient(135deg, #4facfe, #00f2fe)",letter:"L",name:"L님",meta:"글로벌 블로거 · 8개월 사용"}].map((t,r)=>e.jsxs("div",{className:"fade-in",style:{background:"var(--bg-card)",border:"1px solid var(--border-glass)",borderRadius:"var(--radius-lg)",padding:32,backdropFilter:"blur(20px)"},children:[e.jsx("div",{style:{fontSize:32,color:"var(--gold-primary)",marginBottom:12,lineHeight:1,fontFamily:"Georgia, serif"},children:'"'}),e.jsx("p",{style:{fontSize:15,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:20},children:t.quote}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx("div",{style:{width:40,height:40,borderRadius:"50%",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:14},children:t.letter}),e.jsxs("div",{children:[e.jsx("strong",{style:{color:"var(--text-primary)",fontSize:14},children:t.name}),e.jsx("div",{style:{color:"var(--text-muted)",fontSize:12},children:t.meta})]})]})]},r))}),e.jsx("div",{style:{textAlign:"center",marginTop:40},children:e.jsx(v,{to:"/reviews",style:{display:"inline-flex",alignItems:"center",gap:8,padding:"14px 32px",background:"var(--bg-glass)",border:"1px solid var(--border-glass)",borderRadius:"var(--radius-sm)",color:"var(--gold-primary)",fontSize:14,fontWeight:600,transition:"all 0.3s"},onMouseEnter:t=>t.currentTarget.style.borderColor="var(--border-gold)",onMouseLeave:t=>t.currentTarget.style.borderColor="var(--border-glass)",children:"더 많은 후기 보기 →"})})]})}),e.jsx("style",{children:`
                .hero-robot-stage {
                    position: relative;
                    min-height: 560px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                    overflow: hidden;
                    border-radius: 8px;
                }

                .hero-robot-stage::before {
                    content: '';
                    position: absolute;
                    inset: 24px 10px 42px;
                    border-radius: 8px;
                    border: 1px solid rgba(201,168,76,0.22);
                    background:
                        linear-gradient(180deg, rgba(12,18,28,0.38), rgba(5,8,12,0.16)),
                        radial-gradient(circle at 50% 28%, rgba(244,201,93,0.12), transparent 48%);
                    box-shadow: 0 26px 90px rgba(0,0,0,0.30);
                    pointer-events: none;
                    z-index: -2;
                }

                .robot-ambient,
                .robot-orbit,
                .robot-gridline,
                .robot-chip,
                .robot-console,
                .robot-scanline {
                    pointer-events: none;
                }

                .robot-ambient {
                    position: absolute;
                    border-radius: 999px;
                    filter: blur(4px);
                    z-index: -3;
                }

                .robot-ambient-main {
                    width: 460px;
                    height: 460px;
                    background: radial-gradient(circle, rgba(244,201,93,0.22), transparent 62%);
                    animation: robotPulse 6s ease-in-out infinite;
                }

                .robot-ambient-blue {
                    width: 320px;
                    height: 320px;
                    right: 22px;
                    top: 92px;
                    background: radial-gradient(circle, rgba(68,215,182,0.16), transparent 64%);
                    animation: robotFloat 8s ease-in-out infinite;
                }

                .robot-orbit {
                    position: absolute;
                    border: 1px solid rgba(244,201,93,0.28);
                    border-radius: 50%;
                    transform: rotate(-10deg);
                    z-index: -1;
                }

                .robot-orbit-one {
                    width: 480px;
                    height: 210px;
                    top: 146px;
                }

                .robot-orbit-two {
                    width: 390px;
                    height: 170px;
                    top: 190px;
                    border-color: rgba(68,215,182,0.24);
                    transform: rotate(18deg);
                }

                .robot-gridline {
                    position: absolute;
                    width: min(520px, 88%);
                    height: 290px;
                    top: 122px;
                    border-radius: 8px;
                    background:
                        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
                    background-size: 36px 36px;
                    mask-image: radial-gradient(circle at center, #000 0%, transparent 72%);
                    opacity: 0.55;
                    z-index: -1;
                }

                .hero-robot-frame {
                    width: min(100%, 560px);
                    height: 520px;
                    border: 1px solid rgba(255,255,255,0.16);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 26px 90px rgba(0,0,0,0.34);
                    position: relative;
                    z-index: 1;
                }

                .robot-scanline {
                    position: absolute;
                    left: 7%;
                    right: 7%;
                    top: 28%;
                    height: 2px;
                    border-radius: 999px;
                    background: linear-gradient(90deg, transparent, rgba(68,215,182,0.88), rgba(244,201,93,0.68), transparent);
                    box-shadow: 0 0 18px rgba(68,215,182,0.52);
                    animation: robotScan 4.8s ease-in-out infinite;
                    z-index: 2;
                }

                .robot-chip {
                    position: absolute;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 38px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background: rgba(8,13,18,0.76);
                    color: #f8fafc;
                    backdrop-filter: blur(12px);
                    box-shadow: 0 14px 36px rgba(0,0,0,0.24);
                    z-index: 3;
                }

                .robot-chip b {
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .robot-chip span {
                    color: rgba(255,255,255,0.66);
                    font-size: 12px;
                }

                .robot-chip-top {
                    top: 54px;
                    right: 44px;
                }

                .robot-chip-top span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #44d7b6;
                    box-shadow: 0 0 12px rgba(68,215,182,0.9);
                }

                .robot-chip-left {
                    left: 0;
                    bottom: 152px;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }

                .robot-chip-left b {
                    color: #f4c95d;
                    font-size: 22px;
                }

                .robot-chip-right {
                    right: 0;
                    bottom: 118px;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }

                .robot-chip-right b {
                    color: #44d7b6;
                    font-size: 15px;
                }

                .robot-console {
                    position: absolute;
                    left: 42px;
                    right: 42px;
                    bottom: 18px;
                    display: grid;
                    gap: 4px;
                    padding: 14px 16px;
                    border-radius: 8px;
                    border: 1px solid rgba(244,201,93,0.22);
                    background: rgba(8,13,18,0.84);
                    backdrop-filter: blur(16px);
                    z-index: 4;
                    box-shadow: 0 18px 50px rgba(0,0,0,0.30);
                }

                .robot-console span {
                    color: #f4c95d;
                    font-size: 11px;
                    font-weight: 900;
                }

                .robot-console strong {
                    color: #ffffff;
                    font-size: 15px;
                }

                .robot-console small {
                    color: rgba(255,255,255,0.54);
                    font-size: 12px;
                }

                @keyframes robotPulse {
                    0%, 100% { transform: scale(0.96); opacity: 0.72; }
                    50% { transform: scale(1.06); opacity: 1; }
                }

                @keyframes robotFloat {
                    0%, 100% { transform: translate3d(0, 0, 0); }
                    50% { transform: translate3d(-18px, 14px, 0); }
                }

                @keyframes robotScan {
                    0%, 100% { transform: translateY(-72px); opacity: 0; }
                    18%, 76% { opacity: 1; }
                    50% { transform: translateY(210px); }
                }

                @media (max-width: 900px) {
                    .home-hero {
                        grid-template-columns: 1fr !important;
                        gap: 28px !important;
                        min-height: auto !important;
                        padding: 100px 20px 56px !important;
                    }

                    .hero-robot-stage {
                        min-height: 520px;
                        margin-top: 22px;
                        width: 100%;
                    }

                    .hero-robot-frame {
                        width: 100%;
                        height: 480px;
                    }
                }

                @media (max-width: 640px) {
                    .home-hero {
                        padding: 92px 14px 48px !important;
                    }

                    .hero-robot-stage {
                        min-height: 455px;
                        margin-top: 4px;
                    }

                    .hero-robot-stage::before {
                        inset: 18px 0 36px;
                    }

                    .hero-robot-frame {
                        height: 410px;
                    }

                    .robot-chip-top {
                        top: 28px;
                        right: 18px;
                    }

                    .robot-chip-left,
                    .robot-chip-right {
                        display: none;
                    }

                    .robot-console {
                        left: 14px;
                        right: 14px;
                        bottom: 12px;
                    }

                    .robot-console strong {
                        font-size: 13px;
                        line-height: 1.35;
                        overflow-wrap: anywhere;
                    }
                }
            `})]})}function At({image:t,onClose:r}){return a.useEffect(()=>{if(!t)return;const o=document.body.style.overflow,n=i=>{i.key==="Escape"&&r()};return document.body.style.overflow="hidden",window.addEventListener("keydown",n),()=>{document.body.style.overflow=o,window.removeEventListener("keydown",n)}},[t,r]),!t||typeof document>"u"?null:Ze.createPortal(e.jsxs("div",{className:"image-lightbox-backdrop",role:"dialog","aria-modal":"true","aria-label":t.title||t.alt,onClick:r,children:[e.jsx("style",{children:`
                .image-lightbox-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 30000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 28px;
                    background: rgba(3, 7, 18, 0.82);
                    backdrop-filter: blur(18px);
                }
                .image-lightbox-panel {
                    position: relative;
                    width: min(1180px, 100%);
                    max-height: calc(100vh - 56px);
                    padding: 18px;
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: 14px;
                    background: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(4,8,18,0.98));
                    box-shadow: 0 28px 100px rgba(0,0,0,0.55);
                }
                .image-lightbox-scroll {
                    max-height: calc(100vh - 146px);
                    overflow: auto;
                    overscroll-behavior: contain;
                    border-radius: 10px;
                    background: #020617;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(244, 201, 93, 0.78) rgba(15, 23, 42, 0.92);
                }
                .image-lightbox-scroll::-webkit-scrollbar {
                    width: 12px;
                    height: 12px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.92);
                    border-radius: 999px;
                }
                .image-lightbox-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, rgba(244, 201, 93, 0.95), rgba(68, 215, 182, 0.85));
                    border: 3px solid rgba(15, 23, 42, 0.92);
                    border-radius: 999px;
                }
                .image-lightbox-panel img {
                    display: block;
                    width: 100%;
                    height: auto;
                    border-radius: 10px;
                    background: #020617;
                }
                .image-lightbox-title {
                    margin: 12px 48px 0 2px;
                    color: #e5edf7;
                    font-size: 15px;
                    font-weight: 800;
                    line-height: 1.45;
                }
                .image-lightbox-close {
                    position: absolute;
                    top: 14px;
                    right: 14px;
                    width: 38px;
                    height: 38px;
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: 999px;
                    background: rgba(15,23,42,0.82);
                    color: #ffffff;
                    cursor: pointer;
                    font-size: 24px;
                    line-height: 1;
                }
                .image-lightbox-close:hover {
                    background: rgba(244, 201, 93, 0.22);
                    border-color: rgba(244, 201, 93, 0.55);
                }
                @media (max-width: 640px) {
                    .image-lightbox-backdrop {
                        padding: 14px;
                    }
                    .image-lightbox-panel {
                        padding: 10px;
                        border-radius: 12px;
                    }
                    .image-lightbox-scroll {
                        max-height: calc(100vh - 116px);
                    }
                    .image-lightbox-title {
                        margin-right: 42px;
                        font-size: 13px;
                    }
                    .image-lightbox-close {
                        width: 34px;
                        height: 34px;
                        top: 10px;
                        right: 10px;
                    }
                }
            `}),e.jsxs("div",{className:"image-lightbox-panel",onClick:o=>o.stopPropagation(),children:[e.jsx("button",{type:"button",className:"image-lightbox-close",onClick:r,"aria-label":"이미지 닫기",children:"×"}),e.jsx("div",{className:"image-lightbox-scroll",children:e.jsx("img",{src:t.src,alt:t.alt})}),t.title?e.jsx("div",{className:"image-lightbox-title",children:t.title}):null]})]}),document.body)}function q({src:t,alt:r,title:o,loading:n="lazy",className:i,imgClassName:s,imgStyle:p,buttonStyle:c}){const[m,u]=a.useState(null),l=o||r;return e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",className:i,"aria-label":`${l} 크게 보기`,onClick:()=>u({src:t,alt:r,title:l}),style:{width:"100%",padding:0,border:0,background:"transparent",display:"block",cursor:"zoom-in",lineHeight:0,textAlign:"inherit",...c},children:e.jsx("img",{src:t,alt:r,loading:n,className:s,style:p})}),e.jsx(At,{image:m,onClose:()=>u(null)})]})}const Se=[{id:"naver",eyebrow:"FLAGSHIP",name:"Better Life Naver",subtitle:"네이버 블로그 자동화",headline:"키워드 하나로 글, 이미지, 발행까지 끝내는 메인 엔진",desc:e.jsx(e.Fragment,{children:"계정별 대기열, 글 생성, 이미지 생성, 자동 발행, 제휴 링크까지 한 화면에서 운영합니다. 네이버 블로그를 꾸준히 쌓아야 하는 사용자에게 가장 먼저 필요한 제품입니다."}),href:"/detail",cta:"네이버 자동화 자세히 보기",media:{type:"video",src:"/images/hero-demo.mp4",alt:"Better Life Naver 자동 발행 데모"},metrics:[["100건","일 최대 자동 발행"],["7 AI","본문·이미지 엔진"],["다계정","계정별 간격 관리"]],bullets:["키워드 입력 후 제목, 본문, 이미지, CTA까지 자동 구성","쿠팡·스마트스토어 상품 기반 리뷰형 포스팅 지원","사람형 타이핑, 랜덤 딜레이, 계정별 스케줄링으로 운영 부담 감소"],fit:["네이버 블로그를 본진으로 키우는 경우","다계정 운영과 반복 발행이 필요한 경우","제휴/리뷰형 콘텐츠까지 함께 돌리는 경우"]},{id:"leword",eyebrow:"INTELLIGENCE",name:"LEWORD",subtitle:"AI 키워드 인텔리전스",headline:"검색량, 문서수, 경쟁도를 보고 쓸 키워드만 남깁니다",desc:e.jsx(e.Fragment,{children:"네이버·ZUM·네이트·다음 실시간 검색어와 17개 데이터 소스를 교차검증해 운영자가 바로 판단할 수 있는 키워드 후보를 보여줍니다."}),href:"/leword",cta:"LEWORD 자세히 보기",media:{type:"image",src:"/images/leword/realtime-monitor-hero.png",alt:"LEWORD 실시간 검색어 모니터링 화면"},metrics:[["4매체","실시간 검색어"],["17소스","교차검증"],["SSS","황금키워드 등급"]],bullets:["실시간 이슈와 롱테일 후보를 한 화면에서 확인","검색량, 문서수, CPC, SERP 지표를 조합해 우선순위 계산","Naver와 Orbit 발행 전에 키워드 선별 단계로 사용"],fit:["무엇을 써야 할지 먼저 정해야 하는 경우","키워드 경쟁도를 숫자로 보고 싶은 경우","트렌드형/정보형 콘텐츠를 섞어 운영하는 경우"]},{id:"orbit",eyebrow:"GLOBAL",name:"Leaders Orbit",subtitle:"블로그스팟 · 워드프레스 자동화",headline:"외부유입용 글과 링크 구조를 한 번에 만드는 글로벌 발행 엔진",desc:e.jsx(e.Fragment,{children:"블로그스팟과 워드프레스 발행, 내부링크, 외부유입 문안, 공개 글 확인까지 이어지는 보조 채널 자동화입니다. 올인원 이용권 안에서 함께 씁니다."}),href:"/orbit",cta:"Orbit 자세히 보기",media:{type:"image",src:"/images/orbit/orbit-hero-live.gif",alt:"Leaders Orbit 대표 발행 결과 GIF 시연"},metrics:[["2플랫폼","Blogger·WordPress"],["5모드","목적별 콘텐츠"],["유입글","채널별 문안 생성"]],bullets:["WordPress REST API와 Blogger API 기반 발행 흐름","종합글, 하위글, FAQ, CTA가 이어지는 공개 글 구조","네이버 자동화와 함께 외부유입 보조 채널을 구축"],fit:["네이버 외 보조 채널을 만들고 싶은 경우","외부유입 글과 내부링크 구조가 필요한 경우","워드프레스/블로그스팟을 함께 쓰는 경우"]}],Wt=[["블로그 운영 자동화가 먼저라면","Better Life Naver","본문·이미지·발행까지 반복 업무를 줄이는 메인 제품입니다.","/detail"],["키워드 판단이 막힌다면","LEWORD","검색량과 경쟁도를 보고 발행할 주제를 먼저 골라냅니다.","/leword"],["외부유입 채널이 필요하다면","Leaders Orbit","블로그스팟·워드프레스 글과 링크 구조를 보조 채널로 만듭니다.","/orbit"]],ze=[["01","LEWORD","쓸 만한 키워드 후보를 찾고 경쟁도를 확인"],["02","Naver","네이버 블로그에 본문·이미지·CTA 자동 발행"],["03","Orbit","블로그스팟·워드프레스로 외부유입 글 확장"],["04","운영","주문·결제·지원까지 Leaders Pro에서 관리"]],Rt=[["주요 목적","네이버 블로그 성장","키워드 발굴","외부유입 채널 확장"],["입력값","키워드, 계정, 발행 옵션","주제, 카테고리, 지표 조건","키워드, 플랫폼 연결, 글 모드"],["결과물","네이버 블로그 공개 글","우선순위가 매겨진 키워드 후보","Blogger·WordPress 공개 글"],["잘 맞는 사용자","꾸준한 발행량이 필요한 운영자","쓰기 전 판단을 정확히 하고 싶은 운영자","보조 채널과 링크 구조가 필요한 운영자"],["추천 조합","LEWORD와 함께 쓰면 주제 선정이 쉬움","Naver·Orbit의 출발점으로 사용","Naver 글의 외부유입 보조 채널로 사용"]],Ne={naver:"linear-gradient(135deg, #f4c95d 0%, #44d7b6 100%)",leword:"linear-gradient(135deg, #7c3aed 0%, #38bdf8 100%)",orbit:"linear-gradient(135deg, #1fb6ff 0%, #34d399 100%)"};function Ct({product:t}){return t.media.type==="video"?e.jsx("video",{className:"products-media",autoPlay:!0,muted:!0,loop:!0,playsInline:!0,"aria-label":t.media.alt,children:e.jsx("source",{src:t.media.src,type:"video/mp4"})}):e.jsx(q,{className:"products-zoom-trigger",imgClassName:"products-media",src:t.media.src,alt:t.media.alt,title:t.name})}function Et({items:t}){return e.jsx("div",{className:"products-metrics",children:t.map(([r,o])=>e.jsxs("div",{children:[e.jsx("b",{children:r}),e.jsx("span",{children:o})]},`${r}-${o}`))})}function Te(){return a.useEffect(()=>{const t=document.title;return document.title="제품 정보 — Leaders Pro",()=>{document.title=t}},[]),a.useEffect(()=>{const t=new IntersectionObserver(r=>{r.forEach(o=>{o.isIntersecting&&(o.target.classList.add("visible"),t.unobserve(o.target))})},{threshold:.12});return document.querySelectorAll(".fade-in").forEach(r=>t.observe(r)),()=>t.disconnect()},[]),e.jsxs(e.Fragment,{children:[e.jsx(ne,{}),e.jsxs("main",{className:"products-page",children:[e.jsx("section",{className:"products-hero",children:e.jsxs("div",{className:"products-wrap products-hero-grid",children:[e.jsxs("div",{className:"products-hero-copy",children:[e.jsx("span",{className:"products-kicker",children:"PRODUCTS"}),e.jsx("h1",{children:"운영 목적에 맞는 자동화를 바로 고르세요"}),e.jsx("p",{children:"Leaders Pro는 키워드 발굴, 네이버 블로그 발행, 블로그스팟·워드프레스 외부유입까지 하나의 운영 흐름으로 이어지도록 만든 제품군입니다."}),e.jsxs("div",{className:"products-actions",children:[e.jsx("a",{className:"products-btn primary",href:"#products-guide",children:"제품 선택 가이드"}),e.jsx(v,{className:"products-btn secondary",to:"/pricing",children:"요금제 보기"})]})]}),e.jsxs("div",{className:"products-suite-panel","aria-label":"Leaders Pro 제품 흐름",children:[e.jsxs("div",{className:"suite-panel-head",children:[e.jsx("span",{}),e.jsx("span",{}),e.jsx("span",{}),e.jsx("b",{children:"Leaders Pro Suite"})]}),e.jsx("div",{className:"suite-steps",children:ze.map(([t,r,o])=>e.jsxs("article",{children:[e.jsx("small",{children:t}),e.jsx("strong",{children:r}),e.jsx("p",{children:o})]},t))}),e.jsxs("div",{className:"suite-preview",children:[e.jsx(q,{className:"products-zoom-trigger",src:"/images/leword/screen-golden-keywords.png",alt:"LEWORD 황금키워드 화면",title:"LEWORD 황금키워드 화면"}),e.jsx(q,{className:"products-zoom-trigger",src:"/images/orbit/orbit-sequential-queue.png",alt:"Orbit 연속 발행 대기열 화면",title:"Orbit 연속 발행 대기열 화면"})]})]})]})}),e.jsx("section",{id:"products-guide",className:"products-section light",children:e.jsxs("div",{className:"products-wrap",children:[e.jsxs("div",{className:"products-section-head fade-in",children:[e.jsx("span",{className:"products-kicker",children:"CHOICE MAP"}),e.jsx("h2",{children:"지금 필요한 제품부터 고르면 됩니다"}),e.jsx("p",{children:"처음에는 하나로 시작하고, 운영이 커지면 LEWORD → Naver → Orbit 흐름으로 확장하면 됩니다."})]}),e.jsx("div",{className:"guide-grid",children:Wt.map(([t,r,o,n])=>e.jsxs(v,{className:"guide-card fade-in",to:n,children:[e.jsx("span",{children:t}),e.jsx("strong",{children:r}),e.jsx("p",{children:o}),e.jsx("b",{children:"자세히 보기"})]},r))})]})}),e.jsx("section",{className:"products-section dark",children:e.jsxs("div",{className:"products-wrap",children:[e.jsxs("div",{className:"products-section-head fade-in",children:[e.jsx("span",{className:"products-kicker",children:"PRODUCT LINEUP"}),e.jsx("h2",{children:"각 제품의 역할이 겹치지 않게 나뉩니다"}),e.jsx("p",{children:"키워드 판단, 네이버 발행, 외부유입 발행을 서로 다른 단계로 분리해 운영 흐름을 단순하게 만듭니다."})]}),e.jsx("div",{className:"product-panels",children:Se.map(t=>e.jsxs("article",{className:`product-panel fade-in ${t.id}`,children:[e.jsxs("div",{className:"product-panel-copy",children:[e.jsx("span",{className:"product-badge",style:{background:Ne[t.id]},children:t.eyebrow}),e.jsx("h3",{children:t.name}),e.jsx("strong",{children:t.subtitle}),e.jsx("h4",{children:t.headline}),e.jsx("p",{children:t.desc}),e.jsx(Et,{items:t.metrics}),e.jsx("ul",{children:t.bullets.map(r=>e.jsx("li",{children:r},r))}),e.jsx(v,{className:"products-btn panel-btn",to:t.href,children:t.cta})]}),e.jsx("div",{className:"product-panel-media",children:e.jsx(Ct,{product:t})})]},t.id))})]})}),e.jsx("section",{className:"products-section light",children:e.jsxs("div",{className:"products-wrap",children:[e.jsxs("div",{className:"products-section-head fade-in",children:[e.jsx("span",{className:"products-kicker",children:"BEST FIT"}),e.jsx("h2",{children:"이럴 때 이 제품을 쓰면 됩니다"}),e.jsx("p",{children:"구매 전 가장 많이 헷갈리는 기준만 따로 정리했습니다."})]}),e.jsx("div",{className:"fit-grid",children:Se.map(t=>e.jsxs("article",{className:`fit-card fade-in ${t.id}`,children:[e.jsxs("div",{className:"fit-title",children:[e.jsx("span",{style:{background:Ne[t.id]},children:t.name.slice(0,1)}),e.jsxs("div",{children:[e.jsx("b",{children:t.name}),e.jsx("small",{children:t.subtitle})]})]}),e.jsx("ul",{children:t.fit.map(r=>e.jsx("li",{children:r},r))})]},t.id))})]})}),e.jsx("section",{className:"products-section dark compact",children:e.jsxs("div",{className:"products-wrap",children:[e.jsxs("div",{className:"products-section-head fade-in",children:[e.jsx("span",{className:"products-kicker",children:"ONE SUITE"}),e.jsx("h2",{children:"올인원 코드로 운영 흐름이 더 깔끔해집니다"}),e.jsx("p",{children:"LEWORD에서 키워드를 고르고, Naver와 Orbit으로 발행 채널을 나눠도 기간제 구매자는 올인원 라이선스 코드 하나로 함께 이용합니다."})]}),e.jsx("div",{className:"flow-line fade-in",children:ze.map(([t,r,o])=>e.jsxs("article",{children:[e.jsx("small",{children:t}),e.jsx("b",{children:r}),e.jsx("p",{children:o})]},t))}),e.jsxs("div",{className:"workflow-shots fade-in",children:[e.jsx(q,{className:"products-zoom-trigger",src:"/images/leword/17-sources-orbit.png",alt:"LEWORD 17개 데이터 소스 화면",title:"LEWORD 17개 데이터 소스 화면"}),e.jsx(q,{className:"products-zoom-trigger",src:"/images/orbit/orbit-external-traffic.png",alt:"Orbit 외부유입 글 생성 화면",title:"Orbit 외부유입 글 생성 화면"})]})]})}),e.jsx("section",{className:"products-section light",children:e.jsxs("div",{className:"products-wrap",children:[e.jsxs("div",{className:"products-section-head fade-in",children:[e.jsx("span",{className:"products-kicker",children:"COMPARE"}),e.jsx("h2",{children:"한눈에 보는 제품 비교"}),e.jsx("p",{children:"세 제품은 경쟁 제품이 아니라, 운영 단계별로 이어지는 역할을 맡습니다."})]}),e.jsx("div",{className:"compare-table-wrap fade-in",children:e.jsxs("table",{className:"compare-table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"구분"}),e.jsx("th",{children:"Better Life Naver"}),e.jsx("th",{children:"LEWORD"}),e.jsx("th",{children:"Leaders Orbit"})]})}),e.jsx("tbody",{children:Rt.map(([t,r,o,n])=>e.jsxs("tr",{children:[e.jsx("th",{children:t}),e.jsx("td",{children:r}),e.jsx("td",{children:o}),e.jsx("td",{children:n})]},t))})]})})]})}),e.jsx("section",{className:"products-final",children:e.jsxs("div",{className:"products-wrap",children:[e.jsx("span",{className:"products-kicker",children:"START"}),e.jsx("h2",{children:"고민되면 올인원으로 시작하면 됩니다"}),e.jsx("p",{children:"네이버 자동화, LEWORD, Orbit은 함께 쓸 때 키워드 발굴부터 발행, 외부유입까지 흐름이 가장 좋아집니다."}),e.jsx("p",{className:"products-note",children:"무료 체험은 Better Life Naver 기준입니다. LEWORD와 Orbit은 올인원 라이선스에서 함께 이용합니다. 개별 구매는 영구제만 별도 문의로 가능하며 각 100만원입니다."}),e.jsxs("div",{className:"products-actions center",children:[e.jsx(v,{className:"products-btn primary",to:"/pricing",children:"요금제 확인하기"}),e.jsx(v,{className:"products-btn secondary",to:"/download",children:"네이버 무료 체험 다운로드"})]})]})})]}),e.jsx("style",{children:`
                .products-page {
                    position: relative;
                    z-index: 1;
                    color: #f8fafc;
                    background: rgba(5, 8, 12, 0.54);
                }

                .products-wrap {
                    width: min(1180px, calc(100% - 48px));
                    margin: 0 auto;
                }

                .products-hero {
                    min-height: 720px;
                    display: flex;
                    align-items: center;
                    padding: 118px 0 64px;
                    background:
                        linear-gradient(135deg, rgba(8, 13, 18, 0.88), rgba(7, 35, 31, 0.76) 52%, rgba(48, 39, 17, 0.70));
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .products-hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
                    gap: 48px;
                    align-items: center;
                }

                .products-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 12px;
                    border: 1px solid rgba(244, 201, 93, 0.45);
                    border-radius: 8px;
                    background: rgba(244, 201, 93, 0.10);
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .products-hero h1 {
                    margin: 18px 0 18px;
                    font-size: 48px;
                    line-height: 1.13;
                    letter-spacing: 0;
                }

                .products-hero p,
                .products-section-head p,
                .products-final p {
                    color: rgba(255,255,255,0.76);
                    font-size: 17px;
                    line-height: 1.75;
                }

                .products-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 30px;
                }

                .products-actions.center {
                    justify-content: center;
                }

                .products-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 46px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .products-btn:hover {
                    transform: translateY(-2px);
                }

                .products-btn.primary {
                    border: 1px solid rgba(244, 201, 93, 0.7);
                    background: #f4c95d;
                    color: #071018;
                }

                .products-btn.secondary {
                    border: 1px solid rgba(255,255,255,0.20);
                    background: rgba(255,255,255,0.08);
                    color: #ffffff;
                }

                .products-suite-panel {
                    border: 1px solid rgba(255,255,255,0.16);
                    border-radius: 8px;
                    overflow: hidden;
                    background: rgba(8, 13, 18, 0.72);
                    box-shadow: 0 28px 90px rgba(0,0,0,0.34);
                    backdrop-filter: blur(12px);
                }

                .suite-panel-head {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.06);
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .suite-panel-head span {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #ef4444;
                }

                .suite-panel-head span:nth-child(2) { background: #f59e0b; }
                .suite-panel-head span:nth-child(3) { background: #22c55e; }
                .suite-panel-head b {
                    margin-left: 8px;
                    color: rgba(255,255,255,0.70);
                    font-size: 13px;
                }

                .suite-steps {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 1px;
                    background: rgba(255,255,255,0.08);
                }

                .suite-steps article {
                    min-height: 142px;
                    padding: 18px;
                    background: rgba(8, 13, 18, 0.94);
                }

                .suite-steps small,
                .flow-line small {
                    display: inline-flex;
                    margin-bottom: 12px;
                    color: #44d7b6;
                    font-size: 12px;
                    font-weight: 900;
                }

                .suite-steps strong,
                .flow-line b {
                    display: block;
                    color: #ffffff;
                    font-size: 18px;
                    margin-bottom: 8px;
                }

                .suite-steps p,
                .flow-line p {
                    color: rgba(255,255,255,0.62);
                    font-size: 13px;
                    line-height: 1.6;
                }

                .suite-preview {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(255,255,255,0.04);
                    align-items: stretch;
                }

                .suite-preview img,
                .workflow-shots img {
                    width: 100%;
                    display: block;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: #071018;
                }

                .products-zoom-trigger {
                    position: relative;
                    overflow: hidden;
                    border-radius: 8px;
                }

                .products-zoom-trigger img {
                    transition: transform .24s ease, filter .24s ease;
                }

                .products-zoom-trigger:hover img,
                .products-zoom-trigger:focus-visible img {
                    transform: scale(1.025);
                    filter: brightness(1.07);
                }

                .suite-preview img {
                    height: 312px;
                    object-fit: cover;
                    object-position: left top;
                }

                .suite-preview img:nth-child(2) {
                    object-position: center top;
                }

                .products-section {
                    padding: 88px 0;
                }

                .products-section.light {
                    background: rgba(248, 250, 252, 0.96);
                    color: #0f172a;
                }

                .products-section.dark {
                    background: rgba(7, 16, 24, 0.94);
                    color: #f8fafc;
                }

                .products-section.compact {
                    padding-bottom: 76px;
                }

                .products-section-head {
                    text-align: center;
                    max-width: 760px;
                    margin: 0 auto 42px;
                }

                .products-section-head h2,
                .products-final h2 {
                    margin: 14px 0 12px;
                    font-size: 38px;
                    line-height: 1.2;
                    letter-spacing: 0;
                }

                .products-section.light .products-section-head p,
                .products-section.light .product-panel-copy p,
                .products-section.light .fit-card li,
                .products-section.light .guide-card p {
                    color: #526173;
                }

                .guide-grid,
                .fit-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .guide-card,
                .fit-card {
                    display: block;
                    min-height: 220px;
                    padding: 24px;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    background: #ffffff;
                    color: #0f172a;
                    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
                    text-decoration: none;
                }

                .guide-card span {
                    display: block;
                    color: #0f766e;
                    font-size: 13px;
                    font-weight: 900;
                    margin-bottom: 12px;
                }

                .guide-card strong {
                    display: block;
                    font-size: 24px;
                    margin-bottom: 10px;
                }

                .guide-card p {
                    min-height: 72px;
                    font-size: 14px;
                    line-height: 1.65;
                }

                .guide-card b {
                    display: inline-flex;
                    margin-top: 18px;
                    color: #b8860b;
                    font-size: 14px;
                }

                .product-panels {
                    display: flex;
                    flex-direction: column;
                    gap: 34px;
                }

                .product-panel {
                    display: grid;
                    grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
                    gap: 34px;
                    align-items: center;
                    padding: 28px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                }

                .product-panel:nth-child(even) .product-panel-copy {
                    order: 2;
                }

                .product-panel:nth-child(even) .product-panel-media {
                    order: 1;
                }

                .product-badge {
                    display: inline-flex;
                    min-height: 26px;
                    align-items: center;
                    padding: 5px 10px;
                    border-radius: 8px;
                    color: #071018;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0;
                    margin-bottom: 14px;
                }

                .product-panel h3 {
                    font-size: 34px;
                    line-height: 1.2;
                    margin-bottom: 6px;
                    letter-spacing: 0;
                }

                .product-panel-copy > strong {
                    display: block;
                    color: #f4c95d;
                    font-size: 16px;
                    margin-bottom: 18px;
                }

                .product-panel h4 {
                    font-size: 22px;
                    line-height: 1.45;
                    margin-bottom: 12px;
                }

                .product-panel-copy p {
                    color: rgba(255,255,255,0.70);
                    font-size: 15px;
                    line-height: 1.75;
                }

                .products-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin: 22px 0;
                }

                .products-metrics div {
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .products-metrics b {
                    display: block;
                    font-size: 21px;
                    color: #ffffff;
                    line-height: 1.1;
                    margin-bottom: 6px;
                }

                .products-metrics span {
                    color: rgba(255,255,255,0.60);
                    font-size: 12px;
                }

                .product-panel ul,
                .fit-card ul {
                    list-style: none;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    padding: 0;
                    margin: 0;
                }

                .product-panel li,
                .fit-card li {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.6;
                }

                .product-panel li::before,
                .fit-card li::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 10px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #44d7b6;
                }

                .panel-btn {
                    margin-top: 24px;
                    border: 1px solid rgba(244, 201, 93, 0.55);
                    background: rgba(244, 201, 93, 0.12);
                    color: #f4c95d;
                }

                .product-panel-media {
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: #071018;
                    box-shadow: 0 22px 70px rgba(0,0,0,0.36);
                }

                .products-media {
                    display: block;
                    width: 100%;
                    min-height: 300px;
                    object-fit: cover;
                    background: #071018;
                }

                .product-panel.orbit .products-media {
                    aspect-ratio: 16 / 9;
                    min-height: 0;
                    object-fit: contain;
                }

                .fit-card {
                    min-height: 250px;
                }

                .fit-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 18px;
                }

                .fit-title span {
                    width: 42px;
                    height: 42px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    color: #071018;
                    font-weight: 900;
                }

                .fit-title b,
                .fit-title small {
                    display: block;
                }

                .fit-title b {
                    font-size: 18px;
                    color: #0f172a;
                }

                .fit-title small {
                    color: #64748b;
                    font-size: 13px;
                }

                .flow-line {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 14px;
                }

                .flow-line article {
                    min-height: 180px;
                    padding: 22px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .workflow-shots {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 18px;
                    margin-top: 26px;
                }

                .compare-table-wrap {
                    overflow-x: auto;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    box-shadow: 0 14px 44px rgba(15, 23, 42, 0.08);
                }

                .compare-table {
                    width: 100%;
                    min-width: 760px;
                    border-collapse: collapse;
                    background: #ffffff;
                    color: #0f172a;
                    font-size: 14px;
                }

                .compare-table th,
                .compare-table td {
                    padding: 18px;
                    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
                    vertical-align: top;
                    text-align: left;
                }

                .compare-table thead th {
                    color: #0f172a;
                    background: #f8fafc;
                    font-size: 14px;
                    font-weight: 900;
                }

                .compare-table tbody th {
                    width: 160px;
                    color: #0f766e;
                    font-weight: 900;
                    background: #f8fafc;
                }

                .compare-table tr:last-child th,
                .compare-table tr:last-child td {
                    border-bottom: none;
                }

                .products-final {
                    padding: 84px 0 96px;
                    text-align: center;
                    background:
                        linear-gradient(135deg, rgba(6, 95, 70, 0.94), rgba(10, 16, 24, 0.96) 58%, rgba(87, 66, 18, 0.90));
                    border-top: 1px solid rgba(255,255,255,0.10);
                }

                .products-final .products-wrap {
                    max-width: 760px;
                }

                .products-note {
                    margin-top: 12px;
                    color: rgba(255,255,255,0.68) !important;
                    font-size: 14px !important;
                }

                @media (max-width: 980px) {
                    .products-hero {
                        min-height: auto;
                    }

                    .products-hero-grid,
                    .product-panel,
                    .workflow-shots {
                        grid-template-columns: 1fr;
                    }

                    .product-panel:nth-child(even) .product-panel-copy,
                    .product-panel:nth-child(even) .product-panel-media {
                        order: initial;
                    }

                    .guide-grid,
                    .fit-grid,
                    .flow-line {
                        grid-template-columns: 1fr 1fr;
                    }

                    .suite-steps {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                @media (max-width: 640px) {
                    .products-wrap {
                        width: min(100% - 28px, 1180px);
                    }

                    .products-hero {
                        padding: 96px 0 42px;
                    }

                    .products-hero h1 {
                        font-size: 34px;
                    }

                    .products-hero p,
                    .products-section-head p,
                    .products-final p {
                        font-size: 15px;
                    }

                    .products-section {
                        padding: 62px 0;
                    }

                    .products-section-head h2,
                    .products-final h2 {
                        font-size: 28px;
                    }

                    .products-actions,
                    .products-actions.center {
                        display: grid;
                        grid-template-columns: 1fr;
                    }

                    .products-btn {
                        width: 100%;
                    }

                    .suite-steps,
                    .suite-preview,
                    .guide-grid,
                    .fit-grid,
                    .flow-line,
                    .products-metrics {
                        grid-template-columns: 1fr;
                    }

                    .product-panel {
                        padding: 18px;
                    }

                    .product-panel h3 {
                        font-size: 28px;
                    }

                    .product-panel h4 {
                        font-size: 20px;
                    }

                    .products-media {
                        min-height: 220px;
                    }

                    .suite-preview img {
                        height: 220px;
                    }
                }
            `})]})}const g={gold:"#FFD700",neonGreen:"#00FF88",neonBlue:"#00AAFF",bgDark:"#0a0a0f",bgCard:"#12121a",bgSection:"#0d0d14",textPrimary:"#fff",textSecondary:"#a0a0b0",gradGold:"linear-gradient(135deg, #FFD700, #FFA500, #FF6B00)",gradFire:"linear-gradient(135deg, #f12711, #f5af19)"},It=[{icon:"⏰",title:"매일 3시간씩 글쓰기",desc:"키워드 찾고, 글 쓰고, 이미지 만들고... 하루가 다 가도 1~2편이 한계"},{icon:"📉",title:"노출이 안 되는 글",desc:"열심히 썼는데 검색에도 안 걸리고, 홈피드에도 안 뜨는 현실"},{icon:"🤖",title:"AI 글 저품질 걱정",desc:"ChatGPT로 쓰면 AI 티가 나서 저품질 먹을까 불안..."},{icon:"💸",title:"수익화가 안 됨",desc:"애드포스트 수익은 하루 커피값, 제휴마케팅은 링크 넣기조차 번거로움"},{icon:"😓",title:"다계정 관리 불가능",desc:"블로그 수익을 키우려면 계정이 여러 개 필요한데... 하나도 힘든 걸 여러 개?"}],Bt=[{badge:"SEO 모드",title:"검색 노출을 목표로 글 구조를 자동 설계",desc:"키워드, 제목, 소제목, 본문 흐름, 표, 해시태그까지 네이버 검색형 글 구조로 정리합니다.",image:"/images/seo-analysis.png",points:["핵심 키워드 중심 제목 생성","소제목별 본문 흐름 자동 정리","표·체크리스트 자동 삽입","이전글 엮기와 해시태그 자동 추가"]},{badge:"홈판 모드",title:"홈피드에서 술술 읽히는 대화형 글",desc:"딱딱한 설명문이 아니라 공감, 경험, 질문, 짧은 문단 중심으로 읽히는 글을 만듭니다.",image:"/images/mega03-hero.jpg",points:["공감형 도입부","짧은 문단과 자연스러운 줄바꿈","요체·습니다체 혼합 문체","모바일 화면 기준 가독성 정리"]},{badge:"네이버 메이트",title:"선정 가능성을 높이는 정보형 고품질 구성",desc:"근거, 경험, 비교, 요약, Q&A를 조합해 사람이 직접 정리한 듯한 신뢰형 글을 구성합니다.",image:"/images/naver-detail/content-format-highlight.png",points:["핵심 문장 하이라이트","모바일 중심 문단 간격","Q&A·한 줄 판정 정리","표와 체크리스트 기반 설명"]},{badge:"쇼핑커넥트",title:"제품 크롤링부터 CTA·수익화 배치까지",desc:"상품명, 가격, 대표 이미지, 추가 이미지, 핵심 장단점을 읽고 구매욕구를 만드는 글로 바꿉니다.",image:"/images/naver-detail/shopping-result-main.png",points:["대표·추가 이미지 수집","제품 정보 기반 글 생성","CTA 위치 선택","관련 글·해시태그까지 마무리"]},{badge:"업체홍보·사용자정의",title:"홍보글도 티 나지 않게 자연스럽게",desc:"업체 정보, 장점, 후기형 흐름을 섞어 광고 느낌은 낮추고 문의 전환은 높이도록 구성합니다.",image:"/images/mega05-hero.jpg",points:["업체 장점 자동 정리","후기형 문체 적용","전환 CTA 삽입","사용자 프롬프트 자유 반영"]}],Ot=[{label:"문단·하이라이트",image:"/images/naver-detail/content-format-highlight.png",title:"문단정리, 하이라이트, 줄바꿈을 한 번에",desc:"모바일에서 읽기 쉬운 간격으로 문단을 나누고, 중요한 문장만 자연스럽게 강조합니다."},{label:"표 자동 삽입",image:"/images/naver-detail/auto-table-result.png",title:"필요한 글에는 표까지 자동 삽입",desc:"비교, 기준, 가격, 체크포인트가 필요한 글은 표로 정리해 독자가 빠르게 이해하게 만듭니다."},{label:"이전글·해시태그",image:"/images/naver-detail/previous-post-hashtags.png",title:"이전글 엮기와 해시태그까지 자동 마무리",desc:"본문 작성 후 관련 이전글 카드와 해시태그를 붙여 체류 시간과 내부 이동을 함께 챙깁니다."}],Pt=[{image:"/images/naver-detail/shopping-result-main.png",title:"쇼핑커넥트 본문 결과"},{image:"/images/naver-detail/shopping-result-table.png",title:"제품 정보 표 자동 구성"},{image:"/images/naver-detail/shopping-result-cta.png",title:"CTA 배너 배치"},{image:"/images/naver-detail/shopping-result-link-card.png",title:"상품 카드 연결"},{image:"/images/naver-detail/shopping-result-related-hashtags.png",title:"관련글과 해시태그"}],Dt=["/images/proof-user/KakaoTalk_20260305_004700252.jpg","/images/proof-user/KakaoTalk_20260305_004700252_01.jpg","/images/proof-user/KakaoTalk_20260305_004700252_02.jpg","/images/proof-user/KakaoTalk_20260305_004700252_03.jpg","/images/proof-user/KakaoTalk_20260305_004700252_04.jpg","/images/proof-user/KakaoTalk_20260305_004700252_05.png","/images/proof-user/KakaoTalk_20260305_004700252_06.jpg","/images/proof-user/KakaoTalk_20260305_004700252_07.jpg","/images/proof-user/KakaoTalk_20260309_163736774.jpg","/images/proof-user/KakaoTalk_20260309_164704537.png","/images/proof-user/KakaoTalk_20260310_002438127.png"],_t=[{title:"반자동 모드",desc:"글은 직접 확인하고, 이미지 삽입과 발행 흐름은 자동화합니다."},{title:"풀오토 모드",desc:"키워드나 URL만 넣으면 글 생성, 이미지 생성, 발행까지 클릭 한 번으로 진행합니다."},{title:"연속발행",desc:"자기 전에 세팅해두면 안전 간격을 두고 여러 글을 순차 발행합니다."},{title:"다중계정 발행",desc:"계정별 설정을 나누고 각 계정에 맞춰 순차 발행할 수 있습니다."}],Mt=[{title:"AI 이미지 자동 생성",desc:"소제목과 문맥에 맞는 이미지를 엔진별로 생성하고 미리보기로 확인합니다."},{title:"AI 이미지 자동 수집",desc:"URL에서 대표 이미지와 추가 이미지를 수집해 글 흐름에 맞게 사용할 수 있습니다."},{title:"소제목별 원하는 이미지 배치",desc:"특정 소제목에는 사용자가 고른 이미지를 우선 배치해 섞임을 줄입니다."},{title:"썸네일 텍스트 포함",desc:"대표 썸네일에만 제목 텍스트를 넣고 본문 이미지는 깔끔하게 유지합니다."}],$t=[{feature:"AI 글 작성",manual:"✕",generic:"일부 지원",ours:"✓ 10종 AI 엔진"},{feature:"AI 이미지 생성",manual:"✕",generic:"✕",ours:"✓ 6종 이미지 엔진"},{feature:"완전 자동 발행",manual:"✕",generic:"반자동",ours:"✓ 100% 풀오토"},{feature:"다중 계정",manual:"✕",generic:"제한적",ours:"✓ 무제한"},{feature:"AI 탐지 우회",manual:"✕",generic:"✕",ours:"✓ 자동 우회"},{feature:"스케줄 발행",manual:"✕",generic:"✓",ours:"✓ 스마트 예약"},{feature:"쇼핑 커넥트",manual:"✕",generic:"✕",ours:"✓ 자동 수익화"}],Ht=[{avatar:"👩‍💼",name:"김*진",role:"육아맘 블로거 · 6개월차",text:"아이 재우고 새벽에 글 쓰던 게 일상이었는데... 이제 키워드만 넣으면 AI가 다 써줘요. 하루 5편씩 올리니까 방문자가 3배 늘었어요!",result:"📈 월 방문자 3,200 → 12,400"},{avatar:"👨‍💻",name:"이*현",role:"직장인 부업 블로거 · 3개월차",text:"퇴근 후 30분이면 다음날 발행할 글 10편을 세팅합니다. 쇼핑 커넥트로 쿠팡 수익도 자동이라 진짜 편해요.",result:"💰 월 부수입 0원 → 87만원"},{avatar:"👨‍🔧",name:"박*수",role:"전업 블로거 · 1년차",text:"6개 블로그를 혼자 운영하는 게 가능해졌습니다. 다중계정 기능이 진짜 사기예요. 이전에는 하나도 벅찼는데.",result:"📊 블로그 6개 동시 운영 중"}],Le=[{name:"스타터",period:"1개월",original:"₩100,000",current:"₩50,000",discount:"50% OFF — 첫 달 한정",features:["AI 10종 엔진 풀 액세스","AI 이미지 6종 엔진","풀오토 자동 발행","다중계정 관리","쇼핑 커넥트 수익화","무제한 글 생성"]},{name:"프로",period:"3개월 · 월 ₩40,000",original:"₩300,000",current:"₩120,000",discount:"60% OFF — ₩180,000 절약",popular:!0,features:["스타터의 모든 기능","우선 기술 지원","신기능 얼리 액세스","보너스 키워드팩 증정","카카오 VIP 채널 초대"]},{name:"마스터",period:"1년 · 월 ₩33,333",original:"₩1,200,000",current:"₩400,000",discount:"67% OFF — ₩800,000 절약",features:["프로의 모든 기능","전담 매니저 배정","커스텀 프롬프트 설정","베타 기능 우선 체험","블로그 성장 컨설팅"]}],Gt=[{q:"네이버 저품질에 걸리지 않나요?",a:`3단계 안전장치로 저품질을 방지합니다.

① AI 탐지 위험도 실시간 분석 — 발행 전 글의 AI 패턴 점수를 체크하여 위험도가 높으면 자동으로 문체를 재조정합니다.
② 11가지 문체 스타일 — '엄마 블로거', '직장인 후기', '전문가 칼럼' 등 사람마다 다른 톤으로 작성.
③ 스마트 시간차 발행 — 글마다 3~15분 랜덤 딜레이 + 일일 발행 쿨다운으로 봇 탐지를 우회.

실제 사용자 2,800명 이상이 6개월 넘게 운영 중이며, 저품질 보고 사례가 없습니다.`},{q:"AI가 작성한 글의 품질은 어떤가요? 직접 수정해야 하나요?",a:`별도 수정 없이 바로 발행 가능한 수준입니다.

· AI 엔진 7종 — GPT-4o, Gemini 2.5 Flash/Pro, Claude 3.5 Sonnet, DeepSeek 등 목적에 맞는 AI 자동 선택
· 글 분량 — 네이버 SEO 최적 6,000~10,000자
· 14개 카테고리 전용 프롬프트
· 자동 구조화 — 서론→본론→마무리 + 소제목 + 이미지 위치까지 자동`},{q:"쇼핑 커넥트로 구체적으로 얼마나 벌 수 있나요?",a:`하루 10편 발행 기준, 월 30~100만원이 일반적입니다.

· 수익 구조 — 쿠팡 파트너스(구매액 3~5%) + 네이버 애드포스트 + 스마트스토어 제휴링크 자동 삽입
· 실제 사례 — 블로그 3개 운영 + 하루 15편 사용자가 월 평균 127만원의 제휴 수익

수익은 블로그 지수, 카테고리, 발행 빈도에 따라 달라질 수 있습니다.`},{q:"다계정은 몇 개까지 등록할 수 있나요?",a:`계정 수 제한 없이 무제한 등록 가능합니다.

· 계정별 개별 설정 (카테고리, AI 엔진, 발행 시간대, 문체)
· 시간대 분산 (A: 오전 9~12시 / B: 오후 2~6시)
· 통합 대시보드에서 전체 발행 현황 확인`},{q:"이미지는 어떻게 생성되나요? 저작권 문제는 없나요?",a:`100% AI 생성 이미지로 저작권 문제가 없습니다.

· 이미지 엔진 6종 — Google Imagen 4, DALL-E 3, ImageFX, Ideogram 등
· 영상 지원 — Google Veo로 6초 분량 AI 영상
· 글당 3~8장 자동 삽입
· 내 PC 이미지 업로드도 가능`},{q:"설치 방법이 복잡한가요? 컴퓨터를 잘 못해도 사용할 수 있나요?",a:`설치 파일 1개 다운로드 → 실행 → 끝. 5분이면 시작합니다.

· Windows 전용 데스크톱 앱 — 별도 서버 X, 코딩 지식 X
· 결제 후 라이선스 키 입력 → 즉시 사용
· 자동 업데이트 — 매주 1~2회 정기
· 카카오톡 1:1 지원`},{q:"예약 발행(스케줄링)은 어떻게 작동하나요?",a:`캘린더에서 날짜와 시간대만 선택하면 자동으로 발행됩니다.

· 스마트 스케줄러 — 트래픽 높은 시간대(오전 7~9, 오후 12~2, 저녁 8~10) 자동 추천
· 랜덤 딜레이 — 3~15분
· 반복 스케줄 — '매일 오전 9시~오후 6시 사이 5편' 패턴 저장
· 실시간 모니터링`},{q:"환불 정책은 어떻게 되나요?",a:`구매 후 7일 이내 무조건 전액 환불해 드립니다.

· 환불 방법 — 카카오톡 채널 '리더스프로' 1:1 문의
· 위약금 없음 — 사유 무관
· 월간 구독 — 다음 달 구독 취소 시 추가 비용 X
· 연간 구독 — 7일 이후 잔여 금액 환불`}],me={display:"inline-flex",alignItems:"center",gap:10,background:g.gradGold,color:"#000",fontSize:18,fontWeight:700,padding:"18px 40px",borderRadius:12,textDecoration:"none",transition:"all 0.3s"};function ae({text:t,btnLabel:r="무료 체험 시작 →"}){return e.jsxs("div",{style:{padding:"60px 20px",textAlign:"center",background:"linear-gradient(135deg, rgba(255,215,0,0.06), rgba(255,107,0,0.04))",borderTop:"1px solid rgba(255,215,0,0.1)",borderBottom:"1px solid rgba(255,215,0,0.1)"},children:[e.jsx("p",{style:{fontSize:20,fontWeight:700,marginBottom:20},children:t}),e.jsx(v,{to:"/pricing",style:me,children:r})]})}const V=t=>({padding:"100px 20px",background:t,position:"relative",zIndex:1});function X({label:t,title:r,desc:o}){return e.jsxs("div",{style:{textAlign:"center",maxWidth:820,margin:"0 auto 54px"},children:[e.jsx("div",{style:{color:g.gold,fontWeight:800,fontSize:13,letterSpacing:3,textTransform:"uppercase",marginBottom:14},children:t}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900,lineHeight:1.25,marginBottom:o?18:0},children:r}),o&&e.jsx("p",{style:{color:g.textSecondary,fontSize:18,lineHeight:1.8},children:o})]})}function Ut(){return e.jsx("section",{style:V(g.bgDark),id:"features",children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsx(X,{label:"MODE BY MODE",title:e.jsx(e.Fragment,{children:"앱 모드별로 결과가 다르게 나옵니다"}),desc:"SEO, 홈판, 네이버 메이트, 쇼핑커넥트, 업체홍보까지 목적에 맞는 글 구조와 이미지 흐름을 자동으로 맞춥니다."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:22},children:Bt.map((t,r)=>e.jsxs("article",{style:{background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:20,overflow:"hidden",boxShadow:"0 24px 70px rgba(0,0,0,0.22)"},children:[e.jsx("div",{style:{height:190,background:"#08080c",overflow:"hidden"},children:e.jsx("img",{src:t.image,alt:`${t.badge} 결과 예시`,loading:r<2?"eager":"lazy",style:{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",display:"block"}})}),e.jsxs("div",{style:{padding:24},children:[e.jsx("span",{style:{display:"inline-flex",padding:"6px 12px",borderRadius:999,background:"rgba(255,215,0,0.12)",color:g.gold,fontSize:12,fontWeight:900,marginBottom:14},children:t.badge}),e.jsx("h3",{style:{fontSize:21,fontWeight:900,lineHeight:1.35,marginBottom:10},children:t.title}),e.jsx("p",{style:{color:g.textSecondary,fontSize:14,lineHeight:1.75,marginBottom:16},children:t.desc}),e.jsx("ul",{style:{listStyle:"none",margin:0,padding:0,display:"grid",gap:8},children:t.points.map(o=>e.jsxs("li",{style:{display:"flex",gap:9,color:"#d8d8e8",fontSize:13,lineHeight:1.55},children:[e.jsx("span",{style:{color:g.neonGreen,fontWeight:900,flexShrink:0},children:"✓"}),e.jsx("span",{children:o})]},o))})]})]},t.badge))})]})})}function Kt(){return e.jsx("section",{style:V(g.bgSection),children:e.jsxs("div",{style:{maxWidth:1180,margin:"0 auto"},children:[e.jsx(X,{label:"REAL WRITING RESULT",title:e.jsx(e.Fragment,{children:"글 결과물은 이렇게 정리됩니다"}),desc:"문단정리, 핵심문장 하이라이트, 표, 이전글 엮기, 해시태그가 발행 흐름 안에서 같이 들어가도록 구성합니다."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:24},children:Ot.map((t,r)=>e.jsxs("article",{style:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:20,overflow:"hidden"},children:[e.jsx("div",{style:{height:r===0?300:260,overflow:"hidden",background:"#f5f5f5"},children:e.jsx("img",{src:t.image,alt:t.title,loading:"lazy",style:{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top",display:"block"}})}),e.jsxs("div",{style:{padding:24},children:[e.jsx("div",{style:{color:g.neonGreen,fontSize:12,fontWeight:900,letterSpacing:2,marginBottom:10},children:t.label}),e.jsx("h3",{style:{fontSize:22,fontWeight:900,marginBottom:10},children:t.title}),e.jsx("p",{style:{color:g.textSecondary,lineHeight:1.75,fontSize:14},children:t.desc})]})]},t.label))})]})})}function qt(){return e.jsx("section",{style:V(g.bgDark),children:e.jsxs("div",{style:{maxWidth:1180,margin:"0 auto"},children:[e.jsx(X,{label:"PUBLISHING FLOW",title:e.jsx(e.Fragment,{children:"클릭 한 번부터 자기 전 세팅까지"}),desc:"반자동, 풀오토, 연속발행, 다중계정 발행까지 사용자의 운영 방식에 맞춰 글과 이미지를 끝까지 처리합니다."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:18},children:_t.map((t,r)=>e.jsxs("article",{style:{background:"linear-gradient(180deg, rgba(255,215,0,0.08), rgba(255,255,255,0.04))",border:"1px solid rgba(255,215,0,0.18)",borderRadius:18,padding:26},children:[e.jsx("div",{style:{width:34,height:34,borderRadius:"50%",background:g.gradGold,color:"#111",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:18},children:r+1}),e.jsx("h3",{style:{fontSize:20,fontWeight:900,marginBottom:9},children:t.title}),e.jsx("p",{style:{color:g.textSecondary,fontSize:14,lineHeight:1.75},children:t.desc})]},t.title))})]})})}function Yt(){return e.jsx("section",{style:V(g.bgSection),children:e.jsxs("div",{style:{maxWidth:1180,margin:"0 auto"},children:[e.jsx(X,{label:"IMAGE MANAGEMENT",title:e.jsx(e.Fragment,{children:"이미지도 글 흐름에 맞게 자동 관리합니다"}),desc:"이미지 생성, 이미지 수집, 소제목별 이미지 배치, 썸네일 텍스트 포함까지 한 화면에서 관리할 수 있습니다."}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1.05fr 0.95fr",gap:26,alignItems:"stretch"},className:"detail-image-workflow-grid",children:[e.jsx("div",{style:{borderRadius:22,overflow:"hidden",border:"1px solid rgba(255,255,255,0.10)",background:"#060609"},children:e.jsx("img",{src:"/images/mega02-hero.jpg",alt:"AI 이미지 생성과 이미지 관리 탭",loading:"lazy",style:{width:"100%",height:"100%",minHeight:360,objectFit:"cover",objectPosition:"top",display:"block"}})}),e.jsx("div",{style:{display:"grid",gap:16},children:Mt.map(t=>e.jsxs("article",{style:{background:"rgba(255,255,255,0.055)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:18,padding:24},children:[e.jsx("h3",{style:{fontSize:20,fontWeight:900,marginBottom:9},children:t.title}),e.jsx("p",{style:{color:g.textSecondary,fontSize:14,lineHeight:1.75},children:t.desc})]},t.title))})]})]})})}function Vt(){return e.jsx("section",{style:V(g.bgDark),children:e.jsxs("div",{style:{maxWidth:1180,margin:"0 auto"},children:[e.jsx(X,{label:"SHOPPING CONNECT RESULT",title:e.jsx(e.Fragment,{children:"쇼핑커넥트 글은 판매 흐름까지 챙깁니다"}),desc:"제품 이미지, 제품 정보 표, CTA, 상품 카드, 관련글과 해시태그까지 구매 전환에 필요한 구성을 자동으로 붙입니다."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:20},children:Pt.map(t=>e.jsxs("article",{style:{background:"rgba(255,255,255,0.045)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:18,overflow:"hidden"},children:[e.jsx("img",{src:t.image,alt:t.title,loading:"lazy",style:{width:"100%",height:260,objectFit:"cover",objectPosition:"top",display:"block"}}),e.jsx("div",{style:{padding:"16px 18px",fontWeight:800},children:t.title})]},t.title))})]})})}function Xt(){return e.jsx("section",{style:V(g.bgSection),children:e.jsxs("div",{style:{maxWidth:1180,margin:"0 auto"},children:[e.jsx(X,{label:"USER PROOF",title:e.jsx(e.Fragment,{children:"사용자들이 실제로 결과를 만들고 있습니다"}),desc:"조회수와 수익 인증 이미지를 그대로 모아, 단순 기능 소개가 아니라 실제 운영 결과를 함께 보여줍니다."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:16},children:Dt.map((t,r)=>e.jsx("div",{style:{borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.10)",background:"rgba(255,255,255,0.04)",minHeight:180},children:e.jsx("img",{src:t,alt:`구매자 수익 인증 ${r+1}`,loading:"lazy",style:{width:"100%",height:220,objectFit:"cover",objectPosition:"top",display:"block"}})},t))}),e.jsx("p",{style:{color:g.textSecondary,textAlign:"center",marginTop:24,fontSize:14},children:"매일 업데이트되는 로직과 네이버 화면 변경 모니터링으로, 사용자가 막히는 지점을 계속 개선합니다."})]})})}function Fe(){const[t,r]=a.useState(null),[o,n]=a.useState(null);return a.useEffect(()=>{const i=document.title;return document.title="Better Life Naver — AI 글인데 사람이 쓴 것처럼",()=>{document.title=i}},[]),a.useEffect(()=>{const i=p=>{const m=p.target?.closest?.(".detail-page-root img");!m||m.closest("nav")||m.dataset.zoomDisabled==="true"||n({src:m.currentSrc||m.src,alt:m.alt||"이미지 크게 보기"})},s=p=>{p.key==="Escape"&&n(null)};return document.addEventListener("click",i),document.addEventListener("keydown",s),()=>{document.removeEventListener("click",i),document.removeEventListener("keydown",s)}},[]),e.jsxs("div",{className:"detail-page-root",style:{background:g.bgDark,color:g.textPrimary},children:[e.jsx(ne,{}),e.jsxs("section",{style:{minHeight:"90vh",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"120px 20px 60px",position:"relative",overflow:"hidden",zIndex:1},children:[e.jsx("div",{style:{position:"absolute",inset:0,opacity:.15,filter:"blur(2px)",zIndex:0},children:e.jsx("video",{autoPlay:!0,muted:!0,loop:!0,playsInline:!0,style:{width:"100%",height:"100%",objectFit:"cover"},children:e.jsx("source",{src:"/images/hero-demo.mp4",type:"video/mp4"})})}),e.jsxs("div",{style:{maxWidth:900,position:"relative",zIndex:2},children:[e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"8px 20px",borderRadius:50,fontSize:14,color:g.gold,marginBottom:30},children:[e.jsx("span",{children:"🏆"}),e.jsx("span",{children:"네이버가 못 잡는 AI 글, Leaders Pro로"})]}),e.jsxs("h1",{style:{fontSize:"clamp(32px, 6vw, 64px)",fontWeight:900,lineHeight:1.2,marginBottom:20},children:["AI 글인데",e.jsx("br",{}),e.jsx("span",{style:{background:g.gradGold,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"사람이 쓴 것처럼."})]}),e.jsxs("p",{style:{fontSize:"clamp(16px, 2.5vw, 22px)",color:g.textSecondary,marginBottom:40},children:["AuthGR 방어 · 이미지 일관성 검증 · 저품질 회피 알고리즘",e.jsx("br",{}),"— 자동인데 노출에 강한 네이버 블로그 자동화 도구."]}),e.jsx(v,{to:"/pricing",style:me,children:"지금 시작하기 →"}),e.jsxs("div",{style:{marginTop:40,fontSize:14,color:g.textSecondary,display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap"},children:[e.jsxs("span",{children:[e.jsx("strong",{style:{color:"#fff"},children:"2,847명"})," 사용 중"]}),e.jsx("span",{children:"·"}),e.jsxs("span",{children:[e.jsx("strong",{style:{color:"#fff"},children:"158,430편"})," 발행"]}),e.jsx("span",{children:"·"}),e.jsxs("span",{children:[e.jsx("strong",{style:{color:"#fff"},children:"4.9★"})," 만족도"]})]})]})]}),e.jsx("section",{style:{padding:"100px 20px",background:g.bgSection,textAlign:"center",position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsx("div",{style:{color:"#ff6b6b",fontWeight:700,fontSize:14,letterSpacing:3,textTransform:"uppercase",marginBottom:16},children:"😰 이런 고민, 있으시죠?"}),e.jsxs("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900,marginBottom:20},children:["블로그 운영, ",e.jsx("span",{style:{color:"#ff6b6b"},children:"이렇게 힘들어야 하나요?"})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:24,marginTop:50},children:It.map((i,s)=>e.jsxs("div",{style:{background:"rgba(255,107,107,0.12)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:16,padding:32,textAlign:"left"},children:[e.jsx("div",{style:{fontSize:40,marginBottom:16},children:i.icon}),e.jsx("h3",{style:{fontSize:20,marginBottom:10,color:"#ff6b6b"},children:i.title}),e.jsx("p",{style:{color:g.textSecondary,fontSize:15},children:i.desc})]},s))}),e.jsxs("div",{style:{background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:12,padding:24,marginTop:40},children:[e.jsxs("p",{style:{fontSize:18,fontWeight:700,color:"#ff8888"},children:["하루 3시간 × 30일 = ",e.jsx("span",{style:{fontSize:32,color:"#ff6b6b"},children:"90시간"})]}),e.jsxs("p",{style:{fontSize:18,fontWeight:700,color:"#ff8888"},children:["시급 1만원이면 매달 ",e.jsx("span",{style:{fontSize:32,color:"#ff6b6b"},children:"90만원"}),"을 블로그에 버리는 셈입니다"]})]})]})}),e.jsx(Ut,{}),e.jsx(Kt,{}),e.jsx(ae,{text:"문단정리, 하이라이트, 표, 이전글 엮기까지 한 번에 끝냅니다"}),e.jsx(qt,{}),e.jsx(Yt,{}),e.jsx(Vt,{}),e.jsx(ae,{text:"쇼핑커넥트 글도 클릭 한 번으로 수익화 흐름까지 배치합니다",btnLabel:"요금제 확인 →"}),e.jsx(Xt,{}),e.jsx("section",{style:{padding:"100px 20px",background:g.bgDark,position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:40},children:[e.jsx("div",{style:{color:g.neonBlue,fontWeight:700,fontSize:14,letterSpacing:3,textTransform:"uppercase",marginBottom:16},children:"📊 비교"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900},children:"왜 Better Life Naver인가?"})]}),e.jsx("div",{style:{overflowX:"auto"},children:e.jsxs("table",{style:{width:"100%",minWidth:600,borderCollapse:"collapse",maxWidth:900,margin:"0 auto"},children:[e.jsx("thead",{children:e.jsxs("tr",{style:{background:"rgba(255,215,0,0.12)"},children:[e.jsx("th",{style:{padding:"18px 24px",textAlign:"left"},children:"기능"}),e.jsx("th",{style:{padding:"18px 24px"},children:"수동 블로깅"}),e.jsx("th",{style:{padding:"18px 24px"},children:"타사 자동화"}),e.jsx("th",{style:{padding:"18px 24px",color:g.gold},children:"Better Life Naver"})]})}),e.jsx("tbody",{children:$t.map((i,s)=>e.jsxs("tr",{children:[e.jsx("td",{style:{padding:"18px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",fontWeight:500},children:i.feature}),e.jsx("td",{style:{padding:"18px 24px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.06)",color:i.manual.startsWith("✕")?"#ff4444":"#ffaa00"},children:i.manual}),e.jsx("td",{style:{padding:"18px 24px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.06)",color:i.generic.startsWith("✕")?"#ff4444":"#ffaa00"},children:i.generic}),e.jsx("td",{style:{padding:"18px 24px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,215,0,0.10)",color:g.neonGreen},children:i.ours})]},s))})]})})]})}),e.jsx("div",{style:{textAlign:"center",padding:"30px 20px",background:"rgba(255,215,0,0.10)",borderTop:"1px solid rgba(255,215,0,0.25)",position:"relative",zIndex:1},children:e.jsxs("p",{style:{fontSize:16,color:g.textSecondary,fontWeight:500},children:[e.jsx("strong",{style:{color:g.gold},children:"대한민국 블로그 자동화 1위"})," — 2,847명이 선택한 이유가 있습니다"]})}),e.jsx("section",{style:{padding:"100px 20px",background:g.bgSection,position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:50},children:[e.jsx("div",{style:{color:g.gold,fontWeight:700,fontSize:14,letterSpacing:3,textTransform:"uppercase",marginBottom:16},children:"💬 실제 사용 후기"}),e.jsxs("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900},children:["사용자들의 ",e.jsx("span",{style:{background:g.gradGold,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"리얼 후기"})]})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:24},children:Ht.map((i,s)=>e.jsxs("div",{style:{background:g.bgCard,border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:32},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:12},children:[e.jsx("div",{style:{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg, #667eea, #764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20},children:i.avatar}),e.jsxs("div",{children:[e.jsx("div",{style:{fontWeight:700,fontSize:15},children:i.name}),e.jsx("div",{style:{fontSize:13,color:g.textSecondary},children:i.role})]})]}),e.jsx("div",{style:{color:g.gold,fontSize:18,marginBottom:12},children:"★★★★★"}),e.jsxs("p",{style:{fontSize:15,color:g.textSecondary,lineHeight:1.8,marginBottom:16},children:['"',i.text,'"']}),e.jsx("div",{style:{background:"rgba(255,215,0,0.10)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:8,padding:"10px 14px",fontSize:13,color:g.gold,fontWeight:600},children:i.result})]},s))})]})}),e.jsx(ae,{text:"🚀 지금 시작하면 내일부터 블로그가 자동으로 돌아갑니다",btnLabel:"요금제 보기 →"}),e.jsx("section",{style:{padding:"100px 20px",background:g.bgDark,textAlign:"center",position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsx("div",{style:{color:g.gold,fontWeight:700,fontSize:14,letterSpacing:3,textTransform:"uppercase",marginBottom:16},children:"💎 PRICING"}),e.jsxs("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900,marginBottom:20},children:["블로그 외주 1편 가격으로",e.jsx("br",{}),e.jsx("span",{style:{background:g.gradGold,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"한 달을 자동화하세요"})]}),e.jsx("p",{style:{color:g.textSecondary,fontSize:16,maxWidth:600,margin:"0 auto 20px"},children:"매달 블로그 외주비 90만원 vs Better Life Naver 월 5만원"}),e.jsx("div",{style:{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(0,255,136,0.08)",border:"1px solid rgba(0,255,136,0.25)",padding:"8px 20px",borderRadius:50,fontSize:14,color:g.neonGreen,marginBottom:48},children:"💡 하루 커피 한잔 값으로 블로그 완전 자동화"}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:0,maxWidth:1100,margin:"0 auto"},children:Le.map((i,s)=>e.jsxs("div",{style:{background:i.popular?"linear-gradient(180deg, rgba(255,215,0,0.06), rgba(18,18,26,0.9))":"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:i.popular?`2px solid ${g.gold}55`:"1px solid rgba(255,255,255,0.06)",padding:"40px 28px 36px",position:"relative",transform:i.popular?"scale(1.06)":"none",zIndex:i.popular?3:1,borderRadius:s===0?"24px 0 0 24px":s===Le.length-1?"0 24px 24px 0":0},children:[i.popular&&e.jsx("div",{style:{position:"absolute",top:-16,left:"50%",transform:"translateX(-50%)",background:g.gradFire,padding:"6px 28px",borderRadius:50,fontSize:13,fontWeight:800,color:"#fff"},children:"🔥 가장 인기"}),e.jsx("h3",{style:{fontSize:22,fontWeight:800,marginBottom:16},children:i.name}),e.jsx("div",{style:{fontSize:16,color:g.textSecondary,textDecoration:"line-through",opacity:.6},children:i.original}),e.jsx("div",{style:{fontSize:44,fontWeight:900,background:g.gradGold,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.1},children:i.current}),e.jsx("div",{style:{fontSize:14,color:g.neonGreen,fontWeight:600,marginTop:4},children:i.period}),e.jsx("div",{style:{display:"inline-block",background:"rgba(255,107,0,0.15)",color:"#ff8c00",fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:6,marginTop:8},children:i.discount}),e.jsx("ul",{style:{listStyle:"none",textAlign:"left",margin:"20px 0 28px",paddingTop:20,borderTop:"1px solid rgba(255,255,255,0.06)"},children:i.features.map((p,c)=>e.jsxs("li",{style:{padding:"7px 0",fontSize:14,color:g.textSecondary,display:"flex",alignItems:"center",gap:10},children:[e.jsx("span",{style:{color:g.neonGreen,fontWeight:700},children:"✓"}),p]},c))}),e.jsx(v,{to:"/pricing",style:{display:"block",width:"100%",padding:16,borderRadius:14,background:i.popular?g.gradGold:"rgba(255,255,255,0.06)",color:i.popular?"#000":"#fff",fontWeight:700,fontSize:i.popular?17:16,textAlign:"center",textDecoration:"none",border:i.popular?"none":"1px solid rgba(255,255,255,0.12)"},children:i.popular?"가장 인기 있는 플랜 →":"시작하기 →"})]},s))}),e.jsx("div",{style:{marginTop:36,textAlign:"center"},children:e.jsx(v,{to:"/pricing",style:{display:"inline-flex",alignItems:"center",gap:12,background:"linear-gradient(135deg, rgba(45,27,105,0.6), rgba(26,26,46,0.8))",backdropFilter:"blur(12px)",border:`1px solid ${g.gold}`,borderRadius:16,padding:"18px 48px",fontSize:16,fontWeight:700,color:g.gold,textDecoration:"none"},children:"🏆 올인원 1년 ₩400,000 — 모든 도구 1년 이용 · 우선 지원"})}),e.jsx("div",{style:{display:"flex",justifyContent:"center",gap:32,flexWrap:"wrap",marginTop:40,paddingTop:32,borderTop:"1px solid rgba(255,255,255,0.04)"},children:[["🔒","안전한 결제"],["🔄","7일 전액 환불"],["💬","카카오 즉시 지원"],["🔑","즉시 활성화"]].map(([i,s],p)=>e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,color:g.textSecondary,fontSize:14},children:[e.jsx("span",{style:{fontSize:18},children:i}),s]},p))})]})}),e.jsx("section",{style:{padding:"80px 20px",background:g.bgSection,textAlign:"center",position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:700,margin:"0 auto",background:"rgba(0,255,136,0.10)",border:"1px solid rgba(0,255,136,0.3)",borderRadius:20,padding:40},children:[e.jsx("div",{style:{fontSize:56,marginBottom:16},children:"🛡️"}),e.jsx("h3",{style:{fontSize:28,fontWeight:900,marginBottom:12},children:"100% 만족 보장"}),e.jsxs("p",{style:{color:g.textSecondary,fontSize:16},children:["사용 후 만족하지 않으면 7일 이내 전액 환불.",e.jsx("br",{}),"질문이나 어려움이 있으면 카카오톡 1:1 문의로 즉시 도움을 드립니다."]})]})}),e.jsx("section",{style:{padding:"100px 20px",background:g.bgDark,position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:800,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:50},children:[e.jsx("div",{style:{color:g.neonBlue,fontWeight:700,fontSize:14,letterSpacing:3,textTransform:"uppercase",marginBottom:16},children:"❓ 자주 묻는 질문"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 48px)",fontWeight:900},children:"궁금한 점이 있으신가요?"})]}),Gt.map((i,s)=>e.jsxs("div",{style:{background:g.bgCard,border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,marginBottom:12,overflow:"hidden"},children:[e.jsxs("button",{onClick:()=>r(t===s?null:s),style:{width:"100%",padding:"20px 28px",background:"transparent",border:"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:g.textPrimary,fontWeight:700,fontSize:16,textAlign:"left"},children:[e.jsx("span",{children:i.q}),e.jsx("span",{style:{fontSize:22,color:g.gold,transform:t===s?"rotate(45deg)":"none",transition:"transform 0.3s"},children:"+"})]}),e.jsx("div",{style:{maxHeight:t===s?800:0,overflow:"hidden",padding:t===s?"0 28px 24px":"0 28px",transition:"all 0.4s ease",color:g.textSecondary},children:e.jsx("p",{style:{fontSize:15,lineHeight:1.8,whiteSpace:"pre-line"},children:i.a})})]},s))]})}),e.jsx("section",{style:{padding:"120px 20px",background:g.bgDark,textAlign:"center",position:"relative",zIndex:1},children:e.jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[e.jsxs("h2",{style:{fontSize:"clamp(28px, 5vw, 52px)",fontWeight:900,marginBottom:20,lineHeight:1.3},children:["지금 시작하면",e.jsx("br",{}),e.jsx("span",{style:{background:g.gradGold,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"내일부터 블로그가 자동으로 돌아갑니다"})]}),e.jsxs("p",{style:{fontSize:18,color:g.textSecondary,marginBottom:40,maxWidth:600,margin:"0 auto 40px"},children:["더 이상 글쓰기에 시간 낭비하지 마세요.",e.jsx("br",{}),"Better Life Naver가 당신의 블로그 수익을 바꿔드립니다."]}),e.jsx(v,{to:"/pricing",style:{...me,fontSize:20,padding:"20px 48px"},children:"지금 시작하기 →"}),e.jsx("p",{style:{marginTop:16,color:"#888",fontSize:14},children:"🔒 안전한 결제 · 7일 환불 보장 · 카카오톡 즉시 지원"})]})}),o&&e.jsxs("div",{role:"dialog","aria-modal":"true","aria-label":o.alt,onClick:()=>n(null),style:{position:"fixed",inset:0,zIndex:2147483e3,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"72px 22px 28px",cursor:"zoom-out"},children:[e.jsx("button",{type:"button","aria-label":"큰 이미지 닫기","data-lightbox-close":"true",onClick:i=>{i.stopPropagation(),n(null)},style:{position:"fixed",top:22,right:24,width:46,height:46,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.26)",background:"rgba(20,20,28,0.78)",color:"#fff",fontSize:30,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2147483001},children:"×"}),e.jsx("img",{src:o.src,alt:o.alt,onClick:i=>i.stopPropagation(),style:{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",borderRadius:14,boxShadow:"0 22px 90px rgba(0,0,0,0.58)",background:"#111",cursor:"default"}})]})]})}const Ae="https://141.164.59.17.sslip.io/leword";function We(){const[t,r]=a.useState(()=>Date.now()),[o,n]=a.useState(!1),[i,s]=a.useState(!1);a.useEffect(()=>{const m=document.title;return document.title="LEWORD Pro Web",()=>{document.title=m}},[]);const p=a.useMemo(()=>`${Ae}?embed=leaderspro&v=${t}`,[t]),c=()=>{n(!1),s(!1),r(Date.now())};return e.jsx("section",{"aria-label":"LEWORD Pro Web",style:{minHeight:"calc(100vh - 72px)",background:"#07090d",padding:"10px 14px 14px"},children:e.jsxs("div",{style:{position:"relative",minHeight:"calc(100vh - 102px)",border:"1px solid rgba(91,183,255,.28)",borderRadius:8,overflow:"hidden",background:"#07090d",boxShadow:"0 20px 54px rgba(0,0,0,.34)"},children:[(!o||i)&&e.jsxs("div",{style:{position:"absolute",top:12,left:12,right:12,zIndex:3,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,pointerEvents:"none"},children:[e.jsxs("div",{role:"status","aria-live":"polite",style:{display:"inline-flex",alignItems:"center",gap:8,border:"1px solid rgba(245,197,66,.28)",borderRadius:8,background:"rgba(7,9,13,.72)",color:"#f8fbff",padding:"8px 10px",boxShadow:"0 10px 28px rgba(0,0,0,.22)",backdropFilter:"blur(10px)",pointerEvents:"auto"},children:[e.jsx("strong",{style:{color:"#f5c542",fontSize:13,fontWeight:900},children:"LEWORD Pro Web"}),e.jsx("span",{style:{color:"#a4b1c4",fontSize:12},children:i?"연결 확인 필요":"실시간 서버 연결 중"})]}),e.jsx("button",{type:"button",onClick:c,style:{minHeight:36,border:"1px solid rgba(91,183,255,.42)",borderRadius:8,background:"rgba(7,9,13,.72)",color:"#dceaff",padding:"7px 11px",fontSize:12,fontWeight:900,boxShadow:"0 10px 28px rgba(0,0,0,.22)",backdropFilter:"blur(10px)",pointerEvents:"auto"},children:"새로고침"})]}),e.jsx("iframe",{title:"LEWORD Pro Web",src:p,onLoad:()=>{n(!0),s(!1)},onError:()=>{n(!1),s(!0)},style:{width:"100%",height:"calc(100vh - 102px)",minHeight:720,border:0,display:"block",background:"#07090d",opacity:1,transition:"opacity .18s ease"},allow:"clipboard-read; clipboard-write",referrerPolicy:"no-referrer-when-downgrade"},t),e.jsx("a",{href:Ae,target:"_blank",rel:"noopener noreferrer",style:{position:"absolute",right:14,bottom:14,zIndex:3,minHeight:38,display:"inline-flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(245,197,66,.42)",borderRadius:8,background:"rgba(7,9,13,.78)",color:"#f5c542",padding:"8px 12px",fontSize:13,fontWeight:900,boxShadow:"0 10px 28px rgba(0,0,0,.24)",backdropFilter:"blur(10px)"},children:"새 창"})]})})}const Qt=[{title:"두 플랫폼을 한 화면에서",desc:"Blogger API와 WordPress REST API 기반 발행 흐름을 같은 제품 안에서 관리합니다."},{title:"콘텐츠 모드 분리",desc:"SEO, 애드센스, 쇼핑, 내부링크, 페러프레이징 목적에 맞춰 글 구조를 나눕니다."},{title:"이미지 흐름까지 포함",desc:"썸네일, H2 이미지, URL 이미지 수집, CTA 배너를 발행 흐름 안에서 함께 봅니다."},{title:"연속 발행 대기열",desc:"여러 키워드를 한 번에 넣고 진행, 대기, 실패 상태를 순차적으로 확인합니다."}],Zt=[["01","Keyword","키워드 또는 URL을 입력하고 콘텐츠 방향을 잡습니다."],["02","Generate","본문, 제목, FAQ, CTA 구간을 생성합니다."],["03","Image","썸네일과 본문 이미지를 생성하거나 수집합니다."],["04","Publish","블로그스팟 또는 워드프레스로 순차 발행합니다."],["05","Link","종합글과 하위글을 내부링크로 연결합니다."],["06","Traffic","발행글 기반 외부유입 문안을 만듭니다."]],Jt=[["키워드 입력","/images/orbit/orbit-smart-keyword.png","본문 모드, 이미지 엔진, CTA 설정까지 함께 확인"],["연속 발행","/images/orbit/orbit-sequential-queue.png","여러 키워드를 순서대로 처리하고 상태를 추적"],["플랫폼 연동","/images/orbit/orbit-platform-settings.png","Blogger와 WordPress 연결 정보를 한 화면에서 확인"],["외부유입 생성","/images/orbit/orbit-external-traffic.png","공개 글을 기준으로 채널별 보조 문안 생성"],["내부링크","/images/orbit/orbit-spider-links.png","종합글과 하위글을 연결하는 거미줄 구조"],["이미지 도구","/images/orbit/leadernam-orbit-download.png","썸네일, 배너, 발행용 이미지 흐름 보조"]],er=[["문안 생성","/images/orbit/orbit-traffic-generate.png","원본 글 선택 후 유입 글 초안 생성"],["사이트 라이브러리","/images/orbit/orbit-traffic-sites.png","공식 링크와 후보 채널 관리"],["활용 흐름","/images/orbit/orbit-traffic-usage.png","플랫폼별 톤에 맞는 보조 문안 확인"],["CTA 패턴","/images/orbit/orbit-traffic-patterns.png","정보형, 비교형, 마감형 CTA 흐름 점검"]],tr=["블로그스팟이나 워드프레스를 보조 채널로 키우려는 분","네이버블로그 외부유입 동선을 함께 만들고 싶은 분","애드센스형 정보 글과 제휴 글을 반복 운영하는 분","종합글, 하위글, 보조 글을 역할별로 나누고 싶은 분","이미지, CTA, FAQ까지 포함된 발행 흐름이 필요한 분","연속 발행 대기열과 결과 확인을 한 번에 보고 싶은 분"],rr=[["Leaders Orbit은 어떤 제품인가요?","블로그스팟과 워드프레스 발행을 중심으로 본문 생성, 이미지, CTA, 내부링크, 외부유입 문안 흐름을 지원하는 자동화 제품입니다."],["네이버블로그 자동화와 다른 점은 무엇인가요?","네이버 자동화는 네이버 채널 운영에 초점을 두고, Orbit은 블로그스팟·워드프레스 기반 보조 콘텐츠와 외부유입 동선에 초점을 둡니다."],["상위노출이나 수익을 보장하나요?","아닙니다. 검색 결과와 수익은 키워드, 콘텐츠 품질, 도메인 상태, 운영 기간, 플랫폼 정책에 따라 달라집니다."],["어떤 정보를 먼저 보내면 좋나요?","사용 PC 환경, 운영 중인 플랫폼, 연결하려는 계정 수, 필요한 기능 범위를 먼저 알려주시면 확인이 빠릅니다."]];function E({title:t,src:r,alt:o,desc:n,wide:i=!1}){const s=["orbit-shot",i?"orbit-shot-wide":"",r.includes("leadernam-orbit-download")?"orbit-shot-contain":""].filter(Boolean).join(" ");return e.jsxs("figure",{className:s,children:[e.jsxs("div",{className:"orbit-shot-bar",children:[e.jsx("span",{className:"dot red"}),e.jsx("span",{className:"dot yellow"}),e.jsx("span",{className:"dot green"}),e.jsx("b",{children:t})]}),e.jsx(q,{className:"orbit-zoom-trigger",src:r,alt:o,title:t}),n?e.jsx("figcaption",{children:n}):null]})}function Re(){return a.useEffect(()=>{const t=document.title;return document.title="Leaders Orbit — 블로그스팟·워드프레스 자동화",()=>{document.title=t}},[]),e.jsxs("div",{className:"orbit-page",children:[e.jsxs("section",{className:"orbit-hero",id:"orbit-top",children:[e.jsxs("div",{className:"orbit-wrap hero-grid",children:[e.jsxs("div",{children:[e.jsx("p",{className:"orbit-kicker",children:"GLOBAL PUBLISHER"}),e.jsx("h1",{children:"Leaders Orbit"}),e.jsx("p",{className:"hero-subtitle",children:"블로그스팟·워드프레스를 한 화면에서 운영하는 글로벌 블로그 자동화"}),e.jsx("p",{className:"hero-copy",children:"키워드 입력, 본문 생성, 이미지 수집, 썸네일과 H2 이미지, CTA 배치, 발행, 내부링크, 외부유입 문안까지 실제 운영자가 반복해서 하던 흐름을 하나의 제품 안에 묶었습니다."}),e.jsxs("div",{className:"orbit-actions",children:[e.jsx("a",{className:"orbit-btn primary",href:"#orbit-workflow",children:"운영 흐름 보기"}),e.jsx("a",{className:"orbit-btn secondary",href:"#orbit-screens",children:"실제 화면 보기"})]})]}),e.jsx(E,{title:"Leaders Orbit - Global Publisher",src:"/images/orbit/leadernam-orbit-download.png",alt:"Leaders Orbit 글로벌 퍼블리셔 대표 이미지",wide:!0})]}),e.jsxs("div",{className:"orbit-wrap metric-row",children:[e.jsxs("article",{children:[e.jsx("b",{children:"2 Platforms"}),e.jsx("span",{children:"Blogger API + WordPress REST"})]}),e.jsxs("article",{children:[e.jsx("b",{children:"5 Modes"}),e.jsx("span",{children:"SEO, 애드센스, 쇼핑, 내부링크, 페러프레이징"})]}),e.jsxs("article",{children:[e.jsx("b",{children:"Images"}),e.jsx("span",{children:"썸네일, 본문 이미지, CTA 배너 흐름"})]}),e.jsxs("article",{children:[e.jsx("b",{children:"Traffic"}),e.jsx("span",{children:"발행글 기반 외부유입 문안 생성"})]})]})]}),e.jsx("section",{className:"orbit-section light",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"WHY IT MATTERS"}),e.jsx("h2",{children:"글을 많이 쓰는 것보다 중요한 건, 글이 서로 이어지는 구조입니다"}),e.jsx("p",{className:"section-lead",children:"블로그스팟과 워드프레스는 외부유입, 보조 콘텐츠, 애드센스형 글, 제휴 글을 운영하기 좋지만 설정과 발행 흐름이 흩어지면 매번 처음부터 다시 세팅하게 됩니다."}),e.jsx("div",{className:"feature-grid",children:Qt.map(t=>e.jsxs("article",{className:"orbit-card",children:[e.jsx("h3",{children:t.title}),e.jsx("p",{children:t.desc})]},t.title))})]})}),e.jsx("section",{className:"orbit-section dark",id:"orbit-workflow",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"ORBIT FLOW"}),e.jsx("h2",{children:"키워드에서 공개 발행글까지, 흐름이 끊기지 않게 설계했습니다"}),e.jsx("div",{className:"flow-grid",children:Zt.map(([t,r,o])=>e.jsxs("article",{className:"flow-card",children:[e.jsx("span",{children:t}),e.jsx("b",{children:r}),e.jsx("p",{children:o})]},t))})]})}),e.jsx("section",{className:"orbit-section light",children:e.jsxs("div",{className:"orbit-wrap two-col",children:[e.jsxs("div",{children:[e.jsx("p",{className:"orbit-kicker",children:"ONE SCREEN SETUP"}),e.jsx("h2",{children:"초기 설정값을 유지한 채 단일 발행과 연속 발행을 오갑니다"}),e.jsx("p",{children:"Leaders Orbit은 키워드 입력창만 있는 도구가 아닙니다. 플랫폼, 콘텐츠 모드, 이미지 정책, 썸네일 엔진, CTA, 말투, 제목 옵션을 발행 흐름 안에서 같이 다룹니다."}),e.jsxs("ul",{className:"check-list",children:[e.jsx("li",{children:"Blogger와 WordPress 발행 흐름을 같은 화면에서 선택"}),e.jsx("li",{children:"키워드 기반, URL 기반, 이미지 기반 글 생성 흐름 지원"}),e.jsx("li",{children:"본문 모드와 이미지 정책을 발행 전 한 번에 확인"}),e.jsx("li",{children:"대기열에 들어간 글을 1개씩 순차 처리해 실패 지점을 추적"})]})]}),e.jsx(E,{title:"Sequential Publishing",src:"/images/orbit/orbit-sequential-queue.png",alt:"Leaders Orbit 연속 발행 대기열 화면",desc:"여러 키워드를 넣어도 설정값과 진행 상태가 함께 유지되는 연속 발행 대기열"})]})}),e.jsx("section",{className:"orbit-section dark",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"PLATFORM CONNECTION"}),e.jsx("h2",{children:"블로그스팟과 워드프레스 연결 방식은 다르지만, 발행 경험은 하나로 맞췄습니다"}),e.jsx("p",{className:"section-lead",children:"Blogger는 Google 계정 인증과 Blog ID를 기준으로, WordPress는 REST API와 Application Password를 기준으로 연결합니다."}),e.jsxs("div",{className:"split-gallery",children:[e.jsx(E,{title:"Platform Settings",src:"/images/orbit/orbit-platform-settings.png",alt:"블로그스팟 워드프레스 플랫폼 연결 설정 화면",desc:"플랫폼 연결, 인증 상태, 발행 대상 정보를 한 화면에서 확인"}),e.jsx(E,{title:"Blogspot Output",src:"/images/orbit/orbit-blogspot.png",alt:"블로그스팟 공개 발행글 화면",desc:"발행 후 공개 URL에서 본문, CTA, FAQ 구간을 확인"})]})]})}),e.jsx("section",{className:"orbit-section light",id:"orbit-screens",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"REAL PRODUCT SCREENS"}),e.jsx("h2",{children:"제품 설명보다 중요한 실제 화면을 더 많이 보여줍니다"}),e.jsx("p",{className:"section-lead",children:"구매자는 “무엇을 할 수 있다”보다 “어디서 어떻게 보이는가”를 보고 판단합니다. 실제 앱 화면을 넓게 배치해 발행 전, 발행 중, 발행 후 흐름을 숨기지 않았습니다."}),e.jsx("div",{className:"screen-grid",children:Jt.map(([t,r,o])=>e.jsx(E,{title:t,src:r,alt:`${t} 화면`,desc:o},t))})]})}),e.jsx("section",{className:"orbit-section dark",children:e.jsxs("div",{className:"orbit-wrap two-col reverse",children:[e.jsx(E,{title:"Published Output",src:"/images/orbit/orbit-public-article-body.png",alt:"공개 발행글 본문과 이미지 구간",desc:"앱 안에서 끝나지 않고 공개 글에서 확인되는 실제 결과물"}),e.jsxs("div",{children:[e.jsx("p",{className:"orbit-kicker",children:"PUBLISHED OUTPUT"}),e.jsx("h2",{children:"발행 결과물은 본문, 이미지, 강조 문구, FAQ까지 확인할 수 있어야 합니다"}),e.jsx("p",{children:"앱 화면만 보여주는 것보다 공개 발행글의 완성 형태를 같이 보여주는 편이 신뢰를 줍니다. Leaders Orbit은 발행된 글에서 이미지, CTA, FAQ가 어떻게 보이는지까지 확인하는 흐름을 전제로 합니다."}),e.jsxs("div",{className:"mini-gallery",children:[e.jsx(E,{title:"FAQ Top",src:"/images/orbit/orbit-public-faq-top.png",alt:"공개 글 FAQ 시작 구간"}),e.jsx(E,{title:"FAQ Full",src:"/images/orbit/orbit-public-faq-full.png",alt:"공개 글 FAQ 전체 구간"})]})]})]})}),e.jsx("section",{className:"orbit-section light",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"SPIDER LINKING"}),e.jsx("h2",{children:"발행된 글을 그냥 쌓아두지 않고, 종합글과 하위글 구조로 다시 연결합니다"}),e.jsx("p",{className:"section-lead",children:"거미줄치기는 이미 발행한 글을 선택해 종합글로 묶고, 하위글에서 다시 핵심 글로 돌아오는 CTA를 넣는 구조입니다."}),e.jsx(E,{title:"Spider Linking",src:"/images/orbit/orbit-spider-links.png",alt:"내부링크 거미줄 구성 화면",desc:"앱 안에서 기존 글과 종합글 연결 흐름을 구성",wide:!0})]})}),e.jsx("section",{className:"orbit-section dark",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"EXTERNAL TRAFFIC"}),e.jsx("h2",{children:"외부유입 문안은 발행글을 기준으로 만들고, 채널별 톤에 맞게 분리합니다"}),e.jsx("p",{className:"section-lead",children:"무리한 자동 게시가 아니라, 사용자가 복사해 자연스럽게 활용할 수 있는 유입 문안을 만드는 데 초점을 둡니다."}),e.jsx(E,{title:"External Traffic",src:"/images/orbit/orbit-external-traffic.png",alt:"외부유입 글 생성 모드 전체 화면",wide:!0}),e.jsx("div",{className:"screen-grid compact",children:er.map(([t,r,o])=>e.jsx(E,{title:t,src:r,alt:`${t} 화면`,desc:o},t))})]})}),e.jsx("section",{className:"orbit-section light",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"LEADERS PRO ECOSYSTEM"}),e.jsx("h2",{children:"Leaders Orbit은 리더스 프로 올인원 흐름 안에서 더 강해집니다"}),e.jsx("p",{className:"section-lead",children:"LEWORD로 키워드를 찾고, 네이버 자동화로 핵심 채널을 운영하고, Leaders Orbit으로 블로그스팟·워드프레스 보조 동선을 만듭니다. 기간제 구매자는 올인원 코드 1개로 세 제품을 함께 이용합니다."}),e.jsxs("div",{className:"logo-wall",children:[e.jsxs("article",{children:[e.jsx("img",{src:"/images/orbit/leword-logo.svg",alt:"LEWORD 로고"}),e.jsx("b",{children:"LEWORD"}),e.jsx("p",{children:"검색량, 문서수, 경쟁비율을 보고 키워드 후보를 발굴합니다."})]}),e.jsxs("article",{children:[e.jsx("img",{src:"/images/orbit/leaders-pro-logo.png",alt:"리더스 프로 로고"}),e.jsx("b",{children:"네이버 자동화"}),e.jsx("p",{children:"계정별 대기열, 발행 간격, 콘텐츠 모드를 관리합니다."})]}),e.jsxs("article",{children:[e.jsx("img",{src:"/images/orbit/orbit-logo.png",alt:"Leaders Orbit 로고"}),e.jsx("b",{children:"Leaders Orbit"}),e.jsx("p",{children:"블로그스팟과 워드프레스로 외부유입 보조 글을 발행합니다."})]})]}),e.jsxs("div",{className:"split-gallery",children:[e.jsx(E,{title:"LEWORD Keywords",src:"/images/orbit/orbit-leword-keywords.png",alt:"LEWORD 최신 키워드 발굴 화면",desc:"키워드 출발점은 LEWORD에서 잡고"}),e.jsx(E,{title:"Naver Automation",src:"/images/orbit/orbit-naver-full-auto.png",alt:"네이버 자동화 풀오토 발행 화면",desc:"네이버 자동화와 Orbit 발행 흐름을 함께 운영"})]})]})}),e.jsx("section",{className:"orbit-section dark",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"USE CASE"}),e.jsx("h2",{children:"예시 키워드 하나가 종합글, 하위글, 외부유입 글로 확장됩니다"}),e.jsxs("div",{className:"scenario",children:[e.jsxs("div",{className:"scenario-keyword",children:[e.jsx("span",{children:"예시 중심 키워드"}),e.jsx("b",{children:"다이어트 식단"}),e.jsx("p",{children:"목표: 검색 의도가 다른 글을 역할별로 나누고 서로 연결하기"})]}),e.jsxs("ol",{children:[e.jsxs("li",{children:[e.jsx("b",{children:"종합글"}),e.jsx("span",{children:"다이어트 식단 시작 전 알아야 할 구성 원칙"})]}),e.jsxs("li",{children:[e.jsx("b",{children:"하위글"}),e.jsx("span",{children:"직장인 식단, 저녁 식단, 도시락 식단처럼 세부 글 분리"})]}),e.jsxs("li",{children:[e.jsx("b",{children:"내부링크"}),e.jsx("span",{children:"종합글에서 하위글로, 하위글에서 다시 종합글로 이동"})]}),e.jsxs("li",{children:[e.jsx("b",{children:"외부유입"}),e.jsx("span",{children:"블로그스팟·워드프레스 보조 글로 메인 콘텐츠 진입 보완"})]})]})]})]})}),e.jsx("section",{className:"orbit-section light",children:e.jsxs("div",{className:"orbit-wrap two-col",children:[e.jsxs("div",{children:[e.jsx("p",{className:"orbit-kicker",children:"GOOD FIT"}),e.jsx("h2",{children:"이런 운영자에게 특히 잘 맞습니다"}),e.jsx("div",{className:"persona-grid",children:tr.map(t=>e.jsx("article",{children:t},t))})]}),e.jsxs("div",{className:"not-fit",children:[e.jsx("p",{className:"orbit-kicker",children:"NOT FOR"}),e.jsx("h2",{children:"이런 목적에는 맞지 않습니다"}),e.jsxs("ul",{children:[e.jsx("li",{children:"플랫폼 정책을 벗어난 자동 게시를 원하는 경우"}),e.jsx("li",{children:"검색 순위, 방문자 수, 수익을 보장받고 싶은 경우"}),e.jsx("li",{children:"콘텐츠 품질 검토 없이 대량 생산만 원하는 경우"}),e.jsx("li",{children:"운영 주제와 계정 상태를 고려하지 않고 결과만 기대하는 경우"})]})]})]})}),e.jsx("section",{className:"orbit-section dark",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"FAQ"}),e.jsx("h2",{children:"자세히 보기 페이지에서 바로 풀어줘야 할 질문들"}),e.jsx("div",{className:"faq-grid",children:rr.map(([t,r])=>e.jsxs("article",{children:[e.jsx("b",{children:t}),e.jsx("p",{children:r})]},t))})]})}),e.jsx("section",{className:"orbit-final",children:e.jsxs("div",{className:"orbit-wrap",children:[e.jsx("p",{className:"orbit-kicker",children:"LEADERS ORBIT"}),e.jsx("h2",{children:"블로그스팟·워드프레스를 보조 채널이 아니라 운영 동선으로 쓰고 싶다면"}),e.jsx("p",{children:"운영 중인 블로그 플랫폼, 연결하려는 계정 수, 필요한 자동화 범위를 보내주세요. Leaders Pro 올인원 흐름 안에서 어떤 방식으로 쓰는 것이 맞는지 안내할 수 있습니다. 개별 구매가 필요하면 영구제만 별도 문의로 가능합니다."}),e.jsx(v,{className:"orbit-btn primary",to:"/pricing",children:"올인원 가격표 보기"}),e.jsx("p",{className:"safe-note",children:"Leaders Orbit은 플랫폼 정책을 준수하는 범위에서 콘텐츠 운영 흐름을 체계화하는 제품입니다. 검색 노출, 방문자 수, 수익, 애드센스 승인은 보장하지 않습니다."})]})}),e.jsx("style",{children:`
                .orbit-page {
                    --ink: #0f172a;
                    --muted: #526273;
                    --line: #d7e1eb;
                    --paper: #ffffff;
                    --bg: #f4f8fb;
                    --dark: #0a1322;
                    --dark2: #172338;
                    --teal: #0f9f8f;
                    --sky: #0ea5e9;
                    --green: #34d399;
                    --amber: #f5c451;
                    background: var(--bg);
                    color: var(--ink);
                }
                .orbit-page * {
                    box-sizing: border-box;
                    letter-spacing: 0;
                    word-break: keep-all;
                    overflow-wrap: anywhere;
                }
                .orbit-wrap {
                    width: min(1180px, calc(100% - 40px));
                    margin: 0 auto;
                }
                .orbit-hero {
                    padding: 104px 0 84px;
                    color: #ffffff;
                    background:
                        linear-gradient(130deg, rgba(15,159,143,.28) 0 16%, transparent 16% 48%, rgba(245,158,11,.16) 48% 64%, transparent 64%),
                        linear-gradient(145deg, #0a1322 0%, #133149 52%, #0f766e 100%);
                }
                .hero-grid, .two-col {
                    display: grid;
                    grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr);
                    gap: 42px;
                    align-items: center;
                }
                .two-col.reverse {
                    grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
                }
                .orbit-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 32px;
                    margin: 0 0 18px;
                    padding: 5px 12px;
                    border: 1px solid rgba(14,165,233,.36);
                    border-radius: 999px;
                    background: rgba(14,165,233,.12);
                    color: #bae6fd;
                    font-size: 13px;
                    font-weight: 900;
                }
                .light .orbit-kicker {
                    border-color: rgba(15,159,143,.36);
                    background: rgba(15,159,143,.1);
                    color: #0f766e;
                }
                .orbit-page h1, .orbit-page h2, .orbit-page h3 {
                    margin: 0;
                    line-height: 1.16;
                    font-weight: 900;
                }
                .orbit-page h1 {
                    font-size: 62px;
                }
                .orbit-page h2 {
                    max-width: 920px;
                    font-size: 42px;
                }
                .hero-subtitle {
                    margin: 18px 0 0;
                    color: #e0f2fe;
                    font-size: 26px;
                    line-height: 1.36;
                    font-weight: 900;
                }
                .hero-copy, .dark p, .dark li, .orbit-final p {
                    color: #dbe7f3;
                }
                .hero-copy {
                    max-width: 710px;
                    margin: 24px 0 0;
                    font-size: 18px;
                    line-height: 1.75;
                }
                .section-lead, .light p, .orbit-card p {
                    color: var(--muted);
                    font-size: 18px;
                    line-height: 1.7;
                }
                .orbit-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 28px;
                }
                .orbit-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 48px;
                    padding: 11px 18px;
                    border: 1px solid transparent;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                }
                .orbit-btn.primary {
                    color: #07111f;
                    background: linear-gradient(90deg, var(--green), var(--amber));
                }
                .orbit-btn.secondary {
                    color: #f8fafc;
                    border-color: rgba(255,255,255,.28);
                    background: rgba(255,255,255,.08);
                }
                .orbit-shot {
                    margin: 0;
                    overflow: hidden;
                    border: 1px solid rgba(148,163,184,.28);
                    border-radius: 8px;
                    background: #08111f;
                    box-shadow: 0 18px 46px rgba(15,23,42,.13);
                }
                .orbit-shot-bar {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 42px;
                    padding: 0 14px;
                    background: #111827;
                    color: #cbd5e1;
                    font-size: 13px;
                }
                .dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                .dot.red { background: #ef4444; }
                .dot.yellow { background: #f59e0b; }
                .dot.green { background: #10b981; }
                .orbit-shot img {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    object-position: top center;
                    aspect-ratio: 16 / 10;
                    transition: transform .24s ease, filter .24s ease;
                }
                .orbit-zoom-trigger {
                    overflow: hidden;
                }
                .orbit-zoom-trigger:hover img,
                .orbit-zoom-trigger:focus-visible img {
                    transform: scale(1.025);
                    filter: brightness(1.08);
                }
                .orbit-shot-wide img {
                    aspect-ratio: 16 / 7;
                }
                .orbit-shot-contain .orbit-zoom-trigger {
                    background: #020617;
                }
                .orbit-shot-contain img,
                .orbit-shot-wide.orbit-shot-contain img {
                    aspect-ratio: 4 / 3;
                    object-fit: contain;
                    object-position: center;
                }
                .orbit-shot figcaption {
                    padding: 14px 16px;
                    color: #e5edf7;
                    background: #111827;
                    font-size: 15px;
                    font-weight: 800;
                }
                .metric-row {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 14px;
                    margin-top: 46px;
                }
                .metric-row article {
                    min-height: 104px;
                    padding: 18px;
                    border: 1px solid rgba(255,255,255,.18);
                    border-radius: 8px;
                    background: rgba(255,255,255,.08);
                }
                .metric-row b {
                    display: block;
                    font-size: 20px;
                }
                .metric-row span {
                    display: block;
                    margin-top: 8px;
                    color: #cfe8f5;
                    font-size: 14px;
                }
                .orbit-section {
                    padding: 92px 0;
                }
                .orbit-section.light {
                    background: var(--bg);
                }
                .orbit-section.dark {
                    color: #ffffff;
                    background:
                        linear-gradient(130deg, rgba(14,165,233,.12) 0 18%, transparent 18% 62%, rgba(245,158,11,.1) 62% 74%, transparent 74%),
                        linear-gradient(150deg, var(--dark), var(--dark2));
                }
                .feature-grid, .screen-grid, .flow-grid, .split-gallery, .logo-wall, .persona-grid, .faq-grid, .mini-gallery {
                    display: grid;
                    gap: 18px;
                    margin-top: 36px;
                }
                .feature-grid {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
                .orbit-card, .flow-card, .logo-wall article, .persona-grid article, .faq-grid article, .not-fit {
                    border: 1px solid var(--line);
                    border-radius: 8px;
                    background: var(--paper);
                }
                .orbit-card {
                    min-height: 190px;
                    padding: 24px;
                }
                .orbit-card h3 {
                    font-size: 20px;
                    margin-bottom: 10px;
                }
                .flow-grid {
                    grid-template-columns: repeat(6, minmax(0, 1fr));
                }
                .flow-card {
                    min-height: 210px;
                    padding: 22px 18px;
                    background: rgba(255,255,255,.06);
                    border-color: rgba(148,163,184,.22);
                }
                .flow-card span {
                    display: inline-flex;
                    margin-bottom: 18px;
                    color: #67e8f9;
                    font-size: 14px;
                    font-weight: 900;
                }
                .flow-card b {
                    display: block;
                    color: #ffffff;
                    font-size: 22px;
                }
                .flow-card p {
                    margin: 12px 0 0;
                    color: #dbe7f3;
                    font-size: 15px;
                }
                .check-list, .not-fit ul {
                    display: grid;
                    gap: 12px;
                    margin: 24px 0 0;
                    padding: 0;
                    list-style: none;
                }
                .check-list li, .not-fit li {
                    position: relative;
                    padding-left: 24px;
                    color: var(--muted);
                    font-weight: 800;
                }
                .check-list li::before, .not-fit li::before {
                    content: "";
                    position: absolute;
                    top: 12px;
                    left: 0;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--teal);
                }
                .split-gallery {
                    grid-template-columns: 1.05fr .95fr;
                }
                .screen-grid {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .screen-grid.compact {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
                .mini-gallery {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .logo-wall {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .logo-wall article {
                    min-height: 300px;
                    padding: 28px 22px;
                    text-align: center;
                }
                .logo-wall img {
                    display: block;
                    width: 132px;
                    height: 132px;
                    margin: 0 auto 20px;
                    object-fit: contain;
                    border: 1px solid var(--line);
                    border-radius: 8px;
                    background: #f8fafc;
                }
                .logo-wall b {
                    display: block;
                    color: var(--ink);
                    font-size: 24px;
                    font-weight: 900;
                }
                .scenario {
                    display: grid;
                    grid-template-columns: .78fr 1.22fr;
                    gap: 22px;
                    margin-top: 38px;
                }
                .scenario-keyword, .scenario ol {
                    margin: 0;
                    border: 1px solid rgba(148,163,184,.24);
                    border-radius: 8px;
                    background: rgba(255,255,255,.06);
                }
                .scenario-keyword {
                    padding: 30px;
                }
                .scenario-keyword span {
                    color: #bae6fd;
                    font-size: 15px;
                    font-weight: 900;
                }
                .scenario-keyword b {
                    display: block;
                    margin-top: 12px;
                    color: #ffffff;
                    font-size: 42px;
                    line-height: 1.15;
                }
                .scenario ol {
                    display: grid;
                    padding: 0;
                    list-style: none;
                }
                .scenario li {
                    display: grid;
                    grid-template-columns: 140px 1fr;
                    gap: 16px;
                    padding: 22px 24px;
                    border-bottom: 1px solid rgba(148,163,184,.2);
                }
                .scenario li:last-child {
                    border-bottom: 0;
                }
                .scenario li b {
                    color: #ffffff;
                }
                .persona-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .persona-grid article {
                    min-height: 92px;
                    display: flex;
                    align-items: center;
                    padding: 20px;
                    color: var(--ink);
                    font-weight: 900;
                }
                .not-fit {
                    padding: 28px;
                    background: #ffffff;
                }
                .not-fit .orbit-kicker {
                    color: #0f766e;
                    border-color: rgba(15,159,143,.36);
                    background: rgba(15,159,143,.1);
                }
                .not-fit h2 {
                    font-size: 34px;
                }
                .not-fit li::before {
                    background: #f59e0b;
                }
                .faq-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .faq-grid article {
                    min-height: 170px;
                    padding: 24px;
                    background: rgba(255,255,255,.06);
                    border-color: rgba(148,163,184,.22);
                }
                .faq-grid b {
                    display: block;
                    color: #ffffff;
                    font-size: 20px;
                    line-height: 1.35;
                }
                .faq-grid p {
                    margin: 10px 0 0;
                    color: #dbe7f3;
                    font-size: 15px;
                }
                .orbit-final {
                    padding: 92px 0;
                    color: #ffffff;
                    background:
                        linear-gradient(135deg, rgba(245,158,11,.18), transparent 34%),
                        linear-gradient(135deg, #0a1322 0%, #0f766e 100%);
                }
                .orbit-final h2 {
                    max-width: 980px;
                    font-size: 42px;
                }
                .orbit-final p {
                    max-width: 900px;
                    font-size: 18px;
                    line-height: 1.72;
                }
                .safe-note {
                    margin-top: 28px;
                    color: #cfe8f5;
                    font-size: 14px !important;
                }
                @media (max-width: 1100px) {
                    .flow-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                    .feature-grid, .screen-grid, .screen-grid.compact {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 900px) {
                    .hero-grid, .two-col, .two-col.reverse, .split-gallery, .scenario {
                        grid-template-columns: 1fr;
                    }
                    .metric-row, .logo-wall {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 680px) {
                    .orbit-wrap {
                        width: min(100% - 28px, 1180px);
                    }
                    .orbit-hero, .orbit-section, .orbit-final {
                        padding: 58px 0;
                    }
                    .orbit-page h1 {
                        font-size: 38px;
                    }
                    .orbit-page h2, .orbit-final h2 {
                        font-size: 30px;
                    }
                    .hero-subtitle {
                        font-size: 21px;
                    }
                    .hero-copy, .section-lead, .light p, .orbit-final p {
                        font-size: 16px;
                    }
                    .metric-row, .feature-grid, .flow-grid, .screen-grid, .screen-grid.compact, .logo-wall, .persona-grid, .faq-grid, .mini-gallery {
                        grid-template-columns: 1fr;
                    }
                    .orbit-actions {
                        flex-direction: column;
                    }
                    .orbit-btn {
                        width: 100%;
                    }
                    .scenario li {
                        grid-template-columns: 1fr;
                        gap: 6px;
                    }
                    .orbit-shot img, .orbit-shot-wide img {
                        aspect-ratio: 4 / 3;
                    }
                }
            `})]})}const ir="live_ck_mBZ1gQ4YVX9M4BDM7a0Rrl2KPoqN",Ce="https://js.tosspayments.com/v2/standard",or={naver:[{id:"free-naver",name:"Better Life Naver 무료 체험",desc:"네이버 자동화 먼저 체험",amount:0,period:"무료",free:!0,badge:{text:"🎁 FREE",type:"trial"},features:["Better Life Naver 체험","AI 콘텐츠 생성","매일 2회 발행 제한","LEWORD·Orbit은 올인원 구매 후 이용"]},{id:"all-in-one-monthly",name:"올인원 1개월",desc:"세 제품을 한 번에 가볍게 시작",amount:5e4,amountCard:55e3,period:"/ 월 (공급가)",features:["네이버 자동화툴 이용","LEWORD 키워드 분석 이용","Leaders Orbit 이용","이메일 고객 지원"]},{id:"all-in-one-quarterly",name:"올인원 3개월",desc:"블로그 자동화 흐름을 안정적으로 운영",amount:12e4,period:"/ 3개월",monthly:"월 40,000원",features:["네이버 자동화툴 이용","LEWORD 전체 기능 이용","Leaders Orbit 이용","우선 고객 지원"]},{id:"all-in-one-yearly",name:"올인원 1년",desc:"가장 합리적인 전체 제품 기간권",amount:4e5,period:"/ 년",monthly:"월 33,333원",badge:{text:"👑 BEST VALUE",type:"best"},features:["모든 자동화툴 기간 내 이용","라이선스 기간 내 업데이트","전용 커뮤니티 안내","1:1 우선 지원"]}]},nr={naver:"ALL · Leaders Pro 올인원"},Ee=["naver"];let te=null;function ar(){return typeof window<"u"&&window.TossPayments?Promise.resolve():te||(te=new Promise((t,r)=>{const o=document.querySelector(`script[src="${Ce}"]`);if(o){o.addEventListener("load",()=>t(),{once:!0}),o.addEventListener("error",()=>r(new Error("Toss SDK load failed")),{once:!0}),o.getAttribute("data-loaded")==="1"&&t();return}const n=document.createElement("script");n.src=Ce,n.async=!0,n.onload=()=>{n.setAttribute("data-loaded","1"),t()},n.onerror=()=>r(new Error("Toss SDK load failed")),document.head.appendChild(n)}),te)}const sr=()=>{const t=Date.now(),r=Math.random().toString(36).substring(2,8).toUpperCase();return`LP-${t}-${r}`};function Ie(){const[t]=Je(),r=t.get("tab"),[o,n]=a.useState(Ee.includes(r)?r:"naver"),[i,s]=a.useState(null),[p,c]=a.useState(""),[m,u]=a.useState(!1),[l,d]=a.useState(!1),f=a.useRef(null),[S,T]=a.useState(!1),N=a.useRef(null);a.useEffect(()=>{const x=document.title;return document.title="올인원 기간제 이용권 — Leaders Pro",()=>{document.title=x}},[]),a.useEffect(()=>{(async()=>{try{await ar(),window.TossPayments&&(f.current=window.TossPayments(ir),T(!0))}catch(x){console.error("Toss SDK init failed:",x)}})()},[]);const I=x=>{n(x),s(null)},P=x=>{if(x.free){window.location.href="/download";return}s(x),window.setTimeout(()=>{N.current?.scrollIntoView({behavior:"smooth",block:"center"})},50)},B=async()=>{if(!i||!f.current)return;const x=p.trim();if(!x||!x.includes("@")){u(!0),window.setTimeout(()=>u(!1),600);return}d(!0);try{const k=i.amountCard||i.amount,j="LP_"+x.replace(/[^a-zA-Z0-9]/g,"_")+"_"+Date.now(),z=sr(),L=window.location.origin,R=`${L}/success.html?email=${encodeURIComponent(x)}&productId=${encodeURIComponent(i.id)}&amount=${k}&orderName=${encodeURIComponent(i.name)}&customerKey=${encodeURIComponent(j)}&orderId=${encodeURIComponent(z)}`,D=`${L}/fail.html`;await f.current.payment({customerKey:j}).requestBillingAuth({method:"CARD",successUrl:R,failUrl:D})}catch(k){const j=k?.code||"",z=k?.message||String(k);console.error("[Toss requestBillingAuth] code:",j,"message:",z,k),j!=="USER_CANCEL"&&!z.includes("취소")&&alert(`결제창 호출 실패

code: ${j||"(없음)"}
message: ${z}

토스 콘솔에 successUrl(${window.location.origin}/success.html) 등록 여부를 확인해주세요.`),d(!1)}},F=(()=>{if(!i)return"플랜을 선택해주세요";const x=i.amountCard||i.amount,k=i.amountCard?" (VAT 포함)":"";return`${i.name} 시작 — 7일 후 ${x.toLocaleString()}원${k}`})();return e.jsx("div",{style:{position:"relative",zIndex:1},children:e.jsxs("section",{style:{padding:"140px 20px 80px",maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:40},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:50,color:"#FFD700",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:"PRICING"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:"올인원 기간제 이용권"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:"구매하면 패널에서 올인원 라이선스 코드가 발급됩니다. Better Life Naver, Leaders Orbit, LEWORD를 이용 기간 안에서 함께 사용할 수 있습니다."})]}),e.jsx("div",{style:{display:"flex",justifyContent:"center",gap:12,marginBottom:36,flexWrap:"wrap"},children:Ee.map(x=>e.jsx("button",{onClick:()=>I(x),style:{display:"flex",alignItems:"center",gap:8,padding:"12px 22px",borderRadius:50,cursor:"pointer",background:o===x?"linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,215,0,0.06))":"rgba(255,255,255,0.04)",border:o===x?"1px solid #FFD700":"1px solid rgba(255,255,255,0.08)",color:o===x?"#FFD700":"rgba(255,255,255,0.7)",fontWeight:700,fontSize:14},children:nr[x]},x))}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:18},children:or[o].map(x=>{const k=i?.id===x.id,j=x.badge?.type==="best",z=x.free;return e.jsxs("div",{onClick:()=>P(x),style:{background:k?"linear-gradient(180deg, rgba(255,215,0,0.10), rgba(18,18,26,0.85))":j?"linear-gradient(180deg, rgba(255,215,0,0.04), rgba(18,18,26,0.7))":"rgba(18,18,26,0.6)",border:k?"2px solid #FFD700":j?"1px solid rgba(255,215,0,0.5)":"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"28px 22px",cursor:"pointer",transition:"all 0.25s",position:"relative",textAlign:"center"},children:[x.badge&&e.jsx("div",{style:{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:x.badge.type==="best"?"linear-gradient(135deg, #FFD700, #FFA500)":x.badge.type==="lifetime"?"linear-gradient(135deg, #A78BFA, #7C3AED)":"linear-gradient(135deg, #44d7b6, #2bb89c)",color:x.badge.type==="trial"?"#0a0a0f":"#000",padding:"4px 14px",borderRadius:50,fontSize:11,fontWeight:800,letterSpacing:.5,whiteSpace:"nowrap"},children:x.badge.text}),e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("h3",{style:{fontSize:18,fontWeight:800,marginBottom:4},children:x.name}),e.jsx("p",{style:{fontSize:12,color:"rgba(255,255,255,0.5)"},children:x.desc})]}),e.jsxs("div",{style:{marginBottom:10},children:[e.jsx("span",{style:{fontSize:28,fontWeight:900,background:"linear-gradient(135deg, #FFD700, #FFA500)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:x.free?"0":x.amount.toLocaleString()}),e.jsx("span",{style:{fontSize:14,color:"rgba(255,255,255,0.55)",marginLeft:4},children:(x.free,"원")})]}),e.jsxs("div",{style:{fontSize:12,color:"rgba(255,255,255,0.55)",marginBottom:4},children:[x.period,x.monthly&&e.jsxs("span",{style:{display:"block",color:"#FFD700",marginTop:4},children:["(",x.monthly,")"]})]}),x.amountCard&&e.jsxs("div",{style:{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:6,lineHeight:1.6},children:["카드 ",e.jsxs("strong",{style:{color:"rgba(255,255,255,0.75)"},children:[x.amountCard.toLocaleString(),"원"]})," ",e.jsx("span",{style:{opacity:.7},children:"(VAT 10%)"}),e.jsx("br",{}),"계좌이체 ",e.jsxs("strong",{style:{color:"rgba(255,255,255,0.75)"},children:[x.amount.toLocaleString(),"원"]})]}),e.jsx("ul",{style:{listStyle:"none",textAlign:"left",marginTop:18,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"},children:x.features.map((L,R)=>e.jsxs("li",{style:{padding:"5px 0",fontSize:12,color:"rgba(255,255,255,0.75)",display:"flex",gap:8},children:[e.jsx("span",{style:{color:j?"#FFD700":"#44d7b6",fontWeight:700},children:"✓"}),L]},R))}),e.jsx("div",{style:{marginTop:18,padding:"10px 16px",borderRadius:10,background:z?"linear-gradient(135deg, rgba(68,215,182,0.2), rgba(68,215,182,0.05))":k?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.05)",color:z?"#44d7b6":k?"#000":"rgba(255,255,255,0.85)",fontSize:13,fontWeight:700,border:z?"1px solid rgba(68,215,182,0.4)":"none"},children:z?"🚀 체험하기 (다운로드)":k?"✓ 선택됨":"선택하기"})]},x.id)})}),e.jsx("div",{style:{maxWidth:720,margin:"36px auto 18px",padding:"18px 22px",background:"rgba(255,255,255,0.95)",borderRadius:14,boxShadow:"0 6px 22px rgba(0,0,0,0.14)"},children:e.jsxs("div",{style:{display:"flex",justifyContent:"space-around",gap:12,flexWrap:"wrap",alignItems:"center"},children:[e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#c9a84c"},children:"⭐ 4.9 / 5"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"실사용 후기 기반"})]}),e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#14304d"},children:"2,847명"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"현재 활성 사용자"})]}),e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#44d7b6"},children:"🛡️ 7일 환불"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"미사용 시 전액 환불"})]})]})}),e.jsxs("div",{ref:N,style:{maxWidth:720,margin:"0 auto",padding:"28px 24px",background:"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,215,0,0.15)",borderRadius:18},children:[e.jsx("label",{style:{display:"block",marginBottom:8,color:"#FFD700",fontSize:14,fontWeight:700},children:"📧 라이선스를 받을 이메일"}),e.jsx("input",{type:"email",value:p,onChange:x=>c(x.target.value),placeholder:"example@email.com",style:{width:"100%",padding:"14px 16px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box",animation:m?"shakePay 0.4s":"none"}}),e.jsx("p",{style:{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:6,marginBottom:14},children:"결제 완료 후 이 이메일로 올인원 라이선스 코드가 발송됩니다."}),e.jsxs("button",{onClick:B,disabled:!i||l||!S,style:{width:"100%",padding:18,borderRadius:14,border:"none",background:i&&S&&!l?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.08)",color:i&&S&&!l?"#000":"rgba(255,255,255,0.4)",fontSize:16,fontWeight:800,cursor:i&&S&&!l?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[l&&e.jsx("span",{style:{width:16,height:16,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spinPay 0.8s linear infinite"}}),e.jsx("span",{children:l?"결제 중...":F})]}),e.jsxs("p",{style:{textAlign:"center",color:"#c9a84c",fontSize:13,marginTop:10,lineHeight:1.7},children:["구매 시 올인원 코드 1개가 발급되며, 이용 기간 안에서 네이버 자동화툴·LEWORD·Leaders Orbit을 함께 사용할 수 있습니다.",e.jsx("br",{}),"무료 다운로드 체험은 Better Life Naver 기준이며, LEWORD·Orbit은 올인원 구매 후 함께 이용합니다."]}),e.jsxs("p",{style:{textAlign:"center",color:"rgba(255,255,255,0.45)",fontSize:12,marginTop:8},children:["결제 진행 시 ",e.jsx(v,{to:"/terms",style:{color:"#FFD700"},children:"이용약관"})," 및 ",e.jsx(v,{to:"/privacy",style:{color:"#FFD700"},children:"개인정보처리방침"}),"에 동의하는 것으로 간주됩니다."]}),e.jsxs("details",{style:{marginTop:16,padding:"12px 16px",background:"rgba(20,48,77,0.15)",borderRadius:10,border:"1px solid rgba(255,255,255,0.06)"},children:[e.jsx("summary",{style:{cursor:"pointer",fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.8)"},children:"❓ 결제 전 자주 묻는 질문"}),e.jsxs("div",{style:{marginTop:12,fontSize:13,lineHeight:1.7,color:"rgba(255,255,255,0.65)"},children:[e.jsxs("p",{style:{marginBottom:10},children:[e.jsx("strong",{children:"Q. 결제 정보는 안전한가요?"}),e.jsx("br",{}),"토스페이먼츠(Toss Payments) 공식 PG를 통해 처리됩니다. 카드 정보가 저희 서버에 저장되지 않으며, 토스 보안 인증을 거칩니다."]}),e.jsxs("p",{style:{marginBottom:10},children:[e.jsx("strong",{children:"Q. 환불이 정말 가능한가요?"}),e.jsx("br",{}),"라이선스 발급 후 7일 이내·서비스 미사용 시 전액 환불됩니다. 카카오톡 1:1 상담으로 즉시 신청 가능합니다."]}),e.jsxs("p",{style:{margin:0},children:[e.jsx("strong",{children:"Q. 사용법이 어렵지 않나요?"}),e.jsx("br",{}),"설치 후 키워드만 입력하면 AI가 자동으로 글·이미지·발행까지 처리합니다. 처음 5분 안내 영상 제공 + 카카오톡 무료 지원 포함."]})]})]})]}),e.jsxs("div",{style:{maxWidth:920,margin:"28px auto 0",padding:"26px 24px",background:"linear-gradient(135deg, rgba(124,58,237,0.10), rgba(18,18,26,0.78))",border:"1px solid rgba(167,139,250,0.28)",borderRadius:18},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:20},children:[e.jsx("span",{style:{display:"inline-flex",padding:"5px 12px",borderRadius:8,border:"1px solid rgba(167,139,250,0.42)",color:"#A78BFA",fontSize:12,fontWeight:900,marginBottom:12},children:"LIFETIME ONLY"}),e.jsx("h3",{style:{fontSize:24,fontWeight:900,marginBottom:8},children:"개별 제품은 영구제만 별도 문의로 구매 가능합니다"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.62)",fontSize:14,lineHeight:1.7,margin:0},children:"기간제는 올인원 코드로 구매하고, 특정 제품만 영구제로 쓰고 싶을 때는 1:1 문의로 발급합니다."})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))",gap:12},children:[["네이버 자동화툴","영구제","₩1,000,000"],["LEADER Orbit","영구제","₩1,000,000"],["LEWORD","영구제","₩1,000,000"]].map(([x,k,j])=>e.jsxs("article",{style:{padding:18,borderRadius:12,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)"},children:[e.jsx("strong",{style:{display:"block",color:"#fff",fontSize:16,marginBottom:6},children:x}),e.jsx("span",{style:{display:"block",color:"#A78BFA",fontSize:13,fontWeight:800,marginBottom:8},children:k}),e.jsx("b",{style:{color:"#FFD700",fontSize:22},children:j})]},x))}),e.jsx("div",{style:{textAlign:"center",marginTop:18},children:e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:46,padding:"12px 22px",borderRadius:10,background:"linear-gradient(135deg, #FEE500, #F5D100)",color:"#3C1E1E",fontSize:14,fontWeight:900,textDecoration:"none"},children:"개별 영구제 문의하기"})})]}),e.jsxs("div",{style:{maxWidth:720,margin:"14px auto 0",padding:"12px 20px",background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,fontSize:13,color:"rgba(255,255,255,0.75)",textAlign:"center"},children:["💡 라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다."," ",e.jsx(v,{to:"/refund",style:{color:"#FFD700"},children:"환불정책 자세히 보기 →"})]}),e.jsxs("div",{style:{maxWidth:720,margin:"12px auto 0",padding:"12px 20px",background:"linear-gradient(135deg, rgba(68,215,182,0.08), rgba(68,215,182,0.02))",border:"1px solid rgba(68,215,182,0.3)",borderRadius:10,fontSize:13,color:"rgba(255,255,255,0.75)",textAlign:"center"},children:["🏦 카드 결제가 어려우신가요?"," ",e.jsx(v,{to:"/bank-order",style:{color:"#44d7b6"},children:"계좌이체로 결제하기 →"})]}),e.jsx("style",{children:`
                    @keyframes shakePay{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
                    @keyframes spinPay{to{transform:rotate(360deg)}}
                `})]})})}const lr="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec",dr="1645",cr={naver:{name:"Better Life Naver",version:"네이버 블로그 자동화 · v2.11.14",image:"/images/feature-auto-publish.png",accent:"#FFD700",borderColor:"rgba(255,215,0,0.25)",downloads:[{key:"windows",label:"Windows",detail:"2.11.14 · exe",url:"https://github.com/cd000242-sudo/naver/releases/download/v2.11.14/Better-Life-Naver-Setup-2.11.14.exe"},{key:"mac-arm",label:"Mac M1-M4",detail:"2.11.14 · arm64 dmg",url:"https://github.com/cd000242-sudo/naver/releases/download/v2.11.14/Better-Life-Naver-2.11.14-arm64.dmg"},{key:"mac-intel",label:"Mac Intel",detail:"2.11.14 · x64 dmg",url:"https://github.com/cd000242-sudo/naver/releases/download/v2.11.14/Better-Life-Naver-2.11.14-x64.dmg"}]},leword:{name:"LEWORD",version:"AI 키워드 인텔리전스 · v2.49.83",image:"/images/leword/hero-banner.png",accent:"#A78BFA",borderColor:"rgba(124,58,237,0.25)",downloads:[{key:"windows",label:"Windows",detail:"2.49.83 · exe",url:"https://github.com/cd000242-sudo/leword-app/releases/download/v2.49.83/LEWORD-2.49.83.exe"},{key:"mac-arm",label:"Mac M1-M4",detail:"2.49.83 · arm64 dmg",url:"https://github.com/cd000242-sudo/leword-app/releases/download/v2.49.83/LEWORD-2.49.83-arm64.dmg"},{key:"mac-intel",label:"Mac Intel",detail:"2.49.83 · x64 dmg",url:"https://github.com/cd000242-sudo/leword-app/releases/download/v2.49.83/LEWORD-2.49.83-x64.dmg"}]},orbit:{name:"LEADERNAM Orbit",version:"블로그스팟·워드프레스 자동화 · v3.8.112",image:"/images/orbit/leadernam-orbit-download.png",accent:"#44d7b6",borderColor:"rgba(68,215,182,0.28)",downloads:[{key:"windows",label:"Windows",detail:"3.8.112 · exe",url:"https://github.com/cd000242-sudo/blogger-gpt-cli/releases/download/v3.8.112/LEADERNAM-Orbit-3.8.112.exe"},{key:"mac-arm",label:"Mac M1-M4",detail:"3.8.112 · arm64 dmg",url:"https://github.com/cd000242-sudo/blogger-gpt-cli/releases/download/v3.8.112/LEADERNAM-Orbit-3.8.112-arm64.dmg"},{key:"mac-intel",label:"Mac Intel",detail:"3.8.112 · x64 dmg",url:"https://github.com/cd000242-sudo/blogger-gpt-cli/releases/download/v3.8.112/LEADERNAM-Orbit-3.8.112-x64.dmg"}]}};function pr(t){return typeof navigator<"u"&&/mac/i.test(`${navigator.platform} ${navigator.userAgent}`)?t.find(r=>r.key==="mac-arm")||t[0]:t.find(r=>r.key==="windows")||t[0]}function Be(){return a.useEffect(()=>{const t=document.title;return document.title="다운로드 — Leaders Pro",()=>{document.title=t}},[]),e.jsxs("div",{style:{position:"relative",zIndex:1},children:[e.jsx("style",{children:`
                @media (min-width: 1180px) and (max-width: 1520px) {
                    .download-product-grid {
                        max-width: 1040px;
                        margin-left: 0 !important;
                        margin-right: auto !important;
                    }
                }
                .download-card-zoom img {
                    transition: transform .24s ease, filter .24s ease;
                }
                .download-card-zoom:hover img,
                .download-card-zoom:focus-visible img {
                    transform: scale(1.025);
                    filter: brightness(1.08);
                }
            `}),e.jsxs("section",{style:{padding:"140px 20px 100px",maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:40},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:50,color:"#FFD700",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:"DOWNLOAD"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:"프로그램 다운로드"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:"비밀번호를 입력하면 최신 버전을 다운로드할 수 있습니다."}),e.jsx("p",{style:{color:"rgba(255,255,255,0.52)",fontSize:13,marginTop:8},children:"무료 체험은 Better Life Naver만 제공됩니다. LEWORD는 올인원 라이선스 보유자용입니다."})]}),e.jsx(gr,{}),e.jsxs("div",{className:"download-product-grid",style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:24,margin:"32px auto 0"},children:[e.jsx(se,{productKey:"naver"}),e.jsx(se,{productKey:"leword"}),e.jsx(se,{productKey:"orbit"})]})]})]})}function gr(){const[t,r]=a.useState(""),[o,n]=a.useState(null),[i,s]=a.useState(!1),[p,c]=a.useState("받아보기"),m=async()=>{const u=t.trim();if(!u||!u.includes("@")){n({text:"올바른 이메일을 입력해주세요.",color:"#ff3b5c"});return}s(!0),c("등록 중...");try{const d=await(await fetch(lr,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"lead-submit",email:u,source:"download",timestamp:new Date().toISOString()})})).json();d.success?(n({text:d.updated?"✅ 이메일 정보가 갱신되었습니다.":"✅ 등록되었습니다. 곧 소식 전해드릴게요.",color:"#44d7b6"}),r(""),c("✓ 완료"),window.setTimeout(()=>{s(!1),c("받아보기")},2500)):(n({text:d.message||"등록 실패",color:"#ff3b5c"}),s(!1),c("받아보기"))}catch(l){n({text:"오류: "+(l?.message||""),color:"#ff3b5c"}),s(!1),c("받아보기")}};return e.jsxs("div",{style:{maxWidth:720,margin:"0 auto",padding:"20px 24px",background:"rgba(255,255,255,0.95)",borderRadius:14,boxShadow:"0 6px 22px rgba(0,0,0,0.14)"},children:[e.jsxs("div",{style:{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"},children:[e.jsxs("div",{style:{flex:1,minWidth:220},children:[e.jsx("strong",{style:{display:"block",color:"#14304d",fontSize:15,marginBottom:4},children:"📧 신제품·업데이트·꿀팁 받아보기 (선택)"}),e.jsx("span",{style:{fontSize:12,color:"#5b6b7a"},children:"이메일을 남기시면 새 기능 출시·할인 등을 알려드립니다."})]}),e.jsx("input",{type:"email",value:t,onChange:u=>r(u.target.value),placeholder:"your@email.com",style:{flex:1.2,minWidth:180,padding:"10px 14px",border:"1px solid rgba(20,48,77,0.15)",borderRadius:8,fontSize:14,color:"#14304d"}}),e.jsx("button",{onClick:m,disabled:i,style:{padding:"10px 20px",background:"linear-gradient(135deg, #c9a84c, #d4a012)",color:"#1a1a2e",border:"none",borderRadius:8,fontWeight:700,cursor:i?"not-allowed":"pointer",fontSize:14},children:p})]}),o&&e.jsx("div",{style:{marginTop:10,fontSize:13,color:o.color},children:o.text})]})}function se({productKey:t}){const r=cr[t],[o,n]=a.useState(""),[i,s]=a.useState(!1),[p,c]=a.useState(!1),[m,u]=a.useState(!1),[l,d]=a.useState(()=>pr(r.downloads).key),f=r.downloads.find(T=>T.key===l)||r.downloads[0],S=async()=>{if(o.trim()!==dr){s(!0),c(!0),window.setTimeout(()=>{s(!1),c(!1)},2e3);return}s(!1),u(!0),window.open(f.url,"_blank","noopener"),n(""),window.setTimeout(()=>u(!1),700)};return e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",backdropFilter:"blur(20px)",border:`1px solid ${r.borderColor}`,borderRadius:20,padding:24,transition:"transform 0.3s"},children:[e.jsx("div",{style:{width:"100%",aspectRatio:"1 / 1",borderRadius:16,overflow:"hidden",marginBottom:18,border:t==="leword"?`1px solid ${r.borderColor}`:"none",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(q,{className:"download-card-zoom",src:r.image,alt:r.name,title:r.name,loading:"lazy",imgStyle:{width:"100%",height:"100%",display:"block",objectFit:"contain",objectPosition:"center"}})}),e.jsx("h3",{style:{fontSize:22,fontWeight:800,marginBottom:4},children:r.name}),e.jsx("p",{style:{color:"rgba(255,255,255,0.55)",fontSize:13,marginBottom:14},children:r.version}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(108px, 1fr))",gap:8,marginBottom:14},children:r.downloads.map(T=>{const N=T.key===f.key;return e.jsxs("button",{type:"button",onClick:()=>d(T.key),style:{minHeight:58,padding:"9px 10px",borderRadius:10,border:N?"1px solid "+r.accent:"1px solid rgba(255,255,255,0.12)",background:N?r.accent:"rgba(255,255,255,0.06)",color:N?"#050816":"rgba(255,255,255,0.78)",cursor:"pointer",fontWeight:800,textAlign:"left",boxShadow:N?"0 10px 24px rgba(0,0,0,0.22)":"none"},children:[e.jsx("span",{style:{display:"block",fontSize:13,lineHeight:1.2},children:T.label}),e.jsx("span",{style:{display:"block",marginTop:4,fontSize:10,lineHeight:1.2,opacity:.78},children:T.detail})]},T.key)})}),e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",gap:8},children:[e.jsx("input",{type:"password",value:o,onChange:T=>n(T.target.value),onKeyDown:T=>{T.key==="Enter"&&S()},placeholder:"비밀번호 입력",style:{flex:1,padding:"12px 14px",background:"rgba(0,0,0,0.3)",border:`1px solid ${i?"#ff3b5c":"rgba(255,255,255,0.08)"}`,borderRadius:10,color:"#fff",fontSize:14,outline:"none",animation:p?"shakeDl 0.4s":"none"}}),e.jsx("button",{onClick:S,disabled:m,style:{padding:"12px 18px",background:`linear-gradient(135deg, ${r.accent}, ${r.accent}cc)`,color:"#000",border:"none",borderRadius:10,cursor:m?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center"},title:f.label+" 다운로드",children:m?e.jsx("span",{style:{fontSize:16},children:"⏳"}):e.jsxs("svg",{width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),e.jsx("polyline",{points:"7 10 12 15 17 10"}),e.jsx("line",{x1:"12",y1:"15",x2:"12",y2:"3"})]})})]}),i&&e.jsx("p",{style:{marginTop:8,color:"#ff3b5c",fontSize:12,fontWeight:600},children:"비밀번호가 올바르지 않습니다."})]}),e.jsx("style",{children:"@keyframes shakeDl{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}"})]})}const xr=[{category:"초안 작성",title:"ALL OVER GOD GPTS",subtitle:"리더남 블로그 초안 프롬프트",desc:"블로그 초안 작성에 초점을 맞춘 아이디어 확장형 챗봇입니다. 주제를 넓히고 글의 방향을 잡을 때 사용하기 좋습니다.",bestFor:["블로그 글 초안","아이디어 확장","정보성 글 구성"],url:"https://chatgpt.com/g/g-6898187006ec8191b8e3617a94efe0ba-sangwi-1-all-over-god-gpts-leadernam",accent:"gold"},{category:"애드센스",title:"애드센스 키워드 도우미",subtitle:"카테고리별 키워드 발굴",desc:"애드센스 승인 글을 준비할 때 카테고리 기준으로 키워드 후보를 넓게 뽑아보는 챗봇입니다.",bestFor:["승인 글 카테고리 선정","키워드 후보 100개 이상 발굴","주제 방향 정리"],url:"https://chatgpt.com/g/g-682528d677908191a1c9b7e71c181709-edeusenseu-kiweodeu-doumi",accent:"green"},{category:"애드센스",title:"애드센스 승인 글쓰기 전문가",subtitle:"승인용 글 작성 보조",desc:"키워드를 넣고 승인용 글 초안을 만드는 챗봇입니다. 영어 초안이 먼저 나오면 안내에 따라 진행하면 됩니다.",bestFor:["애드센스 승인 글 초안","키워드 기반 글쓰기","구조화된 정보 글"],url:"https://chatgpt.com/g/g-68075a10c7c08191841f0d4255fd2a07-seungin-geulsseugi-jeonmunga",accent:"green"},{category:"애드센스",title:"사람처럼 경험글 변환기",subtitle:"AI 느낌 줄이는 경험형 문장 변환",desc:"작성한 글을 사람의 경험이 들어간 문장처럼 다듬는 챗봇입니다. 승인 여부를 보장하지는 않지만 글의 자연스러움을 높이는 데 도움됩니다.",bestFor:["AI 문장 자연화","경험형 문장 보강","승인 글 최종 다듬기"],url:"https://chatgpt.com/g/g-67fdb02274d88191ab9c4ed51b909b91-seungin-haegsim-saramceoreom-gyeongheomgeul-byeonhwangi",accent:"rose"},{category:"글로벌 블로그",title:"LEADERNAM TOP BLOG GPTS",subtitle:"워드프레스·티스토리·블로그스팟 글쓰기",desc:"워드프레스, 티스토리, 블로그스팟에 붙여 넣기 좋은 HTML 기반 글을 만들 때 사용하는 챗봇입니다.",bestFor:["워드프레스 글","티스토리 글","블로그스팟 HTML 글"],url:"https://chatgpt.com/g/g-67f61d189538819186d7d3606ba7a484-leadernam-top-blog-gpts",accent:"blue"},{category:"네이버",title:"네이버 SEO 노출 글쓰기",subtitle:"네이버 검색 노출형 글 작성",desc:"뉴스 기사나 상위노출 글의 구조를 참고해 네이버 SEO에 맞춘 제목과 글 방향을 잡는 챗봇입니다.",bestFor:["네이버 SEO 글","제목 후보 3개","정보성 글 재구성"],url:"https://chatgpt.com/g/g-68229c4ff3fc8191a8a6cdc75e965197-rideonam-neibeo-hompideu-nocul-geulsseugi-ggeutpanwang",accent:"purple"},{category:"네이버",title:"네이버 홈판 노출글 마스터",subtitle:"홈피드·홈판 노출형 글 작성",desc:"네이버 홈피드 흐름에 맞춰 글을 재구성하고 제목을 다듬는 챗봇입니다. 자동화 앱과 함께 쓰면 초안 품질을 더 빠르게 끌어올릴 수 있습니다.",bestFor:["홈피드용 글","클릭되는 제목","상위 글 재구성"],url:"https://chatgpt.com/g/g-690e9d56e48081918978d24af5fd3445-neibeo-hompan-noculgeul-maseuteo",accent:"purple"},{category:"외부유입",title:"외부유입 전용글 생성기",subtitle:"외부 채널용 보조 글 작성",desc:"작성한 글 링크를 넣으면 외부유입용 보조 글의 방향을 잡아줍니다. 하단에는 본인 링크를 자연스럽게 연결해 사용하세요.",bestFor:["외부유입 글","보조 채널 문안","링크 연결용 글"],url:"https://chatgpt.com/g/g-690c2f9764408191b9048cda1144c221-oebuyuib-jeonyonggeul-saengseonggi",accent:"blue"},{category:"지식인",title:"전문 지식인 답변봇",subtitle:"질문 맞춤형 답변 작성",desc:"질문 내용을 붙여 넣으면 답변 초안을 만들어줍니다. 홍보성 답변은 피하고, 질문자에게 실제로 도움이 되는 내용 중심으로 사용하세요.",bestFor:["질문 답변 초안","전문형 답변","블로그 링크 보조"],url:"https://chatgpt.com/g/g-67f45a6b3990819193c23bc4636d68ba-jeonmun-jisigin-dabbyeonbos",accent:"gold"}],hr=[["애드센스 승인 준비","키워드 도우미 → 승인 글쓰기 전문가 → 경험글 변환기"],["네이버 글 작성","상위 글 내용 참고 → SEO/홈판 챗봇 → 제목 선택 후 본문 작성"],["외부유입 운영","원본 글 작성 → 외부유입 전용글 생성기 → 채널별 문안 배포"]],mr={gold:"linear-gradient(135deg, #f4c95d, #d4a012)",blue:"linear-gradient(135deg, #38bdf8, #2563eb)",green:"linear-gradient(135deg, #44d7b6, #16a34a)",purple:"linear-gradient(135deg, #a78bfa, #7c3aed)",rose:"linear-gradient(135deg, #fb7185, #e11d48)"};function Oe(){return a.useEffect(()=>{const t=document.title;return document.title="무료 챗봇 — Leaders Pro",()=>{document.title=t}},[]),a.useEffect(()=>{const t=new IntersectionObserver(r=>{r.forEach(o=>{o.isIntersecting&&(o.target.classList.add("visible"),t.unobserve(o.target))})},{threshold:.12});return document.querySelectorAll(".fade-in").forEach(r=>t.observe(r)),()=>t.disconnect()},[]),e.jsxs(e.Fragment,{children:[e.jsx(ne,{}),e.jsxs("main",{className:"chatbots-page",children:[e.jsx("section",{className:"chatbots-hero",children:e.jsxs("div",{className:"chatbots-wrap chatbots-hero-grid",children:[e.jsxs("div",{children:[e.jsx("span",{className:"chatbots-kicker",children:"FREE CHATBOTS"}),e.jsx("h1",{children:"무료 챗봇 모음"}),e.jsx("p",{children:"블로그 초안, 애드센스 승인 글, 네이버 노출 글, 외부유입 글까지 바로 사용할 수 있는 리더남 GPTs를 한곳에 정리했습니다."}),e.jsxs("div",{className:"chatbots-actions",children:[e.jsx("a",{className:"chatbots-btn primary",href:"#chatbots-list",children:"챗봇 바로가기"}),e.jsx(v,{className:"chatbots-btn secondary",to:"/pricing",children:"자동화 툴 보기"})]})]}),e.jsxs("aside",{className:"chatbots-notice","aria-label":"사용 전 안내",children:[e.jsx("b",{children:"사용 전 꼭 확인하세요"}),e.jsxs("ul",{children:[e.jsx("li",{children:"아래 링크와 프롬프트 구성은 무단 복제 및 재배포를 금지합니다."}),e.jsx("li",{children:"구매자 전용 오픈채팅방과 사용법 영상은 공지사항에서 확인해주세요."}),e.jsx("li",{children:"초안이나 키워드를 넣을 때 마지막에 “100% 지침대로 해줘”라고 요청하면 결과가 더 안정적입니다."}),e.jsx("li",{children:"문제가 있으면 단톡방에서 리더남을 찾거나 1:1 문의를 이용해주세요."})]})]})]})}),e.jsx("section",{className:"chatbots-section light",children:e.jsxs("div",{className:"chatbots-wrap",children:[e.jsxs("div",{className:"chatbots-section-head fade-in",children:[e.jsx("span",{className:"chatbots-kicker",children:"RECOMMENDED FLOW"}),e.jsx("h2",{children:"이 순서대로 쓰면 더 편합니다"}),e.jsx("p",{children:"처음 쓰는 분들도 목적에 맞게 바로 시작할 수 있도록 추천 흐름을 정리했습니다."})]}),e.jsx("div",{className:"flow-grid",children:hr.map(([t,r])=>e.jsxs("article",{className:"flow-card fade-in",children:[e.jsx("strong",{children:t}),e.jsx("p",{children:r})]},t))})]})}),e.jsx("section",{id:"chatbots-list",className:"chatbots-section dark",children:e.jsxs("div",{className:"chatbots-wrap",children:[e.jsxs("div",{className:"chatbots-section-head fade-in",children:[e.jsx("span",{className:"chatbots-kicker",children:"GPTS LINKS"}),e.jsx("h2",{children:"원하는 챗봇을 바로 실행하세요"}),e.jsx("p",{children:"각 버튼을 누르면 ChatGPT의 해당 GPTs 페이지가 새 창으로 열립니다."})]}),e.jsx("div",{className:"chatbot-grid",children:xr.map(t=>e.jsxs("article",{className:"chatbot-card fade-in",children:[e.jsxs("div",{className:"chatbot-card-top",children:[e.jsx("span",{style:{background:mr[t.accent]},children:t.category}),e.jsx("small",{children:"무료 GPTs"})]}),e.jsx("h3",{children:t.title}),e.jsx("strong",{children:t.subtitle}),e.jsx("p",{children:t.desc}),e.jsx("div",{className:"chatbot-tags",children:t.bestFor.map(r=>e.jsx("em",{children:r},r))}),e.jsx("a",{className:"chatbots-btn launch",href:t.url,target:"_blank",rel:"noopener noreferrer",children:"챗봇 사용하기"})]},t.url))})]})}),e.jsx("section",{className:"chatbots-section light",children:e.jsxs("div",{className:"chatbots-wrap",children:[e.jsxs("div",{className:"chatbots-section-head fade-in",children:[e.jsx("span",{className:"chatbots-kicker",children:"SAFE USE"}),e.jsx("h2",{children:"답변은 그대로 쓰기보다 한 번 더 확인하세요"}),e.jsx("p",{children:"GPTs는 글쓰기 보조 도구입니다. 승인, 노출, 수익을 보장하지 않으며 최종 판단과 수정은 사용자에게 있습니다."})]}),e.jsxs("div",{className:"guide-panel fade-in",children:[e.jsxs("div",{children:[e.jsx("b",{children:"좋은 사용법"}),e.jsx("p",{children:"키워드, 대상 독자, 글 목적, 원하는 톤을 함께 넣고 마지막에 “100% 지침대로 해줘”를 붙여주세요."})]}),e.jsxs("div",{children:[e.jsx("b",{children:"주의할 점"}),e.jsx("p",{children:"외부 채널이나 지식인 답변에는 과도한 홍보를 피하고, 질문자에게 도움이 되는 내용 중심으로 사용해주세요."})]}),e.jsxs("div",{children:[e.jsx("b",{children:"문의 위치"}),e.jsx("p",{children:"문제가 생기면 구매자 단톡방 또는 1:1 문의가 가장 빠릅니다. 사이트 문의는 확인이 늦을 수 있습니다."})]})]})]})}),e.jsx("section",{className:"chatbots-final",children:e.jsxs("div",{className:"chatbots-wrap",children:[e.jsx("span",{className:"chatbots-kicker",children:"SPECIAL EVENT"}),e.jsx("h2",{children:"LEWORD 키워드 마스터와 네이버 자동화 툴도 함께 써보세요"}),e.jsx("p",{children:"챗봇으로 초안을 잡고, Leaders Pro 자동화 툴로 키워드 발굴과 발행 흐름을 더 빠르게 이어갈 수 있습니다."}),e.jsxs("div",{className:"chatbots-actions center",children:[e.jsx(v,{className:"chatbots-btn primary",to:"/products",children:"제품정보 보기"}),e.jsx(v,{className:"chatbots-btn secondary",to:"/download",children:"다운로드"})]})]})})]}),e.jsx("style",{children:`
                .chatbots-page {
                    position: relative;
                    z-index: 1;
                    color: #f8fafc;
                    background: rgba(5, 8, 12, 0.58);
                }

                .chatbots-wrap {
                    width: min(1180px, calc(100% - 48px));
                    margin: 0 auto;
                }

                .chatbots-hero {
                    min-height: 700px;
                    display: flex;
                    align-items: center;
                    padding: 118px 0 70px;
                    background: linear-gradient(135deg, rgba(8, 13, 18, 0.88), rgba(17, 54, 67, 0.80) 54%, rgba(55, 43, 17, 0.76));
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .chatbots-hero-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.82fr);
                    gap: 46px;
                    align-items: center;
                }

                .chatbots-kicker {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 12px;
                    border: 1px solid rgba(244, 201, 93, 0.45);
                    border-radius: 8px;
                    background: rgba(244, 201, 93, 0.10);
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                    letter-spacing: 0;
                }

                .chatbots-hero h1 {
                    margin: 18px 0;
                    font-size: 52px;
                    line-height: 1.1;
                    letter-spacing: 0;
                }

                .chatbots-hero p,
                .chatbots-section-head p,
                .chatbots-final p {
                    color: rgba(255,255,255,0.76);
                    font-size: 17px;
                    line-height: 1.75;
                }

                .chatbots-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    margin-top: 30px;
                }

                .chatbots-actions.center {
                    justify-content: center;
                }

                .chatbots-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 46px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 900;
                    text-decoration: none;
                    transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
                }

                .chatbots-btn:hover {
                    transform: translateY(-2px);
                }

                .chatbots-btn.primary,
                .chatbots-btn.launch {
                    border: 1px solid rgba(244, 201, 93, 0.7);
                    background: #f4c95d;
                    color: #071018;
                }

                .chatbots-btn.secondary {
                    border: 1px solid rgba(255,255,255,0.20);
                    background: rgba(255,255,255,0.08);
                    color: #ffffff;
                }

                .chatbots-notice {
                    padding: 24px;
                    border: 1px solid rgba(255,255,255,0.14);
                    border-radius: 8px;
                    background: rgba(8, 13, 18, 0.72);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.32);
                    backdrop-filter: blur(12px);
                }

                .chatbots-notice b {
                    display: block;
                    font-size: 20px;
                    margin-bottom: 16px;
                    color: #ffffff;
                }

                .chatbots-notice ul,
                .chatbot-card ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .chatbots-notice li {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.7;
                    margin-bottom: 10px;
                }

                .chatbots-notice li::before,
                .chatbot-card p::before {
                    content: "";
                    position: absolute;
                    left: 0;
                    top: 11px;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #44d7b6;
                }

                .chatbots-section {
                    padding: 86px 0;
                }

                .chatbots-section.light {
                    background: rgba(248, 250, 252, 0.96);
                    color: #0f172a;
                }

                .chatbots-section.dark {
                    background: rgba(7, 16, 24, 0.94);
                    color: #f8fafc;
                }

                .chatbots-section-head {
                    text-align: center;
                    max-width: 760px;
                    margin: 0 auto 42px;
                }

                .chatbots-section-head h2,
                .chatbots-final h2 {
                    margin: 14px 0 12px;
                    font-size: 38px;
                    line-height: 1.2;
                    letter-spacing: 0;
                }

                .chatbots-section.light .chatbots-section-head p,
                .chatbots-section.light .flow-card p,
                .chatbots-section.light .guide-panel p {
                    color: #526173;
                }

                .flow-grid,
                .guide-panel {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .flow-card,
                .guide-panel > div {
                    min-height: 180px;
                    padding: 24px;
                    border-radius: 8px;
                    border: 1px solid rgba(15, 23, 42, 0.10);
                    background: #ffffff;
                    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
                }

                .flow-card strong,
                .guide-panel b {
                    display: block;
                    font-size: 20px;
                    color: #0f172a;
                    margin-bottom: 10px;
                }

                .flow-card p,
                .guide-panel p {
                    font-size: 14px;
                    line-height: 1.75;
                }

                .chatbot-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 18px;
                }

                .chatbot-card {
                    display: flex;
                    flex-direction: column;
                    min-height: 430px;
                    padding: 22px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.06);
                }

                .chatbot-card-top {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .chatbot-card-top span {
                    display: inline-flex;
                    min-height: 26px;
                    align-items: center;
                    padding: 5px 10px;
                    border-radius: 8px;
                    color: #071018;
                    font-size: 12px;
                    font-weight: 900;
                }

                .chatbot-card-top small {
                    color: rgba(255,255,255,0.52);
                    font-size: 12px;
                }

                .chatbot-card h3 {
                    color: #ffffff;
                    font-size: 24px;
                    line-height: 1.25;
                    margin-bottom: 8px;
                    letter-spacing: 0;
                }

                .chatbot-card > strong {
                    display: block;
                    color: #f4c95d;
                    font-size: 15px;
                    margin-bottom: 12px;
                }

                .chatbot-card p {
                    position: relative;
                    padding-left: 18px;
                    color: rgba(255,255,255,0.72);
                    font-size: 14px;
                    line-height: 1.7;
                    margin-bottom: 18px;
                }

                .chatbot-tags {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin: auto 0 20px;
                }

                .chatbot-tags em {
                    display: inline-flex;
                    padding: 6px 9px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.72);
                    font-size: 12px;
                    font-style: normal;
                }

                .chatbots-btn.launch {
                    width: 100%;
                }

                .chatbots-final {
                    padding: 84px 0 96px;
                    text-align: center;
                    background: linear-gradient(135deg, rgba(6, 95, 70, 0.94), rgba(10, 16, 24, 0.96) 58%, rgba(87, 66, 18, 0.90));
                    border-top: 1px solid rgba(255,255,255,0.10);
                }

                .chatbots-final .chatbots-wrap {
                    max-width: 780px;
                }

                @media (max-width: 980px) {
                    .chatbots-hero-grid,
                    .flow-grid,
                    .guide-panel,
                    .chatbot-grid {
                        grid-template-columns: 1fr 1fr;
                    }

                    .chatbots-hero-grid {
                        align-items: stretch;
                    }
                }

                @media (max-width: 640px) {
                    .chatbots-wrap {
                        width: min(100% - 28px, 1180px);
                    }

                    .chatbots-hero {
                        min-height: auto;
                        padding: 96px 0 48px;
                    }

                    .chatbots-hero-grid,
                    .flow-grid,
                    .guide-panel,
                    .chatbot-grid {
                        grid-template-columns: 1fr;
                    }

                    .chatbots-hero h1 {
                        font-size: 36px;
                    }

                    .chatbots-section {
                        padding: 62px 0;
                    }

                    .chatbots-section-head h2,
                    .chatbots-final h2 {
                        font-size: 28px;
                    }

                    .chatbots-hero p,
                    .chatbots-section-head p,
                    .chatbots-final p {
                        font-size: 15px;
                    }

                    .chatbots-actions,
                    .chatbots-actions.center {
                        display: grid;
                        grid-template-columns: 1fr;
                    }

                    .chatbots-btn {
                        width: 100%;
                    }
                }
            `})]})}const Pe="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec",De=[["#667eea","#764ba2"],["#f093fb","#f5576c"],["#4facfe","#00f2fe"],["#fdcb6e","#e17055"],["#a8edea","#fed6e3"],["#ff9a9e","#fad0c4"],["#c2e9fb","#a1c4fd"],["#fbc2eb","#a6c1ee"]],_e=t=>{let r=0;for(let n=0;n<t.length;n++)r=r*31+t.charCodeAt(n)>>>0;const o=De[r%De.length];return`linear-gradient(135deg, ${o[0]}, ${o[1]})`},br=[{author:"K 대표",role:"마케팅 에이전시 · 10개월 사용",text:"블로그 10개를 혼자 운영하는데, 리더스 프로 없었으면 불가능했어요. 출근 전에 키워드만 세팅하면 퇴근할 때 50건이 올라가 있습니다.",badge:"📈 월 방문자 12만 달성",gradient:"linear-gradient(135deg, #667eea, #764ba2)"},{author:"P님",role:"제휴 마케터 · 6개월 사용",text:"쿠팡 파트너스 블로그를 4개 돌리고 있는데, 쇼핑 커넥트 기능으로 월 수익이 3배 뛰었어요. AI가 생성한 리뷰 글이 정말 자연스러워요.",badge:"💰 월 수익 3배 성장",gradient:"linear-gradient(135deg, #f093fb, #f5576c)"},{author:"L님",role:"글로벌 블로거 · 8개월 사용",text:"글로벌 블로그 5개를 Leaders Orbit으로 운영 중입니다. 애드센스 승인이 2주 만에 떨어졌고, 지금은 월 $400 이상 벌고 있어요.",badge:"🌍 월 $400+ 애드센스 수익",gradient:"linear-gradient(135deg, #4facfe, #00f2fe)"}],fr=[["Leaders Pro는 어떤 프로그램인가요?","Leaders Pro는 AI 기반 네이버 블로그 자동화 솔루션입니다. 키워드만 입력하면 GPT-4o, Gemini 2.5 등 7종의 AI가 6,000~10,000자의 자연스러운 포스팅을 작성하고, AI 이미지·영상을 생성하며, 네이버 블로그에 자동으로 발행합니다."],["봇 감지에 걸리지 않나요?","사람처럼 타이핑하는 고급 봇 회피 엔진을 탑재했습니다. 랜덤 딜레이, 최적 시간대 발행, 쿨다운 기간 등의 기술로 봇 감지를 우회합니다. 실제로 수천 명의 사용자가 안전하게 사용 중입니다."],["계정을 몇 개까지 등록할 수 있나요?","계정 수 제한이 없습니다. 네이버 블로그 ID를 원하는 만큼 등록하고, 각 계정별로 독립적인 스케줄을 설정하여 통합 관리할 수 있습니다."],["환불이 가능한가요?",e.jsxs(e.Fragment,{children:["라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다. 환불 요청은 cd000242@gmail.com으로 보내주세요. ",e.jsx(v,{to:"/refund",style:{color:"#FFD700"},children:"환불정책 자세히 보기 →"})]})],["Leaders Orbit과 Leaders Pro의 차이는?",e.jsxs(e.Fragment,{children:["Leaders Pro는 ",e.jsx("strong",{children:"네이버 블로그 전용"}),", Leaders Orbit은 ",e.jsx("strong",{children:"워드프레스 + 블로그스팟"})," 글로벌 플랫폼을 대상으로 합니다. Orbit은 100% API 기반이라 봇 감지 걱정 없이 구글 애드센스 수익화에 최적화되어 있습니다."]})],["기기 변경 시 어떻게 하나요?","라이선스는 동시에 1대의 기기에서만 사용 가능합니다. 기기를 변경하면 이전 기기에서 자동으로 로그아웃됩니다. 별도의 이전 절차 없이 새 기기에서 바로 로그인하시면 됩니다."]];function Me(){const[t,r]=a.useState(br),[o,n]=a.useState(null),[i,s]=a.useState(""),[p,c]=a.useState(""),[m,u]=a.useState(0),[l,d]=a.useState(0),[f,S]=a.useState(""),[T,N]=a.useState(""),[I,P]=a.useState(!1),[B,F]=a.useState(null);a.useEffect(()=>{const j=document.title;return document.title="후기 — Leaders Pro",()=>{document.title=j}},[]),a.useEffect(()=>{(async()=>{try{const z=await(await fetch(`${Pe}?action=get-reviews`)).json();if(!z.success)return;const L=z.reviews||[];if(L.length===0)return;r(L.map(R=>{const D=R.author||(R.email?R.email.replace(/(.{2}).*(@.*)/,"$1***$2"):"익명");let _="",b="";if(R.detail){const h=R.detail.split("|");_=(h[0]||"").trim(),b=(h.slice(1).join("|")||"").trim()}return{author:D,role:_,text:R.summary||"",badge:b,gradient:_e(D)}}))}catch{}})()},[]);const x=async()=>{if(m===0){F({text:"별점을 선택해주세요.",type:"error"});return}if(!i.trim()){F({text:"닉네임을 입력해주세요.",type:"error"});return}if(!f.trim()){F({text:"한줄 요약을 입력해주세요.",type:"error"});return}P(!0);try{const z=await(await fetch(Pe,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"submit-review",author:i.trim(),email:p.trim(),rating:m,summary:f.trim(),detail:T.trim(),timestamp:new Date().toISOString()})})).json();z.success?(F({text:"🎉 후기가 접수되었습니다. 검토 후 1~2일 내 공개됩니다.",type:"success"}),s(""),c(""),u(0),S(""),N("")):F({text:z.message||"등록 실패. 다시 시도해주세요.",type:"error"})}catch{F({text:"서버 연결 오류. 잠시 후 다시 시도해주세요.",type:"error"})}P(!1)},k={width:"100%",padding:"12px 14px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#fff",fontSize:14,outline:"none",marginBottom:12};return e.jsxs("div",{style:{position:"relative",zIndex:1},children:[e.jsxs("section",{style:{padding:"140px 20px 80px",maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:50},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:50,color:"#FFD700",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:"TESTIMONIALS"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:"실제 사용자들의 이야기"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:"Leaders Pro를 경험한 분들의 생생한 후기"})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:24,marginBottom:60},children:t.map((j,z)=>e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:28,position:"relative"},children:[e.jsx("div",{style:{fontSize:60,lineHeight:1,color:"#FFD700",opacity:.3,marginBottom:-10},children:'"'}),e.jsx("p",{style:{fontSize:15,color:"rgba(255,255,255,0.85)",lineHeight:1.8,marginBottom:20},children:j.text}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:14},children:[e.jsx("div",{style:{width:44,height:44,borderRadius:"50%",background:j.gradient||_e(j.author),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff"},children:(j.author.replace(/[^가-힣A-Za-z0-9]/g,"")[0]||"?").toUpperCase()}),e.jsxs("div",{children:[e.jsx("div",{style:{fontWeight:700,fontSize:14,color:"#fff"},children:j.author}),j.role&&e.jsx("div",{style:{fontSize:12,color:"rgba(255,255,255,0.55)"},children:j.role})]})]}),j.badge&&e.jsx("div",{style:{background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#FFD700",fontWeight:600,display:"inline-block"},children:j.badge})]},z))}),e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:20,padding:"clamp(24px, 4vw, 36px)"},children:[e.jsx("h3",{style:{fontSize:22,fontWeight:800,marginBottom:8},children:"✍️ 후기 작성하기"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.55)",fontSize:14,marginBottom:20},children:"자유롭게 후기를 남겨주세요. 누구나 작성 가능합니다."}),e.jsxs("div",{style:{display:"flex",gap:12,marginBottom:4,flexWrap:"wrap"},children:[e.jsx("input",{type:"text",placeholder:"닉네임 (예: 블로그생활러)",maxLength:20,value:i,onChange:j=>s(j.target.value),style:{...k,flex:1,minWidth:180}}),e.jsx("input",{type:"email",placeholder:"이메일 (선택 — 공개 안 됨)",value:p,onChange:j=>c(j.target.value),style:{...k,flex:1.3,minWidth:200}})]}),e.jsx("div",{style:{display:"flex",gap:4,marginBottom:16,fontSize:28},children:[1,2,3,4,5].map(j=>e.jsx("span",{onClick:()=>u(j),onMouseEnter:()=>d(j),onMouseLeave:()=>d(0),style:{cursor:"pointer",color:(l||m)>=j?"#FFD700":"rgba(255,255,255,0.2)",transition:"color 0.15s"},children:"★"},j))}),e.jsx("input",{type:"text",placeholder:"한줄 요약 (예: 블로그 운영이 정말 편해졌어요!)",maxLength:50,value:f,onChange:j=>S(j.target.value),style:k}),e.jsx("textarea",{rows:4,placeholder:"상세 후기를 작성해주세요...",maxLength:500,value:T,onChange:j=>N(j.target.value),style:{...k,resize:"vertical",fontFamily:"inherit"}}),e.jsx("button",{onClick:x,disabled:I,style:{width:"100%",padding:14,background:I?"rgba(255,255,255,0.08)":"linear-gradient(135deg, #FFD700, #FFA500)",color:I?"rgba(255,255,255,0.4)":"#000",border:"none",borderRadius:10,fontSize:15,fontWeight:800,cursor:I?"not-allowed":"pointer"},children:I?"등록 중...":"후기 등록하기"}),B&&e.jsx("div",{style:{marginTop:14,padding:12,borderRadius:10,fontSize:13,textAlign:"center",background:B.type==="success"?"rgba(68,215,182,0.08)":"rgba(255,92,117,0.08)",border:`1px solid ${B.type==="success"?"rgba(68,215,182,0.3)":"rgba(255,92,117,0.25)"}`,color:B.type==="success"?"#44d7b6":"#ff5c75"},children:B.text})]})]}),e.jsxs("section",{style:{padding:"60px 20px 100px",maxWidth:900,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:50},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(0,170,255,0.1)",border:"1px solid rgba(0,170,255,0.25)",borderRadius:50,color:"#00AAFF",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:"FAQ"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:"자주 묻는 질문"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:"궁금한 점을 빠르게 해결하세요"})]}),fr.map(([j,z],L)=>e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,marginBottom:12,overflow:"hidden"},children:[e.jsxs("button",{onClick:()=>n(o===L?null:L),style:{width:"100%",padding:"18px 24px",background:"transparent",border:"none",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:"#fff",fontWeight:700,fontSize:15,textAlign:"left"},children:[e.jsx("span",{children:j}),e.jsx("span",{style:{fontSize:20,color:"#FFD700",transform:o===L?"rotate(180deg)":"none",transition:"transform 0.3s"},children:"⌄"})]}),e.jsx("div",{style:{maxHeight:o===L?500:0,overflow:"hidden",padding:o===L?"0 24px 20px":"0 24px",transition:"all 0.3s ease",color:"rgba(255,255,255,0.75)"},children:e.jsx("p",{style:{fontSize:14,lineHeight:1.8},children:z})})]},L))]})]})}const J="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec",rt={width:"100%",padding:"13px 15px",background:"#111827",border:"1px solid rgba(255,255,255,0.22)",borderRadius:10,color:"#f8fafc",fontSize:14,outline:"none",boxSizing:"border-box",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.18)"},ur={maxWidth:720,margin:"0 auto 36px",background:"linear-gradient(180deg, rgba(34,28,12,0.96), rgba(15,18,28,0.97))",border:"1px solid rgba(255,215,0,0.42)",borderRadius:16,padding:28,boxShadow:"0 22px 60px rgba(0,0,0,0.36)"},jr={maxWidth:720,margin:"0 auto 36px",background:"linear-gradient(180deg, rgba(16,28,54,0.96), rgba(14,18,32,0.97))",border:"1px solid rgba(100,149,237,0.45)",borderRadius:16,padding:28,boxShadow:"0 22px 60px rgba(0,0,0,0.36)"},yr={important:"중요",update:"업데이트",event:"이벤트",tip:"안내"},vr=[{badge:"important",date:"2026.05.23",title:"Better Life Naver v2.10.337 — 안정성 11건 + 봇 우회 강화",preview:"발행 간격 jitter, 사람형 타이핑, 세션 워밍업 등 안정성 진단 픽스 11건을 통합했습니다.",body:"v2.10.337 릴리즈가 배포되었습니다. 발행 간격에 ±40% 랜덤 jitter, 사람형 가우시안 타이핑, 세션 워밍업, 연속발행 try/catch 보호, AI 클리셰 금지어 제거 등이 포함되었습니다."},{badge:"update",date:"2026.05.22",title:"이미지 생성 모델 강화 — gpt-image-1.5 + 나노바나나 3종 분리",preview:"새 이미지 모델과 품질 선택을 추가하고, 한글 텍스트 깨짐 회귀를 잡았습니다.",body:"gpt-image-1.5 모델 신규 지원 + 품질 선택, 나노바나나 3종 분리(Pro/2/기본), 썸네일만 모드 본문 중복 배치 버그 수정, Gemini 원문 모드 그라운딩 OFF."},{badge:"tip",date:"2026.03.10",title:"환불 정책 안내",preview:"라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불이 가능합니다.",body:"전액 환불: 발급 후 7일 이내 + 미사용. 부분 환불: 활성화 후 7일 이내. 환불 불가: 7일 초과 또는 정상 이용 후."}],wr=[{emoji:"📊",amount:"월 127만원",author:"블로그왕 K님",date:"2026.03",desc:"네이버 블로그 7개 운영, 쿠팡 파트너스 + 체험단 수익입니다. Better Life Naver로 하루 평균 35건 발행 중.",tags:["Better Life Naver","쿠팡파트너스","7개 블로그"]},{emoji:"💵",amount:"월 $420",author:"글로벌 블로거 L님",date:"2026.03",desc:"WordPress 3개 + Blogspot 2개 운영. 영어 콘텐츠로 구글 애드센스 수익화 성공. Leaders Orbit 8개월차.",tags:["Leaders Orbit","구글 애드센스","다국어"]},{emoji:"🏆",amount:"월 85만원",author:"부업러 P님",date:"2026.02",desc:"직장인 부업으로 네이버 블로그 4개 운영 중. 출근 전 키워드 세팅만 하면 퇴근 시 30건 완료.",tags:["Better Life Naver","직장인 부업","4개 블로그"]},{emoji:"🎯",amount:"월 200만원+",author:"에이전시 대표 M님",date:"2026.03",desc:"마케팅 에이전시 운영. 클라이언트 블로그 12개를 Leaders Pro로 통합 관리. 인건비 절약 + 품질 향상.",tags:["Better Life Naver","에이전시","12개 블로그"]}],kr=[{icon:"🎯",title:"키워드 선정이 수익의 80%",detail:"경쟁이 낮고 검색량이 있는 블루오션 키워드를 찾는 것이 핵심입니다. Leword를 활용하면 경쟁 강도·난이도를 한눈에 파악할 수 있습니다."},{icon:"⏰",title:"최적 발행 시간대",detail:"네이버 상위노출을 위한 최적 발행 시간: 오전 7-9시, 오후 12-1시, 저녁 8-10시. 스케줄링으로 자동 설정하세요."},{icon:"📈",title:"일 10건으로 시작하세요",detail:"처음부터 100건을 발행하면 봇 감지 위험이 있습니다. 일 10건부터 시작해서 2주 후 20건, 한 달 후 30건으로 천천히 늘려가세요."},{icon:"🛡️",title:"랜덤 딜레이 활용",detail:"발행 간 랜덤 딜레이(3~8분)를 설정하면 봇 감지 확률이 크게 감소합니다. 자동 설정 옵션을 활성화하세요."},{icon:"🌍",title:"글로벌 수익화 전략",detail:"Leaders Orbit으로 영어 블로그를 운영하면 구글 애드센스 단가가 한국어 대비 2~5배 높습니다. 다국어 콘텐츠 생성을 활용하세요."},{icon:"🎨",title:"AI 이미지 품질 높이기",detail:"Imagen 4 또는 DALL-E를 선택하면 가장 높은 품질의 AI 이미지가 생성됩니다. 글 내용에 맞는 키워드 이미지로 체류시간을 높이세요."}];function $e(){const[t,r]=a.useState("notices"),[o,n]=a.useState(vr),[i,s]=a.useState(wr),[p,c]=a.useState(kr),[m,u]=a.useState(null);a.useEffect(()=>{const d=document.title;return document.title="커뮤니티 — Leaders Pro",()=>{document.title=d}},[]);const l=async()=>{try{const f=await(await fetch(`${J}?action=get-tips`)).json();if(!f.success)return;const S=f.tips||[];if(S.length===0)return;c(S)}catch{}};return a.useEffect(()=>{(async()=>{try{const f=await(await fetch(`${J}?action=get-notices`)).json();f.success&&f.notices?.length&&n(f.notices)}catch{}})(),(async()=>{try{const f=await(await fetch(`${J}?action=income-list`)).json();f.success&&f.income?.length&&s(f.income)}catch{}})(),l()},[]),e.jsxs("div",{style:{position:"relative",zIndex:1},children:[e.jsx("style",{children:`
                .community-form-field::placeholder {
                    color: rgba(226,232,240,0.68);
                    opacity: 1;
                }
                .community-form-field:focus {
                    border-color: rgba(255,215,0,0.72) !important;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 3px rgba(255,215,0,0.16), 0 14px 28px rgba(0,0,0,0.22) !important;
                }
                .community-form-field.tip-focus:focus {
                    border-color: rgba(100,149,237,0.8) !important;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 3px rgba(100,149,237,0.18), 0 14px 28px rgba(0,0,0,0.22) !important;
                }
            `}),e.jsxs("section",{style:{padding:"140px 20px 100px",maxWidth:1200,margin:"0 auto"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:40},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:50,color:"#FFD700",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:"COMMUNITY"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:"Leaders Pro 커뮤니티"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:"공지사항, 수익 인증, 활용 팁을 확인하세요"})]}),e.jsx("div",{style:{display:"flex",justifyContent:"center",gap:8,marginBottom:40,flexWrap:"wrap"},children:[["notices","📢 공지사항"],["income","💰 수익 인증"],["tips","💡 활용 팁"]].map(([d,f])=>e.jsx("button",{onClick:()=>r(d),style:{padding:"12px 28px",borderRadius:50,background:t===d?"linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.08))":"rgba(255,255,255,0.03)",border:t===d?"1px solid #FFD700":"1px solid rgba(255,255,255,0.1)",color:t===d?"#FFD700":"rgba(255,255,255,0.65)",fontWeight:600,fontSize:14,cursor:"pointer",boxShadow:t===d?"0 0 20px rgba(255,215,0,0.15)":"none"},children:f},d))}),t==="notices"&&e.jsx(Sr,{notices:o,openIdx:m,onToggle:d=>u(m===d?null:d)}),t==="income"&&e.jsx(zr,{items:i}),t==="tips"&&e.jsx(Nr,{items:p,onSubmitted:l})]})]})}function Sr({notices:t,openIdx:r,onToggle:o}){const n=i=>{switch(i){case"important":return{bg:"rgba(255,92,117,0.15)",color:"#ff5c75",border:"rgba(255,92,117,0.3)"};case"update":return{bg:"rgba(0,170,255,0.15)",color:"#00AAFF",border:"rgba(0,170,255,0.3)"};case"event":return{bg:"rgba(68,215,182,0.15)",color:"#44d7b6",border:"rgba(68,215,182,0.3)"};default:return{bg:"rgba(255,215,0,0.12)",color:"#FFD700",border:"rgba(255,215,0,0.3)"}}};return e.jsx("div",{style:{maxWidth:900,margin:"0 auto"},children:t.map((i,s)=>{const p=r===s,c=n(i.badge);return e.jsxs("div",{onClick:()=>o(s),style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:24,marginBottom:14,cursor:"pointer",transition:"all 0.2s"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:10},children:[e.jsx("span",{style:{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,background:c.bg,color:c.color,border:`1px solid ${c.border}`},children:yr[i.badge]||i.badge}),e.jsx("span",{style:{color:"rgba(255,255,255,0.45)",fontSize:12},children:i.date})]}),e.jsx("h4",{style:{fontSize:17,fontWeight:700,marginBottom:8},children:i.title}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:14,lineHeight:1.6},children:i.preview}),e.jsx("div",{style:{maxHeight:p?600:0,overflow:"hidden",transition:"max-height 0.3s ease"},children:e.jsx("div",{style:{paddingTop:14,marginTop:14,borderTop:"1px solid rgba(255,255,255,0.06)",fontSize:14,color:"rgba(255,255,255,0.7)",lineHeight:1.8},dangerouslySetInnerHTML:{__html:i.body}})})]},s)})})}function zr({items:t}){const[r,o]=a.useState({emoji:"💰",amount:"",author:"",email:"",date:"",desc:"",tags:""}),[n,i]=a.useState(null),[s,p]=a.useState(!1),c=(l,d)=>o(f=>({...f,[l]:d})),m=async()=>{if(!r.author.trim()){i({text:"닉네임을 입력해주세요.",color:"#e95e2c"});return}if(!r.amount.trim()){i({text:"금액을 입력해주세요.",color:"#e95e2c"});return}if(!r.desc.trim()){i({text:"설명을 입력해주세요.",color:"#e95e2c"});return}p(!0);try{const d=await(await fetch(J,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"income-submit",...r,timestamp:new Date().toISOString()})})).json();d.success?(i({text:"🎉 수익 인증이 접수되었습니다. 검토 후 1~2일 내 공개됩니다.",color:"#44d7b6"}),o({emoji:"💰",amount:"",author:"",email:"",date:"",desc:"",tags:""})):i({text:d.message||"등록 실패",color:"#e95e2c"})}catch(l){i({text:"오류: "+(l?.message||""),color:"#e95e2c"})}p(!1)},u=rt;return e.jsxs("div",{children:[e.jsxs("div",{style:ur,children:[e.jsx("h3",{style:{fontSize:16,color:"#FFD700",marginBottom:6},children:"💰 내 수익 인증 올리기"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.78)",fontSize:13,marginBottom:18},children:"검토 후 1~2일 내 공개됩니다. 누구나 가능합니다."}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"70px 1fr 1fr",gap:12,marginBottom:12},children:[e.jsx("input",{className:"community-form-field",value:r.emoji,maxLength:4,onChange:l=>c("emoji",l.target.value),placeholder:"💰",style:{...u,textAlign:"center",fontSize:20}}),e.jsx("input",{className:"community-form-field",value:r.amount,maxLength:50,onChange:l=>c("amount",l.target.value),placeholder:"금액 (예: 월 127만원)",style:u}),e.jsx("input",{className:"community-form-field",value:r.author,maxLength:20,onChange:l=>c("author",l.target.value),placeholder:"닉네임",style:u})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12},children:[e.jsx("input",{className:"community-form-field",type:"email",value:r.email,onChange:l=>c("email",l.target.value),placeholder:"이메일 (선택 — 공개 안 됨)",style:u}),e.jsx("input",{className:"community-form-field",value:r.date,maxLength:20,onChange:l=>c("date",l.target.value),placeholder:"시점 (예: 2026.05)",style:u})]}),e.jsx("textarea",{className:"community-form-field",value:r.desc,maxLength:500,rows:3,onChange:l=>c("desc",l.target.value),placeholder:"어떤 제품으로 어떻게 수익화했는지 1-2줄",style:{...u,resize:"vertical",lineHeight:1.6,marginBottom:12}}),e.jsx("input",{className:"community-form-field",value:r.tags,maxLength:200,onChange:l=>c("tags",l.target.value),placeholder:"태그 (콤마 구분: Better Life Naver, 쿠팡파트너스, 7개 블로그)",style:u}),e.jsx("button",{onClick:m,disabled:s,style:{marginTop:14,width:"100%",padding:14,background:s?"rgba(255,255,255,0.08)":"linear-gradient(135deg, #c9a84c, #d4a012)",color:s?"rgba(255,255,255,0.4)":"#1a1a2e",border:"none",borderRadius:10,fontWeight:700,cursor:s?"not-allowed":"pointer",fontSize:14},children:s?"등록 중...":"수익 인증 등록하기"}),n&&e.jsx("div",{style:{marginTop:12,fontSize:13,textAlign:"center",color:n.color},children:n.text})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:20},children:t.map((l,d)=>e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,overflow:"hidden"},children:[e.jsxs("div",{style:{background:"linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.08))",height:120,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"},children:[e.jsx("div",{style:{fontSize:48},children:l.emoji}),e.jsx("span",{style:{position:"absolute",top:12,right:12,background:"rgba(255,215,0,0.9)",color:"#000",fontSize:12,fontWeight:800,padding:"4px 10px",borderRadius:50},children:l.amount})]}),e.jsxs("div",{style:{padding:18},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:12},children:[e.jsx("span",{style:{color:"#fff",fontWeight:600},children:l.author}),e.jsx("span",{style:{color:"rgba(255,255,255,0.45)"},children:l.date})]}),e.jsx("p",{style:{fontSize:13,color:"rgba(255,255,255,0.7)",lineHeight:1.7,marginBottom:12},children:l.desc}),e.jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:6},children:(l.tags||[]).map((f,S)=>e.jsx("span",{style:{background:"rgba(255,215,0,0.08)",color:"#FFD700",fontSize:11,padding:"3px 10px",borderRadius:50,border:"1px solid rgba(255,215,0,0.2)"},children:f},S))})]})]},d))}),e.jsxs("p",{style:{textAlign:"center",color:"rgba(255,255,255,0.55)",fontSize:13,marginTop:32},children:["💬 수익 인증을 공유하고 싶으시다면"," ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#FFD700"},children:"카카오톡 1:1 문의"}),"로 보내주세요!"]})]})}function Nr({items:t,onSubmitted:r}){const[o,n]=a.useState({author:"",email:"",title:"",detail:""}),[i,s]=a.useState(null),[p,c]=a.useState(!1),m=(d,f)=>n(S=>({...S,[d]:f})),u=async()=>{if(!o.author.trim()){s({text:"닉네임을 입력해주세요.",color:"#e95e2c"});return}if(!o.title.trim()){s({text:"제목을 입력해주세요.",color:"#e95e2c"});return}if(!o.detail.trim()){s({text:"본문을 입력해주세요.",color:"#e95e2c"});return}c(!0);try{const f=await(await fetch(J,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"submit-tip",...o,timestamp:new Date().toISOString()})})).json();f.success?(s({text:"🎉 팁이 접수되었습니다. 검토 후 1~2일 내 공개됩니다.",color:"#44d7b6"}),n({author:"",email:"",title:"",detail:""}),r()):s({text:f.message||"등록 실패",color:"#e95e2c"})}catch(d){s({text:"오류: "+(d?.message||""),color:"#e95e2c"})}c(!1)},l=rt;return e.jsxs("div",{children:[e.jsxs("div",{style:jr,children:[e.jsx("h3",{style:{fontSize:16,color:"#6495ed",marginBottom:6},children:"💡 내 활용 팁 공유하기"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.78)",fontSize:13,marginBottom:18},children:"자유롭게 작성하세요. 누구나 가능합니다."}),e.jsxs("div",{style:{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap"},children:[e.jsx("input",{className:"community-form-field tip-focus",value:o.author,maxLength:20,onChange:d=>m("author",d.target.value),placeholder:"닉네임",style:{...l,flex:1,minWidth:180}}),e.jsx("input",{className:"community-form-field tip-focus",type:"email",value:o.email,onChange:d=>m("email",d.target.value),placeholder:"이메일 (선택 — 공개 안 됨)",style:{...l,flex:1.3,minWidth:200}})]}),e.jsx("input",{className:"community-form-field tip-focus",value:o.title,maxLength:100,onChange:d=>m("title",d.target.value),placeholder:"제목 (예: 키워드 분석 꿀팁)",style:{...l,marginBottom:12}}),e.jsx("textarea",{className:"community-form-field tip-focus",value:o.detail,maxLength:1500,rows:5,onChange:d=>m("detail",d.target.value),placeholder:"활용 팁을 자세히 작성해주세요...",style:{...l,resize:"vertical",lineHeight:1.6}}),e.jsx("button",{onClick:u,disabled:p,style:{marginTop:14,width:"100%",padding:14,background:p?"rgba(255,255,255,0.08)":"linear-gradient(135deg, #6495ed, #4169e1)",color:"#fff",border:"none",borderRadius:10,fontWeight:700,cursor:p?"not-allowed":"pointer",fontSize:14},children:p?"등록 중...":"팁 등록하기"}),i&&e.jsx("div",{style:{marginTop:12,fontSize:13,textAlign:"center",color:i.color},children:i.text})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:18},children:t.map((d,f)=>e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:22},children:[d.author?e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},children:[e.jsxs("span",{style:{color:"#6495ed",fontSize:12,fontWeight:600},children:["👤 ",d.author]}),d.timestamp&&e.jsx("span",{style:{color:"rgba(255,255,255,0.45)",fontSize:11},children:new Date(d.timestamp).toLocaleDateString("ko-KR")})]}):e.jsx("div",{style:{fontSize:28,marginBottom:10},children:d.icon}),e.jsx("h4",{style:{fontSize:15,fontWeight:700,marginBottom:8},children:d.title}),e.jsx("p",{style:{fontSize:13,color:"rgba(255,255,255,0.7)",lineHeight:1.7,whiteSpace:"pre-wrap"},children:d.detail})]},f))}),e.jsxs("p",{style:{textAlign:"center",color:"rgba(255,255,255,0.4)",fontSize:12,marginTop:32},children:["더 많은 정보는"," ",e.jsx(v,{to:"/reviews",style:{color:"#FFD700"},children:"후기"})," ","또는"," ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#FFD700"},children:"카카오톡 채널"}),"에서 확인하세요."]})]})}const Tr="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec",Lr=15e3;function re(t,r){return new Promise((o,n)=>{const i="__lookupCb_"+Date.now()+"_"+Math.floor(Math.random()*1e3),s=window.setTimeout(()=>{delete window[i],n(new Error("TIMEOUT"))},Lr);window[i]=m=>{window.clearTimeout(s),delete window[i],o(m)};const p=Object.entries(r).map(([m,u])=>`${m}=${encodeURIComponent(u)}`).join("&"),c=document.createElement("script");c.src=`${Tr}?action=${t}&${p}&callback=${i}`,c.onerror=()=>{window.clearTimeout(s),delete window[i],n(new Error("NETWORK"))},document.head.appendChild(c)})}async function He(t){try{await navigator.clipboard.writeText(t);const r=document.createElement("div");r.textContent="✅ 복사됨!",r.style.cssText="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FFD700,#FFA500);color:#0a0a0f;padding:8px 20px;border-radius:100px;font-size:13px;font-weight:600;z-index:9999;",document.body.appendChild(r),window.setTimeout(()=>r.remove(),1500)}catch{const r=document.createElement("textarea");r.value=t,document.body.appendChild(r),r.select(),document.execCommand("copy"),document.body.removeChild(r)}}function Ge(){const[t,r]=a.useState("email"),[o,n]=a.useState(""),[i,s]=a.useState(""),[p,c]=a.useState(!1),[m,u]=a.useState(null),[l,d]=a.useState(null),[f,S]=a.useState(null),[T,N]=a.useState(null),[I,P]=a.useState(null),B=a.useRef(null);a.useEffect(()=>{const b=document.title;return document.title="주문 조회 — Leaders Pro",()=>{document.title=b}},[]);const F=()=>{N(null),u(null),d(null),P(null)},x=b=>{F(),r(b)},k=async()=>{const b=o.trim();if(!b||!b.includes("@")){N({title:"입력 오류",message:"올바른 이메일 주소를 입력해주세요."});return}F(),c(!0);try{const[h,w]=await Promise.all([re("lookup-by-email",{email:b}),re("lookup-subscriptions-by-email",{email:b})]);c(!1);const A=h?.ok&&(h.orders||[]).length>0,W=w?.ok&&(w.subscriptions||[]).length>0;A&&u(h.orders||[]),W&&d(w.subscriptions||[]),!A&&!W&&N({title:"조회 실패",message:h?.error||"해당 이메일로 등록된 주문/구독이 없습니다."})}catch{c(!1),N({title:"연결 실패",message:"서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요."})}},j=async b=>{if(!(b.status!=="active"||!window.confirm(`구독을 해지하시겠습니까?

상품: ${b.productName}
다음 결제 예정일: ${(b.nextPaymentDate||"").split("T")[0]}

해지해도 위 결제 예정일까지는 서비스를 계속 이용하실 수 있습니다. 그 이후 자동결제는 발생하지 않습니다.`))){S(b.licenseCode);try{const w=await re("cancel-subscription",{email:o.trim(),licenseCode:b.licenseCode});S(null),w?.ok?(P(`✅ ${w.message||"구독이 해지되었습니다."}`),d(A=>A&&A.map(W=>W.licenseCode===b.licenseCode?{...W,status:"cancelled"}:W))):N({title:"해지 실패",message:w?.error||"해지 중 오류가 발생했습니다."})}catch{S(null),N({title:"연결 실패",message:"서버에 연결할 수 없습니다."})}}},z=async()=>{const b=i.trim();if(!b){N({title:"입력 오류",message:"주문번호를 입력해주세요."});return}F(),c(!0);try{const h=await re("check-order",{orderId:b});c(!1),h.ok&&h.code?u([{product:h.product,code:h.code,orderId:b,date:h.date||"—"}]):N({title:"조회 실패",message:h.error||"해당 주문번호를 찾을 수 없습니다."})}catch{c(!1),N({title:"연결 실패",message:"서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요."})}},L={flex:1,padding:10,background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:8,color:"#FFD700",fontWeight:600,fontSize:13,cursor:"pointer",transition:"all 0.2s"},R={flex:1,padding:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"rgba(255,255,255,0.6)",fontWeight:500,fontSize:13,cursor:"pointer",transition:"all 0.2s"},D={width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:10,color:"#fff",fontSize:14,marginBottom:12,outline:"none"},_={width:"100%",padding:14,background:"linear-gradient(135deg, #FFD700, #FFA500)",color:"#000",border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer"};return e.jsxs("div",{style:{maxWidth:520,margin:"0 auto",padding:"140px 20px 80px",position:"relative",zIndex:1},children:[e.jsxs("div",{style:{background:"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:32},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:24},children:[e.jsx("div",{style:{fontSize:40,marginBottom:8},children:"🔍"}),e.jsx("h2",{style:{fontSize:24,fontWeight:800,marginBottom:6},children:"주문 조회"}),e.jsxs("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:14,lineHeight:1.6},children:["구매 시 입력한 이메일 또는 주문번호로",e.jsx("br",{}),"라이선스 코드를 확인하세요."]})]}),e.jsxs("div",{style:{display:"flex",gap:8,marginBottom:20},children:[e.jsx("button",{onClick:()=>x("email"),style:t==="email"?L:R,children:"📧 이메일로 조회"}),e.jsx("button",{onClick:()=>x("order"),style:t==="order"?L:R,children:"📋 주문번호로 조회"})]}),t==="email"&&e.jsxs("div",{children:[e.jsx("input",{ref:B,type:"email",value:o,onChange:b=>n(b.target.value),onKeyDown:b=>{b.key==="Enter"&&k()},placeholder:"구매 시 입력한 이메일 주소",style:D}),e.jsx("button",{onClick:k,disabled:p,style:_,children:p?"조회 중...":"조회하기"})]}),t==="order"&&e.jsxs("div",{children:[e.jsx("input",{type:"text",value:i,onChange:b=>s(b.target.value),onKeyDown:b=>{b.key==="Enter"&&z()},placeholder:"주문번호 (예: LP-1234567890-ABCDEF)",style:D}),e.jsx("button",{onClick:z,disabled:p,style:_,children:p?"조회 중...":"조회하기"})]}),p&&e.jsxs("div",{style:{textAlign:"center",padding:"30px 0"},children:[e.jsx("div",{style:{width:32,height:32,border:"3px solid rgba(255,215,0,0.2)",borderTopColor:"#FFD700",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}),e.jsx("p",{style:{fontSize:14,color:"rgba(255,255,255,0.5)",marginTop:12},children:"조회 중..."}),e.jsx("style",{children:"@keyframes spin{to{transform:rotate(360deg)}}"})]}),m&&m.length===0&&e.jsx("div",{style:{marginTop:20,padding:20,background:"rgba(255,200,76,0.06)",border:"1px solid rgba(255,200,76,0.15)",borderRadius:10,textAlign:"center"},children:e.jsx("p",{style:{fontSize:14,color:"rgba(255,255,255,0.6)"},children:"주문 내역이 없습니다."})}),m&&m.length>0&&m.map((b,h)=>e.jsxs("div",{style:{marginTop:h===0?20:12,padding:16,background:"rgba(255,215,0,0.05)",border:"1px solid rgba(255,215,0,0.18)",borderRadius:12},children:[e.jsx($,{label:"상품",value:b.product||"—"}),e.jsx($,{label:"라이선스 코드",value:b.code||"—",mono:!0,copy:!0,onCopy:()=>b.code&&He(b.code)}),e.jsx($,{label:"주문번호",value:b.orderId||"—",small:!0}),e.jsx($,{label:"결제일",value:b.date||"—",dim:!0})]},h)),l&&l.length>0&&e.jsxs("div",{style:{marginTop:24},children:[e.jsx("div",{style:{fontSize:13,color:"#FFD700",fontWeight:700,letterSpacing:.5,marginBottom:10},children:"📅 정기구독"}),l.map(b=>{const h=b.status==="active",w=b.status==="cancelled",A=b.status==="expired",W=(b.nextPaymentDate||"").split("T")[0],M=(b.cancelledAt||"").split("T")[0],je=h?"#44d7b6":w?"#FFA500":"#ff5c75",ot=h?"활성":w?`해지됨 (${W}까지 사용 가능)`:A?"만료":b.status;return e.jsxs("div",{style:{marginTop:12,padding:16,background:"rgba(255,255,255,0.04)",border:`1px solid ${je}33`,borderRadius:12},children:[e.jsx($,{label:"상품",value:b.productName}),e.jsx($,{label:"라이선스 코드",value:b.licenseCode||"—",mono:!0,copy:!0,onCopy:()=>b.licenseCode&&He(b.licenseCode)}),e.jsx($,{label:"결제 금액",value:b.amount?`${b.amount.toLocaleString()}원`:"—"}),e.jsx($,{label:h?"다음 결제일":w?"서비스 종료일":"결제 예정일",value:W||"—"}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"},children:[e.jsx("span",{style:{fontSize:12,color:"rgba(255,255,255,0.5)"},children:"상태"}),e.jsxs("span",{style:{fontSize:13,color:je,fontWeight:700},children:["● ",ot]})]}),w&&M&&e.jsxs("div",{style:{fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"right"},children:["해지일: ",M]}),h&&e.jsx("button",{onClick:()=>j(b),disabled:f===b.licenseCode,style:{width:"100%",marginTop:10,padding:10,background:f===b.licenseCode?"rgba(255,255,255,0.06)":"rgba(255,92,117,0.12)",border:"1px solid rgba(255,92,117,0.35)",color:f===b.licenseCode?"rgba(255,255,255,0.4)":"#ff5c75",borderRadius:8,fontSize:13,fontWeight:700,cursor:f===b.licenseCode?"not-allowed":"pointer"},children:f===b.licenseCode?"해지 처리 중...":"🛑 정기결제 해지"})]},b.licenseCode)})]}),I&&e.jsx("div",{style:{marginTop:20,padding:14,background:"rgba(68,215,182,0.08)",border:"1px solid rgba(68,215,182,0.3)",borderRadius:10,textAlign:"center",fontSize:13,color:"#44d7b6",fontWeight:600},children:I}),T&&e.jsxs("div",{style:{marginTop:20,padding:16,background:"rgba(255,92,117,0.06)",border:"1px solid rgba(255,92,117,0.15)",borderRadius:10,textAlign:"center"},children:[e.jsx("p",{style:{fontSize:14,color:"#ff5c75",fontWeight:600,marginBottom:4},children:T.title}),e.jsx("p",{style:{fontSize:13,color:"rgba(255,255,255,0.6)"},children:T.message})]})]}),e.jsxs("div",{style:{marginTop:20,textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.4)"},children:["조회가 되지 않으시면"," ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#FFD700"},children:"cd000242@gmail.com"}),"으로 문의해주세요."]})]})}function $({label:t,value:r,mono:o,copy:n,onCopy:i,small:s,dim:p}){return e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"},children:[e.jsx("span",{style:{fontSize:12,color:"rgba(255,255,255,0.5)",letterSpacing:.5},children:t}),e.jsx("span",{onClick:n?i:void 0,style:{fontSize:s?12:14,fontFamily:o?"monospace":"inherit",letterSpacing:o?1:"normal",color:p?"rgba(255,255,255,0.5)":"#fff",cursor:n?"pointer":"default",fontWeight:500},title:n?"클릭하여 복사":void 0,children:r})]})}function ue({title:t,effective:r,children:o}){return e.jsxs("div",{style:{maxWidth:900,margin:"0 auto",padding:"160px 24px 80px",position:"relative",zIndex:1},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:60},children:[e.jsx("h1",{style:{fontSize:"clamp(32px, 5vw, 48px)",fontWeight:900,marginBottom:12,background:"linear-gradient(135deg, #FFD700, #FFA500)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:t}),e.jsx("p",{style:{color:"rgba(255,255,255,0.5)",fontSize:14},children:r})]}),e.jsxs("div",{style:{background:"rgba(18,18,26,0.6)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:"clamp(24px, 4vw, 48px)",color:"rgba(255,255,255,0.85)",fontSize:15,lineHeight:1.8},className:"legal-content",children:[o,e.jsx("div",{style:{marginTop:40,textAlign:"center"},children:e.jsx(v,{to:"/",style:{display:"inline-block",padding:"10px 24px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:14,textDecoration:"none"},children:"← 메인으로 돌아가기"})})]})]})}const H={fontSize:20,fontWeight:800,color:"#FFD700",margin:"32px 0 14px"},le={fontSize:16,fontWeight:700,color:"#FFA500",margin:"20px 0 10px"},U={paddingLeft:22,margin:"0 0 16px"},be={background:"rgba(255,215,0,0.06)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:12,padding:16,margin:"16px 0"},Fr={...be,background:"rgba(255,59,92,0.06)",borderColor:"rgba(255,59,92,0.25)",marginTop:0},Ar={width:"100%",borderCollapse:"collapse",margin:"12px 0 20px",fontSize:14},de={background:"rgba(255,215,0,0.08)",color:"#FFD700",padding:"10px 12px",textAlign:"left",border:"1px solid rgba(255,255,255,0.08)",fontWeight:700},C={padding:"10px 12px",border:"1px solid rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.8)"};function Ue(){return a.useEffect(()=>{const t=document.title;return document.title="환불 및 취소 정책 — Leaders Pro",()=>{document.title=t}},[]),e.jsxs(ue,{title:"환불 및 취소 정책",effective:"시행일: 2026년 3월 27일 (최종 수정)",children:[e.jsx("div",{style:Fr,children:e.jsxs("p",{style:{margin:0},children:[e.jsx("strong",{children:"⚠️ 중요 안내:"})," Leaders Pro는 ",e.jsx("strong",{children:"디지털 라이선스 상품"}),"으로, 그 특성상 구매 후 환불이 매우 제한적입니다. 구매 전 반드시 ",e.jsx("strong",{children:"무료 체험"}),"을 통해 서비스를 충분히 확인하신 후 결제해 주시기 바랍니다."]})}),e.jsx("h2",{style:H,children:"제1조 (환불 정책 원칙)"}),e.jsxs("p",{children:["Leaders Pro의 모든 상품은 ",e.jsx("strong",{children:"디지털 라이선스 코드"})," 형태로 제공되며, 라이선스 코드가 발급되는 즉시 서비스 이용이 가능합니다. 디지털 콘텐츠의 특성상, 라이선스 코드 발급 후에는 ",e.jsx("strong",{children:"원칙적으로 환불이 불가"}),"합니다."]}),e.jsx("p",{children:'구매자는 결제 전 무료 체험(Free Trial)을 통해 프로그램의 기능과 적합성을 충분히 확인할 수 있으므로, 결제 후 "기대와 다르다"는 사유만으로는 환불이 불가합니다.'}),e.jsx("h2",{style:H,children:"제2조 (예외적 환불 가능 조건)"}),e.jsxs("p",{children:["아래 조건을 ",e.jsx("strong",{children:"모두 동시에 충족"}),"하는 경우에 한해 예외적으로 환불을 검토합니다."]}),e.jsxs("ul",{style:U,children:[e.jsxs("li",{children:["라이선스 코드 발급일로부터 ",e.jsx("strong",{children:"48시간(2일) 이내"})," 환불 요청"]}),e.jsxs("li",{children:["프로그램에 ",e.jsx("strong",{children:"1회도 로그인한 이력이 없는 경우"})," (서버 로그 기준)"]}),e.jsxs("li",{children:["라이선스 코드를 ",e.jsx("strong",{children:"어떤 형태로도 사용·활성화·공유하지 않은 경우"})]})]}),e.jsx("p",{children:"위 조건을 충족하더라도, 회사의 내부 심사를 거쳐 환불 여부가 최종 결정됩니다."}),e.jsx("h2",{style:H,children:"제3조 (환불 불가 사유)"}),e.jsxs("p",{children:["다음 중 ",e.jsx("strong",{children:"하나라도 해당"}),"하는 경우 환불이 절대 불가합니다."]}),e.jsxs("ul",{style:U,children:[e.jsxs("li",{children:["라이선스 코드 발급 후 ",e.jsx("strong",{children:"48시간이 경과"}),"한 경우"]}),e.jsxs("li",{children:[e.jsx("strong",{children:"프로그램 로그인 이력"}),"이 1회 이상 확인되는 경우"]}),e.jsxs("li",{children:["콘텐츠 생성, 발행, 설정 변경 등 ",e.jsx("strong",{children:"서비스 사용 이력"}),"이 있는 경우"]}),e.jsxs("li",{children:['"생각보다 어렵다", "기대와 다르다" 등 ',e.jsx("strong",{children:"단순 변심"}),"에 의한 요청"]}),e.jsx("li",{children:"이용약관 위반으로 서비스 이용이 제한된 경우"}),e.jsx("li",{children:"라이선스 코드를 타인에게 양도·공유·재판매한 경우"}),e.jsxs("li",{children:[e.jsx("strong",{children:"영구제(Lifetime)"})," 상품의 경우 (일체 환불 불가)"]})]}),e.jsx("h2",{style:H,children:"제4조 (환불 요청 절차)"}),e.jsx("p",{children:"환불 대상에 해당한다고 판단되시는 경우, 아래 단계를 따라주세요."}),e.jsx("h3",{style:le,children:"1단계: 환불 신청"}),e.jsxs("div",{style:be,children:[e.jsxs("p",{style:{margin:0},children:[e.jsx("strong",{children:"📧 환불 접수 이메일:"})," cd000242@gmail.com"]}),e.jsxs("p",{style:{margin:"8px 0 0"},children:[e.jsx("strong",{children:"필수 기재 사항:"})," 주문번호, 구매자명, 결제 이메일, 구체적 환불 사유"]}),e.jsx("p",{style:{color:"rgba(255,100,100,0.8)",fontSize:12,marginTop:8,marginBottom:0},children:"※ 필수 사항이 누락되거나 사유가 불명확한 경우 접수가 거부됩니다."})]}),e.jsx("h3",{style:le,children:"2단계: 사용 이력 심사"}),e.jsxs("ul",{style:U,children:[e.jsxs("li",{children:["환불 요청 접수 후 ",e.jsx("strong",{children:"영업일 기준 3~5일 이내"})," 서버 로그 기반으로 사용 이력을 정밀 확인합니다."]}),e.jsx("li",{children:"프로그램 로그인, API 호출, 콘텐츠 생성/발행 기록 등을 종합적으로 검토합니다."}),e.jsx("li",{children:"심사 결과를 이메일로 회신드립니다."})]}),e.jsx("h3",{style:le,children:"3단계: 환불 처리 (승인 시)"}),e.jsxs("ul",{style:U,children:[e.jsxs("li",{children:["환불 승인 시 ",e.jsx("strong",{children:"영업일 기준 5~7일 이내"})," 원래 결제 수단으로 환불됩니다."]}),e.jsx("li",{children:"카드사 처리 기간에 따라 최대 14일이 소요될 수 있습니다."}),e.jsx("li",{children:"환불 시 결제 수수료(PG 수수료 등)가 차감될 수 있습니다."})]}),e.jsx("h2",{style:H,children:"제5조 (서비스 제공 기간)"}),e.jsx("p",{children:"각 라이선스의 서비스 제공 기간은 다음과 같습니다."}),e.jsxs("table",{style:Ar,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{style:de,children:"플랜"}),e.jsx("th",{style:de,children:"서비스 제공 기간"}),e.jsx("th",{style:de,children:"환불 검토 가능 기간"})]})}),e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{style:C,children:"무료 체험"}),e.jsx("td",{style:C,children:"무기한 (기능 제한)"}),e.jsx("td",{style:C,children:"해당 없음 (무료)"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:C,children:"1개월권"}),e.jsx("td",{style:C,children:"결제일로부터 30일"}),e.jsx("td",{style:C,children:"48시간 이내 (미사용 시)"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:C,children:"3개월권"}),e.jsx("td",{style:C,children:"결제일로부터 90일"}),e.jsx("td",{style:C,children:"48시간 이내 (미사용 시)"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:C,children:"1년권"}),e.jsx("td",{style:C,children:"결제일로부터 365일"}),e.jsx("td",{style:C,children:"48시간 이내 (미사용 시)"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:C,children:"영구제"}),e.jsx("td",{style:C,children:"무기한"}),e.jsx("td",{style:{...C,color:"rgba(255,100,100,0.85)",fontWeight:600},children:"환불 불가"})]})]})]}),e.jsx("h2",{style:H,children:"제6조 (정기결제 해지)"}),e.jsxs("ul",{style:U,children:[e.jsx("li",{children:"정기결제(구독)는 언제든지 해지할 수 있습니다."}),e.jsx("li",{children:"해지 시 현재 결제 주기가 종료될 때까지 서비스를 이용할 수 있습니다."}),e.jsx("li",{children:"해지 후 다음 결제일에 자동 결제가 이루어지지 않습니다."}),e.jsxs("li",{children:[e.jsx("strong",{children:"해지는 환불과 무관합니다."})," 이미 결제된 기간에 대한 환불은 위 조건에 따릅니다."]}),e.jsx("li",{children:"해지는 주문 조회 페이지 또는 이메일(cd000242@gmail.com)을 통해 가능합니다."})]}),e.jsx("h2",{style:H,children:"제7조 (면책 사항)"}),e.jsxs("ul",{style:U,children:[e.jsxs("li",{children:["디지털 라이선스의 특성상, ",e.jsx("strong",{children:"복제·무단사용 방지를 위해 환불 조건이 엄격히 적용"}),"됩니다."]}),e.jsx("li",{children:"결제 전 무료 체험 기간이 제공되므로, 구매 후 기능 불만족은 환불 사유로 인정되지 않습니다."}),e.jsx("li",{children:"회사는 환불 심사 과정에서 요청을 거부할 수 있으며, 이에 대한 최종 결정권은 회사에 있습니다."})]}),e.jsx("h2",{style:H,children:"제8조 (분쟁 해결)"}),e.jsxs("ul",{style:U,children:[e.jsx("li",{children:"환불과 관련한 분쟁은 전자상거래 등에서의 소비자보호에 관한 법률에 따릅니다."}),e.jsx("li",{children:"소비자 상담: 1544-7772 (토스페이먼츠)"}),e.jsx("li",{children:"이메일 문의: cd000242@gmail.com"})]}),e.jsx("div",{style:be,children:e.jsxs("p",{style:{margin:0},children:[e.jsx("strong",{children:"💡 참고:"})," 본 환불정책은"," ",e.jsx(v,{to:"/terms",style:{color:"#FFD700"},children:"이용약관"})," ","제4조(결제 및 환불)에 근거합니다. 구매 전 반드시 무료 체험을 이용해주세요."]})})]})}const K={fontSize:20,fontWeight:800,color:"#FFD700",margin:"32px 0 14px"},Q={paddingLeft:22,margin:"0 0 16px"};function Ke(){return a.useEffect(()=>{const t=document.title;return document.title="이용약관 — Leaders Pro",()=>{document.title=t}},[]),e.jsxs(ue,{title:"이용약관",effective:"시행일: 2026년 3월 24일 (최종 수정)",children:[e.jsx("h2",{style:{...K,marginTop:0},children:"제1조 (목적)"}),e.jsx("p",{children:'본 약관은 Leaders Pro (이하 "회사")가 제공하는 블로그 자동화 소프트웨어 (이하 "서비스")의 이용 조건과 절차, 권리, 의무 및 기타 필요한 사항을 규정함을 목적으로 합니다.'}),e.jsx("h2",{style:K,children:"제2조 (정의)"}),e.jsxs("ul",{style:Q,children:[e.jsx("li",{children:'"서비스"란 회사가 제공하는 Leaders Pro, Leaders Orbit, Leaders Tistory, Leword 등의 자동화 프로그램을 의미합니다.'}),e.jsx("li",{children:'"라이선스 코드"란 서비스 이용을 위해 발급되는 고유한 인증 코드를 의미합니다.'}),e.jsx("li",{children:'"이용자"란 본 약관에 동의하고 라이선스를 구매한 자를 의미합니다.'})]}),e.jsx("h2",{style:K,children:"제3조 (라이선스)"}),e.jsxs("ul",{style:Q,children:[e.jsx("li",{children:"라이선스 코드는 구매자 본인에게만 사용 권한이 부여됩니다."}),e.jsx("li",{children:"1개월권: 구매일로부터 30일간 유효합니다."}),e.jsx("li",{children:"3개월권: 구매일로부터 90일간 유효합니다."}),e.jsx("li",{children:"1년권: 구매일로부터 365일간 유효합니다."}),e.jsx("li",{children:"영구제: 기간 제한 없이 사용 가능합니다."}),e.jsx("li",{children:"라이선스 코드의 양도, 재판매, 공유는 금지됩니다."}),e.jsx("li",{children:"동시에 1대의 기기에서만 사용 가능합니다."})]}),e.jsx("h2",{style:K,children:"제4조 (결제 및 환불)"}),e.jsxs("ul",{style:Q,children:[e.jsx("li",{children:"결제는 토스페이먼츠를 통해 처리되며, 카드 결제 및 계좌이체를 지원합니다."}),e.jsx("li",{children:"모든 가격은 부가가치세(VAT)가 포함된 금액입니다."}),e.jsx("li",{children:"라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다."}),e.jsx("li",{children:"서비스 사용 이력이 있는 경우 환불이 제한될 수 있습니다."}),e.jsx("li",{children:"환불은 cd000242@gmail.com으로 요청해주세요."})]}),e.jsx("h2",{style:K,children:"제5조 (서비스 이용 제한)"}),e.jsx("p",{children:"다음의 경우 서비스 이용이 제한될 수 있습니다:"}),e.jsxs("ul",{style:Q,children:[e.jsx("li",{children:"라이선스 코드를 타인에게 공유하거나 판매하는 행위"}),e.jsx("li",{children:"서비스를 역공학, 분해, 변조하는 행위"}),e.jsx("li",{children:"서비스를 이용하여 불법적인 활동을 하는 행위"})]}),e.jsx("h2",{style:K,children:"제6조 (면책)"}),e.jsxs("ul",{style:Q,children:[e.jsx("li",{children:"네이버 등 외부 플랫폼의 정책 변경으로 인한 서비스 기능 제한에 대해 회사는 책임을 지지 않습니다."}),e.jsx("li",{children:"이용자의 부주의로 인한 라이선스 코드 분실에 대해 책임지지 않습니다. (이메일 백업을 권장합니다)"})]}),e.jsx("h2",{style:K,children:"제7조 (약관 변경)"}),e.jsx("p",{children:"회사는 필요 시 약관을 변경할 수 있으며, 변경 사항은 본 페이지에 게시됩니다."})]})}const Y={fontSize:20,fontWeight:800,color:"#FFD700",margin:"32px 0 14px"},qe={paddingLeft:22,margin:"0 0 16px"},Ye={width:"100%",borderCollapse:"collapse",margin:"12px 0 20px",fontSize:14},Z={background:"rgba(255,215,0,0.08)",color:"#FFD700",padding:"10px 12px",textAlign:"left",border:"1px solid rgba(255,255,255,0.08)",fontWeight:700},O={padding:"10px 12px",border:"1px solid rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.8)"};function Ve(){return a.useEffect(()=>{const t=document.title;return document.title="개인정보처리방침 — Leaders Pro",()=>{document.title=t}},[]),e.jsxs(ue,{title:"개인정보처리방침",effective:"시행일: 2026년 3월 24일 (최종 수정)",children:[e.jsx("h2",{style:{...Y,marginTop:0},children:"1. 수집하는 개인정보"}),e.jsxs("table",{style:Ye,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{style:Z,children:"수집 항목"}),e.jsx("th",{style:Z,children:"수집 목적"}),e.jsx("th",{style:Z,children:"보관 기간"})]})}),e.jsxs("tbody",{children:[e.jsxs("tr",{children:[e.jsx("td",{style:O,children:"이메일 주소 (선택)"}),e.jsx("td",{style:O,children:"라이선스 코드 백업 발송"}),e.jsx("td",{style:O,children:"발송 후 즉시 파기"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:O,children:"결제 정보"}),e.jsx("td",{style:O,children:"결제 처리 (토스페이먼츠 위탁)"}),e.jsx("td",{style:O,children:"관련 법령에 따름"})]}),e.jsxs("tr",{children:[e.jsx("td",{style:O,children:"주문번호, 결제일시"}),e.jsx("td",{style:O,children:"주문 내역 관리 및 고객 지원"}),e.jsx("td",{style:O,children:"5년 (전자상거래법)"})]})]})]}),e.jsx("h2",{style:Y,children:"2. 개인정보 처리 위탁"}),e.jsxs("table",{style:Ye,children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{style:Z,children:"수탁업체"}),e.jsx("th",{style:Z,children:"위탁 업무"})]})}),e.jsx("tbody",{children:e.jsxs("tr",{children:[e.jsx("td",{style:O,children:"토스페이먼츠 주식회사"}),e.jsx("td",{style:O,children:"결제 처리"})]})})]}),e.jsx("h2",{style:Y,children:"3. 이용자의 권리"}),e.jsxs("ul",{style:qe,children:[e.jsx("li",{children:"개인정보 열람, 정정, 삭제 요청: cd000242@gmail.com"}),e.jsx("li",{children:"요청 접수 후 10일 이내 처리됩니다."})]}),e.jsx("h2",{style:Y,children:"4. 개인정보의 안전성 확보"}),e.jsxs("ul",{style:qe,children:[e.jsx("li",{children:"결제 정보는 토스페이먼츠의 PCI-DSS 인증 시스템에서 처리됩니다."}),e.jsx("li",{children:"라이선스 코드는 접근 권한이 제한된 시스템에 저장되며 관리됩니다."}),e.jsx("li",{children:"이메일 주소는 발송 완료 후 서버에 저장되지 않습니다."})]}),e.jsx("h2",{style:Y,children:"5. 개인정보 보호책임자"}),e.jsx("p",{children:"이메일: cd000242@gmail.com"}),e.jsx("h2",{style:Y,children:"6. 방침 변경"}),e.jsx("p",{children:"본 방침은 변경 시 본 페이지를 통해 공지됩니다."})]})}const it="https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec",Wr={naver:[{id:"all-in-one-monthly",name:"올인원 1개월",price:5e4,period:"/ 월"},{id:"all-in-one-quarterly",name:"올인원 3개월",price:12e4,period:"월 40,000원"},{id:"all-in-one-yearly",name:"올인원 1년",price:4e5,period:"월 33,333원"}]},ce={naver:"Leaders Pro 올인원"},ie=t=>t.toLocaleString();async function Xe(t){return(await fetch(it,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"check-order",orderId:t})})).json()}function Qe(){const[t,r]=Je(),[o,n]=a.useState("naver"),[i,s]=a.useState(null),[p,c]=a.useState(""),[m,u]=a.useState(""),[l,d]=a.useState(!1),[f,S]=a.useState(null),[T,N]=a.useState("📋 복사"),[I,P]=a.useState("📋 복사"),[B,F]=a.useState(null),x=a.useRef(null);a.useEffect(()=>{const h=document.title;return document.title="계좌이체 결제 — Leaders Pro",()=>{document.title=h,x.current&&window.clearInterval(x.current)}},[]),a.useEffect(()=>{const h=t.get("orderId");h&&(async()=>{try{const w=await Xe(h);if(!w.ok)return;S({orderId:h,amount:w.amount,product:w.product,status:w.status,code:w.code}),w.status==="pending"&&k(h)}catch{}})()},[]);const k=h=>{x.current&&window.clearInterval(x.current);const w=async()=>{try{const A=await Xe(h);if(!A.ok)return;S(W=>W&&{...W,status:A.status,code:A.code}),(A.status==="approved"||A.status==="rejected")&&x.current&&(window.clearInterval(x.current),x.current=null)}catch{}};w(),x.current=window.setInterval(w,1e4)},j=h=>{n(h),s(null)},z=h=>s(h),L=()=>{navigator.clipboard.writeText("1000-1770-4358").then(()=>{N("✅ 복사됨"),window.setTimeout(()=>N("📋 복사"),2e3)})},R=h=>{navigator.clipboard.writeText(h).then(()=>{P("✅ 복사됨"),window.setTimeout(()=>P("📋 복사"),1500)})},D=async()=>{if(!i)return;const h=p.trim(),w=m.trim();if(!h||h.length<2){F("name"),window.setTimeout(()=>F(null),500);return}if(!w||!w.includes("@")){F("email"),window.setTimeout(()=>F(null),500);return}d(!0);const A=i.name.startsWith("올인원")?`Leaders Pro ${i.name}`:`${ce[o]} ${i.name}`;try{const M=await(await fetch(it,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({action:"bank-order",name:h,email:w,product:A,amount:i.price})})).json();M.ok?(r({orderId:M.orderId},{replace:!0}),S({orderId:M.orderId,amount:i.price,product:A,status:"pending"}),k(M.orderId)):(alert(M.error||"주문 접수에 실패했습니다."),d(!1))}catch(W){alert("서버 연결 오류: "+(W?.message||"")),d(!1)}};if(f)return e.jsx(Rr,{info:f,copyLicense:R,licCopyLabel:I});const _=Wr[o],b={width:"100%",padding:"14px 16px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(201,168,76,0.18)",borderRadius:10,color:"#fff",fontSize:14,outline:"none"};return e.jsx("div",{style:{maxWidth:720,margin:"0 auto",padding:"140px 20px 80px",position:"relative",zIndex:1},children:e.jsxs("div",{style:{background:"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:"1px solid rgba(201,168,76,0.18)",borderRadius:24,padding:"clamp(24px, 4vw, 40px)"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:32},children:[e.jsx("h1",{style:{fontSize:"clamp(24px, 4vw, 32px)",fontWeight:900,marginBottom:8,background:"linear-gradient(135deg, #FFD700, #FFA500)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"💰 계좌이체 결제"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:14},children:"올인원 기간권 선택 → 정보 입력 → 입금 → 올인원 라이선스 발급"})]}),e.jsxs(pe,{n:1,label:"올인원 기간권 선택",children:[e.jsx("div",{style:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"},children:Object.keys(ce).filter(h=>h==="naver").map(h=>e.jsx("button",{onClick:()=>j(h),style:{padding:"10px 20px",borderRadius:10,background:o===h?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.05)",color:o===h?"#000":"#fff",border:"1px solid rgba(201,168,76,0.3)",fontWeight:o===h?800:500,cursor:"pointer",fontSize:14},children:ce[h]},h))}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:12},children:_.map(h=>{const w=i?.id===h.id;return e.jsxs("div",{onClick:()=>z(h),style:{padding:16,borderRadius:12,cursor:"pointer",background:w?"rgba(201,168,76,0.15)":"rgba(0,0,0,0.3)",border:w?"2px solid #FFD700":"1px solid rgba(255,255,255,0.08)",textAlign:"center",transition:"all 0.2s"},children:[e.jsx("div",{style:{fontSize:14,color:"rgba(255,255,255,0.7)",marginBottom:6},children:h.name}),e.jsxs("div",{style:{fontSize:18,fontWeight:800,color:"#FFD700"},children:[ie(h.price),"원"]}),e.jsx("div",{style:{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:4},children:h.period})]},h.id)})})]}),e.jsxs(pe,{n:2,label:"정보 입력",children:[e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{style:{display:"block",marginBottom:6,color:"rgba(255,255,255,0.7)",fontSize:13},children:"입금자명 (실명)"}),e.jsx("input",{type:"text",value:p,maxLength:20,placeholder:"홍길동",onChange:h=>c(h.target.value),style:{...b,...B==="name"?{animation:"shake 0.4s"}:{}}})]}),e.jsxs("div",{children:[e.jsx("label",{style:{display:"block",marginBottom:6,color:"rgba(255,255,255,0.7)",fontSize:13},children:"이메일 (라이선스 코드 수신)"}),e.jsx("input",{type:"email",value:m,placeholder:"example@email.com",onChange:h=>u(h.target.value),style:{...b,...B==="email"?{animation:"shake 0.4s"}:{}}})]}),e.jsx("style",{children:"@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}"})]}),e.jsx(pe,{n:3,label:"입금 계좌 안내",children:e.jsxs("div",{style:{background:"rgba(201,168,76,0.06)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:14,padding:20},children:[e.jsx("h4",{style:{marginBottom:14,fontSize:15,color:"#FFD700"},children:"💰 아래 계좌로 입금해주세요"}),e.jsx(G,{label:"은행",value:"토스뱅크"}),e.jsx(G,{label:"계좌번호",value:e.jsxs(e.Fragment,{children:["1000-1770-4358 ",e.jsx("span",{onClick:L,style:{marginLeft:8,color:"#FFD700",cursor:"pointer",fontSize:12,fontWeight:600},children:T})]})}),e.jsx(G,{label:"예금주",value:"박성현"}),e.jsx(G,{label:"입금 금액",value:i?e.jsxs("strong",{style:{color:"#FFD700"},children:[ie(i.price),"원"]}):"기간권을 선택해주세요"})]})}),e.jsx("button",{onClick:D,disabled:!i||l,style:{width:"100%",padding:"18px",marginTop:24,background:i&&!l?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.08)",color:i&&!l?"#000":"rgba(255,255,255,0.4)",border:"none",borderRadius:14,fontSize:16,fontWeight:800,cursor:i&&!l?"pointer":"not-allowed"},children:l?"접수 중...":i?`${ie(i.price)}원 주문 접수하기`:"기간권을 선택해주세요"}),e.jsxs("div",{style:{marginTop:18,textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.5)",lineHeight:1.7},children:["주문 접수 후 입금이 확인되면 올인원 라이선스 코드가 이메일로 발송됩니다.",e.jsx("br",{}),"결제 진행 시 ",e.jsx("a",{href:"/terms",style:{color:"#FFD700"},children:"이용약관"})," 및 ",e.jsx("a",{href:"/privacy",style:{color:"#FFD700"},children:"개인정보처리방침"}),"에 동의하는 것으로 간주됩니다."]})]})})}function pe({n:t,label:r,children:o}){return e.jsxs("div",{style:{marginBottom:28},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:14},children:[e.jsx("div",{style:{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg, #FFD700, #FFA500)",color:"#000",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14},children:t}),e.jsx("div",{style:{fontSize:16,fontWeight:700},children:r})]}),o]})}function G({label:t,value:r}){return e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:14},children:[e.jsx("span",{style:{color:"rgba(255,255,255,0.6)"},children:t}),e.jsx("span",{style:{color:"#fff",fontWeight:500},children:r})]})}function Rr({info:t,copyLicense:r,licCopyLabel:o}){const{status:n,code:i,orderId:s,amount:p}=t;return e.jsx("div",{style:{maxWidth:600,margin:"0 auto",padding:"140px 20px 80px",position:"relative",zIndex:1},children:e.jsxs("div",{style:{background:"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:"1px solid rgba(201,168,76,0.18)",borderRadius:24,padding:"clamp(28px, 4vw, 40px)",textAlign:"center"},children:[e.jsx("div",{style:{fontSize:56,marginBottom:12},children:n==="approved"?"🎉":n==="rejected"?"❌":"✅"}),e.jsxs("div",{style:{fontSize:22,fontWeight:800,marginBottom:12},children:[n==="approved"&&"라이선스가 발급되었습니다!",n==="rejected"&&"주문이 거절되었습니다",n==="pending"&&"주문이 접수되었습니다!"]}),e.jsxs("div",{style:{color:"rgba(255,255,255,0.65)",fontSize:14,lineHeight:1.8},children:[n==="approved"&&e.jsxs(e.Fragment,{children:["아래 올인원 라이선스 코드를 사용해주세요.",e.jsx("br",{}),"이메일로도 발송되었습니다."]}),n==="rejected"&&"문의 사항이 있으시면 아래 연락처로 연락주세요.",n==="pending"&&e.jsxs(e.Fragment,{children:["아래 계좌로 입금해주세요.",e.jsx("br",{}),"입금 확인 후 ",e.jsx("strong",{children:"올인원 라이선스 코드"}),"가 이메일로 발송됩니다.",e.jsx("br",{}),e.jsx("span",{style:{display:"inline-block",marginTop:8,color:"#c9a84c",fontSize:13},children:"📡 이 페이지는 자동으로 상태가 갱신됩니다."})]})]}),e.jsxs("div",{style:{marginTop:18,color:"rgba(255,255,255,0.55)",fontSize:13},children:["주문번호: ",e.jsx("strong",{style:{color:"#FFD700"},children:s})]}),n==="pending"&&e.jsxs("div",{style:{background:"rgba(201,168,76,0.06)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:14,padding:20,marginTop:20,textAlign:"left"},children:[e.jsx("h4",{style:{marginBottom:14,fontSize:15,color:"#FFD700"},children:"💰 입금 계좌"}),e.jsx(G,{label:"은행",value:"토스뱅크"}),e.jsx(G,{label:"계좌번호",value:"1000-1770-4358"}),e.jsx(G,{label:"예금주",value:"박성현"}),p&&e.jsx(G,{label:"입금 금액",value:`${ie(p)}원`}),e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0 0",marginTop:14,borderTop:"1px solid rgba(201,168,76,0.2)"},children:[e.jsx("span",{style:{color:"rgba(255,255,255,0.6)",fontSize:14},children:"상태"}),e.jsx("span",{style:{color:"#ffc107",fontSize:14,fontWeight:600},children:"⏳ 입금 확인 대기 중"})]})]}),n==="approved"&&i&&e.jsxs("div",{style:{background:"linear-gradient(135deg, rgba(68,215,182,0.08), rgba(201,168,76,0.08))",border:"1px solid rgba(68,215,182,0.4)",borderRadius:14,padding:24,marginTop:18,textAlign:"left"},children:[e.jsx("div",{style:{fontSize:36,textAlign:"center",marginBottom:8},children:"🎉"}),e.jsx("div",{style:{textAlign:"center",color:"#44d7b6",fontSize:18,fontWeight:800,marginBottom:16},children:"올인원 라이선스 발급 완료"}),e.jsx("div",{style:{color:"rgba(255,255,255,0.55)",fontSize:12,marginBottom:6},children:"올인원 라이선스 코드"}),e.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[e.jsx("input",{readOnly:!0,value:i,style:{flex:1,background:"rgba(0,0,0,0.4)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:10,padding:"14px 16px",color:"#c9a84c",fontFamily:"monospace",fontSize:16,fontWeight:800,letterSpacing:.5}}),e.jsx("button",{onClick:()=>r(i),style:{background:"linear-gradient(135deg, #c9a84c, #e8d48b)",color:"#0a0a0f",border:"none",borderRadius:10,padding:"14px 18px",fontWeight:800,cursor:"pointer",fontSize:14,whiteSpace:"nowrap"},children:o})]}),e.jsxs("div",{style:{color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:14,lineHeight:1.6},children:["이 코드는 입력하신 이메일로도 발송되었습니다.",e.jsx("br",{}),"올인원 코드 1개로 이용 기간 안에서 Better Life Naver, Leaders Orbit, LEWORD를 함께 사용할 수 있습니다."]})]}),n==="rejected"&&e.jsxs("div",{style:{background:"rgba(233,94,44,0.08)",border:"1px solid rgba(233,94,44,0.4)",borderRadius:14,padding:24,marginTop:18,textAlign:"center"},children:[e.jsx("div",{style:{fontSize:36,marginBottom:8},children:"❌"}),e.jsx("div",{style:{color:"#e95e2c",fontSize:17,fontWeight:800,marginBottom:8},children:"주문이 거절되었습니다"}),e.jsxs("div",{style:{color:"rgba(255,255,255,0.55)",fontSize:13,lineHeight:1.6},children:["입금 확인이 되지 않았거나 다른 사유로 거절 처리되었습니다.",e.jsx("br",{}),"문의: ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#c9a84c"},children:"cd000242@gmail.com"})]})]}),e.jsxs("p",{style:{color:"rgba(255,255,255,0.45)",fontSize:13,marginTop:20},children:["문의: ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#c9a84c"},children:"cd000242@gmail.com"})," | ",e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{color:"#FEE500"},children:"카카오톡 1:1 문의"})]})]})})}function Cr(){return e.jsx("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"120px 24px",background:"#0a0a0f",color:"#fff",textAlign:"center"},children:e.jsxs("div",{children:[e.jsx("h1",{style:{fontSize:96,fontWeight:900,marginBottom:16,background:"linear-gradient(135deg, #c9a84c, #d4a012)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:"404"}),e.jsx("p",{style:{fontSize:18,color:"#a0a0b0",marginBottom:24},children:"페이지를 찾을 수 없습니다"}),e.jsx(v,{to:"/",style:{display:"inline-block",padding:"12px 28px",background:"linear-gradient(135deg, #c9a84c, #d4a012)",color:"#1a1a2e",borderRadius:10,fontWeight:800,textDecoration:"none"},children:"🏠 홈으로"})]})})}function Er(){return e.jsx(at,{children:e.jsxs(y,{element:e.jsx(Ft,{}),children:[e.jsx(y,{path:"/",element:e.jsx(ke,{})}),e.jsx(y,{path:"/index.html",element:e.jsx(ke,{})}),e.jsx(y,{path:"/products",element:e.jsx(Te,{})}),e.jsx(y,{path:"/products.html",element:e.jsx(Te,{})}),e.jsx(y,{path:"/detail",element:e.jsx(Fe,{})}),e.jsx(y,{path:"/detail.html",element:e.jsx(Fe,{})}),e.jsx(y,{path:"/leword",element:e.jsx(We,{})}),e.jsx(y,{path:"/leword.html",element:e.jsx(We,{})}),e.jsx(y,{path:"/orbit",element:e.jsx(Re,{})}),e.jsx(y,{path:"/orbit.html",element:e.jsx(Re,{})}),e.jsx(y,{path:"/pricing",element:e.jsx(Ie,{})}),e.jsx(y,{path:"/pricing.html",element:e.jsx(Ie,{})}),e.jsx(y,{path:"/download",element:e.jsx(Be,{})}),e.jsx(y,{path:"/download.html",element:e.jsx(Be,{})}),e.jsx(y,{path:"/chatbots",element:e.jsx(Oe,{})}),e.jsx(y,{path:"/chatbots.html",element:e.jsx(Oe,{})}),e.jsx(y,{path:"/reviews",element:e.jsx(Me,{})}),e.jsx(y,{path:"/reviews.html",element:e.jsx(Me,{})}),e.jsx(y,{path:"/community",element:e.jsx($e,{})}),e.jsx(y,{path:"/community.html",element:e.jsx($e,{})}),e.jsx(y,{path:"/lookup",element:e.jsx(Ge,{})}),e.jsx(y,{path:"/lookup.html",element:e.jsx(Ge,{})}),e.jsx(y,{path:"/refund",element:e.jsx(Ue,{})}),e.jsx(y,{path:"/refund.html",element:e.jsx(Ue,{})}),e.jsx(y,{path:"/terms",element:e.jsx(Ke,{})}),e.jsx(y,{path:"/terms.html",element:e.jsx(Ke,{})}),e.jsx(y,{path:"/privacy",element:e.jsx(Ve,{})}),e.jsx(y,{path:"/privacy.html",element:e.jsx(Ve,{})}),e.jsx(y,{path:"/bank-order",element:e.jsx(Qe,{})}),e.jsx(y,{path:"/bank-order.html",element:e.jsx(Qe,{})}),e.jsx(y,{path:"*",element:e.jsx(Cr,{})})]})})}ge.createRoot(document.getElementById("root")).render(e.jsx(st.StrictMode,{children:e.jsx(lt,{children:e.jsx(Er,{})})}));
