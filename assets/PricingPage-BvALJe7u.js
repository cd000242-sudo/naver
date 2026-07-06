import{j as e,f as re}from"./index-B9ObNxJ8.js";import{c as d,d as oe,L as z}from"./router-BCNeJdl_.js";import{P as te,g as B,i as ie}from"./pricingSchedule-D-ZZfyYx.js";const R=[{src:"/images/pricing-proof/adsense-10000-month.jpg",title:"이번 달 US$1만",desc:"애드센스 예상 수입 상승 인증",metric:"월 수익"},{src:"/images/pricing-proof/adsense-daily-100.jpg",title:"오늘 US$100+",desc:"일 수익 상승 사례",metric:"일 수익"},{src:"/images/pricing-proof/adsense-28days-931.jpg",title:"최근 28일 US$931",desc:"월간 운영 성과",metric:"28일 성과"},{src:"/images/pricing-proof/adsense-today-95.jpg",title:"오늘 US$95.57",desc:"당일 수익 인증",metric:"당일 수익"},{src:"/images/pricing-proof/adsense-small-start.jpg",title:"작은 블로그도 수익 흐름 확인",desc:"초기 운영 단계의 수익 상승 사례",metric:"시작 사례"}],O=[{src:"/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg",title:"방문횟수 9,177 돌파",desc:"2월 15일 기준 방문 지표가 크게 상승한 실제 성과 화면입니다.",metric:"방문 9,177"},{src:"/images/proof-user/fast/KakaoTalk_20260310_002438127-fast.jpg",title:"조회수 19,896 인증",desc:"조회수와 공감수가 함께 쌓인 네이버 운영 성과입니다.",metric:"조회 19,896"},{src:"/images/proof-user/fast/KakaoTalk_20260309_163736774-fast.jpg",title:"조회수 10,003 기록",desc:"발행 후 조회수가 빠르게 누적된 실제 인증 화면입니다.",metric:"조회 10,003"}],h=[...R,...O];function ae({className:o="",compact:c=!1,variant:n="grid"}){const[i,t]=d.useState(0),f=R[0],w=R.slice(1),u=h[i]||h[0];return d.useEffect(()=>{if(n!=="carousel"||h.length<=1||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const s=window.setInterval(()=>{t(m=>(m+1)%h.length)},3600);return()=>window.clearInterval(s)},[n]),d.useEffect(()=>{if(n!=="carousel"||h.length<=1)return;const s=h[(i+1)%h.length],m=window.setTimeout(()=>{const x=new Image;x.decoding="async",x.src=s.src},900);return()=>window.clearTimeout(m)},[i,n]),n==="carousel"?e.jsxs("section",{className:`proof-carousel${c?" proof-showcase-compact":""}${o?` ${o}`:""}`,"aria-label":"애드센스와 네이버 성과 자동 슬라이드",children:[e.jsxs("div",{className:"proof-carousel-stage",children:[e.jsxs("div",{className:"proof-carousel-summary",children:[e.jsx("span",{children:u.metric}),e.jsx("strong",{children:u.title}),e.jsx("small",{children:u.desc})]}),e.jsx("div",{className:"proof-carousel-image-shell","aria-live":"polite",children:e.jsx("img",{src:u.src,alt:u.title,loading:"lazy",decoding:"async",className:"proof-carousel-image active"},`${u.src}-${i}`)}),e.jsx("div",{className:"proof-carousel-dots","aria-label":"성과 이미지 선택",children:h.map((s,m)=>e.jsx("button",{type:"button",className:m===i?"active":"","aria-label":`${m+1}번째 성과 보기`,"aria-pressed":m===i,onClick:()=>t(m)},s.src))})]}),e.jsx("style",{children:`
                    .proof-carousel {
                        width: 100%;
                        min-height: 680px;
                        margin: 0;
                        padding: 18px;
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 8px;
                        background:
                            linear-gradient(180deg, rgba(9,15,25,0.94), rgba(5,9,16,0.90)),
                            radial-gradient(circle at 22% 8%, rgba(68,215,182,0.13), transparent 32%);
                        box-shadow: 0 24px 76px rgba(0,0,0,0.34);
                        overflow: hidden;
                    }

                    .proof-carousel-stage {
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        justify-content: flex-end;
                        min-height: 640px;
                        border-radius: 8px;
                        border: 1px solid rgba(255,255,255,0.10);
                        background:
                            linear-gradient(180deg, rgba(11,19,31,0.72), rgba(6,10,18,0.92)),
                            radial-gradient(circle at 50% 38%, rgba(56,189,248,0.11), transparent 45%);
                        overflow: hidden;
                    }

                    .proof-carousel-stage::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background:
                            linear-gradient(180deg, rgba(0,0,0,0.20), transparent 28%, rgba(0,0,0,0.34)),
                            radial-gradient(circle at 12% 18%, rgba(255,215,0,0.13), transparent 10%);
                        pointer-events: none;
                        z-index: 1;
                    }

                    .proof-carousel-summary {
                        position: absolute;
                        left: 18px;
                        right: 18px;
                        top: 18px;
                        z-index: 3;
                        display: grid;
                        gap: 8px;
                        padding: 17px 18px;
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 8px;
                        background: linear-gradient(180deg, rgba(12,19,31,0.94), rgba(7,12,20,0.88));
                        box-shadow: 0 16px 42px rgba(0,0,0,0.28);
                    }

                    .proof-carousel-summary span {
                        color: #ffd84d;
                        font-size: 12px;
                        font-weight: 950;
                        letter-spacing: 0;
                    }

                    .proof-carousel-summary strong {
                        color: #fff;
                        font-size: clamp(20px, 2.4vw, 28px);
                        line-height: 1.18;
                        font-weight: 950;
                        letter-spacing: 0;
                    }

                    .proof-carousel-summary small {
                        color: rgba(226,232,240,0.78);
                        font-size: 13px;
                        line-height: 1.55;
                    }

                    .proof-carousel-image-shell {
                        position: relative;
                        z-index: 2;
                        width: 100%;
                        height: 500px;
                        margin: 118px auto 42px;
                    }

                    .proof-carousel-image {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        height: 100%;
                        padding: 18px;
                        object-fit: contain;
                        object-position: center;
                        opacity: 0;
                        transform: translateX(16px) scale(0.985);
                        transition: opacity 420ms ease, transform 420ms ease;
                        filter: drop-shadow(0 22px 34px rgba(0,0,0,0.34));
                    }

                    .proof-carousel-image.active {
                        opacity: 1;
                        transform: translateX(0) scale(1);
                    }

                    .proof-carousel-dots {
                        position: absolute;
                        left: 0;
                        right: 0;
                        bottom: 17px;
                        z-index: 4;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 8px;
                    }

                    .proof-carousel-dots button {
                        width: 10px;
                        height: 10px;
                        padding: 0;
                        border: 0;
                        border-radius: 999px;
                        background: rgba(255,255,255,0.34);
                        cursor: pointer;
                        transition: width 180ms ease, background 180ms ease;
                    }

                    .proof-carousel-dots button.active {
                        width: 38px;
                        background: #ffd84d;
                    }

                    @media (max-width: 900px) {
                        .proof-carousel {
                            min-height: 600px;
                            padding: 14px;
                        }

                        .proof-carousel-stage {
                            min-height: 570px;
                        }

                        .proof-carousel-image-shell {
                            height: 420px;
                            margin-top: 126px;
                        }
                    }

                    @media (max-width: 640px) {
                        .proof-carousel {
                            min-height: 500px;
                            padding: 10px;
                            border-radius: 12px;
                        }

                        .proof-carousel-stage {
                            min-height: 470px;
                        }

                        .proof-carousel-summary {
                            left: 10px;
                            top: 10px;
                            width: calc(100% - 20px);
                            padding: 12px;
                            gap: 4px;
                        }

                        .proof-carousel-summary strong {
                            font-size: 16px;
                            line-height: 1.3;
                        }

                        .proof-carousel-summary small {
                            font-size: 11px;
                        }

                        .proof-carousel-image-shell {
                            height: 300px;
                            margin-top: 126px;
                            border-radius: 10px;
                        }

                        .proof-carousel-image {
                            padding: 10px;
                        }

                        .proof-carousel-dots {
                            bottom: 16px;
                            gap: 6px;
                        }

                        .proof-carousel-dots button {
                            width: 8px;
                            height: 8px;
                        }

                        .proof-carousel-dots button.active {
                            width: 28px;
                        }
                    }
                `})]}):e.jsxs("section",{className:`proof-showcase${c?" proof-showcase-compact":""}${o?` ${o}`:""}`,"aria-label":"애드센스와 네이버 성과 인증",children:[e.jsxs("div",{className:"proof-showcase-copy",children:[e.jsx("span",{children:"PROOF"}),e.jsx("h3",{children:"성과 화면까지 같이 보면 구매 판단이 빨라집니다"}),e.jsx("p",{children:"애드센스 예상 수익과 기존 네이버 성과를 한 화면에 붙여, 자동화가 단순 기능이 아니라 운영 결과로 이어지는 느낌을 바로 줍니다."})]}),e.jsxs("div",{className:"proof-showcase-layout",children:[e.jsxs("figure",{className:"proof-feature-card",children:[e.jsx("img",{src:f.src,alt:f.title,loading:"lazy"}),e.jsxs("figcaption",{children:[e.jsx("span",{children:f.metric}),e.jsx("strong",{children:f.title}),e.jsx("small",{children:f.desc})]})]}),e.jsx("div",{className:"proof-mini-grid","aria-label":"애드센스 수익 인증",children:w.map(s=>e.jsxs("figure",{className:"proof-mini-card",children:[e.jsx("img",{src:s.src,alt:s.title,loading:"lazy"}),e.jsxs("figcaption",{children:[e.jsx("strong",{children:s.title}),e.jsx("small",{children:s.desc})]})]},s.src))}),e.jsx("div",{className:"proof-naver-row","aria-label":"네이버 성과 인증",children:O.map(s=>e.jsxs("figure",{className:"proof-naver-card",children:[e.jsx("img",{src:s.src,alt:s.title,loading:"lazy"}),e.jsxs("figcaption",{children:[e.jsx("span",{children:s.metric}),e.jsx("strong",{children:s.title})]})]},s.src))})]}),e.jsx("style",{children:`
                .proof-showcase {
                    width: 100%;
                    margin: 0 auto;
                    padding: clamp(22px, 3vw, 34px);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background:
                        linear-gradient(180deg, rgba(10,17,28,0.92), rgba(6,10,18,0.86)),
                        radial-gradient(circle at 15% 0%, rgba(68,215,182,0.12), transparent 34%);
                    box-shadow: 0 24px 80px rgba(0,0,0,0.30);
                    overflow: hidden;
                }

                .proof-showcase-copy {
                    max-width: 760px;
                    margin-bottom: 22px;
                }

                .proof-showcase-copy span {
                    display: inline-flex;
                    align-items: center;
                    min-height: 28px;
                    padding: 5px 13px;
                    border-radius: 999px;
                    border: 1px solid rgba(68,215,182,0.36);
                    background: rgba(68,215,182,0.13);
                    color: #84f2d7;
                    font-size: 12px;
                    font-weight: 950;
                    letter-spacing: 0;
                    margin-bottom: 14px;
                }

                .proof-showcase-copy h3 {
                    margin: 0 0 12px;
                    color: #fff;
                    font-size: clamp(26px, 3.2vw, 42px);
                    line-height: 1.18;
                    font-weight: 950;
                    letter-spacing: 0;
                }

                .proof-showcase-copy p {
                    margin: 0;
                    color: rgba(226,232,240,0.78);
                    font-size: 15px;
                    line-height: 1.8;
                }

                .proof-showcase-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1.12fr) minmax(300px, 0.88fr);
                    gap: 12px;
                    align-items: stretch;
                }

                .proof-feature-card,
                .proof-mini-card,
                .proof-naver-card {
                    min-width: 0;
                    margin: 0;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(12,18,28,0.72);
                    overflow: hidden;
                    box-shadow: 0 18px 48px rgba(0,0,0,0.20);
                }

                .proof-feature-card {
                    grid-row: span 2;
                }

                .proof-feature-card img {
                    width: 100%;
                    height: clamp(260px, 30vw, 360px);
                    display: block;
                    object-fit: cover;
                    object-position: center;
                    background: #0b1220;
                }

                .proof-feature-card figcaption,
                .proof-mini-card figcaption,
                .proof-naver-card figcaption {
                    display: grid;
                    gap: 5px;
                    padding: 13px 15px 15px;
                }

                .proof-feature-card span,
                .proof-naver-card span {
                    color: #5eead4;
                    font-size: 12px;
                    font-weight: 950;
                }

                .proof-feature-card strong {
                    color: #fff;
                    font-size: 20px;
                    font-weight: 950;
                    line-height: 1.25;
                }

                .proof-feature-card small,
                .proof-mini-card small {
                    color: rgba(203,213,225,0.70);
                    font-size: 13px;
                    line-height: 1.55;
                }

                .proof-mini-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }

                .proof-mini-card img {
                    width: 100%;
                    height: 126px;
                    display: block;
                    object-fit: cover;
                    object-position: center;
                    background: #0b1220;
                }

                .proof-mini-card strong,
                .proof-naver-card strong {
                    color: #fff;
                    font-size: 14px;
                    font-weight: 950;
                    line-height: 1.35;
                }

                .proof-naver-row {
                    grid-column: 1 / -1;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                }

                .proof-naver-card img {
                    width: 100%;
                    height: 180px;
                    display: block;
                    object-fit: contain;
                    object-position: center top;
                    padding: 10px;
                    background: rgba(0,0,0,0.24);
                }

                .proof-showcase-compact {
                    padding: 22px;
                }

                .proof-showcase-compact .proof-showcase-layout {
                    grid-template-columns: 1fr;
                }

                .proof-showcase-compact .proof-feature-card {
                    grid-row: auto;
                }

                .proof-showcase-compact .proof-feature-card img {
                    height: 218px;
                }

                .proof-showcase-compact .proof-mini-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .proof-showcase-compact .proof-naver-row {
                    grid-template-columns: 1fr;
                }

                .proof-showcase-compact .proof-naver-card img {
                    height: 136px;
                }

                .proof-showcase-compact .proof-showcase-copy h3 {
                    font-size: clamp(23px, 2.4vw, 30px);
                }

                @media (max-width: 900px) {
                    .proof-showcase-layout,
                    .proof-mini-grid,
                    .proof-naver-row,
                    .proof-showcase-compact .proof-mini-grid {
                        grid-template-columns: 1fr;
                    }

                    .proof-feature-card {
                        grid-row: auto;
                    }

                    .proof-feature-card img {
                        height: auto;
                        max-height: 360px;
                    }
                }

                @media (max-width: 640px) {
                    .proof-showcase {
                        padding: 18px 14px;
                        border-radius: 12px;
                    }

                    .proof-showcase-copy h3 {
                        font-size: 27px;
                        line-height: 1.25;
                    }

                    .proof-showcase-copy p {
                        font-size: 14px;
                        line-height: 1.65;
                    }

                    .proof-feature-card figcaption {
                        padding: 14px;
                    }

                    .proof-feature-card strong {
                        font-size: 18px;
                    }

                    .proof-feature-card img,
                    .proof-naver-card img,
                    .proof-showcase-compact .proof-naver-card img {
                        max-height: 260px;
                        object-fit: contain;
                        background: #08111c;
                    }
                }
            `})]})}const ne="live_ck_mBZ1gQ4YVX9M4BDM7a0Rrl2KPoqN",I="https://js.tosspayments.com/v2/standard",se={naver:[{id:"free-naver",name:"Better Life Naver 무료 체험",desc:"네이버 자동화 먼저 체험",amount:0,period:"무료",free:!0,badge:{text:"🎁 FREE",type:"trial"},features:["Better Life Naver 체험","AI 콘텐츠 생성","매일 2편 발행 제한","LEWORD·Orbit은 올인원 구매 후 이용"]},{id:"all-in-one-monthly",name:"올인원 1개월",desc:"3개 앱을 한 번에 가볍게 시작",amount:5e4,amountCard:55e3,futureAmount:1e5,futureAmountCard:11e4,eventLabel:"8월 1일부터 정상가 100,000원",period:"/ 월 (공급가)",features:["Better Life Naver 이용","LEWORD 키워드 분석 이용","Leadernam Orbit 이용","이메일 고객 지원"]},{id:"all-in-one-quarterly",name:"올인원 3개월",desc:"블로그 자동화 흐름을 안정적으로 운영",amount:12e4,futureAmount:24e4,eventLabel:"8월 1일부터 정상가 240,000원",period:"/ 3개월",monthly:"월 40,000원",features:["Better Life Naver 이용","LEWORD 전체 기능 이용","Leadernam Orbit 이용","우선 고객 지원"]},{id:"all-in-one-yearly",name:"올인원 1년",desc:"가장 합리적인 전체 제품 기간권",amount:4e5,futureAmount:8e5,eventLabel:"8월 1일부터 정상가 800,000원",period:"/ 년",monthly:"월 33,333원",badge:{text:"👑 BEST VALUE",type:"best"},features:["모든 자동화툴 기간 내 이용","라이선스 기간 내 업데이트","전용 커뮤니티 안내","1:1 우선 지원"]},{id:"all-in-one-lifetime",name:"올인원 영구제",desc:"한 번 구매로 장기 운영하는 영구 이용권",amount:165e4,futureAmount:33e5,eventLabel:"8월 1일부터 정상가 3,300,000원",period:"영구 이용",badge:{text:"🌟 LIFETIME",type:"lifetime"},features:["3개 앱 모두 영구 이용","영구제 전용 라이선스","장기 운영자 우선 지원","주요 업데이트 포함"]}]},b=[{title:"Better-Life-Naver 글발행 예시 영상",label:"네이버 자동 발행",desc:"키워드 입력부터 글 작성, 이미지 구성, 발행 흐름까지 실제 구매자가 가장 먼저 확인해야 할 장면입니다.",src:"/videos/pricing-showcase/better-life-naver-publish-demo.mp4"},{title:"LEADERNAM-Orbit 글 발행 영상",label:"Orbit 통합 발행",desc:"외부유입용 글 발행 흐름을 한 번에 확인합니다.",src:"/videos/pricing-showcase/leadernam-orbit-publish-demo.mp4"},{title:"LEADERNAM-Orbit 블로그스팟 발행 예시 영상",label:"블로그스팟",desc:"Blogger 채널에 글이 올라가는 실제 장면입니다.",src:"/videos/pricing-showcase/leadernam-orbit-blogspot-demo.mp4"},{title:"LEADERNAM-Orbit 워드프레스 발행 예시 영상",label:"워드프레스",desc:"WordPress 발행 채널을 운영하는 사용자를 위한 예시입니다.",src:"/videos/pricing-showcase/leadernam-orbit-wordpress-demo.mp4"},{title:"LEADERNAM-Orbit 티스토리 발행 예시 영상",label:"티스토리",desc:"Tistory 발행까지 연결되는 외부유입 운영 흐름입니다.",src:"/videos/pricing-showcase/leadernam-orbit-tistory-demo.mp4"}],de={naver:"ALL · Leaders Pro 올인원"},C=["naver"];function $(o,c=Date.now()){return B(o.amount,o.futureAmount,c)}function F(o,c=Date.now()){if(!o.amountCard)return $(o,c);const n=o.futureAmountCard??(o.futureAmount?Math.round(o.futureAmount*1.1):void 0);return B(o.amountCard,n,c)}function ce(o,c){const n=c?.pricing?.plans||{};return o.map(i=>{const t=n[i.id];return t?{...i,...t,features:Array.isArray(t.features)&&t.features.length>0?t.features:i.features,badge:t.badgeText?{...i.badge||{type:"best"},text:t.badgeText}:i.badge,free:i.free}:i})}let k=null;function le(){return typeof window<"u"&&window.TossPayments?Promise.resolve():k||(k=new Promise((o,c)=>{const n=document.querySelector(`script[src="${I}"]`);if(n){n.addEventListener("load",()=>o(),{once:!0}),n.addEventListener("error",()=>c(new Error("Toss SDK load failed")),{once:!0}),n.getAttribute("data-loaded")==="1"&&o();return}const i=document.createElement("script");i.src=I,i.async=!0,i.onload=()=>{i.setAttribute("data-loaded","1"),o()},i.onerror=()=>c(new Error("Toss SDK load failed")),document.head.appendChild(i)}),k)}const pe=()=>{const o=Date.now(),c=Math.random().toString(36).substring(2,8).toUpperCase();return`LP-${o}-${c}`};function fe(){const[o]=oe(),c=o.get("tab"),[n,i]=d.useState(C.includes(c)?c:"naver"),[t,f]=d.useState(null),[w,u]=d.useState(""),[s,m]=d.useState(!1),[x,N]=d.useState(!1),[A,_]=d.useState(()=>Date.now()),[L,U]=d.useState(null),E=d.useRef(null),[j,K]=d.useState(!1),D=d.useRef(null);d.useEffect(()=>{const r=document.title;return document.title="올인원 기간제 이용권 — Leaders Pro",()=>{document.title=r}},[]),d.useEffect(()=>{const r=()=>_(Date.now()),a=window.setInterval(r,6e4),l=Math.max(1e3,te-Date.now()+1e3),g=window.setTimeout(r,l);return()=>{window.clearInterval(a),window.clearTimeout(g)}},[]),d.useEffect(()=>{(async()=>{try{await le(),window.TossPayments&&(E.current=window.TossPayments(ne),K(!0))}catch(r){console.error("Toss SDK init failed:",r)}})()},[]),d.useEffect(()=>{re().then(U)},[]);const M=r=>{i(r),f(null)},H=r=>{if(r.free){window.location.href="/download";return}f(r),window.setTimeout(()=>{D.current?.scrollIntoView({behavior:"smooth",block:"center"})},50)},V=async()=>{if(!t||!E.current)return;const r=w.trim();if(!r||!r.includes("@")){m(!0),window.setTimeout(()=>m(!1),600);return}N(!0);try{const a=F(t),l="LP_"+r.replace(/[^a-zA-Z0-9]/g,"_")+"_"+Date.now(),g=pe(),v=window.location.origin,T=`${v}/success.html?email=${encodeURIComponent(r)}&productId=${encodeURIComponent(t.id)}&amount=${a}&orderName=${encodeURIComponent(t.name)}&customerKey=${encodeURIComponent(l)}&orderId=${encodeURIComponent(g)}`,S=`${v}/fail.html`;await E.current.payment({customerKey:l}).requestBillingAuth({method:"CARD",successUrl:T,failUrl:S})}catch(a){const l=a?.code||"",g=a?.message||String(a);console.error("[Toss requestBillingAuth] code:",l,"message:",g,a),l!=="USER_CANCEL"&&!g.includes("취소")&&alert(`결제창 호출 실패

code: ${l||"(없음)"}
message: ${g}

토스 콘솔에 successUrl(${window.location.origin}/success.html) 등록 여부를 확인해주세요.`),N(!1)}},X=(()=>{if(!t)return"플랜을 선택해주세요";const r=F(t),a=t.amountCard?" (VAT 포함)":"";return`${t.name} 시작 · 7일 환불 보장 · ${r.toLocaleString()}원${a}`})(),y=ie(A),q=ce(se[n],L),p=L?.pricing?.page||{},P=L?.theme?.pricingBgImage,Q=y?p.titleNormal||"8월 1일부터 가격이 단계적으로 조정 중입니다":p.title||"지금 이벤트가로 이용하고, 8월 1일부터 가격이 점진적으로 상승합니다",Y=y?p.eventTitleNormal||"가격이 단계적으로 조정 중입니다.":p.eventTitle||"현재 가격은 7월 31일까지 이벤트가입니다.",G=y?p.eventDescNormal||"2026년 8월 1일부터 가격이 점진적으로 상승하고 있습니다.":p.eventDesc||"2026년 8월 1일부터 가격이 점진적으로 상승합니다.",Z=e.jsxs("div",{style:{textAlign:"center",margin:"42px 0 36px"},children:[e.jsx("span",{style:{display:"inline-block",padding:"6px 16px",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:50,color:"#FFD700",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:16},children:p.eyebrow||"PRICING"}),e.jsx("h2",{style:{fontSize:"clamp(28px, 4vw, 42px)",fontWeight:900,marginBottom:12},children:Q}),e.jsx("p",{style:{color:"rgba(255,255,255,0.6)",fontSize:16},children:p.desc||"1개월·3개월·1년·영구제 모두 올인원 라이선스로 Better Life Naver, LEWORD, Leadernam Orbit을 함께 이용합니다."}),e.jsxs("div",{style:{margin:"20px auto 0",maxWidth:860,padding:"18px 24px",borderRadius:16,border:"1px solid rgba(255,215,0,0.34)",background:"rgba(255,215,0,0.10)",color:"#FFD700",fontSize:16,fontWeight:900,lineHeight:1.75,boxShadow:"0 12px 36px rgba(0,0,0,0.16)"},children:[e.jsx("div",{style:{fontSize:18,marginBottom:2},children:Y}),e.jsx("div",{children:G}),e.jsx("div",{style:{marginTop:4,color:"#fff7b0",fontSize:15},children:p.eventLine||"8월 1일부터 단계별 인상 예정 · 1개월 100,000원 · 3개월 240,000원 · 1년 800,000원 · 영구제 3,300,000원"})]})]});return e.jsx("div",{style:{position:"relative",zIndex:1,...P?{backgroundImage:`linear-gradient(rgba(5,8,12,0.34), rgba(5,8,12,0.50)), url(${P})`,backgroundSize:"cover",backgroundPosition:"center top",backgroundAttachment:"fixed"}:{}},children:e.jsxs("section",{className:"pricing-page-shell",style:{padding:"140px 20px 80px",maxWidth:1320,margin:"0 auto"},children:[e.jsxs("section",{className:"purchase-proof-showcase","aria-label":"실제 발행 영상과 수익 성과 인증",children:[e.jsxs("div",{className:"purchase-video-side",children:[e.jsx("div",{className:"purchase-section-eyebrow",children:"REAL WORKFLOW"}),e.jsx("h3",{children:"결제 전, 실제로 글이 발행되는 장면부터 확인하세요"}),e.jsx("p",{children:"Better Life Naver와 Leadernam Orbit이 실제로 글을 만들고 각 채널에 발행되는 과정을 영상으로 먼저 보여줍니다. 구매 페이지에서 기능이 말이 아니라 화면으로 증명되도록 배치했습니다."}),e.jsxs("article",{className:"purchase-main-video",children:[e.jsx("video",{src:b[0].src,controls:!0,muted:!0,loop:!0,playsInline:!0,preload:"metadata","aria-label":b[0].title}),e.jsxs("div",{children:[e.jsx("span",{children:b[0].label}),e.jsx("strong",{children:b[0].title}),e.jsx("p",{children:b[0].desc})]})]}),e.jsx("div",{className:"purchase-video-grid",children:b.slice(1).map(r=>e.jsxs("article",{className:"purchase-mini-video",children:[e.jsx("video",{src:r.src,controls:!0,muted:!0,playsInline:!0,preload:"metadata","aria-label":r.title}),e.jsxs("div",{children:[e.jsx("span",{children:r.label}),e.jsx("strong",{children:r.title})]})]},r.src))})]}),e.jsx(ae,{compact:!0,variant:"carousel",className:"purchase-proof-side"})]}),Z,e.jsx("div",{className:"pricing-product-tabs",style:{display:"flex",justifyContent:"center",gap:12,marginBottom:36,flexWrap:"wrap"},children:C.map(r=>e.jsx("button",{onClick:()=>M(r),style:{display:"flex",alignItems:"center",gap:8,padding:"12px 22px",borderRadius:50,cursor:"pointer",background:n===r?"linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,215,0,0.06))":"rgba(255,255,255,0.04)",border:n===r?"1px solid #FFD700":"1px solid rgba(255,255,255,0.08)",color:n===r?"#FFD700":"rgba(255,255,255,0.7)",fontWeight:700,fontSize:14},children:p.tabLabel||de[r]},r))}),e.jsx("style",{children:`
                    .purchase-proof-showcase {
                        display: grid;
                        grid-template-columns: minmax(0, 1.18fr) minmax(360px, 0.82fr);
                        gap: 18px;
                        align-items: stretch;
                        margin: 0 0 34px;
                    }

                    .purchase-video-side {
                        border-radius: 18px;
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: linear-gradient(180deg, rgba(12, 18, 31, 0.88), rgba(9, 13, 22, 0.74));
                        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
                        padding: 22px;
                        overflow: hidden;
                    }

                    .purchase-section-eyebrow {
                        display: inline-flex;
                        align-items: center;
                        min-height: 28px;
                        padding: 5px 12px;
                        border-radius: 999px;
                        background: rgba(56, 189, 248, 0.12);
                        border: 1px solid rgba(56, 189, 248, 0.28);
                        color: #7dd3fc;
                        font-size: 12px;
                        font-weight: 900;
                        letter-spacing: 0;
                        margin-bottom: 12px;
                    }

                    .purchase-section-eyebrow.proof {
                        background: rgba(68, 215, 182, 0.12);
                        border-color: rgba(68, 215, 182, 0.30);
                        color: #8af5dd;
                    }

                    .purchase-video-side h3 {
                        margin: 0 0 8px;
                        color: #fff;
                        font-size: clamp(22px, 2.4vw, 30px);
                        line-height: 1.25;
                        font-weight: 950;
                        letter-spacing: 0;
                    }

                    .purchase-video-side > p {
                        margin: 0 0 18px;
                        color: rgba(226, 232, 240, 0.74);
                        font-size: 14px;
                        line-height: 1.75;
                    }

                    .purchase-main-video {
                        display: grid;
                        grid-template-columns: minmax(0, 1.22fr) minmax(220px, 0.78fr);
                        gap: 16px;
                        align-items: stretch;
                        padding: 14px;
                        border-radius: 14px;
                        border: 1px solid rgba(56, 189, 248, 0.18);
                        background: rgba(2, 6, 23, 0.62);
                    }

                    .purchase-main-video video,
                    .purchase-mini-video video {
                        width: 100%;
                        display: block;
                        border-radius: 10px;
                        background: #000;
                        aspect-ratio: 16 / 9;
                        object-fit: cover;
                    }

                    .purchase-main-video div {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        min-width: 0;
                    }

                    .purchase-main-video span,
                    .purchase-mini-video span {
                        color: #7dd3fc;
                        font-size: 12px;
                        font-weight: 900;
                        margin-bottom: 7px;
                    }

                    .purchase-main-video strong,
                    .purchase-mini-video strong {
                        color: #fff;
                        font-size: 18px;
                        line-height: 1.35;
                        font-weight: 900;
                    }

                    .purchase-main-video p {
                        margin: 10px 0 0;
                        color: rgba(203, 213, 225, 0.76);
                        font-size: 13px;
                        line-height: 1.65;
                    }

                    .purchase-video-grid {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 12px;
                        margin-top: 14px;
                    }

                    .purchase-mini-video {
                        padding: 10px;
                        border-radius: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        background: rgba(15, 23, 42, 0.56);
                    }

                    .purchase-mini-video div {
                        display: flex;
                        flex-direction: column;
                        margin-top: 10px;
                    }

                    .purchase-mini-video strong {
                        font-size: 12px;
                    }

                    .adsense-proof-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 10px;
                    }

                    .adsense-proof-card,
                    .naver-proof-strip figure {
                        margin: 0;
                        border-radius: 12px;
                        border: 1px solid rgba(255, 255, 255, 0.10);
                        background: rgba(15, 23, 42, 0.62);
                        overflow: hidden;
                    }

                    .adsense-proof-card.featured {
                        grid-column: span 2;
                    }

                    .adsense-proof-card img,
                    .naver-proof-strip img {
                        display: block;
                        width: 100%;
                        height: 118px;
                        object-fit: cover;
                        background: #0f172a;
                    }

                    .adsense-proof-card.featured img {
                        height: 190px;
                    }

                    .adsense-proof-card figcaption {
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        padding: 10px 12px 12px;
                    }

                    .adsense-proof-card strong,
                    .naver-proof-strip figcaption {
                        color: #fff;
                        font-size: 13px;
                        font-weight: 900;
                        line-height: 1.35;
                    }

                    .adsense-proof-card span {
                        color: rgba(203, 213, 225, 0.70);
                        font-size: 12px;
                        line-height: 1.4;
                    }

                    .naver-proof-strip {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 10px;
                        margin-top: 12px;
                    }

                    .naver-proof-strip img {
                        height: 82px;
                    }

                    .naver-proof-strip figcaption {
                        padding: 8px 10px 10px;
                        color: #8af5dd;
                        font-size: 11px;
                    }

                    .pricing-plan-grid {
                        display: grid;
                        grid-template-columns: repeat(5, minmax(0, 1fr));
                        gap: 18px;
                    }
                    @media (max-width: 1180px) {
                        .purchase-proof-showcase {
                            grid-template-columns: 1fr;
                        }

                        .pricing-plan-grid {
                            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                        }
                    }
                    @media (max-width: 860px) {
                        .purchase-video-side {
                            padding: 16px;
                        }

                        .purchase-main-video {
                            grid-template-columns: 1fr;
                        }

                        .purchase-video-grid,
                        .adsense-proof-grid,
                        .naver-proof-strip {
                            grid-template-columns: 1fr;
                        }

                        .adsense-proof-card.featured {
                            grid-column: auto;
                        }
                    }

                    @media (max-width: 640px) {
                        .pricing-page-shell {
                            padding: 104px 12px 54px !important;
                        }

                        .purchase-proof-showcase {
                            gap: 14px;
                            margin-bottom: 24px;
                        }

                        .purchase-video-side {
                            padding: 14px;
                            border-radius: 12px;
                        }

                        .purchase-section-eyebrow {
                            min-height: 26px;
                            font-size: 11px;
                        }

                        .purchase-video-side h3 {
                            font-size: 24px;
                        }

                        .purchase-video-side > p {
                            font-size: 13px;
                            line-height: 1.65;
                        }

                        .purchase-main-video {
                            padding: 10px;
                            gap: 12px;
                        }

                        .purchase-main-video strong {
                            font-size: 16px;
                        }

                        .pricing-product-tabs {
                            display: grid !important;
                            grid-template-columns: 1fr 1fr;
                            gap: 8px !important;
                            margin-bottom: 24px !important;
                        }

                        .pricing-product-tabs button {
                            width: 100%;
                            min-height: 44px;
                            justify-content: center;
                            padding: 10px 12px !important;
                            font-size: 13px !important;
                        }

                        .pricing-plan-grid {
                            grid-template-columns: 1fr !important;
                            gap: 14px;
                        }
                    }

                    @media (max-width: 420px) {
                        .pricing-product-tabs {
                            grid-template-columns: 1fr;
                        }
                    }
                `}),e.jsx("div",{className:"pricing-plan-grid",children:q.map(r=>{const a=t?.id===r.id,l=r.badge?.type==="best",g=r.free,v=$(r,A),T=F(r,A),S=!y&&!!r.futureAmount&&!r.free,W=y&&!!r.futureAmount&&!r.free;return e.jsxs("div",{onClick:()=>H(r),style:{background:a?"linear-gradient(180deg, rgba(255,215,0,0.10), rgba(18,18,26,0.85))":l?"linear-gradient(180deg, rgba(255,215,0,0.04), rgba(18,18,26,0.7))":"rgba(18,18,26,0.6)",border:a?"2px solid #FFD700":l?"1px solid rgba(255,215,0,0.5)":"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:"28px 22px",cursor:"pointer",transition:"all 0.25s",position:"relative",textAlign:"center"},children:[r.badge&&e.jsx("div",{style:{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:r.badge.type==="best"?"linear-gradient(135deg, #FFD700, #FFA500)":r.badge.type==="lifetime"?"linear-gradient(135deg, #A78BFA, #7C3AED)":"linear-gradient(135deg, #44d7b6, #2bb89c)",color:r.badge.type==="trial"?"#0a0a0f":"#000",padding:"4px 14px",borderRadius:50,fontSize:11,fontWeight:800,letterSpacing:.5,whiteSpace:"nowrap"},children:r.badge.text}),e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("h3",{style:{fontSize:18,fontWeight:800,marginBottom:4},children:r.name}),e.jsx("p",{style:{fontSize:12,color:"rgba(255,255,255,0.5)"},children:r.desc})]}),e.jsxs("div",{style:{marginBottom:10},children:[S&&r.futureAmount&&e.jsxs("div",{style:{fontSize:13,color:"rgba(255,255,255,0.45)",textDecoration:"line-through",marginBottom:4},children:["정상가 ",r.futureAmount.toLocaleString(),"원"]}),e.jsx("span",{style:{fontSize:28,fontWeight:900,background:"linear-gradient(135deg, #FFD700, #FFA500)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},children:r.free?"0":v.toLocaleString()}),e.jsx("span",{style:{fontSize:14,color:"rgba(255,255,255,0.55)",marginLeft:4},children:(r.free,"원")}),S&&r.eventLabel&&e.jsxs("div",{style:{margin:"10px auto 0",display:"inline-flex",flexDirection:"column",alignItems:"center",gap:2,padding:"7px 12px",borderRadius:14,background:"rgba(255,215,0,0.12)",border:"1px solid rgba(255,215,0,0.26)",color:"#FFD700",fontSize:12,fontWeight:900,lineHeight:1.35},children:[e.jsx("span",{children:"지금 이벤트가"}),e.jsx("span",{style:{color:"#fff7b0",fontSize:11},children:r.eventLabel})]}),W&&e.jsx("div",{style:{margin:"10px auto 0",display:"inline-flex",padding:"7px 12px",borderRadius:14,background:"rgba(68,215,182,0.12)",border:"1px solid rgba(68,215,182,0.28)",color:"#8af5dd",fontSize:12,fontWeight:900},children:"정상가 적용 중"})]}),e.jsxs("div",{style:{fontSize:12,color:"rgba(255,255,255,0.55)",marginBottom:4},children:[r.period,r.monthly&&e.jsxs("span",{style:{display:"block",color:"#FFD700",marginTop:4},children:["(",r.monthly,")"]})]}),r.amountCard&&e.jsxs("div",{style:{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:6,lineHeight:1.6},children:["카드 ",e.jsxs("strong",{style:{color:"rgba(255,255,255,0.75)"},children:[T.toLocaleString(),"원"]})," ",e.jsx("span",{style:{opacity:.7},children:"(VAT 10%)"}),e.jsx("br",{}),"계좌이체 ",e.jsxs("strong",{style:{color:"rgba(255,255,255,0.75)"},children:[v.toLocaleString(),"원"]})]}),e.jsx("ul",{style:{listStyle:"none",textAlign:"left",marginTop:18,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"},children:r.features.map((J,ee)=>e.jsxs("li",{style:{padding:"5px 0",fontSize:12,color:"rgba(255,255,255,0.75)",display:"flex",gap:8},children:[e.jsx("span",{style:{color:l?"#FFD700":"#44d7b6",fontWeight:700},children:"✓"}),J]},ee))}),e.jsx("div",{style:{marginTop:18,padding:"10px 16px",borderRadius:10,background:g?"linear-gradient(135deg, rgba(68,215,182,0.2), rgba(68,215,182,0.05))":a?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.05)",color:g?"#44d7b6":a?"#000":"rgba(255,255,255,0.85)",fontSize:13,fontWeight:700,border:g?"1px solid rgba(68,215,182,0.4)":"none"},children:g?"🚀 체험하기 (다운로드)":a?"✓ 선택됨":"선택하기"})]},r.id)})}),e.jsx("div",{style:{maxWidth:720,margin:"36px auto 18px",padding:"18px 22px",background:"rgba(255,255,255,0.95)",borderRadius:14,boxShadow:"0 6px 22px rgba(0,0,0,0.14)"},children:e.jsxs("div",{style:{display:"flex",justifyContent:"space-around",gap:12,flexWrap:"wrap",alignItems:"center"},children:[e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#c9a84c"},children:"⭐ 4.9 / 5"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"실사용 후기 기반"})]}),e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#14304d"},children:"2,847명"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"현재 활성 사용자"})]}),e.jsxs("div",{style:{textAlign:"center",minWidth:90},children:[e.jsx("div",{style:{fontSize:22,fontWeight:800,color:"#44d7b6"},children:"🛡️ 7일 환불"}),e.jsx("div",{style:{fontSize:12,color:"#5b6b7a",marginTop:2},children:"미사용 시 전액 환불"})]})]})}),e.jsxs("div",{ref:D,style:{maxWidth:720,margin:"0 auto",padding:"28px 24px",background:"rgba(18,18,26,0.7)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,215,0,0.15)",borderRadius:18},children:[e.jsxs("label",{style:{display:"block",marginBottom:8,color:"#FFD700",fontSize:14,fontWeight:700},children:["📧 ",p.paymentEmailLabel||"라이선스를 받을 이메일"]}),e.jsx("input",{type:"email",value:w,onChange:r=>u(r.target.value),placeholder:"example@email.com",style:{width:"100%",padding:"14px 16px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box",animation:s?"shakePay 0.4s":"none"}}),e.jsx("p",{style:{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:6,marginBottom:14},children:p.paymentEmailHelp||"결제 완료 후 이 이메일로 올인원 라이선스 코드가 발송됩니다."}),e.jsxs("button",{onClick:V,disabled:!t||x||!j,style:{width:"100%",padding:18,borderRadius:14,border:"none",background:t&&j&&!x?"linear-gradient(135deg, #FFD700, #FFA500)":"rgba(255,255,255,0.08)",color:t&&j&&!x?"#000":"rgba(255,255,255,0.4)",fontSize:16,fontWeight:800,cursor:t&&j&&!x?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[x&&e.jsx("span",{style:{width:16,height:16,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spinPay 0.8s linear infinite"}}),e.jsx("span",{children:x?"결제 중...":X})]}),e.jsx("p",{style:{textAlign:"center",color:"#c9a84c",fontSize:13,marginTop:10,lineHeight:1.7},children:(p.paymentNote||`구매 시 올인원 코드 1개가 발급되며, 이용 기간 안에서 네이버 자동화툴·LEWORD·Leaders Orbit을 함께 사용할 수 있습니다.
무료 다운로드 체험은 Better Life Naver 기준이며, LEWORD·Orbit은 올인원 구매 후 함께 이용합니다.`).split(`
`).map((r,a,l)=>e.jsxs(d.Fragment,{children:[r,a<l.length-1?e.jsx("br",{}):null]},`${r}-${a}`))}),e.jsxs("p",{style:{textAlign:"center",color:"rgba(255,255,255,0.45)",fontSize:12,marginTop:8},children:["결제 진행 시 ",e.jsx(z,{to:"/terms",style:{color:"#FFD700"},children:"이용약관"})," 및 ",e.jsx(z,{to:"/privacy",style:{color:"#FFD700"},children:"개인정보처리방침"}),"에 동의하는 것으로 간주됩니다."]}),e.jsxs("details",{style:{marginTop:16,padding:"12px 16px",background:"rgba(20,48,77,0.15)",borderRadius:10,border:"1px solid rgba(255,255,255,0.06)"},children:[e.jsx("summary",{style:{cursor:"pointer",fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.8)"},children:"❓ 결제 전 자주 묻는 질문"}),e.jsxs("div",{style:{marginTop:12,fontSize:13,lineHeight:1.7,color:"rgba(255,255,255,0.65)"},children:[e.jsxs("p",{style:{marginBottom:10},children:[e.jsx("strong",{children:"Q. 결제 정보는 안전한가요?"}),e.jsx("br",{}),"토스페이먼츠(Toss Payments) 공식 PG를 통해 처리됩니다. 카드 정보가 저희 서버에 저장되지 않으며, 토스 보안 인증을 거칩니다."]}),e.jsxs("p",{style:{marginBottom:10},children:[e.jsx("strong",{children:"Q. 환불이 정말 가능한가요?"}),e.jsx("br",{}),"라이선스 발급 후 7일 이내·서비스 미사용 시 전액 환불됩니다. 카카오톡 1:1 상담으로 즉시 신청 가능합니다."]}),e.jsxs("p",{style:{margin:0},children:[e.jsx("strong",{children:"Q. 사용법이 어렵지 않나요?"}),e.jsx("br",{}),"설치 후 키워드만 입력하면 AI가 자동으로 글·이미지·발행까지 처리합니다. 처음 5분 안내 영상 제공 + 카카오톡 무료 지원 포함."]})]})]})]}),e.jsxs("div",{style:{maxWidth:920,margin:"28px auto 0",padding:"26px 24px",background:"linear-gradient(135deg, rgba(124,58,237,0.10), rgba(18,18,26,0.78))",border:"1px solid rgba(167,139,250,0.28)",borderRadius:18},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:20},children:[e.jsx("span",{style:{display:"inline-flex",padding:"5px 12px",borderRadius:8,border:"1px solid rgba(167,139,250,0.42)",color:"#A78BFA",fontSize:12,fontWeight:900,marginBottom:12},children:"LIFETIME ONLY"}),e.jsx("h3",{style:{fontSize:24,fontWeight:900,marginBottom:8},children:"개별 제품은 영구제만 별도 문의로 구매 가능합니다"}),e.jsx("p",{style:{color:"rgba(255,255,255,0.62)",fontSize:14,lineHeight:1.7,margin:0},children:"기간제는 올인원 코드로 구매하고, 특정 제품만 영구제로 쓰고 싶을 때는 1:1 문의로 발급합니다."})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(210px, 1fr))",gap:12},children:[["Better Life Naver","개별 영구제","별도 문의"],["Leadernam Orbit","개별 영구제","별도 문의"],["LEWORD","개별 영구제","별도 문의"]].map(([r,a,l])=>e.jsxs("article",{style:{padding:18,borderRadius:12,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)"},children:[e.jsx("strong",{style:{display:"block",color:"#fff",fontSize:16,marginBottom:6},children:r}),e.jsx("span",{style:{display:"block",color:"#A78BFA",fontSize:13,fontWeight:800,marginBottom:8},children:a}),e.jsx("b",{style:{color:"#FFD700",fontSize:22},children:l})]},r))}),e.jsx("div",{style:{textAlign:"center",marginTop:18},children:e.jsx("a",{href:"https://open.kakao.com/o/sPcaslwh",target:"_blank",rel:"noopener noreferrer",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:46,padding:"12px 22px",borderRadius:10,background:"linear-gradient(135deg, #FEE500, #F5D100)",color:"#3C1E1E",fontSize:14,fontWeight:900,textDecoration:"none"},children:"개별 영구제 문의하기"})})]}),e.jsxs("div",{style:{maxWidth:720,margin:"14px auto 0",padding:"12px 20px",background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,fontSize:13,color:"rgba(255,255,255,0.75)",textAlign:"center"},children:["💡 라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다."," ",e.jsx(z,{to:"/refund",style:{color:"#FFD700"},children:"환불정책 자세히 보기 →"})]}),e.jsxs("div",{style:{maxWidth:720,margin:"12px auto 0",padding:"12px 20px",background:"linear-gradient(135deg, rgba(68,215,182,0.08), rgba(68,215,182,0.02))",border:"1px solid rgba(68,215,182,0.3)",borderRadius:10,fontSize:13,color:"rgba(255,255,255,0.75)",textAlign:"center"},children:["🏦 카드 결제가 어려우신가요?"," ",e.jsx(z,{to:"/bank-order",style:{color:"#44d7b6"},children:"계좌이체로 결제하기 →"})]}),e.jsx("style",{children:`
                    @keyframes shakePay{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
                    @keyframes spinPay{to{transform:rotate(360deg)}}
                `})]})})}export{fe as default};
