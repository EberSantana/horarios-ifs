/**
 * ============================================================================
 * APP.JS - Lógica da Aplicação, Interface e Sistema de Validações
 * ============================================================================
 * Responsável por:
 * 1. Fluxo de Autenticação com PIN e "Lembrar no Aparelho".
 * 2. Renderização das 5 abas:
 *    - Minha Grade
 *    - Aulas Disponíveis
 *    - Trocas (Permutas) & Reposições
 *    - Grade por Turma
 *    - Central de E-mails & Notificações
 * 3. Validador Inteligente de Conflitos de Horários (Simples e Cruzado para Trocas).
 * 4. Modais de Ausência, Assunção, Proposta de Permuta e Reposição de Aula.
 * 5. Configuração e Histórico de E-mails para a Coordenação Pedagógica.
 */

let usuarioLogado = "";
let bancoDeDados = {};
let pollingInterval = null;
let aulaSelecionadaParaAcao = null;

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  registrarServiceWorker();
  configurarEventosInterface();
  await carregarDadosIniciais();
  verificarLoginSalvo();
});

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker registrado com sucesso!"))
      .catch((err) => console.log("Falha ao registrar Service Worker:", err));
  }
}

async function carregarDadosIniciais() {
  atualizarIndicadorSincronismo("atualizando", "Carregando horários...");
  const resultado = await API.carregarGradeCompleta();
  bancoDeDados = resultado.data;
  
  if (resultado.online) {
    atualizarIndicadorSincronismo("online", "Conectado ao Google Sheets");
  } else {
    atualizarIndicadorSincronismo("local", "Modo Rápido / Base Local");
  }
}

function verificarLoginSalvo() {
  const usuarioSalvo = localStorage.getItem("IFS_SAVED_USER") || sessionStorage.getItem("IFS_SESSION_USER");
  if (usuarioSalvo) {
    usuarioLogado = usuarioSalvo;
    entrarNoPainel();
  }
}

// ============================================================================
// CONFIGURAÇÃO DE EVENTOS DA INTERFACE
// ============================================================================
function configurarEventosInterface() {
  // Login e Recuperação de PIN
  document.getElementById("btnLogin").addEventListener("click", executarLogin);
  document.getElementById("btnEsqueciPin").addEventListener("click", abrirModalEsqueciPin);
  document.getElementById("btnConfirmarRecuperarPin").addEventListener("click", executarRecuperarPin);
  document.getElementById("pinInput").addEventListener("keyup", (e) => {
    if (e.key === "Enter") executarLogin();
  });

  // Logout
  document.getElementById("btnLogout").addEventListener("click", executarLogout);

  // Troca de Abas
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      alternarAba(btn.getAttribute("data-tab"));
    });
  });

  // Refresh manual
  document.getElementById("btnManualRefresh").addEventListener("click", async () => {
    await recarregarDados();
    mostrarToast("Grade atualizada com sucesso!");
  });

  // Botão de Alerta no Banner
  document.getElementById("btnVerAlertas").addEventListener("click", () => {
    alternarAba("tab-livres");
  });

  // Filtro de Turma
  document.getElementById("filtroTurmaSelect").addEventListener("change", (e) => {
    renderizarGradePorTurma(e.target.value);
  });

  // Botões de Ação de Reposição e Trocas
  document.getElementById("btnOpenModalReposicao").addEventListener("click", abrirModalReposicao);
  document.getElementById("btnNovaReposicaoTab").addEventListener("click", abrirModalReposicao);
  document.getElementById("btnConfirmarReposicao").addEventListener("click", executarAgendarReposicao);
  document.getElementById("btnNovaTrocaTab").addEventListener("click", iniciarTrocaPelaAba);

  // Proposta de Troca
  document.getElementById("selectMinhaAulaTroca").addEventListener("change", (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && bancoDeDados[usuarioLogado] && bancoDeDados[usuarioLogado][idx]) {
      aulaSelecionadaParaAcao = {
        prof: usuarioLogado,
        index: idx,
        aula: bancoDeDados[usuarioLogado][idx]
      };
    }
  });
  document.getElementById("selectColegaTroca").addEventListener("change", (e) => {
    atualizarSelectAulasColega(e.target.value);
  });
  document.getElementById("btnConfirmarPropostaTroca").addEventListener("click", executarPropostaTroca);

  // Filtros e Exportações da Aba de Relatórios
  document.getElementById("filtroRelatorioTipo").addEventListener("change", renderizarRelatorios);
  document.getElementById("filtroRelatorioProf").addEventListener("change", renderizarRelatorios);
  document.getElementById("filtroRelatorioTurma").addEventListener("change", renderizarRelatorios);
  document.getElementById("btnImprimirRelatorio").addEventListener("click", () => window.print());
  document.getElementById("btnExportarCsv").addEventListener("click", exportarRelatorioCSV);
  document.getElementById("btnCopiarTabela").addEventListener("click", copiarRelatorioTabela);

  // Modal Configurações
  document.getElementById("btnOpenSettings").addEventListener("click", abrirModalConfig);
  document.getElementById("btnSalvarConfig").addEventListener("click", salvarConfiguracoes);
  document.getElementById("btnResetarDemo").addEventListener("click", resetarDadosDemo);

  // Modal Alterar PIN
  document.getElementById("btnSalvarNovoPin").addEventListener("click", salvarNovoPin);

  // Fechamento de Modais
  document.querySelectorAll(".btn-close-modal, .btn-cancelar-modal").forEach((btn) => {
    btn.addEventListener("click", fecharTodosModais);
  });

  // Reconexão inteligente instantânea (ao desbloquear tela / trocar de app ou voltar online)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && usuarioLogado) {
      recarregarDados(true);
    }
  });

  window.addEventListener("online", () => {
    if (usuarioLogado) {
      recarregarDados(false);
      mostrarToast("Conexão restabelecida com sucesso!");
    }
  });
}

// ============================================================================
// SISTEMA DE LOGIN COM PIN
// ============================================================================
function executarLogin() {
  const selectProf = document.getElementById("loginProf");
  const pinInput = document.getElementById("pinInput");
  const lembrarme = document.getElementById("lembrarAcesso").checked;

  const prof = selectProf.value;
  const pin = pinInput.value.trim();

  if (!prof) {
    mostrarErroLogin("Selecione o seu nome na lista de professores.");
    return;
  }

  if (!pin) {
    mostrarErroLogin("Digite o seu PIN de acesso (Padrão: 1234).");
    return;
  }

  const pinValido = API.verifyPin(prof, pin);
  if (!pinValido) {
    mostrarErroLogin("PIN incorreto! Se você ainda não alterou, o padrão é 1234.");
    return;
  }

  document.getElementById("erroLogin").style.display = "none";
  usuarioLogado = prof;

  if (lembrarme) {
    localStorage.setItem("IFS_SAVED_USER", prof);
  } else {
    localStorage.removeItem("IFS_SAVED_USER");
  }
  sessionStorage.setItem("IFS_SESSION_USER", prof);

  pinInput.value = "";
  entrarNoPainel();
  mostrarToast(`Bem-vindo(a), Prof. ${usuarioLogado}!`);
}

