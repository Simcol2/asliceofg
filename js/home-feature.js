// Home page rotating feature. Rotates every 7 seconds; stops for hover, keyboard focus,
// the Pause button, a hidden tab, or a reduced-motion preference.
(function(){
  const root=document.getElementById('home-feature');if(!root)return;
  const slides=[...root.querySelectorAll('.hf-slide')];
  const dots=document.getElementById('hf-dots');const pause=document.getElementById('hf-pause');
  const INTERVAL=7000;let index=0,timer=null,userPaused=false,hovering=false;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function show(next,announce){
    index=(next+slides.length)%slides.length;
    slides.forEach((slide,i)=>{slide.hidden=i!==index;slide.classList.toggle('is-active',i===index);});
    dots.querySelectorAll('button').forEach((dot,i)=>dot.setAttribute('aria-current',String(i===index)));
    // Only announce changes the visitor asked for, never the automatic ones.
    document.getElementById('hf-track').setAttribute('aria-live',announce?'polite':'off');
  }
  function stop(){clearInterval(timer);timer=null;}
  function start(){stop();if(userPaused||hovering||reduced.matches||document.hidden||slides.length<2)return;timer=setInterval(()=>show(index+1,false),INTERVAL);}
  function setPaused(value){userPaused=value;pause.setAttribute('aria-pressed',String(value));pause.textContent=value?'Play':'Pause';start();}
  slides.forEach((slide,i)=>{
    const dot=document.createElement('button');dot.type='button';dot.className='hf-dot';
    dot.setAttribute('aria-label',`Show feature ${i+1} of ${slides.length}`);
    dot.addEventListener('click',()=>{show(i,true);start();});dots.appendChild(dot);
  });
  document.getElementById('hf-prev').addEventListener('click',()=>{show(index-1,true);start();});
  document.getElementById('hf-next').addEventListener('click',()=>{show(index+1,true);start();});
  pause.addEventListener('click',()=>setPaused(!userPaused));
  root.addEventListener('mouseenter',()=>{hovering=true;stop();});
  root.addEventListener('mouseleave',()=>{hovering=false;start();});
  root.addEventListener('focusin',()=>{hovering=true;stop();});
  root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget)){hovering=false;start();}});
  document.addEventListener('visibilitychange',start);
  reduced.addEventListener?.('change',start);
  if(reduced.matches){pause.hidden=true;}
  show(0,false);start();
})();
