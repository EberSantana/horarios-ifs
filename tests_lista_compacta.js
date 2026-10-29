const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE='http://localhost:8765'; const falhas=[]; let ok=0;
const t=(n,c,x)=>{ if(c) ok++; else falhas.push(n+(x!==undefined?' → '+JSON.stringify(x):'')); };
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
 const p=await ctx.newPage(); p.on('pageerror',e=>falhas.push('erro JS '+e.message));
 await p.goto(BASE+'/index.html'); await p.waitForTimeout(1000);
 const v=await p.locator('#loginProf option').evaluateAll(os=>os.find(o=>o.textContent.includes('Emerson')).value);
 await p.selectOption('#loginProf',v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(3000);
 await p.evaluate(()=>{
  const me=usuarioLogado, outros=['Adriano','Ângelo','Christiano'];
  const aula=(d,h)=>({dia:d,hora:h,disc:'Tópicos',turma:'3º DS'});
  const L=[];
  for(let i=0;i<26;i++){
    const st=['pendente','aceita','recusada'][i%3];
    const eu=i%2===0;
    L.push({id:'TR-'+(Date.now()-i*86400000),proponente:eu?me:outros[i%3],colega:eu?outros[i%3]:me,aulasCedidas:[aula('Terça-feira','08:40 - 09:30'),aula('Terça-feira','09:30 - 10:20')],aulasDesejadas:[aula('Quinta-feira','14:20 - 15:10')],dataPrevista:'29-10-2026',motivo:'Teste '+i,status:st});
  }
  L.push({id:'TR-'+(Date.now()+777),proponente:'Adriano',colega:me,aulasCedidas:[aula('Segunda-feira','07:00 - 07:50')],aulasDesejadas:[aula('Quarta-feira','07:50 - 08:40')],dataPrevista:'30-10-2026',motivo:'urgente',status:'pendente'});
  localStorage.setItem('IFS_TROCAS_PERMUTAS',JSON.stringify(L));
  window.__eu=me; renderizarTrocasEReposicoes();
 });
 await p.click('[data-tab="tab-trocas"]').catch(()=>{}); await p.waitForTimeout(400);
 await p.evaluate(()=>renderizarTrocasEReposicoes());
 const cards=()=>p.locator('#trocasContainer .item-solic').count();
 const total=await p.evaluate(()=>filtrarTrocas_(API.getTrocas()).length);
 t('padrão só as minhas', total===27, total);
 t('mostra no máximo 10', (await cards())<=10, await cards());
 const primeiro=await p.locator('#trocasContainer .item-solic').first();
 t('1º é "aguardando você" e vem aberto', (await primeiro.getAttribute('class')).includes('destaque') && (await primeiro.getAttribute('open'))!==null);
 {const a=await p.locator('#trocasContainer .item-solic[open]').count(),d=await p.locator('#trocasContainer .item-solic.destaque').count();t('só aguardando você abertos',a===d,[a,d]);}
 const vm=await p.locator('#trocasContainer .btn-ver-mais').count(); 
 if(total>10){ t('botão ver mais', vm===1); await p.locator('#trocasContainer .btn-ver-mais').click(); t('ver mais aumenta', (await cards())>10, await cards()); }
 await p.selectOption('#filtroStatusSolic','recusada'); const nr=await cards();
 t('filtro recusadas só recusadas', (await p.locator('#trocasContainer .solic-badge:not(:has-text("Recusada"))').count())===0 && nr>0, nr);
 await p.selectOption('#filtroStatusSolic','todas'); await p.selectOption('#filtroEscopoSolic','todas');
 t('todos os professores mostra mais', (await p.evaluate(()=>filtrarTrocas_(API.getTrocas()).length))===27);
 // abrir um cartão e re-renderizar: continua aberto
 const alvo=p.locator('#trocasContainer .item-solic:not([open]) summary').first(); await alvo.click();
 const sid=await p.locator('#trocasContainer .item-solic[open]').last().getAttribute('data-sid');
 await p.evaluate(()=>renderizarTrocasEReposicoes());
 t('cartão aberto continua aberto após atualizar', (await p.locator(`#trocasContainer .item-solic[data-sid="${sid}"]`).getAttribute('open'))!==null);
 await p.selectOption('#filtroEscopoSolic','minhas');
 await p.evaluate(()=>{document.querySelectorAll('#trocasContainer .item-solic').forEach(d=>d.open=false);document.querySelector('#trocasContainer').scrollIntoView();});await p.screenshot({path:'comp_m.png',fullPage:false});
 const bw=await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
 t('sem rolagem horizontal',bw);
 console.log('OK',ok,'FALHAS',falhas); await b.close();
})();