function mostrarErroLogin(texto) {
  const msgErro = document.getElementById("erroLogin");
  msgErro.innerText = texto;
  msgErro.style.display = "block";
}

function abrirModalEsqueciPin() {
  const prof = document.getElementById("loginProf").value;
  if (!prof) {
    mostrarErroLogin("Por favor, selecione primeiro o seu nome na lista para recuperar o PIN.");
    return;
  }
  const email = `${prof.toLowerCase().replace(/\s+/g, '.')}@ifs.edu.br`;
  document.getElementById("modalEsqueciPinDesc").innerText = 
    `Professor(a): ${prof} • E-mail Institucional: ${email}`;
  abrirModal("modalEsqueciPin");
}

function executarRecuperarPin() {
  const prof = document.getElementById("loginProf").value;
  if (!prof) return;

  const res = API.recuperarPin(prof);
  fecharTodosModais();
  document.getElementById("pinInput").value = res.pinPadrao;
  mostrarToast(`PIN redefinido para 1234 e notificado para ${res.email}!`);
  mostrarErroLogin(`Seu PIN foi redefinido para 1234. Já preenchemos no campo para você! Basta clicar em "Entrar no Painel".`);
}

function entrarNoPainel() {
  document.getElementById("tela-login").style.display = "none";
  document.getElementById("tela-painel").style.display = "flex";
  document.getElementById("nomeUsuarioLogado").innerText = `Prof. ${usuarioLogado}`;
  document.getElementById("userAvatar").innerText = usuarioLogado.substring(0, 2).toUpperCase();

  renderizarTudo();
  iniciarPolling();
}

function executarLogout() {
  localStorage.removeItem("IFS_SAVED_USER");
  sessionStorage.removeItem("IFS_SESSION_USER");
  usuarioLogado = "";
  pararPolling();

  document.getElementById("tela-painel").style.display = "none";
  document.getElementById("tela-login").style.display = "flex";
  document.getElementById("loginProf").value = "";
  document.getElementById("pinInput").value = "";
  document.getElementById("erroLogin").style.display = "none";
  mostrarToast("Sessão finalizada com sucesso.");
}

// ============================================================================
// NAVEGAÇÃO E RENDERIZAÇÃO GERAL
// ============================================================================
function alternarAba(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === tabId);
  });
  if (tabId === "tab-emails") renderizarEmailsLog();
  if (tabId === "tab-trocas") renderizarTrocasEReposicoes();
  if (tabId === "tab-relatorios") renderizarRelatorios();
}

function renderizarTudo() {
  atualizarContadoresEAlerta();
  renderizarMinhaGrade();
  renderizarAulasLivres();
  renderizarTrocasEReposicoes();
  renderizarGradePorTurma(document.getElementById("filtroTurmaSelect").value || "1º DS");
  renderizarRelatorios();
  renderizarEmailsLog();
}

