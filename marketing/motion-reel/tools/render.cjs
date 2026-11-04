// 使い方: node render.cjs <html> <out.mp4> [fps] [秒] | node render.cjs <html> --stills t1,t2,...
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const path=require('path'); const fs=require('fs');
(async()=>{
  const [html,out,third]=process.argv.slice(2);
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  await p.goto('file://'+path.resolve(html)); await p.evaluate(()=>document.fonts.ready);
  if(out==='--stills'){ for(const t of third.split(',')){ await p.evaluate(t=>seek(+t),t); await p.screenshot({path:`still_${t}.jpg`,type:'jpeg',quality:92}); } await b.close(); return; }
  const fps=+(process.argv[4]||30), dur=+(process.argv[5]||15), n=Math.round(fps*dur), tmp=out.replace(/\.mp4$/,'.part.mp4');
  const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r',String(fps),tmp],{stdio:['pipe','inherit','inherit']});
  for(let i=0;i<n;i++){ await p.evaluate(t=>seek(t),i/fps); const buf=await p.screenshot({type:'jpeg',quality:92}); if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r)); }
  ff.stdin.end(); const code=await new Promise(r=>ff.on('close',r)); await b.close();
  if(code===0){ fs.renameSync(tmp,out); console.log('ok',out); } else { console.error('ffmpeg failed',code); process.exit(1); }
})();
