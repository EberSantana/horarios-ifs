const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:390,height:900},isMobile:true});
 await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
 const a=await ctx.newPage(); const erros=[]; a.on('pageerror',e=>erros.push(e.message)); let f=[]; const t=(n,c)=>{if(!c)f.push(n)};
 await a.goto('http://localhost:8765/admin.html'); await a.waitForTimeout(800);
 await a.evaluate(()=>sessionStorage.setItem('IFS_ADMIN',JSON.stringify({token:'tok',email:'prof.welkson@ifs.edu.br'})));
 await a.reload(); await a.waitForTimeout(1500);
 await a.evaluate(()=>irPara('config')); await a.waitForTimeout(1800);
 t('opção geral existe', await a.evaluate(()=>!!document.querySelector('#cvGeral')));
 await a.click('input[name=cvCurso]'); t('curso desmarca geral', await a.evaluate(()=>!document.querySelector('#cvGeral').checked));
 await a.click('#cvGeral'); t('geral desmarca cursos', await a.evaluate(()=>![...document.querySelectorAll('input[name=cvCurso]')].some(x=>x.checked)));
 await a.fill('#cvEmail','teste@ifs.edu.br'); await a.click('#cvGeral'); // desmarca tudo
 await a.click('#formConvite button[type=submit]'); await a.waitForTimeout(500);
 t('exige escolha', await a.evaluate(()=>!document.querySelector('#cvResultado').textContent.includes('Código')));
 await (await (await a.$('#formConvite')).evaluateHandle(e=>e.closest('.cartao'))).asElement().screenshot({path:'geral.png'});
 t('sem erros js', erros.length===0);
 console.log(f.length?'FALHAS '+f.join(' | '):'UI GERAL SEM ACHADOS', erros); await b.close();
})();
