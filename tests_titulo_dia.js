const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const falhas=[];
 for(const [w,h] of [[390,844],[1280,800]]){
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
  const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
  const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
  await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(2500);
  const r=await p.evaluate(()=>[...document.querySelectorAll('#minhaGradeContainer .day-header, .day-header.dia-semana')].map(e=>e.innerText.replace(/\n/g,' | ')));
  console.log(w,JSON.stringify(r.slice(0,4)));
  await p.evaluate(()=>{const e=document.querySelector('.day-header.dia-semana');e&&e.scrollIntoView()});
  await p.waitForTimeout(3500);await p.evaluate(()=>{const e=[...document.querySelectorAll('.day-header.dia-semana')][1];window.scrollTo(0,e.getBoundingClientRect().top+scrollY-140)});await p.waitForTimeout(300);await p.screenshot({path:'dia_'+w+'.png'});
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1); if(!sw) falhas.push('rolagem lateral '+w);
  await ctx.close();
 }
 console.log('FALHAS',falhas); await b.close();
})();
