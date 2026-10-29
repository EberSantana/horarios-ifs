const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE='http://localhost:8765'; const falhas=[]; let ok=0;
const t=(n,c,x)=>{ if(c) ok++; else falhas.push(n+(x!==undefined?' → '+JSON.stringify(x):'')); };
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const w of [320,360,390,412,430]){
  const ctx=await b.newContext({viewport:{width:w,height:800},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
  const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push('erro JS '+e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(800);
  const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
  await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(2500);
  const r=await p.evaluate(()=>{const nav=document.querySelector('.tab-navigation');const bs=[...nav.querySelectorAll('.tab-btn')].filter(b=>b.offsetParent);
   return {n:bs.length,navOver:nav.scrollWidth>nav.clientWidth+1,cortados:bs.filter(b=>{const l=b.querySelector('.l-curto');return l&&l.scrollWidth>b.clientWidth+1||l.getBoundingClientRect().right>b.getBoundingClientRect().right+0.5||l.getBoundingClientRect().left<b.getBoundingClientRect().left-0.5}).map(b=>b.dataset.tab),
   navRight:Math.max(...bs.map(b=>b.getBoundingClientRect().right)),vw:innerWidth}});
  t('w'+w+' 7 abas visíveis',r.n===7,r); t('w'+w+' sem rolagem',!r.navOver,r); t('w'+w+' rótulos não cortados',r.cortados.length===0,r); t('w'+w+' cabe na tela',r.navRight<=r.vw+1,r);
  if(w===360||w===412) await p.screenshot({path:'nav_'+w+'.png',clip:{x:0,y:700,width:w,height:100}});
  await ctx.close();
 }
 console.log('OK',ok,'FALHAS',falhas); await b.close();
})();
