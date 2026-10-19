/* =============================================================================
   PAINEL ADMINISTRATIVO — Painel Docente IFS Campus Tobias Barreto
   - Toda ação passa pelo Apps Script (doPost "admin_*"), que confere a sessão.
   - A senha nunca fica neste arquivo: o login devolve um token válido por 6 h.
   ============================================================================= */
"use strict";

const URL_PADRAO = "https://script.google.com/macros/s/AKfycbwlITC2JrJ3lFYl__oER1B86JFlHpsrjq75BRGD_q-iIhlKIphfdIcQkbIwRMtTjy2kjg/exec";
const RX_URL_SERVIDOR = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

const estado = {
  token: null, email: null, tela: "inicio",
  grade: [], gradeEm: 0, professores: [], aDefinir: 0, profEm: 0,
  resumo: null, emails: [], selEmails: new Set(), selAulas: new Set(),
  filtrosGrade: { turma: "", prof: "", dia: "", busca: "" },
  filtrosEmail: { busca: "", tipo: "", status: "ativos", periodo: "30" },
  filtroProf: { busca: "", aba: "ativos", area: "" },
  previa: null, arquivoNome: ""
};

// ---------------------------------------------------------------- utilidades
function urlServidor() {
  // Fixo em produção; só o ambiente de teste (localhost) aceita outro endereço
  try {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem("IFS_BACKEND_URL")) return localStorage.getItem("IFS_BACKEND_URL");
    const oficial = localStorage.getItem("IFS_SERVIDOR_OFICIAL");
    if (oficial && RX_URL_SERVIDOR.test(oficial)) return oficial;
  } catch (e) {}
  return URL_PADRAO;
}
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function $(sel, raiz) { return (raiz || document).querySelector(sel); }
function $$(sel, raiz) { return Array.from((raiz || document).querySelectorAll(sel)); }
function diaCurto(d) { return String(d || "").replace("-feira", ""); }
function ordemDia(d) { const i = DIAS.indexOf(d); return i === -1 ? 9 : i; }
function ordenarAulas(a, b) {
  return ordemDia(a.dia) - ordemDia(b.dia) || String(a.hora).localeCompare(String(b.hora)) ||
    String(a.turma).localeCompare(String(b.turma), "pt-BR");
}
function salaDaObs(obs) { const m = String(obs || "").match(/\(([^)]*(Lab|Sala|Bloco|Audit)[^)]*)\)\s*$/i); return m ? m[1] : ""; }
function dataHora(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function nomeBackup(n) {
  const m = String(n).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:_(\d+))?/);
  return m ? `${m[3]}/${m[2]}/${m[1]} · ${m[4]}:${m[5]}${m[6] ? " (" + m[6] + ")" : ""}` : n;
}
function dataDoBackup(n) {
  const m = String(n).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
// Tempo relativo ("Hoje às 14:32", "Ontem às...", "Há 3 dias") para a lista de
// versões — mais fácil de bater o olho do que uma data absoluta. A data exata
// continua disponível no title (tooltip) e nos diálogos de confirmação.
function tempoRelativo(n) {
  const d = dataDoBackup(n);
  if (!d || isNaN(d)) return nomeBackup(n);
  const agora = new Date();
  const diffMin = Math.round((agora - d) / 60000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffMin < 1) return "Agora mesmo";
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (d.toDateString() === agora.toDateString()) return `Hoje às ${hora}`;
  const ontem = new Date(agora); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`;
  const diffDias = Math.round((agora - d) / 86400000);
  if (diffDias < 7) return `Há ${diffDias} dias`;
  return nomeBackup(n);
}
function hojeArquivo() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

let timerToast = null;
function toast(msg, erro) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = erro ? "erro-toast" : "";
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.add("oculto"), erro ? 6000 : 3500);
}
function carregando(txt) { return `<div class="carregando"><div class="giro"></div>${esc(txt || "Carregando…")}</div>`; }

// ---------------------------------------------------------------- servidor
async function chamar(acao, dados) {
  const corpo = Object.assign({ acao, token: estado.token }, dados || {});
  let resp;
  try {
    const r = await fetch(urlServidor(), {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(corpo), redirect: "follow"
    });
    resp = await r.json();
  } catch (e) {
    throw new Error(navigator.onLine === false ? "Sem internet." : "Não foi possível falar com o servidor. Confira se a nova versão do Apps Script foi implantada.");
  }
  if (resp && resp.sessaoExpirada) { sair(true); throw new Error("Sessão expirada. Entre novamente."); }
  return resp;
}

async function carregarGrade(forcar) {
  if (!forcar && estado.grade.length && Date.now() - estado.gradeEm < 60000) return estado.grade;
  const r = await fetch(urlServidor() + "?action=obterTudo&t=" + Date.now(), { cache: "no-store" });
  const dados = await r.json();
  try {
    if (typeof dados.servidor === "string") {
      if (RX_URL_SERVIDOR.test(dados.servidor)) localStorage.setItem("IFS_SERVIDOR_OFICIAL", dados.servidor);
      else if (dados.servidor === "") localStorage.removeItem("IFS_SERVIDOR_OFICIAL");
    }
  } catch (e) {}
  const g = dados.grade || dados;
  const lista = [];
  Object.keys(g || {}).forEach((prof) => (g[prof] || []).forEach((a) => lista.push({
    id: a.id, prof, dia: a.dia, hora: a.hora, turma: a.turma, disc: a.disc,
    status: a.status || "normal", substituto: a.substituto || "", obs: a.obs || "", dataFalta: a.dataFalta || ""
  })));
  lista.sort(ordenarAulas);
  estado.grade = lista;
  estado.gradeEm = Date.now();
  return lista;
}

async function carregarProfessores(forcar) {
  if (!forcar && estado.professores.length && Date.now() - estado.profEm < 60000) return estado.professores;
  const r = await chamar("admin_prof_listar");
  if (!r.sucesso) throw new Error(r.erro || "Erro ao listar professores.");
  estado.professores = r.professores;
  estado.aDefinir = r.aDefinir;
  estado.profEm = Date.now();
  return r.professores;
}
async function carregarCadastros(forcar) {
  if (!forcar && estado.cad && Date.now() - estado.cadEm < 60000) return estado.cad;
  const r = await chamar("admin_cadastros_ler");
  if (!r.sucesso) throw new Error(r.erro || "Erro ao ler os cadastros.");
  estado.cad = r; estado.cadEm = Date.now();
  return r;
}
function cursoDe(turma) {
  const c = estado.cad;
  if (!c) return null;
  const t = c.turmas.find((x) => x.nome === turma);
  return t ? c.cursos.find((x) => x.id === t.curso) || null : null;
}
function temposDoCurso(curso) { return curso ? [...new Set((curso.turnos && curso.turnos.length ? curso.turnos : [curso.turno]).flatMap(temposDoTurno))].sort() : []; }
function temposDoTurno(turno) { return (estado.cad ? estado.cad.tempos : []).filter((h) => h.turno === turno && !h.turma).map((h) => h.hora); }
// horários próprios da turma; se ela não tem, os padrões dos turnos do curso dela
function temposDaTurma(turma) {
  const t = estado.cad ? estado.cad.tempos.filter((h) => h.turma === turma) : [];
  if (t.length) return [...new Set(t.map((h) => h.hora))].sort();
  return turma ? temposDoCurso(cursoDe(turma)) : [];
}

function profsAtivos() { return estado.professores.filter((p) => p.ativo).map((p) => p.nome); }
function invalidarDados() { estado.gradeEm = 0; estado.profEm = 0; estado.cadEm = 0; estado.resumo = null; }

// ---------------------------------------------------------------- login
function mostrarLogin(msg) {
  $("#app").classList.add("oculto");
  $("#tela-login").classList.remove("oculto");
  $("#formPrimeiro").classList.add("oculto"); $("#formLogin").classList.remove("oculto");
  const e = $("#erroLogin");
  if (msg) { e.textContent = msg; e.classList.remove("oculto"); } else e.classList.add("oculto");
}

async function entrar(ev) {
  ev.preventDefault();
  const btn = $("#btnEntrar");
  const email = $("#loginEmail").value.trim();
  const senha = $("#loginSenha").value;
  btn.disabled = true; btn.textContent = "Conferindo…";
  try {
    const r = await chamar("admin_login", { email, senha });
    if (!r.sucesso) throw new Error(r.erro || "Não foi possível entrar.");
    estado.token = r.token; estado.email = r.email;
    try { sessionStorage.setItem("IFS_ADMIN", JSON.stringify({ token: r.token, email: r.email })); } catch (e) {}
    $("#loginSenha").value = "";
    abrirApp();
  } catch (e) {
    mostrarLogin(e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Entrar";
  }
}

function sair(expirou) {
  if (!expirou && estado.token) chamar("admin_sair").catch(() => {});
  estado.token = null;
  try { sessionStorage.removeItem("IFS_ADMIN"); } catch (e) {}
  mostrarLogin(expirou ? "Sua sessão expirou. Entre novamente." : "");
}

function abrirApp() {
  $("#tela-login").classList.add("oculto");
  $("#app").classList.remove("oculto");
  $("#emailAdmin").textContent = estado.email;
  const tela = (location.hash || "").replace("#", "");
  irPara(TELAS[tela] ? tela : "inicio");
}

// ---------------------------------------------------------------- navegação
const TELAS = {
  inicio: telaInicio, emails: telaEmails, grade: telaGrade, cadastros: telaCadastros,
  professores: telaProfessores, arquivos: telaArquivos, config: telaConfig
};
function irPara(tela) {
  estado.tela = tela;
  $$("[data-tela]").forEach((b) => { if (b.dataset.tela === tela) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (location.hash !== "#" + tela) history.replaceState(null, "", "#" + tela);
  const main = $("#conteudo");
  main.innerHTML = carregando();
  window.scrollTo(0, 0);
  TELAS[tela](main).catch((e) => {
    main.innerHTML = `<div class="cartao cartao-pad"><div class="erro">${esc(e.message)}</div>
      <p><button class="btn" data-acao="recarregar">Tentar de novo</button></p></div>`;
  });
}
function recarregarTela() { irPara(estado.tela); }

function cabecalho(titulo, sub, acoes) {
  return `<div class="cabecalho"><div><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
    ${acoes ? `<div class="acoes">${acoes}</div>` : ""}</div>`;
}

// ---------------------------------------------------------------- modal
function abrirModal(html, aoAbrir) {
  const m = $("#modais");
  m.innerHTML = `<div class="fundo-modal" data-fundo><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const primeiro = $("input, select, textarea, button", m);
  if (primeiro) setTimeout(() => primeiro.focus(), 30);
  if (aoAbrir) aoAbrir($(".modal", m));
  return $(".modal", m);
}
function fecharModal() { $("#modais").innerHTML = ""; }
function confirmar(titulo, texto, rotulo, perigo) {
  return new Promise((res) => {
    const m = abrirModal(`<h2>${esc(titulo)}</h2><p style="margin:0">${texto}</p>
      <div class="botoes"><button class="btn" data-r="0">Cancelar</button>
      <button class="btn ${perigo ? "btn-perigo" : "btn-primario"}" data-r="1">${esc(rotulo || "Confirmar")}</button></div>`);
    $$("[data-r]", m).forEach((b) => b.addEventListener("click", () => { fecharModal(); res(b.dataset.r === "1"); }));
  });
}
function blocoConflitos(lista) {
  return `<div class="conflitos"><strong>Atenção — choque de horário:</strong><ul>${lista.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    Corrija ou clique em “mesmo assim” para salvar desse jeito.</div>`;
}

// ================================================================ VISÃO GERAL
async function telaInicio(main) {
  const [r] = await Promise.all([chamar("admin_resumo"), carregarGrade(true)]);
  if (!r.sucesso) throw new Error(r.erro);
  estado.resumo = r;
  atualizarSelo(r.emails.erros);
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const avisos = [];
  r.faltas.forEach((f) => avisos.push(`<div class="aviso aviso-vermelho"><div class="txt"><strong>Falta sem substituto · Prof. ${esc(f.prof)}</strong>
    <span>${esc(f.disc)} · ${esc(f.turma)} · ${esc(diaCurto(f.dia))} ${esc(f.hora)}${f.data ? " · " + esc(f.data) : ""}${f.obs ? " · " + esc(String(f.obs).replace(/^⚠️\s*/, "")) : ""}</span></div>
    <button class="btn btn-perigo" data-acao="indicar" data-id="${esc(f.id)}">Indicar substituto</button></div>`));
  r.assumidasInativo.forEach((a) => avisos.push(`<div class="aviso aviso-laranja"><div class="txt"><strong>Substituto não está mais ativo</strong>
    <span>${esc(a.disc)} · ${esc(a.turma)} · ${esc(diaCurto(a.dia))} ${esc(a.hora)} · com ${esc(a.substituto)} (titular: ${esc(a.prof)})</span></div>
    <button class="btn" data-acao="liberar" data-id="${esc(a.id)}">Liberar aula</button></div>`));
  r.conflitos.forEach((c) => avisos.push(`<div class="aviso aviso-laranja"><div class="txt"><strong>Choque de horário na grade</strong>
    <span>Prof. ${esc(c.prof)} em ${esc(c.turmas)} · ${esc(diaCurto(c.dia))} ${esc(c.hora)}</span></div>
    <button class="btn" data-acao="ver-grade" data-prof="${esc(c.prof)}" data-dia="${esc(c.dia)}">Ver na grade</button></div>`));
  if (r.aDefinir) avisos.push(`<div class="aviso aviso-azul"><div class="txt"><strong>${r.aDefinir} aula${r.aDefinir > 1 ? "s" : ""} sem professor</strong>
    <span>Marcadas como “A definir” na grade</span></div>
    <button class="btn" data-acao="ver-grade" data-prof="A definir">Atribuir professor</button></div>`);
  if (r.emails.erros) avisos.push(`<div class="aviso aviso-vermelho"><div class="txt"><strong>${r.emails.erros} e-mail${r.emails.erros > 1 ? "s" : ""} com erro nesta semana</strong>
    <span>Confira os destinatários e reenvie</span></div><button class="btn" data-acao="ir" data-tela="emails">Ver e-mails</button></div>`);
  if (!avisos.length) avisos.push(`<div class="aviso aviso-verde"><div class="txt"><strong>Tudo em ordem</strong><span>Nenhuma falta aberta, choque ou aula sem professor.</span></div></div>`);

  const ultima = r.ultimaVersao ? `Última grade aplicada: ${esc(nomeBackup(r.ultimaVersao.nome))} (cópia de segurança guardada)` : "Nenhuma cópia de segurança ainda.";
  main.innerHTML = cabecalho("Visão geral", esc(hoje.charAt(0).toUpperCase() + hoje.slice(1)),
      `<button class="btn" data-acao="recarregar">Atualizar</button>
       <button class="btn so-celular" data-acao="ir" data-tela="config">Configurações</button>`) + `
    <div class="grade-numeros">
      <div class="numero"><span class="valor">${r.totalAulas}</span><span class="rotulo">Aulas na grade</span><span class="detalhe">${r.aDefinir} sem professor (A definir)</span></div>
      <div class="numero"><span class="valor">${r.professoresAtivos}</span><span class="rotulo">Professores ativos</span><span class="detalhe">${r.professoresInativos} desligado${r.professoresInativos === 1 ? "" : "s"}</span></div>
      <div class="numero ${r.faltas.length ? "alerta" : ""}"><span class="valor">${r.faltas.length}</span><span class="rotulo">Faltas sem substituto</span><span class="detalhe">${r.faltas[0] ? esc(r.faltas[0].disc + " · " + r.faltas[0].turma) : "nenhuma agora"}</span></div>
      <div class="numero ${r.emails.erros ? "alerta" : ""}"><span class="valor">${r.emails.total}</span><span class="rotulo">E-mails nesta semana</span><span class="detalhe">${r.emails.total - r.emails.erros} enviado${r.emails.total - r.emails.erros === 1 ? "" : "s"} · ${r.emails.erros} com erro</span></div>
    </div>
    <div class="duas-colunas">
      <section class="cartao cartao-pad"><h2 class="secao-titulo">Precisa da sua atenção</h2>${avisos.join("")}</section>
      <section class="cartao cartao-pad"><h2 class="secao-titulo">Ações rápidas</h2>
        <div class="lista-acoes">
          <button class="btn" data-acao="nova-aula">+ Cadastrar aula</button>
          <button class="btn" data-acao="novo-prof">+ Cadastrar professor</button>
          <button class="btn" data-acao="ir" data-tela="arquivos">Importar grade nova</button>
          <button class="btn" data-acao="exportar-excel">Exportar grade (Excel)</button>
        </div>
        <p class="mudo pequeno" style="margin:12px 0 0">${ultima}</p>
      </section>
    </div>`;
}

function atualizarSelo(n) {
  const s = $("#seloErros");
  if (n) { s.textContent = n; s.title = n + (n > 1 ? " e-mails com erro" : " e-mail com erro"); s.classList.remove("oculto"); } else s.classList.add("oculto");
}

// ---------- indicar substituto / liberar
async function modalIndicar(id) {
  await Promise.all([carregarGrade(), carregarProfessores()]);
  const aula = estado.grade.find((a) => a.id === id);
  if (!aula) { toast("Aula não encontrada. Atualize a página.", true); return; }
  const ocupados = new Set(estado.grade.filter((a) => a.dia === aula.dia && a.hora === aula.hora).map((a) => a.prof));
  const nomes = profsAtivos().filter((n) => n !== aula.prof).sort((a, b) => (ocupados.has(a) - ocupados.has(b)) || a.localeCompare(b, "pt-BR"));
  const m = abrirModal(`<h2>Indicar substituto</h2>
    <p class="mudo" style="margin:0">${esc(aula.disc)} · ${esc(aula.turma)} · ${esc(aula.dia)} ${esc(aula.hora)} · titular: Prof. ${esc(aula.prof)}</p>
    <div class="campo"><label for="mSubs">Substituto</label><select id="mSubs" class="input">
      ${nomes.map((n) => `<option value="${esc(n)}">${esc(n)}${ocupados.has(n) ? " — tem aula nesse horário" : " — livre"}</option>`).join("")}</select></div>
    <p class="mudo pequeno" style="margin:0">O titular, o substituto e a coordenação recebem e-mail.</p>
    <div id="mConf"></div>
    <div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="mOk">Indicar</button></div>`);
  let forcar = false;
  $("#mOk", m).addEventListener("click", async () => {
    const b = $("#mOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_aula_status", { id, tipo: "assumir", substituto: $("#mSubs", m).value, forcar });
      if (r.conflitos) { $("#mConf", m).innerHTML = blocoConflitos(r.conflitos); forcar = true; b.textContent = "Indicar mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast("Substituto indicado e e-mails enviados."); invalidarDados(); recarregarTela();
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  });
}

async function mudarStatus(id, tipo) {
  const textos = {
    liberar: ["Liberar aula?", "A aula volta a aparecer como <strong>falta sem substituto</strong> para os professores assumirem.", "Liberar"],
    normal: ["Voltar ao normal?", "Remove a falta/substituição desta aula (o professor titular dá a aula).", "Voltar ao normal"]
  }[tipo];
  if (!(await confirmar(textos[0], textos[1], textos[2]))) return;
  try {
    const r = await chamar("admin_aula_status", { id, tipo });
    if (!r.sucesso) throw new Error(r.erro);
    toast("Pronto."); invalidarDados(); fecharModal(); recarregarTela();
  } catch (e) { toast(e.message, true); }
}

// ================================================================ E-MAILS
async function telaEmails(main) {
  const r = await chamar("admin_emails_listar", { limite: 1000 });
  if (!r.sucesso) throw new Error(r.erro);
  estado.emails = r.emails;
  estado.selEmails.clear();
  const f = estado.filtrosEmail;
  main.innerHTML = cabecalho("E-mails & Avisos", "Todos os e-mails enviados pelo sistema (aba E-mails_Enviados da planilha)",
      `<button class="btn" data-acao="exportar-emails">Exportar lista</button>`) + `
    <section class="cartao">
      <div class="filtros">
        <div class="campo largo"><label for="fBusca">Buscar</label><input id="fBusca" class="input" type="search" placeholder="Assunto, professor ou e-mail" value="${esc(f.busca)}"></div>
        <div class="campo"><label for="fTipo">Tipo</label><select id="fTipo" class="input">
          ${["", "Falta", "Substituição", "Troca", "Reposição", "PIN", "Teste", "Aviso"].map((t) => `<option value="${t}" ${f.tipo === t ? "selected" : ""}>${t || "Todos"}</option>`).join("")}</select></div>
        <div class="campo"><label for="fStatus">Status</label><select id="fStatus" class="input">
          ${[["ativos", "Sem arquivados"], ["", "Todos"], ["Enviado", "Enviado"], ["Erro", "Erro"], ["Reenviado", "Reenviado"], ["Arquivado", "Arquivado"]].map(([v, t]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="campo"><label for="fPeriodo">Período</label><select id="fPeriodo" class="input">
          ${[["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["180", "Últimos 6 meses"], ["", "Tudo"]].map(([v, t]) => `<option value="${v}" ${f.periodo === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div id="barraEmails"></div>
      <div class="tabela-rolagem" id="tabEmails"></div>
    </section>`;
  const ligar = (id, campo) => $(id, main).addEventListener("input", (e) => { f[campo] = e.target.value; estado.selEmails.clear(); desenharEmails(); });
  ligar("#fBusca", "busca"); ligar("#fTipo", "tipo"); ligar("#fStatus", "status"); ligar("#fPeriodo", "periodo");
  desenharEmails();
}

function emailsFiltrados() {
  const f = estado.filtrosEmail;
  const limite = f.periodo ? Date.now() - parseInt(f.periodo, 10) * 86400000 : 0;
  const b = f.busca.trim().toLowerCase();
  return estado.emails.filter((e) =>
    (!f.tipo || e.tipo === f.tipo) &&
    (f.status === "" || (f.status === "ativos" ? e.status !== "Arquivado" : e.status === f.status)) &&
    (!limite || e.data >= limite) &&
    (!b || (e.assunto + " " + e.para).toLowerCase().includes(b)));
}

function desenharEmails() {
  const lista = emailsFiltrados();
  const sel = estado.selEmails;
  const corTipo = { Falta: "et-vermelho", "Substituição": "et-verde", Troca: "et-roxo", "Reposição": "et-azul", PIN: "et-laranja" };
  const corStatus = { Enviado: "et-verde", Erro: "et-vermelho", Reenviado: "et-azul", Arquivado: "" };
  const temArquivado = [...sel].some((id) => (estado.emails.find((e) => e.id === id) || {}).status === "Arquivado");
  $("#barraEmails").innerHTML = sel.size ? `<div class="barra-selecao"><strong>${sel.size} selecionado${sel.size > 1 ? "s" : ""}</strong>
    <button class="btn btn-pequeno" data-acao="email-reenviar">Reenviar</button>
    <button class="btn btn-pequeno" data-acao="${temArquivado ? "email-desarquivar" : "email-arquivar"}">${temArquivado ? "Desarquivar" : "Arquivar"}</button>
    <button class="btn btn-pequeno btn-perigo" data-acao="email-apagar">Apagar</button></div>` : "";
  if (!lista.length) { $("#tabEmails").innerHTML = `<div class="vazio">Nenhum e-mail com esses filtros.</div>`; return; }
  const todos = lista.every((e) => sel.has(e.id));
  $("#tabEmails").innerHTML = `<table><thead><tr>
      <th style="width:36px"><input type="checkbox" class="chk" data-chk-todos-emails aria-label="Selecionar todos" ${todos ? "checked" : ""}></th>
      <th>Data</th><th>Tipo</th><th>Assunto</th><th class="esconder-celular">Destinatários</th><th>Status</th></tr></thead><tbody>
    ${lista.slice(0, 300).map((e) => {
      const para = String(e.para || "").split(/,\s*/).filter(Boolean);
      const paraTxt = para.length ? para[0].split("@")[0] + (para.length > 1 ? ` +${para.length - 1}` : "") : "—";
      return `<tr class="${sel.has(e.id) ? "selecionada" : ""}">
        <td><input type="checkbox" class="chk" data-chk-email="${esc(e.id)}" ${sel.has(e.id) ? "checked" : ""} aria-label="Selecionar"></td>
        <td style="white-space:nowrap">${esc(dataHora(e.data))}</td>
        <td><span class="etiqueta ${corTipo[e.tipo] || ""}">${esc(e.tipo)}</span></td>
        <td>${esc(e.assunto)}</td>
        <td class="esconder-celular" title="${esc(e.para)}">${esc(paraTxt)}</td>
        <td><span class="etiqueta ${corStatus[e.status] || ""}" ${e.erro ? `title="${esc(e.erro)}"` : ""}>${esc(e.status)}${e.status === "Erro" && e.erro ? " · " + esc(String(e.erro).replace(/^(Exception|Error):\s*/, "").slice(0, 40)) : ""}</span></td></tr>`;
    }).join("")}</tbody></table>
    <div class="paginacao"><span>Mostrando ${Math.min(300, lista.length)} de ${lista.length}</span><span>Apagar remove da planilha; o Gmail de quem administra mantém a cópia enviada.</span></div>`;
}

async function acaoEmails(tipo) {
  const ids = [...estado.selEmails];
  if (!ids.length) return;
  if (tipo === "apagar" && !(await confirmar(`Apagar ${ids.length} registro${ids.length > 1 ? "s" : ""}?`,
    "Eles saem da planilha, mas continuam no Gmail Enviados de quem administra o sistema. <strong>Arquivar</strong> apenas esconde da lista.", "Apagar", true))) return;
  if (tipo === "reenviar" && !(await confirmar(`Reenviar ${ids.length} e-mail${ids.length > 1 ? "s" : ""}?`, "Os mesmos destinatários recebem a mensagem de novo.", "Reenviar"))) return;
  try {
    const r = await chamar("admin_emails_acao", { tipo, ids });
    if (r.falhas && r.falhas.length) toast("Alguns não foram: " + r.falhas[0], true);
    else if (!r.sucesso) throw new Error(r.erro);
    else toast({ apagar: "Apagados.", arquivar: "Arquivados.", desarquivar: "Desarquivados.", reenviar: "Reenviados." }[tipo]);
    recarregarTela();
  } catch (e) { toast(e.message, true); }
}

function baixarArquivo(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function csv(linhas) {
  return "﻿" + linhas.map((l) => l.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

// ================================================================ GRADE
async function telaGrade(main) {
  await Promise.all([carregarGrade(), carregarProfessores(), carregarCadastros().catch(() => null)]);
  estado.selAulas.clear();
  const f = estado.filtrosGrade;
  if (!estado.vistaGrade) estado.vistaGrade = "quadro";
  const turmas = [...new Set([...estado.grade.map((a) => a.turma), ...(estado.cad ? estado.cad.turmas.filter((t) => t.ativo).map((t) => t.nome) : [])])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const profs = [...new Set(estado.grade.map((a) => a.prof))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  // No quadro é preciso escolher uma turma ou um professor
  if (estado.vistaGrade === "quadro" && !f.turma && !f.prof) f.turma = turmas[0] || "";
  const quadro = estado.vistaGrade === "quadro";
  main.innerHTML = cabecalho("Grade de aulas", `${estado.grade.length} aulas em ${turmas.length} turmas`,
      `<div class="alternador" role="group" aria-label="Forma de ver a grade">
         <button type="button" data-acao="vista-grade" data-vista="quadro" aria-pressed="${quadro}">Quadro semanal</button>
         <button type="button" data-acao="vista-grade" data-vista="lista" aria-pressed="${!quadro}">Lista</button></div>
       <button class="btn" data-acao="ir" data-tela="cadastros">Cadastros</button>
       <button class="btn btn-primario" data-acao="nova-aula">Nova aula</button>`) + `
    <section class="cartao">
      <div class="filtros">
        <div class="campo"><label for="gTurma">Turma</label><select id="gTurma" class="input"><option value="">${quadro ? "Escolha…" : "Todas"}</option>
          ${turmas.map((t) => `<option ${f.turma === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="campo"><label for="gProf">Professor</label><select id="gProf" class="input"><option value="">${quadro ? "Escolha…" : "Todos"}</option>
          ${profs.map((p) => `<option ${f.prof === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
        ${quadro ? "" : `<div class="campo"><label for="gDia">Dia</label><select id="gDia" class="input"><option value="">Todos</option>
          ${DIAS.map((d) => `<option ${f.dia === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="campo largo"><label for="gBusca">Disciplina</label><input id="gBusca" class="input" type="search" placeholder="Buscar disciplina" value="${esc(f.busca)}"></div>`}
      </div>
      <div id="barraAulas"></div>
      <div class="tabela-rolagem" id="tabAulas"></div>
    </section>
    ${quadro ? `<p class="legenda"><span class="lg lg-falta"></span>Falta sem substituto <span class="lg lg-subs"></span>Substituída <span class="lg lg-def"></span>Sem professor <span class="mudo">· Clique numa aula para editar ou num horário vazio para cadastrar.</span></p>` : ""}`;
  const ligar = (id, campo) => { const el = $(id, main); if (el) el.addEventListener("input", (e) => {
    f[campo] = e.target.value;
    // No quadro, turma e professor são alternativos: escolher um limpa o outro
    if (quadro && campo === "turma" && f.turma) { f.prof = ""; $("#gProf", main).value = ""; }
    if (quadro && campo === "prof" && f.prof) { f.turma = ""; $("#gTurma", main).value = ""; }
    estado.selAulas.clear(); desenharAulas();
  }); };
  ligar("#gTurma", "turma"); ligar("#gProf", "prof"); ligar("#gDia", "dia"); ligar("#gBusca", "busca");
  desenharAulas();
}

function aulasFiltradas() {
  const f = estado.filtrosGrade, b = f.busca.trim().toLowerCase();
  const quadro = estado.vistaGrade === "quadro";
  return estado.grade.filter((a) => (!f.turma || a.turma === f.turma) && (!f.prof || a.prof === f.prof) &&
    (quadro || ((!f.dia || a.dia === f.dia) && (!b || String(a.disc).toLowerCase().includes(b)))));
}

function etiquetaSituacao(a) {
  if (a.status === "alert") return `<span class="etiqueta et-vermelho">Falta${a.dataFalta ? " · " + esc(a.dataFalta) : ""}</span>`;
  if (a.status === "assumed") return `<span class="etiqueta et-laranja">Substituto: ${esc(a.substituto)}</span>`;
  if (a.prof === "A definir") return `<span class="etiqueta et-azul">Sem professor</span>`;
  return "";
}

function classeAula(a) {
  if (a.status === "alert") return "falta";
  if (a.status === "assumed") return "subs";
  if (a.prof === "A definir") return "def";
  return "";
}

function desenharAulas() {
  if (estado.vistaGrade === "quadro") return desenharQuadro();
  const lista = aulasFiltradas(), sel = estado.selAulas;
  $("#barraAulas").innerHTML = sel.size ? `<div class="barra-selecao"><strong>${sel.size} aula${sel.size > 1 ? "s" : ""} selecionada${sel.size > 1 ? "s" : ""}</strong>
    <button class="btn btn-pequeno btn-primario" data-acao="atribuir">Atribuir professor</button>
    <button class="btn btn-pequeno" data-acao="limpar-sel">Limpar seleção</button></div>` : "";
  if (!lista.length) { $("#tabAulas").innerHTML = `<div class="vazio">Nenhuma aula com esses filtros.</div>`; return; }
  const todos = lista.every((a) => sel.has(a.id));
  let diaAtual = "";
  const linhas = lista.map((a) => {
    const cab = a.dia !== diaAtual ? `<tr class="dia-grupo"><th colspan="6">${esc(a.dia)}</th></tr>` : "";
    diaAtual = a.dia;
    return cab + `<tr class="${sel.has(a.id) ? "selecionada" : ""}">
      <td class="col-chk"><input type="checkbox" class="chk" data-chk-aula="${esc(a.id)}" ${sel.has(a.id) ? "checked" : ""} aria-label="Selecionar ${esc(a.disc)} ${esc(a.hora)}"></td>
      <td class="col-hora">${esc(a.hora.replace(" - ", "–"))}</td>
      <td>${esc(a.turma)}</td>
      <td><span class="disc">${esc(a.disc)}</span>${salaDaObs(a.obs) ? ` <span class="mudo pequeno">${esc(salaDaObs(a.obs))}</span>` : ""}
        <div class="sit">${etiquetaSituacao(a)}</div></td>
      <td>${a.prof === "A definir" ? `<span class="mudo">A definir</span>` : esc(a.prof)}</td>
      <td class="acoes"><button class="btn-link" data-acao="editar-aula" data-id="${esc(a.id)}">Editar</button></td></tr>`;
  }).join("");
  $("#tabAulas").innerHTML = `<table class="tabela-aulas"><colgroup><col style="width:44px"><col style="width:120px"><col style="width:22%"><col><col style="width:20%"><col style="width:72px"></colgroup>
    <thead><tr><th class="col-chk"><input type="checkbox" class="chk" data-chk-todas-aulas aria-label="Selecionar todas" ${todos ? "checked" : ""}></th>
      <th>Horário</th><th>Turma</th><th>Disciplina</th><th>Professor</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="paginacao"><span>${lista.length} aula${lista.length > 1 ? "s" : ""}</span><span>Marque aulas para atribuir professor de uma vez</span></div>`;
}

function desenharQuadro() {
  $("#barraAulas").innerHTML = "";
  const f = estado.filtrosGrade;
  const lista = aulasFiltradas();
  if (!f.turma && !f.prof) { $("#tabAulas").innerHTML = `<div class="vazio">Escolha uma turma ou um professor para ver o quadro da semana.</div>`; return; }
  const porTurma = !!f.turma;
  // Linhas: horários usados por essa turma/professor (e, para a turma, o turno completo dela)
  const base = porTurma ? estado.grade.filter((a) => a.turma === f.turma) : lista;
  const semAulas = porTurma && !base.length;
  const cursoQ = porTurma ? cursoDe(f.turma) : null;
  const horas = [...new Set([...(porTurma ? temposDaTurma(f.turma) : []), ...base.map((a) => a.hora)])].sort();
  const dias = DIAS.filter((d, i) => i < 5 || base.some((a) => a.dia === d));
  if (!horas.length) { $("#tabAulas").innerHTML = `<div class="vazio">Nenhuma aula para ${esc(f.turma || f.prof)}. Cadastre os horários do turno em Cadastros → Horários.</div>`; return; }
  const total = lista.length;
  const corpo = horas.map((h) => `<tr><th class="q-hora" scope="row">${esc(h.replace(" - ", "–"))}</th>${dias.map((d) => {
    const aulas = lista.filter((a) => a.dia === d && a.hora === h);
    if (!aulas.length) return `<td class="q-vazio"><button class="q-add" data-acao="nova-aula-slot" data-dia="${esc(d)}" data-hora="${esc(h)}" aria-label="Cadastrar aula ${esc(d)} ${esc(h)}">+</button></td>`;
    return `<td>${aulas.map((a) => `<button class="q-aula ${classeAula(a)}" data-acao="editar-aula" data-id="${esc(a.id)}">
        <span class="q-disc">${esc(a.disc)}</span>
        <span class="q-quem">${esc(porTurma ? a.prof : a.turma)}${salaDaObs(a.obs) ? " · " + esc(salaDaObs(a.obs)) : ""}</span>
        ${a.status === "assumed" ? `<span class="q-st">Substituto: ${esc(a.substituto)}</span>` : a.status === "alert" ? `<span class="q-st">Falta${a.dataFalta ? " · " + esc(a.dataFalta) : ""}</span>` : ""}
      </button>`).join("")}</td>`;
  }).join("")}</tr>`).join("");
  $("#tabAulas").innerHTML = `<table class="quadro"><thead><tr><th class="q-hora">Horário</th>${dias.map((d) => `<th>${esc(diaCurto(d))}</th>`).join("")}</tr></thead>
    <tbody>${corpo}</tbody></table>
    <div class="paginacao"><span>${esc(porTurma ? "Turma " + f.turma : "Prof. " + f.prof)} · ${total} aula${total === 1 ? "" : "s"} na semana</span>
      <button class="btn-link" data-acao="imprimir-quadro">Imprimir este quadro</button></div>`;
}

async function modalAula(id, pre) {
  await Promise.all([carregarGrade(), carregarProfessores(), carregarCadastros().catch(() => null)]);
  const a = id ? estado.grade.find((x) => x.id === id) : null;
  if (id && !a) { toast("Aula não encontrada.", true); return; }
  const f = estado.filtrosGrade;
  const v = a || Object.assign({ prof: f.prof || "", dia: f.dia || "Segunda-feira", hora: "", turma: f.turma || "", disc: "", obs: "" }, pre || {});
  const cad = estado.cad && estado.cad.turmas.length ? estado.cad : null;
  const nomes = profsAtivos().sort((x, y) => x.localeCompare(y, "pt-BR"));
  if (v.prof && v.prof !== "A definir" && !nomes.includes(v.prof)) nomes.unshift(v.prof);
  const status = a && a.status !== "normal" ? `<div class="aviso ${a.status === "alert" ? "aviso-vermelho" : "aviso-laranja"}" style="padding:10px 12px">
      <div class="txt"><strong>${a.status === "alert" ? "Falta lançada" : "Substituída por " + esc(a.substituto)}</strong><span>${esc(a.obs)}${a.dataFalta ? " · " + esc(a.dataFalta) : ""}</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${a.status === "alert" ? `<button class="btn btn-pequeno" data-acao="indicar" data-id="${esc(a.id)}">Indicar substituto</button>` :
        `<button class="btn btn-pequeno" data-acao="liberar" data-id="${esc(a.id)}">Liberar</button>`}
      <button class="btn btn-pequeno" data-acao="normalizar" data-id="${esc(a.id)}">Voltar ao normal</button></div></div>` : "";
  const m = abrirModal(`<h2>${a ? "Editar aula" : "Nova aula"}</h2>
    ${a ? `<p class="mudo pequeno" style="margin:-6px 0 0">Código ${esc(a.id)} · ${esc(a.turma)} · ${esc(a.dia)}</p>` : ""}
    ${status}
    <div class="linha">
      <div class="campo"><label for="aProf">Professor</label><select id="aProf" class="input">
        <option value="">Escolha…</option><option value="A definir" ${v.prof === "A definir" ? "selected" : ""}>A definir</option>
        ${nomes.map((n) => `<option ${v.prof === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="campo"><label for="aDia">Dia</label><select id="aDia" class="input">${DIAS.map((d) => `<option ${v.dia === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
    </div>
    <div class="linha">
      <div class="campo"><label for="aTurma">Turma</label>${cad ? `<select id="aTurma" class="input"><option value="">Escolha…</option>
        ${cad.cursos.map((c) => { const ts = cad.turmas.filter((t) => t.curso === c.id && (t.ativo || t.nome === v.turma));
          return ts.length ? `<optgroup label="${esc(c.nome)}">${ts.map((t) => `<option ${t.nome === v.turma ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</optgroup>` : ""; }).join("")}
        </select>` : `<input id="aTurma" class="input" value="${esc(v.turma)}">`}</div>
      <div class="campo"><label for="aHora">Horário</label>${cad ? `<select id="aHora" class="input"></select>` : `<input id="aHora" class="input" placeholder="08:40 - 09:30" value="${esc(v.hora)}">`}</div>
    </div>
    <div class="linha">
      <div class="campo"><label for="aDisc">Disciplina</label>${cad ? `<select id="aDisc" class="input"></select>` : `<input id="aDisc" class="input" value="${esc(v.disc)}">`}</div>
      <div class="campo"><label for="aSala">Sala (opcional)</label><input id="aSala" class="input" placeholder="Lab 2" value="${esc(salaDaObs(v.obs))}"></div>
    </div>
    ${cad ? `<p class="mudo pequeno" style="margin:-4px 0 0">Falta turma, disciplina ou horário? <button type="button" class="btn-link" data-acao="ir-cadastros">Abrir Cadastros</button></p>` : ""}
    <div id="aConf"></div>
    <div class="botoes">${a ? `<button class="btn btn-perigo esquerda" id="aExcluir">Excluir aula</button>` : ""}
      <button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="aSalvar">Salvar</button></div>`);
  let forcar = false;
  // Disciplinas e horários dependem da turma escolhida (curso e turno)
  const preencherDependentes = () => {
    if (!cad) return;
    const turma = $("#aTurma", m).value, curso = cursoDe(turma);
    const discAtual = $("#aDisc", m).value || v.disc, horaAtual = $("#aHora", m).value || v.hora;
    const discs = curso ? cad.disciplinas.filter((x) => x.curso === curso.id && (x.ativo || x.nome === discAtual)).map((x) => x.nome).sort((x, y) => x.localeCompare(y, "pt-BR")) : [];
    if (discAtual && !discs.includes(discAtual)) discs.unshift(discAtual);
    $("#aDisc", m).innerHTML = `<option value="">${turma ? "Escolha…" : "Escolha a turma primeiro"}</option>` + discs.map((d) => `<option ${d === discAtual ? "selected" : ""}>${esc(d)}</option>`).join("");
    const horas = curso ? temposDaTurma(turma) : [];
    if (horaAtual && !horas.includes(horaAtual)) horas.unshift(horaAtual);
    $("#aHora", m).innerHTML = `<option value="">${turma ? "Escolha…" : "Escolha a turma primeiro"}</option>` + horas.map((h) => `<option value="${esc(h)}" ${h === horaAtual ? "selected" : ""}>${esc(h.replace(" - ", "–"))}</option>`).join("");
  };
  preencherDependentes();
  if (cad) $("#aTurma", m).addEventListener("change", preencherDependentes);
  if (cad && !a) $("#aDisc", m).addEventListener("change", () => {
    const curso = cursoDe($("#aTurma", m).value), d = curso && cad.disciplinas.find((x) => x.curso === curso.id && x.nome === $("#aDisc", m).value);
    if (d && d.professor && !$("#aProf", m).value) $("#aProf", m).value = d.professor;
  });
  $$("#aProf,#aDia,#aHora,#aTurma", m).forEach((el) => el.addEventListener("input", () => { forcar = false; $("#aConf", m).innerHTML = ""; $("#aSalvar", m).textContent = "Salvar"; }));
  $("#aSalvar", m).addEventListener("click", async () => {
    const hora = normalizarHora($("#aHora", m).value);
    const aula = { id: a ? a.id : "", professor: $("#aProf", m).value, dia: $("#aDia", m).value, hora,
      turma: $("#aTurma", m).value.trim(), disc: $("#aDisc", m).value.trim(), sala: $("#aSala", m).value.trim() };
    if (!aula.professor || !aula.turma || !aula.disc) { $("#aConf", m).innerHTML = `<div class="erro">Preencha professor, turma e disciplina.</div>`; return; }
    if (!hora) { $("#aConf", m).innerHTML = `<div class="erro">${cad ? "Escolha o horário." : "Horário no formato 08:40 - 09:30."}</div>`; return; }
    const b = $("#aSalvar", m); b.disabled = true;
    try {
      const r = await chamar("admin_aula_salvar", { aula, forcar });
      if (r.conflitos) { $("#aConf", m).innerHTML = blocoConflitos(r.conflitos); forcar = true; b.textContent = "Salvar mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(a ? "Aula atualizada." : "Aula cadastrada (" + r.id + ")."); invalidarDados(); recarregarTela();
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  });
  if (a) $("#aExcluir", m).addEventListener("click", async () => {
    if (!(await confirmar("Excluir aula?", `${esc(a.disc)} · ${esc(a.turma)} · ${esc(a.dia)} ${esc(a.hora)} sai da grade. Dá para desfazer restaurando uma versão anterior em Importar / Exportar.`, "Excluir", true))) return;
    try {
      const r = await chamar("admin_aula_excluir", { id: a.id });
      if (!r.sucesso) throw new Error(r.erro);
      toast("Aula excluída."); invalidarDados(); recarregarTela();
    } catch (e) { toast(e.message, true); }
  });
}

function normalizarHora(v) {
  const m = String(v || "").match(/(\d{1,2})\s*[:hH]\s*(\d{2})\D+(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!m) return "";
  const p = (n) => String(parseInt(n, 10)).padStart(2, "0");
  return `${p(m[1])}:${m[2]} - ${p(m[3])}:${m[4]}`;
}

async function modalAtribuir() {
  const ids = [...estado.selAulas];
  await carregarProfessores();
  const nomes = profsAtivos().sort((x, y) => x.localeCompare(y, "pt-BR"));
  const m = abrirModal(`<h2>Atribuir professor</h2><p class="mudo" style="margin:0">${ids.length} aula${ids.length > 1 ? "s" : ""} selecionada${ids.length > 1 ? "s" : ""} passa${ids.length > 1 ? "m" : ""} para:</p>
    <div class="campo"><label for="tProf">Professor</label><select id="tProf" class="input"><option value="A definir">A definir</option>
      ${nomes.map((n) => `<option>${esc(n)}</option>`).join("")}</select></div>
    <div id="tConf"></div>
    <div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="tOk">Atribuir</button></div>`);
  let forcar = false;
  $("#tProf", m).addEventListener("input", () => { forcar = false; $("#tConf", m).innerHTML = ""; $("#tOk", m).textContent = "Atribuir"; });
  $("#tOk", m).addEventListener("click", async () => {
    const b = $("#tOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_aulas_atribuir", { ids, professor: $("#tProf", m).value, forcar });
      if (r.conflitos) { $("#tConf", m).innerHTML = blocoConflitos(r.conflitos); forcar = true; b.textContent = "Atribuir mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(r.afetadas + " aula(s) atribuída(s)."); invalidarDados(); recarregarTela();
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  });
}

// ================================================================ CADASTROS
const ABAS_CAD = [["cursos", "Cursos"], ["turmas", "Turmas"], ["disciplinas", "Disciplinas"], ["tempos", "Horários"]];

async function telaCadastros(main) {
  await Promise.all([carregarCadastros(true), carregarGrade().catch(() => null), carregarProfessores().catch(() => null)]);
  if (!estado.abaCad) estado.abaCad = "cursos";
  estado.filtroCad = estado.filtroCad || { curso: "", busca: "", turno: "" };
  main.innerHTML = cabecalho("Cadastros", "Cursos, turmas, disciplinas e horários usados na grade, no cadastro de aula e na importação",
      `<button class="btn" data-acao="ir" data-tela="grade">Voltar à grade</button>`) + `
    <div class="alternador" role="tablist" aria-label="Tipo de cadastro" id="abasCad"></div>
    <section class="cartao" id="secCad"></section>`;
  desenharCadastros();
}

function aulasDaDisciplina(x) { return estado.grade.filter((a) => a.disc === x.nome && (cursoDe(a.turma) || {}).id === x.curso); }
function chaveCad(tipo, x) {
  return esc(JSON.stringify(tipo === "curso" ? { id: x.id } : tipo === "turma" ? { nome: x.nome } : tipo === "disciplina" ? { nome: x.nome, curso: x.curso } : { turno: x.turno, hora: x.hora, turma: x.turma || "" }));
}
function situacao(ativo) { return ativo ? "" : ` <span class="etiqueta">inativo</span>`; }

function desenharCadastros() {
  const c = estado.cad, aba = estado.abaCad, f = estado.filtroCad;
  $("#abasCad").innerHTML = ABAS_CAD.map(([k, t]) => `<button type="button" role="tab" data-acao="aba-cadastro" data-aba="${k}" aria-pressed="${aba === k}">${t}</button>`).join("");
  const nomeCurso = (id) => (c.cursos.find((x) => x.id === id) || {}).nome || id;
  const filtroCurso = (comTurno) => `<div class="filtros">
      ${comTurno ? `<div class="campo"><label for="fcTurno">Turno</label><select id="fcTurno" class="input"><option value="">Todos</option>${c.turnos.map((t) => `<option ${f.turno === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>`
        : `<div class="campo"><label for="fcCurso">Curso</label><select id="fcCurso" class="input"><option value="">Todos</option>${c.cursos.map((x) => `<option value="${esc(x.id)}" ${f.curso === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
        <div class="campo largo"><label for="fcBusca">Buscar</label><input id="fcBusca" class="input" type="search" value="${esc(f.busca)}"></div>`}</div>`;
  let titulo = "", novo = "", corpo = "", topo = "";
  const b = f.busca.trim().toLowerCase();
  if (aba === "cursos") {
    titulo = "Cursos"; novo = `<button class="btn btn-primario btn-pequeno" data-acao="cad-novo" data-tipo="curso">Novo curso</button>`;
    corpo = `<table><thead><tr><th>Curso</th><th>Turno</th><th>E-mail da coordenação</th><th>Turmas</th><th></th></tr></thead><tbody>
      ${c.cursos.map((x) => `<tr><td><strong>${esc(x.nome)}</strong>${situacao(x.ativo)}</td><td>${esc(x.turno)}</td>
        <td>${x.email ? esc(x.email) : `<span class="etiqueta et-vermelho">sem e-mail</span>`}</td><td>${x.turmas}</td>
        <td class="acoes"><button class="btn-link" data-acao="cad-editar" data-tipo="curso" data-chave="${chaveCad("curso", x)}">Editar</button></td></tr>`).join("")}</tbody></table>`;
  } else if (aba === "turmas") {
    titulo = "Turmas"; novo = `<button class="btn btn-primario btn-pequeno" data-acao="cad-novo" data-tipo="turma">Nova turma</button>`; topo = filtroCurso(false);
    const l = c.turmas.filter((x) => (!f.curso || x.curso === f.curso) && (!b || x.nome.toLowerCase().includes(b)));
    corpo = l.length ? `<table><thead><tr><th>Turma</th><th>Curso</th><th>Aulas na grade</th><th></th></tr></thead><tbody>
      ${l.map((x) => `<tr><td><strong>${esc(x.nome)}</strong>${situacao(x.ativo)}</td><td>${esc(nomeCurso(x.curso))}</td><td>${x.aulas}</td>
        <td class="acoes"><button class="btn-link" data-acao="cad-editar" data-tipo="turma" data-chave="${chaveCad("turma", x)}">Editar</button>
        ${x.aulas ? "" : `<button class="btn-link perigo" data-acao="cad-excluir" data-tipo="turma" data-chave="${chaveCad("turma", x)}">Excluir</button>`}</td></tr>`).join("")}</tbody></table>` : `<div class="vazio">Nenhuma turma com esses filtros.</div>`;
  } else if (aba === "disciplinas") {
    titulo = "Disciplinas"; novo = `<button class="btn btn-primario btn-pequeno" data-acao="cad-novo" data-tipo="disciplina">Nova disciplina</button>`; topo = filtroCurso(false);
    const l = c.disciplinas.filter((x) => (!f.curso || x.curso === f.curso) && (!b || x.nome.toLowerCase().includes(b)))
      .sort((x, y) => nomeCurso(x.curso).localeCompare(nomeCurso(y.curso), "pt-BR") || x.nome.localeCompare(y.nome, "pt-BR"));
    corpo = l.length ? `<table><thead><tr><th>Disciplina</th><th>Curso</th><th>Professor(es)</th><th>Aulas na grade</th><th></th></tr></thead><tbody>
      ${l.map((x) => { const au = aulasDaDisciplina(x); const pr = [...new Set(au.map((a) => a.prof))].sort((p, q) => p.localeCompare(q, "pt-BR"));
        return `<tr><td><strong>${esc(x.nome)}</strong>${situacao(x.ativo)}</td><td>${esc(nomeCurso(x.curso))}</td>
        <td>${pr.map((p) => `<span class="etiqueta${p === "A definir" ? " et-amarelo" : ""}">${esc(p)}</span>`).join(" ")}${x.professor && !pr.includes(x.professor) ? ` <span class="etiqueta" title="Professor responsável (sem aulas ainda)">${esc(x.professor)} · resp.</span>` : ""}${!pr.length && !x.professor ? `<span class="etiqueta et-amarelo">sem professor</span>` : ""}</td><td>${x.aulas}</td>
        <td class="acoes">${au.length ? `<button class="btn-link" data-acao="disc-atribuir" data-chave="${chaveCad("disciplina", x)}">Atribuir professor</button>` : ""}<button class="btn-link" data-acao="cad-editar" data-tipo="disciplina" data-chave="${chaveCad("disciplina", x)}">Editar</button>
        ${x.aulas ? "" : `<button class="btn-link perigo" data-acao="cad-excluir" data-tipo="disciplina" data-chave="${chaveCad("disciplina", x)}">Excluir</button>`}</td></tr>`; }).join("")}</tbody></table>` : `<div class="vazio">Nenhuma disciplina com esses filtros.</div>`;
  } else {
    titulo = "Horários (tempos de aula)"; novo = `${c.tempos.some((h) => h.turno === "Diurno") || c.cursos.some((x) => (x.turnos || [x.turno]).includes("Diurno")) ? `<button class="btn btn-pequeno" data-acao="organizar-turnos">Organizar em Matutino / Vespertino / Noturno</button>` : ""}<button class="btn btn-pequeno" data-acao="tempos-copiar">Horários por turma</button><button class="btn btn-primario btn-pequeno" data-acao="cad-novo" data-tipo="tempo">Novo horário</button>`;
    const turnos = c.turnos.filter((t) => (!f.turno || f.turno === t) && (t !== "Diurno" || c.tempos.some((h) => h.turno === t) || c.cursos.some((x) => (x.turnos || [x.turno]).includes(t))));
    const ft = f.turma || "";
    const ini = (h) => { const m = h.hora.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/); return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [0, 0]; };
    const turmasProprias = new Set(c.tempos.filter((h) => h.turma).map((h) => h.turma));
    topo = `<div class="filtros"><div class="campo"><label for="fcTurno">Turno</label><select id="fcTurno" class="input"><option value="">Todos</option>${c.turnos.map((t) => `<option ${f.turno === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="campo"><label for="fcTurma">Turma</label><select id="fcTurma" class="input"><option value="">Todas</option><option value="__padrao" ${ft === "__padrao" ? "selected" : ""}>Só o padrão do turno</option>
      ${c.turmas.map((t) => `<option value="${esc(t.nome)}" ${ft === t.nome ? "selected" : ""}>${esc(t.nome)}${turmasProprias.has(t.nome) ? " ●" : ""}</option>`).join("")}</select></div></div>`;
    const grupos = (t) => {
      const nomes = [...new Set(c.tempos.filter((h) => h.turno === t && h.turma).map((h) => h.turma))].sort((p, q) => p.localeCompare(q, "pt-BR", { numeric: true }));
      const g = [];
      if (!ft || ft === "__padrao") g.push("");
      if (ft !== "__padrao") nomes.filter((n) => !ft || ft === n).forEach((n) => g.push(n));
      return g;
    };
    const semProprio = ft && ft !== "__padrao" && !turmasProprias.has(ft);
    corpo = (semProprio ? `<div class="cartao-pad" style="margin-bottom:10px"><p class="pequeno" style="margin:0 0 8px"><strong>${esc(ft)}</strong> usa os horários padrão do turno. Para ela ter horários só dela (sem se misturar com as outras turmas):</p>
      <button class="btn btn-primario btn-pequeno" data-acao="tempos-copiar" data-turma="${esc(ft)}">Criar horários próprios para ${esc(ft)}</button></div>` : "") +
      `<table><thead><tr><th style="width:70px">Ordem</th><th>Horário</th><th>Aulas na grade</th><th></th></tr></thead><tbody>
      ${turnos.map((t) => grupos(t).map((tm) => {
        const hs = c.tempos.filter((h) => h.turno === t && (h.turma || "") === tm);
        if (tm === "" && ft && ft !== "__padrao") return "";
        const sobre = (h) => hs.filter((o) => o !== h && ini(h)[0] < ini(o)[1] && ini(o)[0] < ini(h)[1]).map((o) => o.hora.replace(" - ", "–"));
        const cursosT = c.cursos.filter((x) => (x.turnos || [x.turno]).includes(t)).map((x) => esc(x.nome)).join(", ");
        const tit = tm ? `${esc(t)} · <strong>${esc(tm)}</strong> <span class="etiqueta">horário próprio</span> <span class="mudo">${hs.length} horário(s)</span>`
          : `${esc(t)} · padrão <span class="mudo">${hs.length} horário(s) · vale para as turmas sem horário próprio · ${cursosT || "nenhum curso neste turno"}</span>`;
        return `<tr class="dia-grupo"><th colspan="3">${tit}</th>
          <th class="acoes"><button class="btn-link" data-acao="cad-novo" data-tipo="tempo" data-turno="${esc(t)}" data-turma="${esc(tm)}">+ Adicionar</button></th></tr>` +
        (hs.length ? hs.map((h) => `<tr><td>${h.ordem}º</td><td><strong>${esc(h.hora.replace(" - ", "–"))}</strong>${sobre(h).length ? ` <span class="etiqueta et-amarelo" title="Mesmo grupo, horários que se cruzam">sobrepõe ${sobre(h).join(", ")}</span>` : ""}</td><td>${h.aulas}</td>
          <td class="acoes"><button class="btn-link" data-acao="cad-editar" data-tipo="tempo" data-chave="${chaveCad("tempo", h)}">Editar</button>
          <button class="btn-link perigo" data-acao="cad-excluir" data-tipo="tempo" data-chave="${chaveCad("tempo", h)}">Excluir</button></td></tr>`).join("")
          : `<tr><td colspan="4" class="mudo pequeno">Nenhum horário aqui. Use “+ Adicionar”.</td></tr>`);
      }).join("")).join("")}</tbody></table>`;
  }
  $("#secCad").innerHTML = `<div class="cartao-pad hist-topo"><div><h2 class="secao-titulo" style="margin:0">${titulo}</h2>
      <p class="mudo pequeno">${{ cursos: "O e-mail do curso recebe os avisos das turmas dele. O turno define os horários disponíveis.",
        turmas: "Cada turma pertence a um curso. Renomear atualiza as aulas na grade.",
        disciplinas: "Disciplinas de cada curso aparecem na lista ao cadastrar uma aula. Renomear atualiza a grade.",
        tempos: "Os horários do turno valem para todas as turmas. Se uma turma tem horários diferentes, crie horários próprios para ela: só os dela passam a valer." }[aba]}</p></div>
      <div class="acoes-hist">${novo}</div></div>${topo}<div class="tabela-rolagem tabela-cad">${corpo}</div>`;
  const ligar = (id, campo) => { const el = $(id); if (el) el.addEventListener("input", (e) => { f[campo] = e.target.value; desenharCadastros(); if (campo === "busca") { const i = $("#fcBusca"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); };
  ligar("#fcCurso", "curso"); ligar("#fcBusca", "busca"); ligar("#fcTurno", "turno"); ligar("#fcTurma", "turma");
}

function modalCadastro(tipo, chave, turnoInicial, turmaInicial) {
  const c = estado.cad;
  const x = !chave ? null : tipo === "curso" ? c.cursos.find((i) => i.id === chave.id) : tipo === "turma" ? c.turmas.find((i) => i.nome === chave.nome)
    : tipo === "disciplina" ? c.disciplinas.find((i) => i.nome === chave.nome && i.curso === chave.curso) : c.tempos.find((i) => i.turno === chave.turno && i.hora === chave.hora && (i.turma || "") === (chave.turma || ""));
  const titulo = { curso: "curso", turma: "turma", disciplina: "disciplina", tempo: "horário" }[tipo];
  const selCurso = (val) => `<div class="campo"><label for="kCurso">Curso</label><select id="kCurso" class="input"><option value="">Escolha…</option>
    ${c.cursos.map((i) => `<option value="${esc(i.id)}" ${val === i.id ? "selected" : ""}>${esc(i.nome)}</option>`).join("")}</select></div>`;
  const selTurmaH = (val) => `<div class="campo"><label for="kTurma">Turma <span class="mudo">(opcional)</span></label><select id="kTurma" class="input"><option value="">Todas (padrão do turno)</option>${c.turmas.map((t) => `<option value="${esc(t.nome)}" ${val === t.nome ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></div>`;
  const selTurno = (val) => `<div class="campo"><label for="kTurno">Turno</label><select id="kTurno" class="input">${c.turnos.map((t) => `<option ${val === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
  const ativo = x && tipo !== "tempo" ? `<label class="pequeno" style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="chk" id="kAtivo" ${x.ativo ? "checked" : ""}> Ativo (aparece nas listas)</label>` : "";
  let campos = "";
  if (tipo === "curso") campos = `<div class="campo"><label for="kNome">Nome do curso</label><input id="kNome" class="input" value="${esc(x ? x.nome : "")}"></div>
    <div class="campo"><label>Turnos do curso</label><div id="kTurnos" style="display:flex;gap:14px;flex-wrap:wrap;padding:6px 0">${c.turnos.map((t) => `<label class="pequeno" style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="chk" value="${t}" ${(x ? (x.turnos || [x.turno]) : ["Noturno"]).includes(t) ? "checked" : ""}> ${t}</label>`).join("")}</div></div>
    <div class="linha"><div class="campo"><label for="kEmail">E-mail da coordenação</label><input id="kEmail" class="input" type="email" value="${esc(x ? x.email : "")}"></div></div>`;
  else if (tipo === "turma") campos = `<div class="linha"><div class="campo"><label for="kNome">Nome da turma</label><input id="kNome" class="input" placeholder="1º DS" value="${esc(x ? x.nome : "")}"></div>${selCurso(x ? x.curso : estado.filtroCad.curso)}</div>
    ${x && x.aulas ? `<p class="mudo pequeno">${x.aulas} aula(s) na grade usam esta turma; renomear atualiza todas.</p>` : ""}`;
  else if (tipo === "disciplina") campos = `<div class="campo"><label for="kNome">Nome da disciplina</label><input id="kNome" class="input" value="${esc(x ? x.nome : "")}"></div>${selCurso(x ? x.curso : estado.filtroCad.curso)}
    ${x && x.aulas ? `<p class="mudo pequeno">${x.aulas} aula(s) na grade usam esta disciplina; renomear atualiza todas.</p>` : ""}
    <div class="campo"><label for="kProf">Professor responsável</label><select id="kProf" class="input"><option value="">Nenhum</option>
      ${profsAtivos().sort((p, q) => p.localeCompare(q, "pt-BR")).concat(x && x.professor && !profsAtivos().includes(x.professor) ? [x.professor] : []).map((n) => `<option ${x && x.professor === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    ${x && aulasDaDisciplina(x).some((a) => a.prof === "A definir") ? `<label class="pequeno" id="kAplicarLinha" style="display:none;gap:8px;align-items:center"><input type="checkbox" class="chk" id="kAplicar" checked>
      Passar para ele(a) as ${aulasDaDisciplina(x).filter((a) => a.prof === "A definir").length} aula(s) que estão como “A definir”</label>` : ""}
    <p class="mudo pequeno" style="margin:0">O professor responsável é sugerido ao cadastrar novas aulas desta disciplina.</p>`;
  else campos = `<div class="linha">${selTurno(x ? x.turno : turnoInicial || estado.filtroCad.turno || "Diurno")}<div class="campo"><label for="kHora">Horário</label><input id="kHora" class="input" placeholder="08:40 - 09:30" value="${esc(x ? x.hora : "")}"></div></div>
    ${selTurmaH(x ? x.turma : turmaInicial || (estado.filtroCad.turma && estado.filtroCad.turma !== "__padrao" ? estado.filtroCad.turma : ""))}
    <div class="campo" style="max-width:160px"><label for="kOrdem">Ordem no turno</label><input id="kOrdem" class="input" type="number" min="1" value="${x ? x.ordem : ""}" placeholder="automática"></div>
    ${x && x.aulas ? `<p class="mudo pequeno">${x.aulas} aula(s) estão neste horário; mudar o horário atualiza todas.</p>` : ""}`;
  const m = abrirModal(`<h2>${x ? "Editar" : "Novo"} ${titulo}</h2>${campos}${ativo}<div id="kErro"></div>
    <div class="botoes">${x && ((tipo === "curso" && !x.turmas) || tipo === "tempo") ? `<button class="btn btn-perigo esquerda" id="kExcluir">Excluir</button>` : ""}
      <button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="kOk">Salvar</button></div>`);
  const val = (id) => { const el = $(id, m); return el ? el.value.trim() : ""; };
  let forcarCad = false;
  if (tipo === "disciplina") {
    const linha = $("#kAplicarLinha", m), sel = $("#kProf", m);
    const mostrar = () => { forcarCad = false; $("#kErro", m).innerHTML = ""; $("#kOk", m).textContent = "Salvar"; if (linha) linha.style.display = sel.value ? "flex" : "none"; };
    if (sel) { sel.addEventListener("input", mostrar); mostrar(); }
  }
  $("#kOk", m).addEventListener("click", async () => {
    const item = { nome: val("#kNome"), turno: val("#kTurno"), turnos: $$("#kTurnos input:checked", m).map((i) => i.value), email: val("#kEmail"), curso: val("#kCurso"), hora: normalizarHora(val("#kHora")) || val("#kHora"), ordem: val("#kOrdem"), turma: val("#kTurma") };
    if ($("#kAtivo", m)) item.ativo = $("#kAtivo", m).checked;
    if (tipo === "disciplina") { item.professor = val("#kProf"); item.aplicarAulas = !!($("#kAplicar", m) && $("#kAplicar", m).checked && item.professor); }
    const b = $("#kOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_cadastro_salvar", { tipo, original: chave ? (tipo === "curso" ? chave.id : tipo === "turma" ? chave.nome : chave) : null, item, forcar: forcarCad });
      if (r.conflitos) { $("#kErro", m).innerHTML = blocoConflitos(r.conflitos); forcarCad = true; b.textContent = "Salvar mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(r.atribuidas ? `Salvo. ${r.atribuidas} aula(s) passaram para ${item.professor}.` : r.atualizadas ? `Salvo. ${r.atualizadas} aula(s) atualizada(s) na grade.` : "Salvo.");
      invalidarDados(); await carregarCadastros(true); desenharCadastros();
    } catch (e) { $("#kErro", m).innerHTML = `<div class="erro">${esc(e.message)}</div>`; } finally { b.disabled = false; }
  });
  const ex = $("#kExcluir", m);
  if (ex) ex.addEventListener("click", () => { fecharModal(); excluirCadastro(tipo, chave); });
}

async function modalAtribuirDisciplina(chave) {
  const x = estado.cad.disciplinas.find((i) => i.nome === chave.nome && i.curso === chave.curso);
  if (!x) return;
  await carregarProfessores();
  const au = aulasDaDisciplina(x);
  const turmas = [...new Set(au.map((a) => a.turma))].sort((p, q) => p.localeCompare(q, "pt-BR", { numeric: true }));
  const nomes = profsAtivos().sort((p, q) => p.localeCompare(q, "pt-BR"));
  const atuais = (lista) => [...new Set(lista.map((a) => a.prof))].join(", ");
  const m = abrirModal(`<h2>Atribuir professor</h2>
    <p class="mudo" style="margin:0"><strong>${esc(x.nome)}</strong> · ${esc((estado.cad.cursos.find((c) => c.id === x.curso) || {}).nome || x.curso)}</p>
    <div class="campo"><label for="dTurma">Turma</label><select id="dTurma" class="input"><option value="">Todas as turmas (${au.length} aulas)</option>
      ${turmas.map((t) => `<option value="${esc(t)}">${esc(t)} (${au.filter((a) => a.turma === t).length} aulas)</option>`).join("")}</select></div>
    <div class="campo"><label for="dProf">Professor</label><select id="dProf" class="input"><option value="A definir">A definir</option>
      ${nomes.map((n) => `<option>${esc(n)}</option>`).join("")}</select></div>
    <p class="mudo pequeno" id="dResumo" style="margin:0"></p>
    <div id="dConf"></div>
    <div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="dOk">Atribuir</button></div>`);
  const alvo = () => { const t = $("#dTurma", m).value; return t ? au.filter((a) => a.turma === t) : au; };
  let forcar = false;
  const resumo = () => { forcar = false; $("#dConf", m).innerHTML = ""; $("#dOk", m).textContent = "Atribuir";
    $("#dResumo", m).textContent = `${alvo().length} aula(s) passam de ${atuais(alvo())} para ${$("#dProf", m).value}.`; };
  $("#dTurma", m).addEventListener("input", resumo); $("#dProf", m).addEventListener("input", resumo); resumo();
  $("#dOk", m).addEventListener("click", async () => {
    const b = $("#dOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_aulas_atribuir", { ids: alvo().map((a) => a.id), professor: $("#dProf", m).value, forcar });
      if (r.conflitos) { $("#dConf", m).innerHTML = blocoConflitos(r.conflitos); forcar = true; b.textContent = "Atribuir mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(r.afetadas + " aula(s) atribuída(s)."); invalidarDados(); await Promise.all([carregarGrade(true), carregarCadastros(true)]); desenharCadastros();
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  });
}

async function copiarTempos(turma) {
  const livres = estado.cad.turmas.filter((t) => !estado.cad.tempos.some((h) => h.turma === t.nome));
  if (!turma) {
    if (!livres.length) { toast("Todas as turmas já têm horários próprios.", true); return; }
    const m = abrirModal(`<h2>Horários por turma</h2><p class="mudo pequeno">Cria uma cópia dos horários padrão do turno para a turma. Depois você edita só os horários dela. Nada muda na grade.</p>
      <div class="campo"><label for="kTurmaCopia">Turma</label><select id="kTurmaCopia" class="input"><option value="">Escolha…</option>${livres.map((t) => `<option>${esc(t.nome)}</option>`).join("")}</select></div>
      <div id="kErro"></div><div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="kOk">Criar</button></div>`);
    $("#kOk", m).addEventListener("click", async () => {
      const t = $("#kTurmaCopia", m).value; if (!t) { $("#kErro", m).innerHTML = `<div class="erro">Escolha a turma.</div>`; return; }
      fecharModal(); copiarTempos(t);
    });
    return;
  }
  try {
    const r = await chamar("admin_tempos_copiar", { turma });
    if (!r.sucesso) throw new Error(r.erro);
    estado.filtroCad.turma = turma;
    toast(`${r.copiados} horário(s) criados para ${turma}. Edite o que for diferente.`); await carregarCadastros(true); desenharCadastros();
  } catch (e) { toast(e.message, true); }
}

async function organizarTurnos() {
  let r;
  try { r = await chamar("admin_turnos_organizar", { aplicar: false }); if (!r.sucesso) throw new Error(r.erro); } catch (e) { toast(e.message, true); return; }
  const pt = Object.keys(r.porTurno).map((t) => `${esc(t)}: ${r.porTurno[t]}`).join(" · ");
  const sob = r.sobrepostos.length ? `<p style="margin:10px 0 4px"><strong>Horários que se cruzam (nada será apagado, você decide depois):</strong></p><ul style="margin:0 0 0 18px">${r.sobrepostos.map((o) =>
    `<li>${esc(o.turno)}${o.turma ? " · " + esc(o.turma) : ""}: ${esc(o.a.replace(" - ", "–"))} (${o.aulasA} aulas) e ${esc(o.b.replace(" - ", "–"))} (${o.aulasB} aulas)</li>`).join("")}</ul>` : "";
  const cur = r.cursos.length ? `<p style="margin:10px 0 0">Cursos que passam a usar os dois turnos: ${r.cursos.map((x) => esc(x.nome)).join("; ")}.</p>` : "";
  const ok = await confirmar("Organizar turnos?", `<p style="margin:0">${r.mover} horário(s) do Diurno serão distribuídos: começa antes das 12:00 → Matutino; a partir das 12:00 → Vespertino. A ordem de cada turno é renumerada. As aulas da grade não mudam.</p>
    <p style="margin:8px 0 0">Resultado: ${pt}</p>${cur}${sob}`, "Organizar");
  if (!ok) return;
  try {
    const f = await chamar("admin_turnos_organizar", { aplicar: true });
    if (!f.sucesso) throw new Error(f.erro);
    toast("Horários organizados em turnos."); invalidarDados(); await carregarCadastros(true); desenharCadastros();
  } catch (e) { toast(e.message, true); }
}

async function excluirCadastro(tipo, chave) {
  let msg = "Este item sai dos cadastros. Itens com aulas na grade não podem ser excluídos (desative-os).";
  if (tipo === "tempo") {
    const h = (estado.cad.tempos || []).find((i) => i.turno === chave.turno && i.hora === chave.hora && (i.turma || "") === (chave.turma || ""));
    msg = `O horário ${chave.hora.replace(" - ", "–")} (${chave.turno}${chave.turma ? " · " + chave.turma : ""}) sai da lista de horários.` +
      (h && h.aulas ? ` As ${h.aulas} aula(s) que usam esse horário continuam na grade, sem alteração.` : "");
  }
  if (!(await confirmar("Excluir?", msg, "Excluir", true))) return;
  try {
    const r = await chamar("admin_cadastro_excluir", { tipo, chave });
    if (!r.sucesso) throw new Error(r.erro);
    toast("Excluído."); invalidarDados(); await carregarCadastros(true); desenharCadastros();
  } catch (e) { toast(e.message, true); }
}

// ================================================================ PROFESSORES
const areasDe = (p) => String(p.curso || "").split(/\s*[\/;,]\s*/).map((x) => x.trim()).filter(Boolean);
function opcoesArea() {
  const n = {};
  estado.professores.forEach((p) => areasDe(p).forEach((a) => { n[a] = (n[a] || 0) + 1; }));
  return Object.keys(n).sort((a, b) => a.localeCompare(b, "pt-BR")).map((a) => [a, n[a]]);
}
async function telaProfessores(main) {
  await carregarProfessores(true);
  const ativos = estado.professores.filter((p) => p.ativo).length;
  const fp = estado.filtroProf;
  main.innerHTML = cabecalho("Professores", `${ativos} ativos · ${estado.professores.length - ativos} desligados · o e-mail é usado em todos os avisos`,
      `<button class="btn btn-primario" data-acao="novo-prof">+ Cadastrar professor</button>`) + `
    <section class="cartao">
      <div class="filtros">
        <div class="campo largo"><label for="pBusca">Buscar professor</label><input id="pBusca" class="input" type="search" value="${esc(fp.busca)}"></div>
        <div class="campo"><label for="pArea">Curso / área</label><select id="pArea" class="input">
          <option value="">Todos os cursos e áreas</option>${opcoesArea().map(([a, q]) => `<option value="${esc(a)}" ${fp.area === a ? "selected" : ""}>${esc(a)} (${q})</option>`).join("")}</select></div>
        <div class="campo"><label for="pAba">Mostrar</label><select id="pAba" class="input">
          ${[["ativos", "Ativos"], ["desligados", "Desligados"], ["todos", "Todos"]].map(([v, t]) => `<option value="${v}" ${fp.aba === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div>
      <div class="tabela-rolagem" id="tabProfs"></div>
    </section>
    <p class="mudo pequeno" style="margin:0">O PIN de cada professor fica guardado só no aparelho dele (padrão 1234). Para trocar o nome no login, edite o nome aqui: as aulas acompanham.</p>`;
  $("#pBusca", main).addEventListener("input", (e) => { fp.busca = e.target.value; desenharProfs(); });
  $("#pAba", main).addEventListener("input", (e) => { fp.aba = e.target.value; desenharProfs(); });
  $("#pArea", main).addEventListener("input", (e) => { fp.area = e.target.value; desenharProfs(); });
  desenharProfs();
}

function desenharProfs() {
  const fp = estado.filtroProf, b = semAcento(fp.busca.trim());
  const lista = estado.professores.filter((p) => (fp.aba === "todos" || (fp.aba === "ativos" ? p.ativo : !p.ativo)) &&
    (!fp.area || areasDe(p).includes(fp.area)) &&
    (!b || semAcento(p.nome + " " + p.email + " " + p.curso).includes(b)));
  if (!lista.length) { $("#tabProfs").innerHTML = `<div class="vazio">Nenhum professor com esses filtros.</div>`; return; }
  $("#tabProfs").innerHTML = `<table><thead><tr><th>Professor</th><th>E-mail institucional</th><th class="esconder-celular">Curso / área</th><th>Aulas</th><th></th></tr></thead><tbody>
    ${lista.map((p) => `<tr>
      <td><strong>${esc(p.nome)}</strong>${p.ativo ? "" : ` <span class="etiqueta">desligado</span>`}</td>
      <td>${p.email ? esc(p.email) : `<span class="etiqueta et-vermelho">sem e-mail</span>`}</td>
      <td class="esconder-celular">${esc(p.curso) || "—"}</td>
      <td>${p.aulas}</td>
      <td class="acoes"><button class="btn btn-pequeno" data-acao="editar-prof" data-nome="${esc(p.nome)}">Editar</button>
        ${p.ativo ? `<button class="btn btn-pequeno btn-perigo" data-acao="desligar-prof" data-nome="${esc(p.nome)}">Desligar</button>`
          : `<button class="btn btn-pequeno" data-acao="reativar-prof" data-nome="${esc(p.nome)}">Reativar</button>`}</td></tr>`).join("")}
    </tbody></table>
    ${estado.aDefinir ? `<div class="paginacao"><span>${estado.aDefinir} aula(s) “A definir” na grade</span><button class="btn-link" data-acao="ver-grade" data-prof="A definir">Atribuir professor</button></div>` : ""}`;
}

function modalProf(nome) {
  const p = nome ? estado.professores.find((x) => x.nome === nome) : null;
  const m = abrirModal(`<h2>${p ? "Editar professor" : "Cadastrar professor"}</h2>
    <div class="campo"><label for="prNome">Nome (como aparece na grade e no login)</label><input id="prNome" class="input" value="${esc(p ? p.nome : "")}"></div>
    <div class="campo"><label for="prEmail">E-mail institucional</label><input id="prEmail" class="input" type="email" placeholder="nome.sobrenome@ifs.edu.br" value="${esc(p ? p.email : "")}"></div>
    <div class="campo"><label for="prCurso">Curso / área</label><input id="prCurso" class="input" value="${esc(p ? p.curso : "")}"></div>
    <p class="mudo pequeno oculto" id="prAviso" style="margin:0">Mudou o nome: as aulas e substituições passam para o novo nome, e o professor escolhe o novo nome no login.</p>
    <div id="prErro"></div>
    <div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="prOk">Salvar</button></div>`);
  if (p) $("#prNome", m).addEventListener("input", (e) => $("#prAviso", m).classList.toggle("oculto", e.target.value.trim() === p.nome));
  $("#prOk", m).addEventListener("click", async () => {
    const b = $("#prOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_prof_salvar", { nomeOriginal: p ? p.nome : "", nome: $("#prNome", m).value.trim(),
        email: $("#prEmail", m).value.trim(), curso: $("#prCurso", m).value.trim(), ativo: p ? p.ativo : true });
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(r.renomeadas ? `Salvo. ${r.renomeadas} aula(s) passaram para o novo nome.` : "Professor salvo."); invalidarDados();
      if (estado.tela === "professores") recarregarTela();
    } catch (e) { $("#prErro", m).innerHTML = `<div class="erro">${esc(e.message)}</div>`; } finally { b.disabled = false; }
  });
}

function modalDesligar(nome) {
  const p = estado.professores.find((x) => x.nome === nome);
  const nomes = profsAtivos().filter((n) => n !== nome).sort((x, y) => x.localeCompare(y, "pt-BR"));
  const m = abrirModal(`<h2>Desligar Prof. ${esc(nome)}</h2>
    <p style="margin:0">Ele sai da lista do login e não recebe mais avisos. O cadastro continua guardado (dá para reativar).</p>
    ${p.aulas ? `<div class="campo"><label for="dDest">As ${p.aulas} aula(s) dele passam para</label><select id="dDest" class="input">
      <option value="A definir">A definir (escolher depois)</option>${nomes.map((n) => `<option>${esc(n)}</option>`).join("")}</select></div>` : ""}
    <div id="dConf"></div>
    <div class="botoes"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo" id="dOk">Desligar</button></div>`);
  let forcar = false;
  $("#dOk", m).addEventListener("click", async () => {
    const b = $("#dOk", m); b.disabled = true;
    try {
      const r = await chamar("admin_prof_desligar", { nome, transferirPara: $("#dDest", m) ? $("#dDest", m).value : "A definir", forcar });
      if (r.conflitos) { $("#dConf", m).innerHTML = blocoConflitos(r.conflitos); forcar = true; b.textContent = "Desligar mesmo assim"; return; }
      if (!r.sucesso) throw new Error(r.erro);
      fecharModal(); toast(`Desligado. ${r.transferidas} aula(s) transferida(s).`); invalidarDados(); recarregarTela();
    } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  });
}

async function reativarProf(nome) {
  const p = estado.professores.find((x) => x.nome === nome);
  try {
    const r = await chamar("admin_prof_salvar", { nomeOriginal: nome, nome, email: p.email, curso: p.curso, ativo: true });
    if (!r.sucesso) throw new Error(r.erro);
    toast("Reativado."); invalidarDados(); recarregarTela();
  } catch (e) { toast(e.message, true); }
}

// ================================================================ IMPORTAR / EXPORTAR
async function telaArquivos(main) {
  const v = await chamar("admin_versoes");
  const versoes = v.sucesso ? v.versoes : [];
  const pv = estado.previa;
  main.innerHTML = cabecalho("Importar e exportar grade", "Troque a grade do semestre sem perder faltas, substituições e trocas já lançadas") + `
    <div class="duas-colunas">
      <div style="min-width:0">
      <section class="cartao cartao-pad" style="display:flex;flex-direction:column;gap:16px">
        <div class="passos">
          <div class="passo ${!pv ? "ativo" : ""}"><span>${pv ? "✓" : "1"}</span>Enviar arquivo</div>
          <div class="passo ${pv ? "ativo" : ""}"><span>2</span>Conferir prévia</div>
          <div class="passo"><span>3</span>Aplicar</div>
        </div>
        <div id="areaImport">${pv ? htmlPrevia(pv) : htmlZonaArquivo()}</div>
      </section>
        <section class="cartao cartao-pad" style="margin-top:20px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <h2 class="secao-titulo">Versões anteriores</h2>
            ${versoes.length ? `<span class="mudo pequeno">${versoes.length} guardada${versoes.length === 1 ? "" : "s"}</span>` : ""}
          </div>
          <p class="mudo pequeno" style="margin:-8px 0 10px">Cópias guardadas antes de cada mudança na grade.</p>
          ${versoes.length ? `<table class="versoes"><tbody>${versoes.map((x, i) => `<tr>
            <td><div class="quando">${esc(tempoRelativo(x.nome))}${i === 0 ? ` <span class="etiqueta et-verde">Mais recente</span>` : ""}</div><div class="aulas" title="${esc(nomeBackup(x.nome))}">${x.aulas} aulas</div></td>
            <td class="acoes"><button class="btn btn-pequeno btn-restaurar" data-acao="restaurar" data-nome="${esc(x.nome)}" title="Restaurar a grade para essa cópia (${esc(nomeBackup(x.nome))})"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>Restaurar</button>
            <button class="btn btn-pequeno btn-perigo btn-icone" data-acao="apagar-versao" data-nome="${esc(x.nome)}" title="Apagar esta cópia" aria-label="Apagar a cópia de ${esc(nomeBackup(x.nome))}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></td></tr>`).join("")}</tbody></table>
            ${versoes.length > 3 ? `<button class="btn-link" style="margin-top:12px" data-acao="limpar-versoes">Apagar as antigas e manter as 3 mais recentes</button>` : ""}`
            : `<p class="mudo pequeno">Nenhuma ainda. Cada importação guarda uma cópia antes de mudar a grade.</p>`}
        </section>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <section class="cartao cartao-pad"><h2 class="secao-titulo">Exportar</h2>
          <div class="lista-acoes">
            <button class="btn" data-acao="exportar-excel">Grade completa · Excel</button>
            <button class="btn" data-acao="imprimir-turmas">Grade por turma · PDF</button>
            <button class="btn" data-acao="imprimir-profs">Grade por professor · PDF</button>
            <button class="btn" data-acao="exportar-historico">Faltas e substituições · CSV</button>
          </div></section>
        <section class="cartao cartao-pad"><h2 class="secao-titulo">Modelo para importar</h2>
          <p class="pequeno" style="margin:0 0 8px">Uma linha por aula, com as colunas Professor, Dia, Horário, Turma, Disciplina e Sala.</p>
          <button class="btn" data-acao="baixar-modelo">Baixar modelo</button>
          <p class="mudo pequeno" style="margin:12px 0 0">Dica: exporte a grade atual em Excel, edite e importe de volta. Cadastre antes os professores novos.</p></section>

      </div>
    </div>`;
  ligarZonaArquivo();
}

function htmlZonaArquivo() {
  return `<label class="zona-arquivo" id="zona" for="arquivoGrade">
      <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1b5e20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16"/></svg>
      <strong>Escolha a planilha da grade nova</strong>
      <span class="mudo">Excel (.xlsx) ou CSV · ou arraste o arquivo para cá</span>
      <span class="btn btn-primario">Escolher arquivo</span>
    </label>
    <input id="arquivoGrade" type="file" accept=".xlsx,.xls,.csv" class="oculto">
    <div id="msgImport"></div>`;
}

function ligarZonaArquivo() {
  const inp = $("#arquivoGrade"), zona = $("#zona");
  if (!inp) return;
  inp.addEventListener("change", () => inp.files[0] && lerArquivo(inp.files[0]));
  ["dragenter", "dragover"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add("arrastando"); }));
  ["dragleave", "drop"].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove("arrastando"); }));
  zona.addEventListener("drop", (e) => e.dataTransfer.files[0] && lerArquivo(e.dataTransfer.files[0]));
}

let sheetjsPromessa = null;
function carregarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetjsPromessa) sheetjsPromessa = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = SHEETJS; s.onload = () => res(window.XLSX); s.onerror = () => { sheetjsPromessa = null; rej(new Error("Não carregou o leitor de planilhas. Confira a internet.")); };
    document.head.appendChild(s);
  });
  return sheetjsPromessa;
}

function semAcento(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }

async function lerArquivo(arquivo) {
  const msg = $("#msgImport");
  msg.innerHTML = carregando("Lendo " + arquivo.name + "…");
  try {
    const XLSX = await carregarSheetJS();
    const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
    const iCab = linhas.findIndex((l) => l.some((c) => semAcento(c) === "professor") && l.some((c) => semAcento(c).startsWith("disciplina")));
    if (iCab === -1) throw new Error("Não achei a linha de cabeçalho com “Professor” e “Disciplina”. Use o modelo.");
    const cab = linhas[iCab].map(semAcento);
    const col = (...nomes) => cab.findIndex((c) => nomes.includes(c));
    const ix = { professor: col("professor"), dia: col("dia"), horario: col("horario", "hora", "horarios"), turma: col("turma"),
      disciplina: col("disciplina", "disc"), sala: col("sala", "local") };
    const faltando = ["professor", "dia", "horario", "turma", "disciplina"].filter((k) => ix[k] === -1);
    if (faltando.length) throw new Error("Faltam colunas: " + faltando.join(", ") + ".");
    const dados = linhas.slice(iCab + 1).filter((l) => l.some((c) => String(c).trim())).map((l) => ({
      professor: String(l[ix.professor]).trim(), dia: l[ix.dia], horario: l[ix.horario], turma: String(l[ix.turma]).trim(),
      disciplina: String(l[ix.disciplina]).trim(), sala: ix.sala > -1 ? String(l[ix.sala]).trim() : ""
    }));
    if (!dados.length) throw new Error("A planilha não tem aulas abaixo do cabeçalho.");
    msg.innerHTML = carregando(`Comparando ${dados.length} aulas com a grade atual…`);
    const r = await chamar("admin_importar_previa", { linhas: dados });
    if (!r.sucesso) {
      msg.innerHTML = `<div class="erro"><strong>Arquivo com problemas (${r.totalErros || 1}):</strong><ul style="margin:6px 0 0;padding-left:18px">
        ${(r.erros || [r.erro]).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      return;
    }
    r.arquivo = arquivo.name; r.lidas = dados.length;
    estado.previa = r;
    recarregarTela();
  } catch (e) { msg.innerHTML = `<div class="erro">${esc(e.message)}</div>`; }
}

function htmlPrevia(pv) {
  const c = pv.contagem;
  const rotulo = { entra: ["Entra", "et-verde"], sai: ["Sai", "et-vermelho"], professor: ["Professor", "et-azul"], disciplina: ["Disciplina", "et-roxo"] };
  const nada = !c.entram && !c.saem && !c.professor && !c.disciplina;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div><strong>${esc(pv.arquivo)}</strong><div class="mudo pequeno">${pv.lidas} linhas lidas · ${c.iguais} aulas iguais à grade atual</div></div>
      <button class="btn btn-pequeno" data-acao="trocar-arquivo">Trocar arquivo</button></div>
    <div class="contagens">
      <div class="contagem"><b>+${c.entram}</b>aulas novas</div><div class="contagem"><b>−${c.saem}</b>aulas removidas</div>
      <div class="contagem"><b>${c.professor}</b>trocam professor</div><div class="contagem"><b>${pv.conflitos.length}</b>choque${pv.conflitos.length === 1 ? "" : "s"} de horário</div>
    </div>
    ${pv.conflitos.length ? `<div class="conflitos"><strong>Choques no arquivo:</strong><ul>${pv.conflitos.slice(0, 10).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${pv.conflitos.length > 10 ? `e mais ${pv.conflitos.length - 10}.` : ""} Dá para aplicar assim e corrigir depois na Grade.</div>` : ""}
    ${pv.avisos.length ? `<div class="conflitos">${pv.avisos.slice(0, 12).map(esc).join("<br>")}${pv.avisos.length > 12 ? `<br>e mais ${pv.avisos.length - 12}.` : ""}</div>` : ""}
    ${nada ? `<div class="ok-msg">O arquivo é igual à grade atual. Nada a aplicar.</div>` : `<div class="tabela-rolagem"><table><thead><tr><th>Mudança</th><th>Aula</th><th>Antes → Depois</th></tr></thead><tbody>
      ${pv.mudancas.slice(0, 60).map((x) => `<tr><td><span class="etiqueta ${rotulo[x.tipo][1]}">${rotulo[x.tipo][0]}</span></td><td>${esc(x.aula)}</td>
        <td>${esc(x.antes || "—")} → ${esc(x.depois || "—")}</td></tr>`).join("")}</tbody></table></div>
      ${pv.mudancas.length > 60 ? `<p class="mudo pequeno" style="margin:0">Mostrando 60 de ${pv.mudancas.length} mudanças.</p>` : ""}`}
    ${pv.preservados.length ? `<div class="aviso aviso-verde" style="padding:10px 12px"><div class="txt"><strong>Mantidos:</strong><span>${pv.preservados.map(esc).join(" · ")}</span></div></div>` : ""}
    ${pv.perdidos.length ? `<div class="aviso aviso-vermelho" style="padding:10px 12px"><div class="txt"><strong>Saem junto com a aula (ficam registrados em Correcoes_Grade):</strong><span>${pv.perdidos.map(esc).join(" · ")}</span></div></div>` : ""}
    <p class="mudo pequeno" style="margin:0">Antes de aplicar, o sistema guarda uma cópia da grade atual para desfazer. A prévia vale por 30 minutos.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primario" data-acao="aplicar-import" ${nada ? "disabled" : ""}>Aplicar grade nova</button>
      <button class="btn" data-acao="trocar-arquivo">Cancelar</button></div>`;
}

async function aplicarImportacao() {
  const pv = estado.previa;
  if (!(await confirmar("Aplicar grade nova?", `A grade passa a ter <strong>${pv.total} aulas</strong>. Professores veem a mudança na próxima sincronização.`, "Aplicar"))) return;
  $("#conteudo").insertAdjacentHTML("afterbegin", `<div id="aplicando">${carregando("Aplicando grade…")}</div>`);
  try {
    const r = await chamar("admin_importar_aplicar", { previaId: pv.previaId });
    if (!r.sucesso) throw new Error(r.erro);
    estado.previa = null; invalidarDados();
    toast(`Grade aplicada: ${r.resultado.total} aulas. Cópia guardada.`);
    recarregarTela();
  } catch (e) { const a = $("#aplicando"); if (a) a.remove(); toast(e.message, true); }
}

async function apagarVersoes(nomes) {
  const texto = nomes.length === 1
    ? `A cópia de <strong>${esc(nomeBackup(nomes[0]))}</strong> será apagada da planilha. A grade atual não muda.`
    : `<strong>${nomes.length} cópias antigas</strong> serão apagadas da planilha. As 3 mais recentes ficam guardadas e a grade atual não muda.`;
  if (!(await confirmar(nomes.length === 1 ? "Apagar esta versão?" : "Apagar versões antigas?", texto, "Apagar", true))) return;
  try {
    for (const nome of nomes) {
      const r = await chamar("admin_versao_apagar", { nome });
      if (!r.sucesso) throw new Error(r.erro);
    }
    toast(nomes.length === 1 ? "Versão apagada." : nomes.length + " versões apagadas."); recarregarTela();
  } catch (e) { toast(e.message, true); recarregarTela(); }
}

async function restaurarVersao(nome) {
  if (!(await confirmar("Restaurar versão?", `A grade volta a ser a de <strong>${esc(nomeBackup(nome))}</strong>. A grade atual também ganha uma cópia, então dá para voltar de novo.`, "Restaurar"))) return;
  try {
    const r = await chamar("admin_restaurar", { nome });
    if (!r.sucesso) throw new Error(r.erro);
    invalidarDados(); toast(`Restaurada: ${r.resultado.total} aulas.`); recarregarTela();
  } catch (e) { toast(e.message, true); }
}

function linhasExport() {
  return estado.grade.map((a) => [a.prof, a.dia, a.hora, a.turma, a.disc, salaDaObs(a.obs),
    a.status === "alert" ? "Falta" : a.status === "assumed" ? "Substituída" : "", a.substituto, a.id]);
}

async function exportarExcel() {
  try {
    toast("Gerando planilha…");
    const [XLSX] = await Promise.all([carregarSheetJS(), carregarGrade(true)]);
    const ws = XLSX.utils.aoa_to_sheet([["Professor", "Dia", "Horário", "Turma", "Disciplina", "Sala", "Situação", "Substituto", "Código"], ...linhasExport()]);
    ws["!cols"] = [18, 14, 14, 26, 34, 10, 12, 16, 9].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grade");
    XLSX.writeFile(wb, `Grade_IFS_${hojeArquivo()}.xlsx`);
  } catch (e) { toast(e.message, true); }
}

async function baixarModelo() {
  try {
    const XLSX = await carregarSheetJS();
    const ws = XLSX.utils.aoa_to_sheet([["Professor", "Dia", "Horário", "Turma", "Disciplina", "Sala"],
      ["Eber", "Segunda-feira", "08:40 - 09:30", "1º DS", "Programação 1", "Lab 2"]]);
    ws["!cols"] = [18, 14, 14, 26, 34, 10].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grade");
    XLSX.writeFile(wb, "Modelo_Grade_IFS.xlsx");
  } catch (e) { toast(e.message, true); }
}

async function exportarHistorico() {
  try {
    const r = await chamar("admin_historico", { incluirArquivo: true });
    if (!r.sucesso) throw new Error(r.erro);
    baixarArquivo(`Historico_Faltas_Substituicoes_${hojeArquivo()}.csv`, csv([r.cabecalho, ...r.linhas]), "text/csv;charset=utf-8");
  } catch (e) { toast(e.message, true); }
}

function exportarEmails() {
  const l = emailsFiltrados();
  baixarArquivo(`Emails_Avisos_${hojeArquivo()}.csv`, csv([["Data", "Tipo", "Assunto", "Destinatários", "Status", "Erro"],
    ...l.map((e) => [new Date(e.data).toLocaleString("pt-BR"), e.tipo, e.assunto, e.para, e.status, e.erro])]), "text/csv;charset=utf-8");
}

function imprimirQuadroAtual() {
  const tabela = $("#tabAulas .quadro");
  if (!tabela) return;
  const f = estado.filtrosGrade;
  const w = document.createElement("iframe");
  w.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(w);
  w.contentDocument.open();
  w.contentDocument.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(f.turma || f.prof)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:0;padding:8px} h1{font-size:12px;color:#1f5135;margin:0 0 2px} h2{font-size:18px;margin:0 0 10px}
    table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #999;padding:5px;vertical-align:top;text-align:left} th{background:#ecf3ee}
    button{all:unset;display:block} .q-add{display:none} .q-disc{display:block;font-weight:bold} .q-quem,.q-st{display:block;color:#444}
    .q-aula+.q-aula{border-top:1px dashed #bbb;margin-top:3px;padding-top:3px} @page{size:A4 landscape;margin:10mm}</style></head><body>
    <h1>IFS Campus Tobias Barreto · gerado em ${new Date().toLocaleDateString("pt-BR")}</h1><h2>${esc(f.turma ? "Turma " + f.turma : "Prof. " + f.prof)}</h2>${tabela.outerHTML}</body></html>`);
  w.contentDocument.close();
  setTimeout(() => { w.contentWindow.focus(); w.contentWindow.print(); setTimeout(() => w.remove(), 60000); }, 300);
}

async function imprimirGrade(porTurma) {
  await carregarGrade(true);
  const chave = porTurma ? "turma" : "prof";
  const grupos = [...new Set(estado.grade.map((a) => a[chave]))].filter((g) => g !== "A definir" || porTurma).sort((x, y) => x.localeCompare(y, "pt-BR"));
  const paginas = grupos.map((g) => {
    const aulas = estado.grade.filter((a) => a[chave] === g);
    const dias = DIAS.filter((d) => aulas.some((a) => a.dia === d));
    const horas = [...new Set(aulas.map((a) => a.hora))].sort();
    return `<section class="pg"><h2>${porTurma ? "Turma" : "Prof."} ${esc(g)}</h2>
      <table><thead><tr><th>Horário</th>${dias.map((d) => `<th>${esc(d)}</th>`).join("")}</tr></thead><tbody>
      ${horas.map((h) => `<tr><td class="h">${esc(h)}</td>${dias.map((d) => `<td>${aulas.filter((a) => a.dia === d && a.hora === h)
        .map((a) => `<b>${esc(a.disc)}</b><br><span>${esc(porTurma ? a.prof : a.turma)}${salaDaObs(a.obs) ? " · " + esc(salaDaObs(a.obs)) : ""}</span>`).join("<hr>")}</td>`).join("")}</tr>`).join("")}
      </tbody></table></section>`;
  }).join("");
  const w = document.createElement("iframe");
  w.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(w);
  w.contentDocument.open();
  w.contentDocument.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Grade por ${porTurma ? "turma" : "professor"}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:0} .pg{page-break-after:always;padding:8px}
    h1{font-size:13px;color:#1b5e20;margin:0 0 2px} h2{font-size:18px;margin:0 0 8px}
    table{width:100%;border-collapse:collapse;font-size:10.5px} th,td{border:1px solid #999;padding:4px;vertical-align:top}
    th{background:#e8f5e9} td.h{white-space:nowrap;font-weight:bold} hr{border:0;border-top:1px dashed #bbb;margin:3px 0} span{color:#444}
    @page{size:A4 landscape;margin:10mm}</style></head><body>
    ${paginas.replace(/<section class="pg">/g, `<section class="pg"><h1>IFS Campus Tobias Barreto · gerado em ${new Date().toLocaleDateString("pt-BR")}</h1>`)}</body></html>`);
  w.contentDocument.close();
  setTimeout(() => { w.contentWindow.focus(); w.contentWindow.print(); setTimeout(() => w.remove(), 60000); }, 300);
}

// ================================================================ CONFIGURAÇÕES
async function telaConfig(main) {
  const [c, h] = await Promise.all([chamar("admin_config_ler"), chamar("admin_historico")]);
  if (!c.sucesso) throw new Error(c.erro);
  const cfg = c.config; estado.configEmails = c.config;
  const campos = [["emailCoordGeral", "Coordenação geral (recebe todos os avisos)"]];
  const hist = h.sucesso ? h.linhas.slice(0, 80) : [];
  main.innerHTML = cabecalho("Configurações", "Destinatários dos avisos, administradores e histórico de ações") + `
    <div class="duas-colunas">
      <section class="cartao cartao-pad" style="display:flex;flex-direction:column;gap:12px">
        <h2 class="secao-titulo" style="margin:0">E-mails da coordenação</h2>
        <p class="mudo" style="margin:0">Cada aviso vai para a coordenação do curso da turma e para a coordenação geral. O e-mail de cada curso fica em <button type="button" class="btn-link" data-acao="ir" data-tela="cadastros">Grade → Cadastros → Cursos</button>.</p>
        ${campos.map(([k, t]) => `<div class="campo"><label for="c_${k}">${t}</label><input id="c_${k}" class="input" type="email" value="${esc(cfg[k])}"></div>`).join("")}
        <div><button class="btn btn-primario" data-acao="salvar-config">Salvar e-mails</button></div>
      </section>
      <section class="cartao cartao-pad" style="display:flex;flex-direction:column;gap:10px">
        <h2 class="secao-titulo" style="margin:0">Administradores</h2>
        <p class="mudo pequeno">Todos têm acesso completo ao painel.</p>
        <table class="lista-admins"><tbody>
          ${c.admins.map((a) => `<tr><td>${esc(a)}${a === c.eu ? ` <span class="etiqueta et-verde">você</span>` : ""}</td>
            <td class="acoes">${a === c.eu ? "" : `<button class="btn-link perigo" data-acao="remover-admin" data-email="${esc(a)}">Remover</button>`}</td></tr>`).join("")}
          ${(c.convites || []).map((v) => `<tr><td>${esc(v.email)} <span class="etiqueta et-laranja">convite pendente</span></td>
            <td class="acoes"><button class="btn-link perigo" data-acao="remover-admin" data-email="${esc(v.email)}">Cancelar</button></td></tr>`).join("")}
        </tbody></table>
        <form id="formConvite" class="convite">
          <div class="campo"><label for="cvEmail">Convidar coordenador(a)</label>
            <input id="cvEmail" class="input" type="email" required placeholder="nome@ifs.edu.br"></div>
          <button class="btn btn-primario" type="submit">Enviar convite</button>
        </form>
        <div id="cvResultado"></div>
      </section>
    </div>
    <section class="cartao cartao-pad servidor">
      <div><h2 class="secao-titulo" style="margin:0 0 4px">Servidor (Google Apps Script)</h2>
        <p class="mudo pequeno">Os apps dos professores e este painel usam este endereço. Ele não muda quando você publica uma <strong>Nova versão</strong>; só troque aqui se criar uma <strong>Nova implantação</strong> (endereço novo). Os apps passam a usar o novo sozinhos na próxima sincronização — mantenha a implantação antiga ativa por alguns dias.</p></div>
      <div class="campo"><label for="cfgServidor">Endereço em uso</label>
        <input id="cfgServidor" class="input" type="url" value="${esc(c.servidorUrl || urlServidor())}" spellcheck="false"></div>
      <div class="acoes-hist"><button class="btn btn-pequeno" data-acao="testar-servidor">Testar conexão</button>
        <button class="btn btn-pequeno btn-primario" data-acao="salvar-servidor">Salvar endereço</button><span id="statusServidor" class="pequeno"></span></div>
    </section>
    <section class="cartao" id="secHistorico"></section>`;
  estado.histArquivo = false;
  desenharHistorico(h);
}

function desenharHistorico(h) {
  const sec = $("#secHistorico");
  if (!sec) return;
  const arquivo = estado.histArquivo;
  const linhas = (h.linhas || []).slice(0, 200);
  sec.innerHTML = `<div class="cartao-pad hist-topo">
      <div><h2 class="secao-titulo" style="margin:0">${arquivo ? "Histórico arquivado" : "Histórico recente"}</h2>
        <p class="mudo pequeno">${arquivo ? `${h.totalArquivo} registro${h.totalArquivo === 1 ? "" : "s"} guardado${h.totalArquivo === 1 ? "" : "s"} na aba Historico_Arquivo da planilha`
          : `${h.totalAtual} registro${h.totalAtual === 1 ? "" : "s"} · arquivar guarda tudo na aba Historico_Arquivo e limpa esta lista`}</p></div>
      <div class="acoes-hist">
        ${!arquivo && h.totalAtual ? `<button class="btn btn-pequeno" data-acao="arquivar-historico">Arquivar histórico</button>` : ""}
        ${h.totalArquivo || arquivo ? `<button class="btn btn-pequeno" data-acao="alternar-historico">${arquivo ? "Voltar ao recente" : `Ver arquivados (${h.totalArquivo})`}</button>` : ""}
      </div></div>
    <div class="tabela-rolagem">${linhas.length ? `<table><thead><tr>${h.cabecalho.slice(0, 7).map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>
      ${linhas.map((l) => `<tr>${l.slice(0, 7).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      ${h.linhas.length > 200 ? `<div class="paginacao"><span>Mostrando os 200 mais recentes de ${h.linhas.length}. A lista completa sai em Importar / Exportar → Faltas e substituições.</span></div>` : ""}`
      : `<div class="vazio">${arquivo ? "Nada arquivado ainda." : "Nenhum registro novo. Os anteriores estão em “Ver arquivados”."}</div>`}</div>`;
}

async function alternarHistorico() {
  estado.histArquivo = !estado.histArquivo;
  const arquivo = estado.histArquivo;
  $("#secHistorico").innerHTML = carregando();
  try {
    const h = await chamar("admin_historico", { arquivo });
    if (!h.sucesso) throw new Error(h.erro);
    estado.histArquivo = arquivo; desenharHistorico(h);
  } catch (e) { toast(e.message, true); }
}

async function arquivarHistorico() {
  if (!(await confirmar("Arquivar histórico?", "Os registros saem desta lista e ficam guardados na aba <strong>Historico_Arquivo</strong> da planilha. Nada é apagado e dá para consultar em “Ver arquivados”.", "Arquivar"))) return;
  try {
    const r = await chamar("admin_historico_arquivar");
    if (!r.sucesso) throw new Error(r.erro);
    toast(`${r.arquivados} registro${r.arquivados === 1 ? "" : "s"} arquivado${r.arquivados === 1 ? "" : "s"}.`);
    estado.histArquivo = false;
    const h = await chamar("admin_historico");
    desenharHistorico(h);
  } catch (e) { toast(e.message, true); }
}

document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "formConvite") return;
  ev.preventDefault();
  const email = $("#cvEmail").value.trim();
  const b = ev.target.querySelector("button"); b.disabled = true;
  try {
    const r = await chamar("admin_convidar", { email });
    if (!r.sucesso) throw new Error(r.erro);
    $("#cvResultado").innerHTML = `<div class="${r.enviado ? "ok-msg" : "erro"}" style="margin-top:4px">
      ${r.enviado ? `Convite enviado para <strong>${esc(email)}</strong>.` : `Não foi possível enviar o e-mail (${esc(r.erroEnvio)}). Passe o código diretamente.`}
      Código: <strong style="letter-spacing:2px">${esc(r.codigo)}</strong> (vale 48 h, só para este e-mail).</div>`;
    toast(r.enviado ? "Convite enviado." : "Convite criado; envie o código.");
    const c = await chamar("admin_config_ler");
    if (c.sucesso) { const res = $("#cvResultado").innerHTML; await telaConfig($("#conteudo")); $("#cvResultado").innerHTML = res; }
  } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
});

async function testarServidor() {
  const url = $("#cfgServidor").value.trim(), st = $("#statusServidor");
  if (!RX_URL_SERVIDOR.test(url)) { st.innerHTML = `<span style="color:var(--falta)">Endereço inválido: use o link do Apps Script que termina em /exec.</span>`; return false; }
  st.textContent = "Testando…";
  try {
    const t0 = Date.now();
    const d = await (await fetch(url + "?action=obterTudo&t=" + t0, { cache: "no-store" })).json();
    const n = Object.values(d.grade || {}).reduce((s, l) => s + l.length, 0);
    st.innerHTML = `<span style="color:var(--ok)">Conectado · ${n} aulas · ${((Date.now() - t0) / 1000).toFixed(1)} s</span>`;
    return true;
  } catch (e) { st.innerHTML = `<span style="color:var(--falta)">Não respondeu. Confira se a implantação está ativa e com acesso “Qualquer pessoa”.</span>`; return false; }
}

async function salvarServidor() {
  const url = $("#cfgServidor").value.trim();
  if (url === urlServidor()) { toast("Esse já é o endereço em uso."); return; }
  if (!(await testarServidor())) return;
  if (!(await confirmar("Trocar o endereço do servidor?", `Todos os apps passam a usar <strong>${esc(url)}</strong> na próxima sincronização. Deixe a implantação antiga ativa por alguns dias para quem ainda não abriu o app.`, "Trocar"))) return;
  try {
    const r = await chamar("admin_servidor_salvar", { url });
    if (!r.sucesso) throw new Error(r.erro);
    try { localStorage.setItem("IFS_SERVIDOR_OFICIAL", url); } catch (e) {}
    toast("Endereço salvo. Os apps vão passar a usá-lo.");
    recarregarTela();
  } catch (e) { toast(e.message, true); }
}

async function removerAdmin(email) {
  if (!(await confirmar("Remover acesso?", `<strong>${esc(email)}</strong> deixa de entrar no painel administrativo (se já estiver dentro, a sessão é encerrada).`, "Remover", true))) return;
  try {
    const r = await chamar("admin_remover_admin", { email });
    if (!r.sucesso) throw new Error(r.erro);
    toast("Acesso removido."); recarregarTela();
  } catch (e) { toast(e.message, true); }
}

async function salvarConfig() {
  const config = Object.assign({}, estado.configEmails || {});
  $$("[id^=c_]").forEach((i) => { config[i.id.slice(2)] = i.value.trim(); });
  try {
    const r = await chamar("admin_config_salvar", { config });
    if (!r.sucesso) throw new Error(r.erro);
    toast("E-mails salvos.");
  } catch (e) { toast(e.message, true); }
}

// ================================================================ EVENTOS
document.addEventListener("click", (ev) => {
  const nav = ev.target.closest("[data-tela]:not([data-acao])");
  if (nav) { irPara(nav.dataset.tela); return; }
  if (ev.target.matches("[data-fundo]") || ev.target.closest("[data-fechar]")) { fecharModal(); return; }
  const el = ev.target.closest("[data-acao]");
  if (!el) return;
  const d = el.dataset;
  switch (d.acao) {
    case "recarregar": invalidarDados(); recarregarTela(); break;
    case "ir": irPara(d.tela); break;
    case "indicar": modalIndicar(d.id); break;
    case "liberar": mudarStatus(d.id, "liberar"); break;
    case "normalizar": mudarStatus(d.id, "normal"); break;
    case "ver-grade":
      estado.filtrosGrade = { turma: "", prof: d.prof || "", dia: d.dia || "", busca: "" };
      estado.vistaGrade = d.prof === "A definir" ? "lista" : "quadro"; irPara("grade"); break;
    case "nova-aula": modalAula(null); break;
    case "nova-aula-slot": modalAula(null, { dia: d.dia, hora: d.hora }); break;
    case "vista-grade": estado.vistaGrade = d.vista; estado.selAulas.clear(); recarregarTela(); break;
    case "imprimir-quadro": imprimirQuadroAtual(); break;
    case "editar-aula": modalAula(d.id); break;
    case "atribuir": modalAtribuir(); break;
    case "limpar-sel": estado.selAulas.clear(); desenharAulas(); break;
    case "novo-prof": carregarProfessores().then(() => modalProf(null)); break;
    case "editar-prof": modalProf(d.nome); break;
    case "desligar-prof": modalDesligar(d.nome); break;
    case "reativar-prof": reativarProf(d.nome); break;
    case "email-reenviar": acaoEmails("reenviar"); break;
    case "email-arquivar": acaoEmails("arquivar"); break;
    case "email-desarquivar": acaoEmails("desarquivar"); break;
    case "email-apagar": acaoEmails("apagar"); break;
    case "exportar-emails": exportarEmails(); break;
    case "trocar-arquivo": estado.previa = null; recarregarTela(); break;
    case "aplicar-import": aplicarImportacao(); break;
    case "restaurar": restaurarVersao(d.nome); break;
    case "apagar-versao": apagarVersoes([d.nome]); break;
    case "limpar-versoes":
      chamar("admin_versoes").then((r) => apagarVersoes((r.versoes || []).slice(3).map((v) => v.nome))); break;
    case "exportar-excel": exportarExcel(); break;
    case "baixar-modelo": baixarModelo(); break;
    case "exportar-historico": exportarHistorico(); break;
    case "imprimir-turmas": imprimirGrade(true); break;
    case "imprimir-profs": imprimirGrade(false); break;
    case "salvar-config": salvarConfig(); break;
    case "remover-admin": removerAdmin(d.email); break;
    case "ir-cadastros": fecharModal(); irPara("cadastros"); break;
    case "aba-cadastro": estado.abaCad = d.aba; desenharCadastros(); break;
    case "organizar-turnos": organizarTurnos(); break;
    case "disc-atribuir": modalAtribuirDisciplina(JSON.parse(d.chave)); break;
    case "cad-novo": modalCadastro(d.tipo, null, d.turno, d.turma); break;
    case "tempos-copiar": copiarTempos(d.turma); break;
    case "cad-editar": modalCadastro(d.tipo, JSON.parse(d.chave)); break;
    case "cad-excluir": excluirCadastro(d.tipo, JSON.parse(d.chave)); break;
    case "testar-servidor": testarServidor(); break;
    case "salvar-servidor": salvarServidor(); break;
    case "arquivar-historico": arquivarHistorico(); break;
    case "alternar-historico": alternarHistorico(); break;
    case "sair": sair(false); break;
  }
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.chkEmail !== undefined) {
    t.checked ? estado.selEmails.add(t.dataset.chkEmail) : estado.selEmails.delete(t.dataset.chkEmail); desenharEmails();
  } else if (t.hasAttribute("data-chk-todos-emails")) {
    emailsFiltrados().slice(0, 300).forEach((e) => t.checked ? estado.selEmails.add(e.id) : estado.selEmails.delete(e.id)); desenharEmails();
  } else if (t.dataset.chkAula !== undefined) {
    t.checked ? estado.selAulas.add(t.dataset.chkAula) : estado.selAulas.delete(t.dataset.chkAula); desenharAulas();
  } else if (t.hasAttribute("data-chk-todas-aulas")) {
    aulasFiltradas().forEach((a) => t.checked ? estado.selAulas.add(a.id) : estado.selAulas.delete(a.id)); desenharAulas();
  }
});

document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && $("#modais").innerHTML) fecharModal(); });
$("#formLogin").addEventListener("submit", entrar);
$("#btnPrimeiro").addEventListener("click", () => { $("#formLogin").classList.add("oculto"); $("#formPrimeiro").classList.remove("oculto"); $("#paCodigo").focus(); });
$("#btnVoltarLogin").addEventListener("click", () => { $("#formPrimeiro").classList.add("oculto"); $("#formLogin").classList.remove("oculto"); });
$("#formPrimeiro").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const erro = $("#erroPrimeiro"), btn = $("#btnCriar");
  const mostrar = (m) => { erro.textContent = m; erro.classList.remove("oculto"); };
  if ($("#paSenha").value !== $("#paSenha2").value) return mostrar("As duas senhas não são iguais.");
  btn.disabled = true; btn.textContent = "Criando…"; erro.classList.add("oculto");
  try {
    const r = await chamar("admin_primeiro_acesso", { codigo: $("#paCodigo").value.trim(), email: $("#paEmail").value.trim(), senha: $("#paSenha").value });
    if (!r.sucesso) throw new Error(r.erro || "Não foi possível criar o acesso.");
    estado.token = r.token; estado.email = r.email;
    try { sessionStorage.setItem("IFS_ADMIN", JSON.stringify({ token: r.token, email: r.email })); } catch (e) {}
    $("#formPrimeiro").reset(); $("#formPrimeiro").classList.add("oculto"); $("#formLogin").classList.remove("oculto");
    abrirApp(); toast("Acesso criado. Bem-vindo!");
  } catch (e) { mostrar(e.message); } finally { btn.disabled = false; btn.textContent = "Criar acesso e entrar"; }
});
$("#btnSair").addEventListener("click", () => sair(false));

(function iniciar() {
  try {
    const s = JSON.parse(sessionStorage.getItem("IFS_ADMIN") || "null");
    if (s && s.token) { estado.token = s.token; estado.email = s.email; abrirApp(); return; }
  } catch (e) {}
  mostrarLogin();
})();
