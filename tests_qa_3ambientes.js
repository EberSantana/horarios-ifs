// Varredura QA: layout + modais + fluxos, em 3 ambientes
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE='http://localhost:8765';
const VPS=[['computador',1366,768,'Emerson','Eber'],['tablet',820,1180,'Fernanda','Vinicius'],['celular',390,844,'Raisa','Weder']];
const achados=[]; const A=(amb,onde,msg)=>{achados.push(`[${amb}] ${onde}: ${msg}`);};
const layout = async (p, amb, onde) => {
  const r = await p.evaluate(() => {
    const W = innerWidth, out = [], peq = [];
    if (document.documentElement.scrollWidth > W + 1) out.push('rolagem lateral na página (' + document.documentElement.scrollWidth + 'px)');
    const dentroRolavel = el => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) return true; } return false; };
    const nome = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '');
    document.querySelectorAll('body *').forEach(el => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) return;
      if ((b.right > W + 2 || b.left < -2) && !dentroRolavel(el)) out.push('fora da tela: ' + nome(el) + ' (' + Math.round(b.left) + '→' + Math.round(b.right) + ')');
      if (W < 500 && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SELECT' || el.tagName==='INPUT') && (b.height < 30) && getComputedStyle(el).visibility !== 'hidden' && !(el.type==='checkbox'||el.type==='radio')) peq.push(nome(el) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      // texto cortado (overflow escondido sem reticências)
    });
    return { out: [...new Set(out)].slice(0, 8), peq: [...new Set(peq)].slice(0, 6) };
  });
  r.out.forEach(m => A(amb, onde, m)); r.peq.forEach(m => A(amb, onde, 'alvo de toque pequeno: ' + m));
};
const checaModal = async (p, amb, nome) => {
  const r = await p.evaluate(() => {
    const m = document.querySelector('.modal-overlay.active'); if (!m) return { aberto: false };
    const c = m.querySelector('.modal-card') || m.firstElementChild; const b = c.getBoundingClientRect();
    const x = m.querySelector('.btn-close-modal'); const xb = x && x.getBoundingClientRect();
    const s = getComputedStyle(c);
    return { aberto: true, id: m.id, alto: Math.round(b.height), H: innerHeight, W: innerWidth, top: Math.round(b.top), bottom: Math.round(b.bottom), larg: Math.round(b.width), rola: c.scrollHeight > c.clientHeight + 2 ? s.overflowY : 'ok',
      xVis: !x || (xb.top >= 0 && xb.bottom <= innerHeight && xb.right <= innerWidth && xb.width > 0) };
  });
  if (!r.aberto) { A(amb, nome, 'janela não abriu'); return false; }
  if (r.top < 0 || r.bottom > r.H + 1) { if (!/auto|scroll/.test(r.rola)) A(amb, nome + ' (' + r.id + ')', `janela maior que a tela (${r.top}..${r.bottom} de ${r.H}) sem rolagem`); }
  if (r.larg > r.W) A(amb, nome, 'janela mais larga que a tela');
  if (!r.xVis) A(amb, nome, 'botão fechar (×) fora da tela');
  await layout(p, amb, 'janela ' + nome);
  return true;
};
const fechar = async p => { const x = p.locator('.modal-overlay.active .btn-close-modal').first(); if (await x.count()) await x.click(); else await p.evaluate(()=>fecharTodosModais()); await p.waitForTimeout(250);
  const ainda = await p.locator('.modal-overlay.active').count(); return ainda === 0; };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const [amb, w, h, prof, prof2] of VPS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, hasTouch: w < 900, isMobile: w < 500 });
    await ctx.addInitScript(() => { localStorage.setItem('IFS_BACKEND_URL', 'http://localhost:8765/exec'); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('erro JS: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_PROXY|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('dialog', d => { errs.push('diálogo nativo inesperado: ' + d.message()); d.dismiss(); });
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(1000);
    await layout(p, amb, 'tela de login');
    // login com PIN errado
    const nomes = await p.locator('#loginProf option').allInnerTexts();
    const opt = async n => (await p.locator('#loginProf option').evaluateAll((os, n) => (os.find(o => o.textContent.includes(n)) || {}).value, n));
    const v1 = await opt(prof); if (!v1) { A(amb, 'login', 'professor ' + prof + ' não está na lista'); continue; }
    await p.selectOption('#loginProf', v1); await p.fill('#pinInput', '9999'); await p.click('#btnLogin'); await p.waitForTimeout(1500);
    const errTxt = await p.evaluate(() => (document.querySelector('#tela-login .erro, #loginErro, .login-error, [id*=rro]') || {}).innerText || '');
    if (await p.locator('#tela-painel').isVisible()) A(amb, 'login', 'entrou com PIN errado!');
    await p.fill('#pinInput', '1234'); await p.click('#btnLogin'); await p.waitForTimeout(2500);
    if (!(await p.locator('#tela-painel').isVisible())) { A(amb, 'login', 'não entrou com PIN correto'); continue; }
    // abas
    const abas = await p.locator('.tab-btn').all();
    for (const t of abas) { const nm = (await t.innerText()).replace(/\s+/g, ' ').trim(); await t.scrollIntoViewIfNeeded(); await t.click(); await p.waitForTimeout(600);
      const id = await t.getAttribute('data-tab'); const vis = await p.locator('#' + id).isVisible(); if (!vis) A(amb, 'aba ' + nm, 'conteúdo não apareceu');
      await layout(p, amb, 'aba ' + nm); await p.screenshot({ path: `q_${amb}_${id}.png`, fullPage: false }); }
    await abas[0].click(); await p.waitForTimeout(400);
    // janelas
    const abrir = async (sel, nome, antes) => { if (antes) { await antes(); }
      const el = p.locator(sel).first(); if (!(await el.count())) { A(amb, nome, 'botão não encontrado ' + sel); return; }
      await el.scrollIntoViewIfNeeded(); await el.click(); await p.waitForTimeout(500);
      if (await checaModal(p, amb, nome)) { await p.screenshot({ path: `q_${amb}_m_${nome.replace(/\W+/g,'_')}.png` }); if (!(await fechar(p))) A(amb, nome, 'janela não fechou pelo ×'); } };
    await abrir('#btnOpenModalAusenciaMultipla', 'Informar falta (topo)');
    await abrir('#btnOpenModalReposicao', 'Agendar reposição');
    await abrir('.btn-card-release', 'Informar falta (cartão)');
    await abrir('.btn-card-swap', 'Propor troca (cartão)');
    await abrir('#btnOpenSettings', 'Configurações');
    await abrir('#btnNotificacoesGlobal', 'Avisos (sino)');
    await p.click('[data-tab="tab-trocas"]'); await p.waitForTimeout(300);
    await abrir('#btnNovaTrocaTab', 'Nova troca (aba)');
    await abrir('#btnOpenSettings', 'Sinal escolar', null); // abre config
    { const s = p.locator('#btnAbrirSinal'); if (await s.isVisible()) { await s.click(); await p.waitForTimeout(500); if (await checaModal(p, amb, 'Sinal escolar')) {
        const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#btnBaixarSinal')]);
        if (!d) A(amb, 'Sinal escolar', 'download do .ics não aconteceu'); await fechar(p); } } }
    // fluxo: informar falta de 1 tempo
    await p.click('[data-tab="tab-minha"]'); await p.waitForTimeout(300);
    const nAlert0 = await p.locator('#minhaGradeContainer .class-card.alert').count();
    await p.locator('.btn-card-release').first().click(); await p.waitForTimeout(500);
    const temJust = await p.locator('#modalLiberar.active textarea, #modalLiberar.active select#selectMotivo, #modalLiberar.active input[type=text]').count();
    // tentar confirmar sem preencher
    await p.click('#btnConfirmarLiberar'); await p.waitForTimeout(800);
    { await p.fill('#inputMotivoFalta','');
      await p.fill('#inputMotivoFalta','Consulta - teste QA');
      const sel = p.locator('#modalLiberar select').nth(1); 
      await p.click('#btnConfirmarLiberar'); await p.waitForTimeout(3000);
    }
    if (await p.locator('.modal-overlay.active').count()) { const txt = await p.locator('.modal-overlay.active').innerText(); A(amb, 'Informar falta', 'janela continua aberta após confirmar: ' + txt.slice(0, 160).replace(/\n/g, ' | ')); await p.evaluate(()=>fecharTodosModais()); }
    const nAlert1 = await p.locator('#minhaGradeContainer .class-card.alert').count();
    if (nAlert1 <= nAlert0) A(amb, 'Informar falta', `cartão não ficou vermelho (antes ${nAlert0}, depois ${nAlert1})`);
    await p.screenshot({ path: `q_${amb}_falta.png` });
    // professor 2 assume
    const ctx2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 500 });
    await ctx2.addInitScript(() => { localStorage.setItem('IFS_BACKEND_URL', 'http://localhost:8765/exec'); });
    const q = await ctx2.newPage(); q.on('pageerror', e => errs.push('erro JS (prof2): ' + e.message)); q.on('dialog', d => { errs.push('diálogo nativo: ' + d.message()); d.dismiss(); });
    await q.goto(BASE + '/index.html'); await q.waitForTimeout(1000);
    const v2 = await q.locator('#loginProf option').evaluateAll((os, n) => (os.find(o => o.textContent.includes(n)) || {}).value, prof2);
    if (!v2) A(amb, 'login 2', prof2 + ' não está na lista'); else {
      await q.selectOption('#loginProf', v2); await q.fill('#pinInput', '1234'); await q.click('#btnLogin'); await q.waitForTimeout(2500);
      await q.click('[data-tab="tab-livres"]'); await q.waitForTimeout(800);
      const take = q.locator('#tab-livres .btn-card-take'); const nt = await take.count();
      if (!nt) A(amb, 'Disponíveis (prof 2)', 'aula liberada não aparece para o colega');
      else { await take.first().click(); await q.waitForTimeout(500);
        if (await q.locator('#modalConflito.active').count()) { A(amb,'Assumir','(info) conflito de horário do colega - normal'); await q.evaluate(()=>fecharTodosModais()); }
        else { await checaModal(q, amb, 'Assumir aula'); await q.click('#btnConfirmarAssumir'); await q.waitForTimeout(3000);
          if (await q.locator('.modal-overlay.active').count()) A(amb, 'Assumir', 'janela continua aberta: ' + (await q.locator('.modal-overlay.active').innerText()).slice(0,140).replace(/\n/g,' | '));
          await q.click('[data-tab="tab-minha"]'); await q.waitForTimeout(600);
          if (!(await q.locator('#minhaGradeContainer .class-card.assumed').count())) A(amb, 'Assumir', 'aula assumida não aparece na grade do substituto');
          await q.screenshot({ path: `q_${amb}_assumiu.png` });
          await p.click('#btnManualRefresh'); await p.waitForTimeout(3000);
          // dono vê como assumida
          const dono = await p.locator('#minhaGradeContainer .class-card.assumed, #minhaGradeContainer .class-card.normal').count();
        } }
    }
    await ctx2.close();
    // reposição: abrir e tentar confirmar vazio
    await p.click('#btnOpenModalReposicao'); await p.waitForTimeout(400); await p.click('#btnConfirmarReposicao'); await p.waitForTimeout(800);
    if (!(await p.locator('#modalReposicao.active').count())) A(amb, 'Reposição', 'confirmou sem preencher dados');
    { const d = p.locator('.dialogo-app'); if (!(await d.count())) A(amb,'Reposição','aviso de validação não apareceu no visual do app'); else { await checaModal(p, amb, 'Aviso (diálogo do app)'); await p.screenshot({path:`q_${amb}_dialogo.png`}); await d.locator('.btn-dialogo-ok').click(); await p.waitForTimeout(200); } }
    await p.evaluate(()=>fecharTodosModais());
    // cancelar a falta via confirmação do app
    await p.click('[data-tab="tab-minha"]'); await p.waitForTimeout(400);
    { const c = p.locator('#minhaGradeContainer .btn-card-cancel').first(); if (await c.count()) { const n0 = await p.locator('#minhaGradeContainer .class-card.alert, #minhaGradeContainer .class-card.assumed').count(); await c.click(); await p.waitForTimeout(300);
        const d = p.locator('.dialogo-app'); if (!(await d.count())) A(amb,'Cancelar falta','confirmação não apareceu'); else { await d.locator('.btn-dialogo-sec').click(); await p.waitForTimeout(300);
          if ((await p.locator('#minhaGradeContainer .class-card.alert, #minhaGradeContainer .class-card.assumed').count()) !== n0) A(amb,'Cancelar falta','"Cancelar" do diálogo executou a ação mesmo assim');
          await c.click(); await p.waitForTimeout(300); await p.locator('.dialogo-app .btn-dialogo-ok').click(); await p.waitForTimeout(2500);
          if ((await p.locator('#minhaGradeContainer .class-card.alert, #minhaGradeContainer .class-card.assumed').count()) >= n0) A(amb,'Cancelar falta','após confirmar, a aula não voltou ao normal'); } } }
    // Esc fecha janela
    await p.click('#btnOpenModalReposicao'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    if (await p.locator('.modal-overlay.active').count()) A(amb,'Teclado','Esc não fecha a janela');
    // falta sem motivo deve ser barrada
    await p.locator('.btn-card-release').first().click(); await p.waitForTimeout(300); await p.fill('#inputMotivoFalta',''); await p.click('#btnConfirmarLiberar'); await p.waitForTimeout(400);
    if (!(await p.locator('#modalLiberar.active').count())) A(amb,'Informar falta','aceitou sem motivo'); await p.evaluate(()=>fecharTodosModais());
    // relatórios: exportar CSV
    await p.click('[data-tab="tab-relatorios"]'); await p.waitForTimeout(600);
    { const e = p.locator('#btnExportarCsv'); if (await e.isVisible()) { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), e.click()]); if (!d) A(amb, 'Relatórios', 'Exportar CSV não baixou'); } }
    // sair
    await p.click('#btnLogout'); await p.waitForTimeout(1200);
    if (await p.locator('.modal-overlay.active').count()) { const t = p.locator('.modal-overlay.active button:has-text("Sair"), .modal-overlay.active .btn-primary').first(); if (await t.count()) await t.click(); await p.waitForTimeout(800); }
    if (!(await p.locator('#tela-login').isVisible())) A(amb, 'Sair', 'não voltou para a tela de login');
    errs.forEach(e => A(amb, 'console', e));
    await ctx.close();
  }
  await b.close();
  console.log(achados.length ? achados.join('\n') : 'SEM ACHADOS');
})().catch(e => { console.log('FALHA', e.stack); process.exit(1); });