function atualizarContadoresEAlerta() {
  let totalLivres = 0;
  for (const prof in bancoDeDados) {
    bancoDeDados[prof].forEach((aula) => {
      if (aula.status === "alert") totalLivres++;
    });
  }

  // Contador de Aulas Livres
  const badgeLivres = document.getElementById("badgeQtdLivres");
  badgeLivres.innerText = totalLivres;
  badgeLivres.style.display = totalLivres > 0 ? "inline-block" : "none";

  // Contador de Trocas Pendentes para o Usuário
  const trocas = API.getTrocas();
  const trocasParaMim = trocas.filter(t => t.colega === usuarioLogado && t.status === "pendente").length;
  const badgeTrocas = document.getElementById("badgeQtdTrocas");
  badgeTrocas.innerText = trocasParaMim;
  badgeTrocas.style.display = trocasParaMim > 0 ? "inline-block" : "none";

  // Banner no topo
  const banner = document.getElementById("alertBanner");
  if (totalLivres > 0) {
    document.getElementById("countAlertas").innerText = totalLivres;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

// ============================================================================
// 1. ABA: MINHA GRADE
// ============================================================================
function renderizarMinhaGrade() {
  const container = document.getElementById("minhaGradeContainer");
  container.innerHTML = "";

  const minhasAulas = [];

  // Aulas originais
  if (bancoDeDados[usuarioLogado]) {
    bancoDeDados[usuarioLogado].forEach((aula, idx) => {
      minhasAulas.push({ ...aula, profOriginal: usuarioLogado, indexOriginal: idx, ehMinha: true });
    });
  }

  // Aulas que assumi de outros professores
  for (const prof in bancoDeDados) {
    if (prof !== usuarioLogado) {
      bancoDeDados[prof].forEach((aula, idx) => {
        if (aula.status === "assumed" && aula.substituto === usuarioLogado) {
          minhasAulas.push({ ...aula, profOriginal: prof, indexOriginal: idx, ehMinha: false });
        }
      });
    }
  }

  if (minhasAulas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">Nenhuma aula cadastrada na sua grade.</div>
      </div>`;
    return;
  }

  const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
  const aulasPorDia = {};
  minhasAulas.forEach((a) => {
    if (!aulasPorDia[a.dia]) aulasPorDia[a.dia] = [];
    aulasPorDia[a.dia].push(a);
  });

  diasOrdem.forEach((dia) => {
    if (aulasPorDia[dia] && aulasPorDia[dia].length > 0) {
      container.innerHTML += `<div class="day-header">${dia}</div>`;
      let cardsHTML = `<div class="cards-grid">`;
      aulasPorDia[dia].forEach((aula) => {
        cardsHTML += criarCardHTML(aula, "minha_grade");
      });
      cardsHTML += `</div>`;
      container.innerHTML += cardsHTML;
    }
  });
}

// ============================================================================
// 2. ABA: AULAS DISPONÍVEIS
// ============================================================================
function renderizarAulasLivres() {
  const container = document.getElementById("aulasLivresContainer");
  container.innerHTML = "";

  const aulasLivres = [];
  for (const prof in bancoDeDados) {
    bancoDeDados[prof].forEach((aula, idx) => {
      if (aula.status === "alert") {
        aulasLivres.push({ ...aula, profOriginal: prof, indexOriginal: idx });
      }
    });
  }

  if (aulasLivres.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-text">Não há aulas precisando de substituição no momento!</div>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">Todas as turmas estão com professores confirmados.</p>
      </div>`;
    return;
  }

  let cardsHTML = `<div class="cards-grid">`;
  aulasLivres.forEach((aula) => {
    cardsHTML += criarCardHTML(aula, "aulas_livres");
  });
  cardsHTML += `</div>`;
  container.innerHTML = cardsHTML;
}

// ============================================================================
// 3. ABA: TROCAS (PERMUTAS) & REPOSIÇÕES DE AULA
// ============================================================================
function renderizarTrocasEReposicoes() {
  const containerTrocas = document.getElementById("trocasContainer");
  const containerReposicoes = document.getElementById("reposicoesContainer");
  containerTrocas.innerHTML = "";
  containerReposicoes.innerHTML = "";

  // 1. Trocas
  const trocas = API.getTrocas();
  if (trocas.length === 0) {
    containerTrocas.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 32px;">🔄</div>
        <div class="empty-state-text" style="font-size: 14px;">Nenhuma troca ou permuta em andamento.</div>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Use o botão "Propor Troca de Horário" para propor uma permuta com outro professor.</p>
      </div>`;
  } else {
    let trocasHTML = `<div class="cards-grid">`;
    trocas.forEach((t) => {
      const souProponente = t.proponente === usuarioLogado;
      const souDestinatario = t.colega === usuarioLogado;
      let statusBadge = "";
      let acaoTroca = "";

      if (t.status === "pendente") {
        statusBadge = `<span style="background:#f3e5f5; color:#7b1fa2; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">Aguardando Aceite</span>`;
        if (souDestinatario) {
          acaoTroca = `
            <div class="card-actions-row" style="margin-top: 12px;">
              <button class="btn-card" style="background: #2e7d32; color: white;" onclick="aceitarTroca('${t.id}')">✅ Aceitar Troca</button>
              <button class="btn-card btn-card-cancel" onclick="recusarTroca('${t.id}')">❌ Recusar</button>
            </div>`;
        } else if (souProponente) {
          acaoTroca = `<div style="font-size:13px; color:#7b1fa2; margin-top:10px; font-weight:600;">⏳ Proposta enviada para Prof. ${t.colega}. Aguardando confirmação.</div>`;
        }
      } else if (t.status === "aceita") {
        statusBadge = `<span style="background:#e8f5e9; color:#1b5e20; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">✅ Permuta Confirmada</span>`;
      } else if (t.status === "recusada") {
        statusBadge = `<span style="background:#ffebee; color:#d32f2f; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">Recusada</span>`;
      }

      trocasHTML += `
        <div class="class-card swap-pending">
          <div class="card-top">
            <span style="font-size:13px; font-weight:800; color:var(--accent-swap);">Permuta de Horário</span>
            ${statusBadge}
          </div>
          <div class="swap-comparison-card">
            <div class="swap-side">
              <div class="swap-side-title">📤 Cedida por Prof. ${t.proponente}:</div>
              <div class="swap-side-desc">${t.aulaCedida.disc} (${t.aulaCedida.turma}) • ${t.aulaCedida.dia} às ${t.aulaCedida.hora}</div>
            </div>
            <div class="swap-side">
              <div class="swap-side-title">📥 Em troca de aula do Prof. ${t.colega}:</div>
              <div class="swap-side-desc">${t.aulaDesejada.disc} (${t.aulaDesejada.turma}) • ${t.aulaDesejada.dia} às ${t.aulaDesejada.hora}</div>
            </div>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); line-height: 1.4;">
            📅 Data Prevista: <strong>${t.dataPrevista}</strong> ${t.motivo ? `• Justificativa: <em>${t.motivo}</em>` : ""}
          </div>
          ${acaoTroca}
        </div>`;
    });
    trocasHTML += `</div>`;
    containerTrocas.innerHTML = trocasHTML;
  }

  // 2. Reposições
  const reposicoes = API.getReposicoes();
  if (reposicoes.length === 0) {
    containerReposicoes.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <div class="empty-state-icon" style="font-size: 32px;">📅</div>
        <div class="empty-state-text" style="font-size: 14px;">Nenhuma reposição de aula agendada.</div>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Clique em "Agendar Reposição de Aula" para registrar reposições letivas.</p>
      </div>`;
  } else {
    let reposHTML = `<div class="cards-grid">`;
    reposicoes.forEach((r) => {
      const souDono = r.professor === usuarioLogado;
      reposHTML += `
        <div class="class-card reposicao">
          <div class="card-top">
            <div class="card-time">📅 ${r.data} • 🕒 ${r.horario}</div>
            <span class="card-badge-room" style="background:#e1f5fe; color:#0288d1; font-weight:800;">${r.turma}</span>
          </div>
          <div class="card-title">${r.disciplina}</div>
          <div class="card-subtitle">Docente: Prof. <strong>${r.professor}</strong> • Local: <strong>${r.sala}</strong></div>
          <div class="card-note" style="color:#0288d1; font-size: 13px;">📌 ${r.motivo || "Reposição de aula curricular"}</div>
          ${souDono ? `<button class="btn-card btn-card-cancel" style="margin-top:10px;" onclick="cancelarReposicao('${r.id}')">Cancelar Reposição</button>` : ""}
        </div>`;
    });
    reposHTML += `</div>`;
    containerReposicoes.innerHTML = reposHTML;
  }
}

// ============================================================================
// 4. ABA: GRADE POR TURMA
// ============================================================================
function renderizarGradePorTurma(turmaAlvo) {
  const container = document.getElementById("gradeTurmaContainer");
  container.innerHTML = "";

  const aulasDaTurma = [];
  for (const prof in bancoDeDados) {
    bancoDeDados[prof].forEach((aula, idx) => {
      if (aula.turma.toLowerCase().includes(turmaAlvo.toLowerCase())) {
        aulasDaTurma.push({ ...aula, profOriginal: prof, indexOriginal: idx });
      }
    });
  }

  if (aulasDaTurma.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏫</div>
        <div class="empty-state-text">Nenhuma aula encontrada para a turma ${turmaAlvo}.</div>
      </div>`;
    return;
  }

  const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
  const agrupado = {};
  aulasDaTurma.forEach((a) => {
    if (!agrupado[a.dia]) agrupado[a.dia] = [];
    agrupado[a.dia].push(a);
  });

  diasOrdem.forEach((dia) => {
    if (agrupado[dia] && agrupado[dia].length > 0) {
      container.innerHTML += `<div class="day-header">${dia}</div>`;
      let cardsHTML = `<div class="cards-grid">`;
      agrupado[dia].forEach((aula) => {
        cardsHTML += criarCardHTML(aula, "grade_turma");
      });
      cardsHTML += `</div>`;
      container.innerHTML += cardsHTML;
    }
  });
}

// ============================================================================
// 5. ABA: RELATÓRIOS & PRESTAÇÃO DE CONTAS
// ============================================================================
function renderizarRelatorios() {
  const dataEl = document.getElementById("dataGeracaoRelatorio");
  if (dataEl) {
    const agora = new Date();
    dataEl.innerText = `Gerado em: ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR")}`;
  }

  // Popula o select de professores se necessário
  const selectProf = document.getElementById("filtroRelatorioProf");
  if (selectProf && selectProf.options.length <= 1) {
    const valAtual = selectProf.value || "TODOS";
    selectProf.innerHTML = '<option value="TODOS">Todos os Professores</option>';
    const profs = Object.keys(bancoDeDados).sort();
    profs.forEach((p) => {
      selectProf.innerHTML += `<option value="${p}">Prof. ${p}</option>`;
    });
    selectProf.value = valAtual;
  }

  const todosEventos = API.obterTodosEventosRelatorio();

  // Atualização dos Indicadores / KPIs Consolidados
  let totalFaltas = 0;
  let totalSubs = 0;
  let totalTrocas = 0;
  let totalRep = 0;

  todosEventos.forEach((ev) => {
    if (ev.tipo === "AUSENCIA") totalFaltas++;
    else if (ev.tipo === "SUBSTITUICAO") totalSubs++;
    else if (ev.tipo === "PERMUTA") totalTrocas++;
    else if (ev.tipo === "REPOSICAO") totalRep++;
  });

  const elFaltas = document.getElementById("kpiTotalFaltas");
  const elSubs = document.getElementById("kpiTotalSubs");
  const elTrocas = document.getElementById("kpiTotalTrocas");
  const elRep = document.getElementById("kpiTotalRep");

  if (elFaltas) elFaltas.innerText = totalFaltas;
  if (elSubs) elSubs.innerText = totalSubs;
  if (elTrocas) elTrocas.innerText = totalTrocas;
  if (elRep) elRep.innerText = totalRep;

  // Filtragem
  const tipoFiltro = document.getElementById("filtroRelatorioTipo") ? document.getElementById("filtroRelatorioTipo").value : "TODOS";
  const profFiltro = document.getElementById("filtroRelatorioProf") ? document.getElementById("filtroRelatorioProf").value : "TODOS";
  const turmaFiltro = document.getElementById("filtroRelatorioTurma") ? document.getElementById("filtroRelatorioTurma").value : "TODAS";

  const filtrados = todosEventos.filter((ev) => {
    if (tipoFiltro !== "TODOS" && ev.tipo !== tipoFiltro) return false;
    if (profFiltro !== "TODOS" && ev.titular !== profFiltro && ev.substituto !== profFiltro) return false;
    if (turmaFiltro !== "TODAS" && !ev.turma.includes(turmaFiltro)) return false;
    return true;
  });

  // Renderização da Tabela
  const tbody = document.getElementById("tabelaRelatoriosCorpo");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted); font-size: 14px;">
          Nenhum registro encontrado para os filtros selecionados.
        </td>
      </tr>`;
    return;
  }

  filtrados.forEach((ev) => {
    let badgeHTML = "";
    if (ev.tipo === "AUSENCIA") {
      badgeHTML = `<span class="badge-tipo-evento AUSENCIA">⚠️ Ausência</span>`;
    } else if (ev.tipo === "SUBSTITUICAO") {
      badgeHTML = `<span class="badge-tipo-evento SUBSTITUICAO">✅ Substituição</span>`;
    } else if (ev.tipo === "PERMUTA") {
      badgeHTML = `<span class="badge-tipo-evento PERMUTA">🔄 Permuta</span>`;
    } else if (ev.tipo === "REPOSICAO") {
      badgeHTML = `<span class="badge-tipo-evento REPOSICAO">📅 Reposição</span>`;
    }

    const subTexto = ev.substituto && ev.substituto !== "-" 
      ? `<strong class="prof-name-text">Prof. ${ev.substituto}</strong>` 
      : `<span class="sem-substituto">—</span>`;

    let statusBadgeClass = "badge-status-neutral";
    if (ev.status === "Homologada" || ev.status === "Confirmada") statusBadgeClass = "badge-status-success";
    else if (ev.status.includes("Pendente") || ev.status.includes("Aguardando")) statusBadgeClass = "badge-status-warning";
    else if (ev.status === "Agendada") statusBadgeClass = "badge-status-info";
    else if (ev.status === "Recusada") statusBadgeClass = "badge-status-danger";

    tbody.innerHTML += `
      <tr>
        <td class="col-data">
          <div class="row-data-main">${ev.data}</div>
          <div class="row-data-sub">🕒 ${ev.horario}</div>
        </td>
        <td class="col-tipo">${badgeHTML}</td>
        <td class="col-titular">
          <strong class="prof-name-text">Prof. ${ev.titular}</strong>
        </td>
        <td class="col-sub">${subTexto}</td>
        <td class="col-turma-disc">
          <span class="turma-tag">${ev.turma}</span>
          <div class="disc-name">${ev.disciplina}</div>
        </td>
        <td class="col-detalhes">
          <div class="detalhes-box">${ev.detalhes}</div>
        </td>
        <td class="col-status">
          <span class="report-status-badge ${statusBadgeClass}">${ev.status}</span>
        </td>
      </tr>`;
  });
}

function exportarRelatorioCSV() {
  const todosEventos = API.obterTodosEventosRelatorio();
  const tipoFiltro = document.getElementById("filtroRelatorioTipo").value;
  const profFiltro = document.getElementById("filtroRelatorioProf").value;
  const turmaFiltro = document.getElementById("filtroRelatorioTurma").value;

  const filtrados = todosEventos.filter((ev) => {
    if (tipoFiltro !== "TODOS" && ev.tipo !== tipoFiltro) return false;
    if (profFiltro !== "TODOS" && ev.titular !== profFiltro && ev.substituto !== profFiltro) return false;
    if (turmaFiltro !== "TODAS" && !ev.turma.includes(turmaFiltro)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    alert("Não há dados para exportar com os filtros atuais.");
    return;
  }

  const cabecalhos = [
    "Data",
    "Horário",
    "Tipo",
    "Docente Titular",
    "Substituto / Colega",
    "Turma",
    "Disciplina",
    "Detalhes / Justificativa",
    "Status"
  ];

  const linhas = filtrados.map((ev) => [
    `"${ev.data}"`,
    `"${ev.horario}"`,
    `"${ev.tipo}"`,
    `"Prof. ${ev.titular}"`,
    `"${ev.substituto !== '-' ? 'Prof. ' + ev.substituto : '-'}"`,
    `"${ev.turma}"`,
    `"${ev.disciplina}"`,
    `"${(ev.detalhes || '').replace(/"/g, '""')}"`,
    `"${ev.status}"`
  ]);

  const csvConteudo = "\uFEFF" + [cabecalhos.join(";"), ...linhas.map((l) => l.join(";"))].join("\r\n");
  const blob = new Blob([csvConteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dataHoje = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `relatorio-horarios-ifs-tobias-barreto-${dataHoje}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  mostrarToast("Planilha CSV baixada com sucesso!");
}

function copiarRelatorioTabela() {
  const todosEventos = API.obterTodosEventosRelatorio();
  const tipoFiltro = document.getElementById("filtroRelatorioTipo").value;
  const profFiltro = document.getElementById("filtroRelatorioProf").value;
  const turmaFiltro = document.getElementById("filtroRelatorioTurma").value;

  const filtrados = todosEventos.filter((ev) => {
    if (tipoFiltro !== "TODOS" && ev.tipo !== tipoFiltro) return false;
    if (profFiltro !== "TODOS" && ev.titular !== profFiltro && ev.substituto !== profFiltro) return false;
    if (turmaFiltro !== "TODAS" && !ev.turma.includes(turmaFiltro)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    alert("Não há dados para copiar.");
    return;
  }

  const cabecalhos = [
    "Data",
    "Horário",
    "Tipo",
    "Docente Titular",
    "Substituto / Colega",
    "Turma",
    "Disciplina",
    "Detalhes / Justificativa",
    "Status"
  ];

  const linhas = filtrados.map((ev) => [
    ev.data,
    ev.horario,
    ev.tipo,
    `Prof. ${ev.titular}`,
    ev.substituto !== '-' ? `Prof. ${ev.substituto}` : '-',
    ev.turma,
    ev.disciplina,
    ev.detalhes || '',
    ev.status
  ]);

  const tsv = [cabecalhos.join("\t"), ...linhas.map((l) => l.join("\t"))].join("\n");
  navigator.clipboard.writeText(tsv).then(() => {
    mostrarToast("Tabela copiada! Cole direto no Excel, Planilhas ou Word (Ctrl+V).");
  }).catch(() => {
    alert("Não foi possível copiar automaticamente para a área de transferência.");
  });
}

// ============================================================================
// 6. ABA: CENTRAL DE E-MAILS & NOTIFICAÇÕES
// ============================================================================
function renderizarEmailsLog() {
  const container = document.getElementById("emailsLogContainer");
  container.innerHTML = "";

  const logs = API.getEmailsLog();
  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✉️</div>
        <div class="empty-state-text">Nenhum e-mail disparado até o momento.</div>
      </div>`;
    return;
  }

  logs.forEach((log) => {
    container.innerHTML += `
      <div class="email-log-item">
        <div class="email-log-top">
          <span class="email-tag ${log.tipo}">${log.tipo}</span>
          <span class="email-log-date">🕒 ${log.data}</span>
        </div>
        <div class="email-log-subject">${log.assunto}</div>
        <div class="email-log-dest">Destinatários: <strong>${log.destinatario}</strong></div>
        <div class="email-log-status">
          <span>✓</span> <span>${log.status}</span>
        </div>
      </div>`;
  });
}

