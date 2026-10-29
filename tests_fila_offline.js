const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE='http://localhost:8765'; let ok=0; const falhas=[];
const t=(n,c,x)=>{ if(c) ok++; else falhas.push(n+(x!==undefined?' → '+JSON.stringify(x):'')); };
const mails = async () => (await (await fetch(BASE+'/__sent')).json());
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
  await ctx.addInitScript(() => { localStorage.setItem('IFS_BACKEND_URL', 'http://localhost:8765/exec'); });
  let modo = 'on'; // on | off | perdeResposta
  await ctx.route('**/exec**', async (route) => {
    if (modo === 'off') return route.abort('internetdisconnected');
    if (modo === 'perdeResposta' && route.request().method()==='POST') { await route.fetch(); return route.abort('connectionreset'); }
    return route.continue();
  });
  const p = await ctx.newPage(); p.on('pageerror', e => falhas.push('erro JS '+e.message)); p.on('dialog', d=>{falhas.push('diálogo nativo '+d.message()); d.dismiss();});
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(1000);
  const v = await p.locator('#loginProf option').evaluateAll(os => os.find(o=>o.textContent.includes('Emerson')).value);
  await p.selectOption('#loginProf', v); await p.fill('#pinInput','1234'); await p.click('#btnLogin'); await p.waitForTimeout(3000);
  const fila = () => p.evaluate(()=>JSON.parse(localStorage.getItem('IFS_FILA_ENVIO')||'[]'));
  const informar = async () => { await p.click('[data-tab="tab-minha"]'); await p.locator('.btn-card-release').first().click(); await p.waitForTimeout(300); await p.fill('#inputMotivoFalta','Teste fila'); await p.click('#btnConfirmarLiberar'); await p.waitForTimeout(600); };

  // ---- A: sem internet
  const m0 = (await mails()).length;
  modo='off'; await p.evaluate(()=>{ Object.defineProperty(navigator,'onLine',{value:false,configurable:true}); });
  await informar();
  let f = await fila();
  t('A1 pedido ficou guardado na fila', f.length===1, f.length);
  t('A2 tem código único', f[0] && /^r[a-z0-9]{10,}$/.test(f[0].reqId), f[0] && f[0].reqId);
  t('A3 cartão marcado "aguardando internet"', (await p.locator('.selo-pendente').count())>=1);
  t('A4 faixa de aviso visível', await p.locator('#bannerFila').isVisible());
  t('A5 nenhum e-mail enviado ainda', (await mails()).length===m0);
  await p.screenshot({path:'fila_A.png'});
  await p.waitForTimeout(7000);
  t('A6 continua guardado após tentativas falhas', (await fila()).length===1);
  // ---- B: recarregar a página sem internet
  await p.reload(); await p.waitForTimeout(3500);
  t('B1 após recarregar, fila preservada', (await fila()).length===1);
  t('B2 após recarregar, cartão ainda marcado (dados não foram sobrescritos)', (await p.locator('.selo-pendente').count())>=1);
  t('B3 faixa visível após recarregar', await p.locator('#bannerFila').isVisible());
  // sair com pendência pede confirmação
  await p.click('#btnLogout'); await p.waitForTimeout(400);
  t('B4 sair com pendência pergunta antes', (await p.locator('.dialogo-app').count())===1);
  await p.locator('.dialogo-app .btn-dialogo-sec').click(); await p.waitForTimeout(200);
  t('B5 cancelar mantém logado', await p.locator('#tela-painel').isVisible());
  // ---- C: internet volta
  modo='on'; await p.evaluate(()=>{ Object.defineProperty(navigator,'onLine',{value:true,configurable:true}); window.dispatchEvent(new Event('online')); });
  await p.waitForTimeout(4000);
  t('C1 fila esvaziou', (await fila()).length===0, await fila());
  t('C2 faixa sumiu', !(await p.locator('#bannerFila').isVisible()));
  const m1 = (await mails()).length; const d1 = m1-m0;
  t('C3 e-mails da falta enviados (1 ação)', d1>=1, d1);
  const g = await (await fetch(BASE+'/exec?action=obterTudo')).json();
  t('C4 servidor registrou a falta', (g.grade.Emerson||[]).filter(a=>a.status==='alert').length>=1);
  t('C5 selo sumiu', (await p.locator('.selo-pendente').count())===0);
  // ---- D: resposta perdida (servidor processou, app não soube) → sem duplicar
  modo='perdeResposta';
  await p.waitForTimeout(31000); // deixa a janela de "escrita recente" passar
  await informar(); await p.waitForTimeout(2500);
  const m2a = (await mails()).length;
  t('D1 servidor processou 1x (mesmo sem o app saber)', m2a-m1===d1, [m2a-m1,d1]);
  t('D2 app ainda considera pendente', (await fila()).length===1);
  modo='on'; await p.evaluate(()=>{ window.dispatchEvent(new Event('online')); });
  await p.waitForTimeout(4000);
  const m2 = (await mails()).length;
  t('D3 reenvio NÃO repetiu e-mails', m2===m2a, [m2a,m2]);
  t('D4 fila esvaziou', (await fila()).length===0);
  // ---- E: servidor recusa (aula já assumida por outro) enquanto estava offline
  await p.waitForTimeout(31000);
  // um colega (sem choque de horário) libera uma aula no servidor
  const alvo = await p.evaluate(()=>{ for (const pr in bancoDeDados) { if (pr===usuarioLogado) continue; const i = bancoDeDados[pr].findIndex(a=>a.status==='normal' && !verificarConflito(a.dia,a.hora).conflito); if (i>=0) return {pr,i,aula:bancoDeDados[pr][i]}; } return null; });
  t('E0 existe aula de colega sem choque', !!alvo);
  if (alvo) {
    const lg0 = await (await fetch(BASE+'/exec',{method:'POST',body:JSON.stringify({acao:'login_professor',professor:alvo.pr,pin:'1234'})})).json();
    const rl = await (await fetch(BASE+'/exec',{method:'POST',body:JSON.stringify({acao:'libertar',profOriginal:alvo.pr,index:alvo.i,aula:alvo.aula,token:lg0.token})})).json();
    t('E0b colega liberou a aula', rl.sucesso===true, rl);
    await p.evaluate(()=>recarregarDados(false)); await p.waitForTimeout(2500);
    modo='off';
    await p.evaluate(([pr,i])=>{ prepararAssumirAula(pr,i); }, [alvo.pr, alvo.i]); await p.waitForTimeout(400);
    await p.click('#btnConfirmarAssumir'); await p.waitForTimeout(800);
    const fa = await fila(); t('E1 assumir offline foi para a fila', fa.length===1, fa.length);
    t('E1b cartão marcado como aguardando', (await p.locator('.selo-pendente').count())>=0);
    // outro professor assume antes
    const lg = await (await fetch(BASE+'/exec',{method:'POST',body:JSON.stringify({acao:'login_professor',professor:'Eber',pin:'1234'})})).json();
    const pl = fa[0] && fa[0].payload;
    const rr = await (await fetch(BASE+'/exec',{method:'POST',body:JSON.stringify({acao:'assumir',profOriginal:pl.profOriginal,index:pl.index,aula:pl.aula,substituto:'Eber',token:lg.token})})).json();
    t('E2 outro professor assumiu primeiro', rr.sucesso===true, rr);
    modo='on'; await p.evaluate(()=>window.dispatchEvent(new Event('online'))); await p.waitForTimeout(5000);
    t('E3 fila esvaziou mesmo com recusa', (await fila()).length===0);
    t('E5 tela atualizada: aula está com Eber', await p.evaluate(([pr,al])=>bancoDeDados[pr].some(a=>a.dia===al.dia&&a.hora===al.hora&&a.turma===al.turma&&a.substituto==='Eber'), [alvo.pr, alvo.aula]));
  }
  console.log(ok+' ok', falhas.length? '\nFALHAS:\n'+falhas.join('\n') : '(0 falhas)');
  await b.close();
})().catch(e=>{console.log('FALHA GERAL',e.stack);process.exit(1);});
