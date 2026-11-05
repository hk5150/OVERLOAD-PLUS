(async function(){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const leaf=(t)=>[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()===t);
  const part=(t)=>[...document.querySelectorAll('*')].filter(e=>e.children.length<=1&&e.textContent.trim().startsWith(t));
  const dot=(el)=>{const r=el.getBoundingClientRect();const d=document.createElement('div');d.style.cssText=`position:fixed;left:${r.left+r.width/2-22}px;top:${r.top+r.height/2-22}px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.4);border:2px solid rgba(255,255,255,.8);z-index:99999;pointer-events:none;transition:opacity .45s,transform .45s`;document.body.appendChild(d);setTimeout(()=>{d.style.opacity=0;d.style.transform='scale(1.5)'},260);setTimeout(()=>d.remove(),800)};
  const tap=async(t,last)=>{let a=leaf(t);if(!a.length)a=part(t);const e=last?a[a.length-1]:a[0];if(!e)return false;dot(e);await sleep(260);e.click();return true};
  const setv=async(i,v)=>{const e=document.querySelectorAll('input')[i];dot(e);await sleep(260);const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));await sleep(350)};
  const rir=async(i,v)=>{let e=document.querySelectorAll('input')[i];while(e&&![...e.querySelectorAll('*')].some(x=>x.children.length===0&&x.textContent.trim()==='3+'))e=e.parentElement;const bs=[...e.querySelectorAll('button')].filter(x=>x.textContent.trim()===v);const b=bs[bs.length-1];dot(b);await sleep(260);b.click();await sleep(300)};
  const anchor=(t,y)=>{const a=part(t);if(!a.length)return;window.scrollBy(0,a[0].getBoundingClientRect().top-y)};
  // 待機中に一度だけ「記録」タブへ
  for(let i=0;i<80&&!part('この内容で記録を開始').length&&!leaf('スキップ').length&&!part('タップして記録を始める').length;i++)await sleep(250);
  await sleep(300);
  if(leaf('スキップ').length){await tap('スキップ');await sleep(800);}
  if(part('タップして記録を始める').length){await tap('タップして記録を始める');await sleep(1200);}
  window.scrollTo(0,0);
  const t0=Date.now(); const at=async(s)=>{const w=t0+s*1000-Date.now();if(w>0)await sleep(w)};
  // 10: 今日のセッションとメニュー(前半は上、後半で全種目が見える位置へ)
  await at(5.0); window.scrollTo({top:300,behavior:'smooth'});
  await at(10.6); await tap('この内容で記録を開始',true);
  // 11: 記録の画面
  await at(12.0); {const a=part('前回 10/');if(a.length)window.scrollBy({top:a[0].getBoundingClientRect().top-178,behavior:'smooth'});}
  // 12: 1セット目の余力を入れる
  await at(18.9); await rir(2,'1');
  await at(20.3); await tap('閉じる'); await sleep(250); anchor('推定1RM',178); anchor('前回 10/',178);
  // 13: 2セット目で重さを上げて、自己ベストを超える
  await at(23.2); await setv(4,'65'); await setv(5,'9'); await rir(4,'1');
  await at(27.0); await tap('閉じる'); await sleep(250); anchor('推定1RM',178);
  // 14: 3セット目は自分で決める
  await at(31.5); await setv(6,'65'); await setv(7,'8');
  // 15: 無料の残り
  await at(35.2); await tap('分割',true); await sleep(400); window.scrollTo(0,0);
})();