// ============================================================================
// CONSTRUÇÃO DOS CARDS COM BOTÕES DE AÇÃO
// ============================================================================
function criarCardHTML(aula, contexto) {
  let statusClass = aula.status;
  let subtitle = "";
  let botaoHTML = "";
  const ehDono = aula.profOriginal === usuarioLogado;
  const ehSubstituto = aula.substituto === usuarioLogado;

  const dataInfo = aula.dataFalta ? `<div class="card-note">📅 Ausência marcada para: <strong>${aula.dataFalta}</strong></div>` : "";

  if (contexto === "minha_grade") {
    if (aula.status === "normal") {
      subtitle = `Turma: ${aula.turma} • Sala de Aula`;
      botaoHTML = `
        <div class="card-actions-row">
          <button class="btn-card btn-card-release" onclick="abrirModalLiberar('${aula.profOriginal}', ${aula.indexOriginal})">
            ⚠️ Informar Falta
          </button>
          <button class="btn-card btn-card-swap" onclick="abrirModalTroca('${aula.profOriginal}', ${aula.indexOriginal})">
            🔄 Propor Troca
          </button>
        </div>`;
    } else if (aula.status === "alert") {
      subtitle = `Turma: ${aula.turma} • <strong>Você disponibilizou este horário</strong>`;
      botaoHTML = `<button class="btn-card btn-card-cancel" onclick="cancelarAusencia('${aula.profOriginal}', ${aula.indexOriginal})">
        ↩️ Desfazer falta (Vou lecionar normalmente)
      </button>`;
    } else if (aula.status === "assumed") {
      if (ehSubstituto) {
        subtitle = `Turma: ${aula.turma} • Substituição da aula de Prof. ${aula.profOriginal}`;
        botaoHTML = `<button class="btn-card btn-card-cancel" onclick="desistirSubstituicao('${aula.profOriginal}', ${aula.indexOriginal})">
          Desistir desta substituição
        </button>`;
      } else {
        subtitle = `Turma: ${aula.turma} • Assumida por Prof. ${aula.substituto}`;
        botaoHTML = `<button class="btn-card btn-card-static">✅ Substituída por Prof. ${aula.substituto}</button>`;
      }
    }
  } else if (contexto === "aulas_livres") {
    subtitle = `Cedida por: Prof. ${aula.profOriginal} (${aula.turma})`;
    if (ehDono) {
      botaoHTML = `<button class="btn-card btn-card-cancel" onclick="cancelarAusencia('${aula.profOriginal}', ${aula.indexOriginal})">
        ↩️ Desfazer falta (Recuperar minha aula)
      </button>`;
    } else {
      botaoHTML = `<button class="btn-card btn-card-take" onclick="prepararAssumirAula('${aula.profOriginal}', ${aula.indexOriginal})">
        🙋‍♂️ Assumir esta Aula
      </button>`;
    }
  } else if (contexto === "grade_turma") {
    subtitle = `Prof. Titular: ${aula.profOriginal} • ${aula.turma}`;
    if (aula.status === "assumed") {
      botaoHTML = `<button class="btn-card btn-card-static">👤 Assumida por: Prof. ${aula.substituto}</button>`;
    } else if (aula.status === "alert") {
      botaoHTML = `<button class="btn-card btn-card-take" onclick="prepararAssumirAula('${aula.profOriginal}', ${aula.indexOriginal})">
        🔴 Disponível para Substituição
      </button>`;
    } else {
      botaoHTML = `<button class="btn-card btn-card-release" style="pointer-events:none;">Aula Regular Confirmada</button>`;
    }
  }

  return `
    <div class="class-card ${statusClass}">
      <div class="card-top">
        <div class="card-time">🕒 ${aula.hora} (${aula.dia})</div>
        <span class="card-badge-room">${aula.turma}</span>
      </div>
      <div class="card-title">${aula.disc}</div>
      <div class="card-subtitle">${subtitle}</div>
      ${dataInfo}
      ${botaoHTML}
    </div>`;
}

