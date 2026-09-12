'use strict';
(()=>{
const labels={all:'전체',kid:'유아',elem:'초등',family:'가족',adult:'어른'};
// Simple, explicit audience labels replace the exploratory icon set.
for(const b of document.querySelectorAll('[data-audience]')){b.textContent=labels[b.dataset.audience];b.setAttribute('aria-label',labels[b.dataset.audience]+' 프로그램');b.removeAttribute('title');}
const heading=document.querySelector('.section-heading h2');heading.setAttribute('aria-live','polite');
const gallery=document.querySelector('.hero-gallery'),photos=[...gallery.querySelectorAll('img')],dots=[...gallery.querySelectorAll('[data-slide]')],pause=document.querySelector('#gallery-pause'),motion=matchMedia('(prefers-reduced-motion: reduce)');
let index=0,paused=motion.matches,timer;
function show(i){index=i;photos.forEach((p,n)=>{p.classList.toggle('is-current',n===i);p.setAttribute('aria-hidden',String(n!==i));});dots.forEach((d,n)=>d.setAttribute('aria-pressed',String(n===i)));}
function schedule(){clearInterval(timer);pause.textContent=paused?'▶':'Ⅱ';pause.setAttribute('aria-label',paused?'사진 자동 전환 시작':'사진 자동 전환 일시정지');if(!paused&&!document.hidden)timer=setInterval(()=>show((index+1)%2),6000);}
dots.forEach(d=>d.onclick=()=>{show(Number(d.dataset.slide));paused=true;schedule();});pause.onclick=()=>{paused=!paused;schedule();};gallery.addEventListener('focusin',e=>{if(e.target!==pause){paused=true;schedule();}});document.addEventListener('visibilitychange',schedule);motion.addEventListener('change',()=>{paused=motion.matches;schedule();});schedule();
})();
