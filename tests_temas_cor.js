const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const falhas=[]; const temas=['ifs','terracota','verde','azul','ifsid','sertao','litoral','bordo','grafite','escuro'];
 for(const [w,h,tag] of [[390,780,'m'],[1280,760,'d']]){
  for(const t of temas){
   const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500,serviceWorkers:'block'});
   await ctx.addInitScript((t)=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec'); localStorage.setItem('IFS_TEMA',t);},t);
   const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push(e.message));
   await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
   const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
   await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(2800);
   if(tag==='m'&&t==='terracota'){ /* teste do seletor */ }
   await p.screenshot({path:`tema/${tag}_${t}.png`});
   if(tag==='m'){ // modal de configurações
     await p.evaluate(()=>abrirModalConfig()); await p.waitForTimeout(500);
     await p.screenshot({path:`tema/cfg_${t}.png`});
   }
   const th=await p.evaluate(()=>document.querySelector('meta[name=theme-color]').content+' '+(document.documentElement.dataset.tema||'ifs'));
   console.log(tag,t,th);
   await ctx.close();
  }
 }
 // clique no seletor persiste
 const ctx=await b.newContext({viewport:{width:390,height:780},isMobile:true,serviceWorkers:'block'});
 await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
 const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push(e.message));
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
 const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
 await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(2500);
 await p.evaluate(()=>abrirModalConfig()); await p.waitForTimeout(400);
 await p.click('.tema-bolinha[data-tema-id=azul]'); await p.waitForTimeout(300);
 if(await p.evaluate(()=>document.documentElement.dataset.tema)!=='azul') falhas.push('não aplicou azul');
 await p.reload(); await p.waitForTimeout(1500);
 if(await p.evaluate(()=>document.documentElement.dataset.tema)!=='azul') falhas.push('não persistiu');
 console.log('FALHAS',falhas); await b.close();
})();