// ============================================================================
// VALIDADOR INTELIGENTE DE CONFLITOS DE HORÁRIO
// ============================================================================
function verificarConflito(diaAlvo, horaAlvo, professorAlvo = usuarioLogado) {
  if (bancoDeDados[professorAlvo]) {
    for (const aula of bancoDeDados[professorAlvo]) {
      if (aula.dia === diaAlvo && aula.hora === horaAlvo && aula.status !== "alert") {
        return {
          conflito: true,
          descricao: `Aula de ${aula.disc} (${aula.turma}) do Prof. ${professorAlvo}`
        };
      }
    }
  }

  for (const prof in bancoDeDados) {
    for (const aula of bancoDeDados[prof]) {
      if (aula.status === "assumed" && aula.substituto === professorAlvo && aula.dia === diaAlvo && aula.hora === horaAlvo) {
        return {
          conflito: true,
          descricao: `Substituição de ${aula.disc} (${aula.turma}) do Prof. ${prof}`
        };
      }
    }
  }

  return { conflito: false };
}

// ============================================================================
// MODAL & AÇÃO: LIBERAR AULA (AUSÊNCIA)
// ============================================================================
function abrirModalLiberar(prof, index) {
  const aula = bancoDeDados[prof][index];
  aulaSelecionadaParaAcao = { prof, index, aula };

  const dests = API.obterDestinatariosPorTurma(aula.turma);
  document.getElementById("modalLiberarDesc").innerHTML = 
    `<strong>${aula.disc} - ${aula.turma}</strong> (${aula.dia} às ${aula.hora})<br>` +
    `<span style="font-size: 11px; color: var(--primary-color); font-weight: 600;">📬 Coordenadores a notificar: ${dests}</span>`;
  
  const inputData = document.getElementById("inputDataFalta");
  const hoje = new Date();
  inputData.value = hoje.toISOString().split("T")[0];

  document.getElementById("inputMotivoFalta").value = "";
  abrirModal("modalLiberar");
}

