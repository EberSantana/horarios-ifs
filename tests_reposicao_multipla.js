const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const falhas=[]; let ok=0; const t=(n,c,x)=>{ if(c) ok++; else falhas.push(n+(x!==undefined?' → '+JSON.stringify(x):'')); };
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 for(const [w,h] of [[390,844],[1280,800]]){
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
  const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push('erro JS '+e.message)); p.on('dialog',d=>{falhas.push('diálogo nativo '+d.message());d.dismiss();});
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(800);
  const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
  await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(2500);
  const esperado=await p.evaluate(()=>new Set((bancoDeDados[usuarioLogado]||[]).map(a=>a.disc+'|'+a.turma)).size);
  await p.evaluate(()=>localStorage.setItem('IFS_REPOSICOES_AULAS','[]'));
  await p.evaluate(()=>abrirModalReposicao()); await p.waitForTimeout(300);
  const n=await p.locator('.repos-disc-chk').count();
  t(w+' sem duplicados (1 por disciplina/turma)',n===esperado&&n>1,[n,esperado]);
  await p.locator('#listaDisciplinasReposicao label').nth(0).click(); await p.locator('#listaDisciplinasReposicao label').nth(1).click();
  t(w+' marcou 2',(await p.locator('.repos-disc-chk:checked').count())===2);
  await p.click('#btnMarcarTodasRepos'); t(w+' marcar todas',(await p.locator('.repos-disc-chk:checked').count())===n);
  await p.click('#btnMarcarTodasRepos'); t(w+' desmarcar todas',(await p.locator('.repos-disc-chk:checked').count())===0);
  await p.screenshot({path:'rep_'+w+'.png'});
  await p.evaluate(()=>{ document.getElementById('inputHoraIniReposicao').value='08:00'; document.getElementById('inputHoraFimReposicao').value='09:00'; });
  await p.click('#btnConfirmarReposicao'); await p.waitForTimeout(300);
  t(w+' sem nenhuma marcada → aviso e nada salvo',(await p.evaluate(()=>JSON.parse(localStorage.getItem('IFS_REPOSICOES_AULAS')||'[]').length))===0);
  await p.evaluate(()=>{document.querySelectorAll('.dialogo-app button').forEach(b=>b.click());});
  await p.evaluate(()=>abrirModalReposicao());
  await p.locator('#listaDisciplinasReposicao label').nth(0).click(); await p.locator('#listaDisciplinasReposicao label').nth(2).click();
  await p.evaluate(()=>{ document.getElementById('inputHoraIniReposicao').value='08:00'; document.getElementById('inputHoraFimReposicao').value='09:00'; });
  await p.click('#btnConfirmarReposicao'); await p.waitForTimeout(800);
  const salvas=await p.evaluate(()=>JSON.parse(localStorage.getItem('IFS_REPOSICOES_AULAS')||'[]'));
  t(w+' salvou 2 reposições',salvas.length===2,salvas.length);
  t(w+' ids distintos',new Set(salvas.map(r=>r.id)).size===2);
  t(w+' disciplinas diferentes',new Set(salvas.map(r=>r.disciplina+r.turma)).size===2);
  await ctx.close();
 }
 console.log('OK',ok,'FALHAS',falhas); await b.close();
})();
