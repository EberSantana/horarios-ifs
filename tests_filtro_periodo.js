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
 const dia=(n)=>Date.now()-n*86400000;
 await p.evaluate((d)=>{
  const rep=(id,ts,extra)=>Object.assign({id:'REP-'+ts,professor:usuarioLogado,disciplina:'X',turma:'3º DS',data:'30-10-2026',horario:'11h00 - 12h00',sala:'Sala 1',motivo:''},extra||{});
  localStorage.setItem(STORAGE_KEY_REPOSICOES||'x', '[]');
 },0).catch(()=>{});
 // grava via API.salvarReposicao
 await p.evaluate(()=>{
  const mk=(dias,extra)=>Object.assign({id:'REP-'+(Date.now()-dias*86400000),professor:usuarioLogado,disciplina:'Disc '+dias,turma:'3º DS',data:'30-10-2026',horario:'11h00 - 12h00',sala:'Sala 1',motivo:''},extra||{});
  localStorage.setItem(Object.keys(localStorage).find(k=>/REPOS/i.test(k))||'IFS_REPOSICOES', JSON.stringify([mk(1),mk(10),mk(40),mk(100,{id:'REP-semdata'})]));
 });
 console.log(await p.evaluate(()=>Object.keys(localStorage)));
 await p.click('[data-tab="tab-trocas"]').catch(async()=>{await p.locator('.tab-btn').nth(2).click()});
 await p.waitForTimeout(500);
 await p.evaluate(()=>renderizarTrocasEReposicoes());
 const n=async()=> (await p.locator('#reposicoesContainer .class-card').count());
 t('Todas mostra 4',(await n())===4,await n());
 await p.selectOption('#filtroPeriodoSolic','1'); t('1 semana → 1',(await n())===1,await n());
 await p.selectOption('#filtroPeriodoSolic','2'); t('2 semanas → 2',(await n())===2,await n());
 await p.selectOption('#filtroPeriodoSolic','8'); t('8 semanas → 3',(await n())===3,await n());
 const txt=await p.locator('#reposicoesContainer').textContent();
 t('mostra "Solicitada em"',/Solicitada em \d{2}\/\d{2}\/\d{4} às \d{2}h\d{2}/.test(txt),txt.slice(0,200));
 await p.reload(); await p.waitForTimeout(3000);
 t('filtro lembrado após recarregar',(await p.inputValue('#filtroPeriodoSolic'))==='8');
 console.log('OK',ok,'FALHAS',falhas);
 await b.close();
})();