document.getElementById("btnConfirmarLiberar").addEventListener("click", async () => {
  if (!aulaSelecionadaParaAcao) return;
  const { prof, index, aula } = aulaSelecionadaParaAcao;

  const dataFalta = document.getElementById("inputDataFalta").value;
  const motivo = document.getElementById("inputMotivoFalta").value.trim();

  fecharTodosModais();
  atualizarIndicadorSincronismo("atualizando", "Notificando coordenação...");

  await API.executarAcao({
    acao: "libertar",
    profOriginal: prof,
    index,
    dataFalta,
    motivo
  });

  await recarregarDados();
  mostrarToast(`Aula liberada! E-mails institucionais enviados.`);
});

// ============================================================================
// MODAL & AÇÃO: ASSUMIR SUBSTITUIÇÃO
// ============================================================================
function prepararAssumirAula(profOriginal, index) {
  const aula = bancoDeDados[profOriginal][index];

  const teste = verificarConflito(aula.dia, aula.hora);
  if (teste.conflito) {
    document.getElementById("modalConflitoTexto").innerText = 
      `Você já possui aula agendada para este mesmo dia e horário:\n▶ ${teste.descricao}\n\nO sistema impede a sobreposição para garantir que nenhuma turma fique desacompanhada.`;
    abrirModal("modalConflito");
    return;
  }

  aulaSelecionadaParaAcao = { profOriginal, index, aula };
  document.getElementById("modalAssumirTexto").innerText = 
    `Confirmar que você (Prof. ${usuarioLogado}) vai assumir a aula de ${aula.disc} (${aula.turma}) no lugar do Prof. ${profOriginal} no dia ${aula.dia} às ${aula.hora}?`;
  abrirModal("modalAssumir");
}

document.getElementById("btnConfirmarAssumir").addEventListener("click", async () => {
  if (!aulaSelecionadaParaAcao) return;
  const { profOriginal, index, aula } = aulaSelecionadaParaAcao;

  fecharTodosModais();
  atualizarIndicadorSincronismo("atualizando", "Registrando substituição...");

  await API.executarAcao({
    acao: "assumir",
    profOriginal,
    index,
    substituto: usuarioLogado
  });

  await recarregarDados();
  mostrarToast(`Sucesso! Aula de ${aula.disc} assumida e e-mails disparados.`);
});

async function cancelarAusencia(prof, index) {
  const aula = bancoDeDados[prof][index];
  if (confirm(`Deseja cancelar a ausência e lecionar a aula de ${aula.disc} normalmente?`)) {
    atualizarIndicadorSincronismo("atualizando", "Restaurando aula...");
    await API.executarAcao({ acao: "recuperar", profOriginal: prof, index });
    await recarregarDados();
    mostrarToast("Aula restaurada na sua grade normal!");
  }
}

async function desistirSubstituicao(profOriginal, index) {
  if (confirm("Deseja desistir desta substituição? A aula voltará a ficar disponível para outros colegas.")) {
    atualizarIndicadorSincronismo("atualizando", "Cancelando substituição...");
    await API.executarAcao({ acao: "libertar", profOriginal, index });
    await recarregarDados();
    mostrarToast("Substituição cancelada. A aula voltou para o mural de disponíveis.");
  }
}

// ============================================================================
// MODAL & AÇÃO: TROCA DE HORÁRIO (PERMUTA ENTRE DOCENTES)
// ============================================================================
function iniciarTrocaPelaAba() {
  const minhasAulas = bancoDeDados[usuarioLogado] || [];
  if (minhasAulas.length === 0) {
    alert("Você não possui aulas cadastradas na sua grade para trocar.");
    return;
  }
  abrirModalTroca(usuarioLogado, 0);
}

