const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 let falhas=[]; const t=(n,c,x)=>{ if(!c) falhas.push(n+(x?' -> '+JSON.stringify(x):'')); };
 for (const w of [1280, 390]) {
 const ctx=await b.newContext({viewport:{width:w,height:900},isMobile:w<500});
 await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
 const a=await ctx.newPage(); const erros=[]; a.on('pageerror',e=>erros.push(e.message));
 await a.goto('http://localhost:8765/admin.html'); await a.waitForTimeout(800);
 await a.evaluate(()=>sessionStorage.setItem('IFS_ADMIN',JSON.stringify({token:'tok',email:'prof.welkson@ifs.edu.br'})));
 await a.reload(); await a.waitForTimeout(1500);
 await a.evaluate(()=>irPara('acoes')); await a.waitForTimeout(2000);
 const n = await a.evaluate(()=>document.querySelectorAll('#acProf option').length);
 t('lista de professores '+w, n>3, n);
 t('botões desligados sem professor', await a.evaluate(()=>[...document.querySelectorAll('.acoes-prof .btn')].every(x=>x.disabled)));
 const prof = await a.evaluate(()=>[...document.querySelectorAll('#acProf option')][1].value);
 await a.selectOption('#acProf', prof);
 t('botões ligam', await a.evaluate(()=>[...document.querySelectorAll('.acoes-prof .btn')].every(x=>!x.disabled)));
 // falta
 await a.click('[data-acao=ac-falta]'); await a.waitForTimeout(400);
 t('modal falta lista tempos', await a.evaluate(()=>document.querySelectorAll('.acf').length>0));
 await a.click('#acfOk'); await a.waitForTimeout(300);
 t('valida sem seleção', /Marque pelo menos/.test(await a.textContent('#acfErro')));
 await a.evaluate(()=>document.querySelector('.acf').click());
 await a.fill('#acfMotivo','consulta médica'); await a.click('#acfOk'); await a.waitForTimeout(1500);
 t('modal fechou após falta', await a.evaluate(()=>!document.querySelector('#acfOk')));
 if (w===390) await a.screenshot({path:'agir_390.png'});
 // reposição
 await a.click('[data-acao=ac-repos]'); await a.waitForTimeout(400);
 t('modal reposição', await a.evaluate(()=>document.querySelectorAll('.acr').length>0));
 await a.evaluate(()=>document.querySelector('.acr').click());
 await a.fill('#acrData','2030-01-10'); await a.fill('#acrIni','14:00'); await a.fill('#acrFim','15:00'); await a.fill('#acrSala','lab 2');
 await a.click('#acrOk'); await a.waitForTimeout(1500);
 t('reposição concluída', await a.evaluate(()=>!document.querySelector('#acrOk')));
 // permuta
 await a.click('[data-acao=ac-troca]'); await a.waitForTimeout(400);
 const temColega = await a.evaluate(()=>document.querySelectorAll('#actColega option').length);
 t('modal permuta abre', await a.evaluate(()=>!!document.querySelector('.modal, [role=dialog]')) );
 await a.keyboard.press('Escape');
 t('sem erros de JS '+w, erros.length===0, erros);
 await ctx.close();
 }
 console.log(falhas.length?'FALHAS\n'+falhas.join('\n'):'UI AGIR SEM ACHADOS'); await b.close();
})();
