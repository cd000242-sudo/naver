import{j as i}from"./index-B9ObNxJ8.js";import{c as d,r as x}from"./router-BCNeJdl_.js";function p({image:e,onClose:o}){return d.useEffect(()=>{if(!e)return;const r=document.body.style.overflow,t=a=>{a.key==="Escape"&&o()};return document.body.style.overflow="hidden",window.addEventListener("keydown",t),()=>{document.body.style.overflow=r,window.removeEventListener("keydown",t)}},[e,o]),!e||typeof document>"u"?null:x.createPortal(i.jsxs("div",{className:"image-lightbox-backdrop",role:"dialog","aria-modal":"true","aria-label":e.title||e.alt,onClick:o,children:[i.jsx("style",{children:`
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
            `}),i.jsxs("div",{className:"image-lightbox-panel",onClick:r=>r.stopPropagation(),children:[i.jsx("button",{type:"button",className:"image-lightbox-close",onClick:o,"aria-label":"이미지 닫기",children:"×"}),i.jsx("div",{className:"image-lightbox-scroll",children:i.jsx("img",{src:e.src,alt:e.alt})}),e.title?i.jsx("div",{className:"image-lightbox-title",children:e.title}):null]})]}),document.body)}function u({src:e,alt:o,title:r,loading:t="lazy",className:a,imgClassName:g,imgStyle:s,buttonStyle:b}){const[c,l]=d.useState(null),n=r||o;return i.jsxs(i.Fragment,{children:[i.jsx("button",{type:"button",className:a,"aria-label":`${n} 크게 보기`,onClick:()=>l({src:e,alt:o,title:n}),style:{width:"100%",padding:0,border:0,background:"transparent",display:"block",cursor:"zoom-in",lineHeight:0,textAlign:"inherit",...b},children:i.jsx("img",{src:e,alt:o,loading:t,className:g,style:s})}),i.jsx(p,{image:c,onClose:()=>l(null)})]})}export{u as Z};
