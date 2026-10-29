const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE='http://localhost:8765'; const falhas=[]; let ok=0;
const t=(n,c,x)=>{ if(c) ok++; else falhas.push(n+(x!==undefined?' → '+JSON.stringify(x):'')); };
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'});
 await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
 const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push('erro JS '+e.message));
 await p.goto(BASE+'/index.html'); await p.waitForTimeout(1000);
 const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
 await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(3000);
 const r=await p.evaluate(()=>{
   const me=usuarioLogado, out={me, minhas:[...turmasDoProf_(me)]};
   const todos=Object.keys(bancoDeDados).filter(c=>c!==me&&c!=='A definir');
   out.todos=todos.length;
   out.comum=todos.filter(c=>turmasEmComum_(me,c).length>0).length;
   out.exemploSem=todos.find(c=>turmasEmComum_(me,c).length===0)||null;
   return out;});
 console.log(JSON.stringify(r));
 await p.evaluate(()=>abrirModalTroca(usuarioLogado));
 await p.waitForTimeout(300);
 const nOpt=await p.locator('#selectColegaTroca option').count();
 t('lista de colegas filtrada (só com turma em comum)', nOpt-1===r.comum, [nOpt-1,r.comum]);
 const col=await p.locator('#selectColegaTroca option').nth(1).getAttribute('value');
 await p.selectOption('#selectColegaTroca',col); await p.waitForTimeout(300);
 const info=await p.evaluate((col)=>{
   const com=new Set(turmasEmComum_(usuarioLogado,col));
   const dias=[...document.querySelectorAll('#selectDiaColegaTroca option')].map(o=>o.value);
   const tur=[...document.querySelectorAll('#listaAulasColegaTroca .tempo-turma-badge')].map(e=>e.textContent.trim());
   const minhas=[...document.querySelectorAll('#listaMinhasAulasTroca .tempo-turma-badge')].map(e=>e.textContent.trim());
   return {com:[...com],tur,minhas,dias};},col);
 console.log(col,JSON.stringify(info));
 t('aulas do colega só em turmas comuns', info.tur.every(x=>info.com.includes(x)), info);
 t('minhas aulas só em turmas comuns', info.minhas.every(x=>info.com.includes(x)), info);
 console.log('OK',ok,'FALHAS',falhas);
 await b.close();
})();