function abrirModalTroca(prof, index) {
  prof = prof || usuarioLogado;
  const minhasAulas = bancoDeDados[prof] || [];
  if (minhasAulas.length === 0) {
    alert("Você não possui aulas cadastradas na sua grade para propor troca.");
    return;
  }

  // Popula o select de aulas do docente a ceder
  const selectMinhaAula = document.getElementById("selectMinhaAulaTroca");
  selectMinhaAula.innerHTML = "";
  minhasAulas.forEach((a, idx) => {
    selectMinhaAula.innerHTML += `<option value="${idx}">${a.disc} (${a.turma}) - ${a.dia} às ${a.hora}</option>`;
  });

  const idxFinal = (index !== undefined && index !== null && minhasAulas[index]) ? index : 0;
  selectMinhaAula.value = idxFinal;

  const aula = minhasAulas[idxFinal];
  aulaSelecionadaParaAcao = { prof, index: idxFinal, aula };

  // Popula o select de colegas
  const selectColega = document.getElementById("selectColegaTroca");
  selectColega.innerHTML = '<option value="" disabled selected>Selecione o professor colega...</option>';
  
  for (const colega in bancoDeDados) {
    if (colega !== usuarioLogado) {
      selectColega.innerHTML += `<option value="${colega}">Prof. ${colega}</option>`;
    }
  }

  document.getElementById("selectAulaColega").innerHTML = '<option value="" disabled selected>Escolha primeiro o colega acima...</option>';
  const inputData = document.getElementById("inputDataTroca");
  inputData.value = new Date().toISOString().split("T")[0];
  document.getElementById("inputMotivoTroca").value = "";

  abrirModal("modalTroca");
}

function atualizarSelectAulasColega(colegaNome) {
  const selectAulas = document.getElementById("selectAulaColega");
  selectAulas.innerHTML = '<option value="" disabled selected>Selecione a aula do colega...</option>';
  
  const aulasColega = bancoDeDados[colegaNome] || [];
  if (aulasColega.length === 0) {
    selectAulas.innerHTML = '<option value="" disabled>Nenhuma aula encontrada para este professor.</option>';
    return;
  }

  aulasColega.forEach((aula, idx) => {
    selectAulas.innerHTML += `<option value="${idx}">${aula.disc} (${aula.turma}) - ${aula.dia} às ${aula.hora}</option>`;
  });
}

async function executarPropostaTroca() {
  const idxMinhaAula = parseInt(document.getElementById("selectMinhaAulaTroca").value, 10);
  if (!isNaN(idxMinhaAula) && bancoDeDados[usuarioLogado] && bancoDeDados[usuarioLogado][idxMinhaAula]) {
    aulaSelecionadaParaAcao = {
      prof: usuarioLogado,
      index: idxMinhaAula,
      aula: bancoDeDados[usuarioLogado][idxMinhaAula]
    };
  }

  if (!aulaSelecionadaParaAcao) return;
  const { aula: minhaAula } = aulaSelecionadaParaAcao;

  const colega = document.getElementById("selectColegaTroca").value;
  const aulaIdx = document.getElementById("selectAulaColega").value;
  const dataPrevista = document.getElementById("inputDataTroca").value;
  const motivo = document.getElementById("inputMotivoTroca").value.trim();

  if (!colega || aulaIdx === "") {
    alert("Por favor, selecione o colega e a aula que deseja trocar em contrapartida!");
    return;
  }

  const aulaDesejada = bancoDeDados[colega][aulaIdx];

  // 1. Validação Dupla de Conflito!
  // Eu posso lecionar no horário da aula do colega?
  const conflitoEu = verificarConflito(aulaDesejada.dia, aulaDesejada.hora, usuarioLogado);
  if (conflitoEu.conflito) {
    alert(`⚠️ CONFLITO DETECTADO:\nVocê já possui aula no horário da aula que deseja pegar (${aulaDesejada.dia} às ${aulaDesejada.hora}):\n▶ ${conflitoEu.descricao}`);
    return;
  }

  // O colega pode lecionar no horário da minha aula?
  const conflitoColega = verificarConflito(minhaAula.dia, minhaAula.hora, colega);
  if (conflitoColega.conflito) {
    alert(`⚠️ CONFLITO DO COLEGA:\nO Prof. ${colega} já possui outra aula no horário da sua aula cedida (${minhaAula.dia} às ${minhaAula.hora}):\n▶ ${conflitoColega.descricao}`);
    return;
  }

  fecharTodosModais();
  atualizarIndicadorSincronismo("atualizando", "Registrando proposta de permuta...");

  const novaTroca = {
    id: "TR-" + Date.now(),
    proponente: usuarioLogado,
    colega,
    aulaCedida: minhaAula,
    aulaDesejada,
    dataPrevista,
    motivo,
    status: "pendente",
    dataCriacao: new Date().toLocaleString("pt-BR")
  };

  await API.executarAcao({
    acao: "propor_troca",
    troca: novaTroca
  });

  await recarregarDados();
  mostrarToast(`Proposta de troca enviada ao Prof. ${colega} e coordenação!`);
}

async function aceitarTroca(trocaId) {
  const trocas = API.getTrocas();
  const troca = trocas.find(t => t.id === trocaId);
  if (!troca) return;

  if (confirm(`Confirmar o aceite da troca com o Prof. ${troca.proponente}?`)) {
    atualizarIndicadorSincronismo("atualizando", "Confirmando permuta...");
    await API.executarAcao({
      acao: "aceitar_troca",
      trocaId,
      troca
    });
    await recarregarDados();
    mostrarToast("Permuta confirmada com sucesso! E-mails de homologação disparados.");
  }
}

async function recusarTroca(trocaId) {
  if (confirm("Deseja recusar esta proposta de troca de aula?")) {
    await API.executarAcao({ acao: "recusar_troca", trocaId });
    await recarregarDados();
    mostrarToast("Proposta de troca recusada.");
  }
}

// ============================================================================
// MODAL & AÇÃO: REPOSIÇÃO DE AULA
// ============================================================================
function abrirModalReposicao() {
  const selectDisc = document.getElementById("selectDisciplinaReposicao");
  selectDisc.innerHTML = "";

  const minhasAulas = bancoDeDados[usuarioLogado] || [];
  if (minhasAulas.length === 0) {
    selectDisc.innerHTML = '<option value="Outra Disciplina">Outra Disciplina / Turma</option>';
  } else {
    minhasAulas.forEach((aula) => {
      selectDisc.innerHTML += `<option value="${aula.disc}|${aula.turma}">${aula.disc} (${aula.turma})</option>`;
    });
  }

  const inputData = document.getElementById("inputDataReposicao");
  inputData.value = new Date().toISOString().split("T")[0];
  document.getElementById("inputHorarioReposicao").value = "";
  document.getElementById("inputSalaReposicao").value = "";
  document.getElementById("inputMotivoReposicao").value = "";

  abrirModal("modalReposicao");
}

async function executarAgendarReposicao() {
  const val = document.getElementById("selectDisciplinaReposicao").value;
  const [disc, turma] = val.includes("|") ? val.split("|") : [val, "Geral"];
  const data = document.getElementById("inputDataReposicao").value;
  const horario = document.getElementById("inputHorarioReposicao").value.trim();
  const sala = document.getElementById("inputSalaReposicao").value.trim() || "Sala a definir";
  const motivo = document.getElementById("inputMotivoReposicao").value.trim();

  if (!horario) {
    alert("Por favor, informe o horário da reposição (Ex: 08:40 - 10:20)!");
    return;
  }

  fecharTodosModais();
  atualizarIndicadorSincronismo("atualizando", "Agendando reposição...");

  const novaReposicao = {
    id: "REP-" + Date.now(),
    professor: usuarioLogado,
    disciplina: disc,
    turma,
    data,
    horario,
    sala,
    motivo,
    dataCriacao: new Date().toLocaleString("pt-BR")
  };

  await API.executarAcao({
    acao: "agendar_reposicao",
    reposicao: novaReposicao
  });

  await recarregarDados();
  mostrarToast(`Reposição de aula cadastrada e avisada à coordenação!`);
}

async function cancelarReposicao(id) {
  if (confirm("Deseja realmente cancelar este agendamento de reposição?")) {
    await API.executarAcao({ acao: "cancelar_reposicao", id });
    await recarregarDados();
    mostrarToast("Reposição cancelada.");
  }
}

// ============================================================================
// CONFIGURAÇÕES E E-MAILS INSTITUCIONAIS
// ============================================================================
function abrirModalConfig() {
  const config = API.getEmailsConfig();
  document.getElementById("configEmailCoordDS").value = config.emailCoordDS || "";
  document.getElementById("configEmailCoordADM").value = config.emailCoordADM || "";
  document.getElementById("configEmailCoordGeral").value = config.emailCoordGeral || "";
  document.getElementById("configEmailDir").value = config.emailDirecao || "";
  document.getElementById("chkNotifFalta").checked = !!config.notificarFalta;
  document.getElementById("chkNotifTroca").checked = !!config.notificarTroca;
  document.getElementById("chkNotifReposicao").checked = !!config.notificarReposicao;
  document.getElementById("chkNotifSubs").checked = !!config.notificarSubstituicao;
  document.getElementById("configBackendUrl").value = API.getBackendUrl();

  abrirModal("modalConfig");
}

function salvarConfiguracoes() {
  const url = document.getElementById("configBackendUrl").value;
  API.setBackendUrl(url);

  const novaConfig = {
    emailCoordDS: document.getElementById("configEmailCoordDS").value.trim() || "coordenacao.ds.tb@ifs.edu.br",
    emailCoordADM: document.getElementById("configEmailCoordADM").value.trim() || "coordenacao.adm.tb@ifs.edu.br",
    emailCoordGeral: document.getElementById("configEmailCoordGeral").value.trim() || "coordenacao.tobiasbarreto@ifs.edu.br",
    emailDirecao: document.getElementById("configEmailDir").value.trim() || "direcao.tobiasbarreto@ifs.edu.br",
    notificarFalta: document.getElementById("chkNotifFalta").checked,
    notificarTroca: document.getElementById("chkNotifTroca").checked,
    notificarReposicao: document.getElementById("chkNotifReposicao").checked,
    notificarSubstituicao: document.getElementById("chkNotifSubs").checked
  };

  API.saveEmailsConfig(novaConfig);
  fecharTodosModais();
  recarregarDados();
  mostrarToast("Configurações e e-mails salvos com sucesso!");
}

function salvarNovoPin() {
  const pinAtual = document.getElementById("inputPinAtual").value.trim();
  const novoPin = document.getElementById("inputNovoPin").value.trim();
  const confirmaPin = document.getElementById("inputConfirmaPin").value.trim();

  if (!API.verifyPin(usuarioLogado, pinAtual)) {
    alert("O PIN atual informado está incorreto!");
    return;
  }
  if (novoPin.length < 4) {
    alert("O novo PIN deve ter pelo menos 4 dígitos!");
    return;
  }
  if (novoPin !== confirmaPin) {
    alert("Os novos PINs não coincidem!");
    return;
  }

  API.saveNewPin(usuarioLogado, novoPin);
  fecharTodosModais();
  document.getElementById("inputPinAtual").value = "";
  document.getElementById("inputNovoPin").value = "";
  document.getElementById("inputConfirmaPin").value = "";
  mostrarToast("Novo PIN cadastrado com sucesso!");
}

function resetarDadosDemo() {
  if (confirm("Deseja restaurar os horários, trocas e e-mails para o padrão de demonstração do IFS?")) {
    localStorage.removeItem("IFS_LOCAL_DATABASE");
    localStorage.removeItem("IFS_TROCAS_PERMUTAS");
    localStorage.removeItem("IFS_REPOSICOES_AULAS");
    localStorage.removeItem("IFS_EMAILS_LOG");
    fecharTodosModais();
    carregarDadosIniciais().then(() => {
      renderizarTudo();
      mostrarToast("Dados restaurados para o padrão de demonstração!");
    });
  }
}

// ============================================================================
// CONTROLE DE MODAIS E TOASTS
// ============================================================================
function abrirModal(modalId) {
  document.getElementById(modalId).classList.add("active");
}

function fecharTodosModais() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("active"));
  aulaSelecionadaParaAcao = null;
}

function mostrarToast(mensagem) {
  const toast = document.getElementById("toast");
  toast.innerText = mensagem;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function atualizarIndicadorSincronismo(status, texto) {
  const dot = document.getElementById("syncDot");
  const txt = document.getElementById("syncText");
  if (!dot || !txt) return;

  dot.className = "sync-dot";
  if (status === "atualizando") {
    dot.classList.add("updating");
  } else if (status === "local") {
    dot.classList.add("local");
  } else if (status === "online") {
    dot.classList.add("online");
  }
  txt.innerText = texto;
}

// ============================================================================
// POLLING (AUTO-REFRESH SILENCIOSO A CADA 30 SEGUNDOS)
// ============================================================================
function iniciarPolling() {
  pararPolling();
  pollingInterval = setInterval(async () => {
    await recarregarDados(true);
  }, 30000);
}

function pararPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
}

async function recarregarDados(silencioso = false) {
  if (!silencioso) atualizarIndicadorSincronismo("atualizando", "Sincronizando...");
  const resultado = await API.carregarGradeCompleta();
  bancoDeDados = resultado.data;
  renderizarTudo();

  if (resultado.online) {
    atualizarIndicadorSincronismo("online", "Conectado ao Google Sheets");
  } else {
    atualizarIndicadorSincronismo("local", "Modo Rápido / Base Local");
  }
}
