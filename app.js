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
// AUXILIARES DE FORMATAÇÃO DE DATA
// ============================================================================
function formatarDataISO(dataObj) {
  const d = dataObj instanceof Date ? dataObj : new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(dataStr) {
  if (typeof window !== "undefined" && window.formatarDataBR && window.formatarDataBR !== formatarDataBR) {
    return window.formatarDataBR(dataStr);
  }
  if (!dataStr) return "";
  if (dataStr instanceof Date) {
    const dia = String(dataStr.getDate()).padStart(2, "0");
    const mes = String(dataStr.getMonth() + 1).padStart(2, "0");
    const ano = dataStr.getFullYear();
    return `${dia}-${mes}-${ano}`;
  }
  const str = String(dataStr).trim();
  if (!str) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  const matchIso = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (matchIso) return `${matchIso[3]}-${matchIso[2]}-${matchIso[1]}`;
  const matchBarra = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchBarra) return `${matchBarra[1]}-${matchBarra[2]}-${matchBarra[3]}`;
  return str;
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  registrarServiceWorker();
  configurarEventosInterface();
  carregarDadosIniciais();
  verificarLoginSalvo();
});

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => console.log("Service Worker registrado com sucesso!"))
      .catch((err) => console.log("Falha ao registrar Service Worker:", err));
  }
}

function carregarDadosIniciais() {
  // 1. Carregamento ultra-rápido instantâneo do cache local (0ms)
  bancoDeDados = API.getLocalDatabase();
  renderizarTudo();

  // 2. Sincronização em segundo plano sem travar o app
  recarregarDados(true);
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

  // Refresh manual com feedback imediato
  document.getElementById("btnManualRefresh").addEventListener("click", () => {
    mostrarToast("Consultando atualizações no Google Sheets...");
    recarregarDados(false).then(() => {
      mostrarToast("Grade sincronizada com sucesso!");
    });
  });

  // Botão de Alerta no Banner
  document.getElementById("btnVerAlertas").addEventListener("click", () => {
    const trocas = API.getTrocas();
    const trocasParaMim = trocas.filter(t => t.colega === usuarioLogado && t.status === "pendente").length;
    let totalLivres = 0;
    for (const p in bancoDeDados) {
      bancoDeDados[p].forEach(a => { if (a.status === 'alert') totalLivres++; });
    }
    if (totalLivres === 0 && trocasParaMim > 0) {
      alternarAba("tab-trocas");
    } else {
      alternarAba("tab-livres");
    }
  });

  // Botão de Notificações / Central de Mudanças no Cabeçalho
  const btnNotifGlobal = document.getElementById("btnNotificacoesGlobal");
  if (btnNotifGlobal) {
    btnNotifGlobal.addEventListener("click", abrirModalMudancasAlertas);
  }

  // Filtro de Turma
  document.getElementById("filtroTurmaSelect").addEventListener("change", (e) => {
    renderizarGradePorTurma(e.target.value);
  });

  // Botões de Ação de Falta, Reposição e Trocas
  const btnAusenciaTop = document.getElementById("btnOpenModalAusenciaMultipla");
  if (btnAusenciaTop) {
    btnAusenciaTop.addEventListener("click", () => abrirModalLiberar(usuarioLogado));
  }

  const selectDiaFalta = document.getElementById("selectDiaFalta");
  if (selectDiaFalta) {
    selectDiaFalta.addEventListener("change", (e) => {
      atualizarChecklistTemposFalta(usuarioLogado, e.target.value);
    });
  }

  const btnMarcarTodos = document.getElementById("btnMarcarTodosTempos");
  if (btnMarcarTodos) {
    btnMarcarTodos.addEventListener("click", () => {
      document.querySelectorAll(".tempo-chk").forEach((chk) => {
        chk.checked = true;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.add("selected");
      });
      atualizarContadorTemposSelecionados();
    });
  }

  const btnDesmarcarTodos = document.getElementById("btnDesmarcarTodosTempos");
  if (btnDesmarcarTodos) {
    btnDesmarcarTodos.addEventListener("click", () => {
      document.querySelectorAll(".tempo-chk").forEach((chk) => {
        chk.checked = false;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.remove("selected");
      });
      atualizarContadorTemposSelecionados();
    });
  }

  document.getElementById("btnOpenModalReposicao").addEventListener("click", abrirModalReposicao);
  document.getElementById("btnNovaReposicaoTab").addEventListener("click", abrirModalReposicao);
  document.getElementById("btnConfirmarReposicao").addEventListener("click", executarAgendarReposicao);
  document.getElementById("btnNovaTrocaTab").addEventListener("click", iniciarTrocaPelaAba);

  // Proposta de Troca (Permuta Multi-Tempos)
  const selectDiaMinhasTroca = document.getElementById("selectDiaMinhasAulasTroca");
  if (selectDiaMinhasTroca) {
    selectDiaMinhasTroca.addEventListener("change", (e) => {
      atualizarChecklistMinhasAulasTroca(usuarioLogado, e.target.value);
    });
  }

  const btnMarcarTodasMinhas = document.getElementById("btnMarcarTodasMinhasTroca");
  if (btnMarcarTodasMinhas) {
    btnMarcarTodasMinhas.addEventListener("click", () => {
      document.querySelectorAll(".minha-troca-chk").forEach((chk) => {
        chk.checked = true;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.add("selected");
      });
      atualizarResumoBalancoTroca();
    });
  }

  const btnDesmarcarTodasMinhas = document.getElementById("btnDesmarcarTodasMinhasTroca");
  if (btnDesmarcarTodasMinhas) {
    btnDesmarcarTodasMinhas.addEventListener("click", () => {
      document.querySelectorAll(".minha-troca-chk").forEach((chk) => {
        chk.checked = false;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.remove("selected");
      });
      atualizarResumoBalancoTroca();
    });
  }

  const selectColega = document.getElementById("selectColegaTroca");
  if (selectColega) {
    selectColega.addEventListener("change", (e) => {
      selecionarColegaTroca(e.target.value);
    });
  }

  const selectDiaColegaTroca = document.getElementById("selectDiaColegaTroca");
  if (selectDiaColegaTroca) {
    selectDiaColegaTroca.addEventListener("change", (e) => {
      const colega = document.getElementById("selectColegaTroca").value;
      atualizarChecklistAulasColegaTroca(colega, e.target.value);
    });
  }

  const btnMarcarTodasColega = document.getElementById("btnMarcarTodasColegaTroca");
  if (btnMarcarTodasColega) {
    btnMarcarTodasColega.addEventListener("click", () => {
      document.querySelectorAll(".colega-troca-chk").forEach((chk) => {
        chk.checked = true;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.add("selected");
      });
      atualizarResumoBalancoTroca();
    });
  }

  const btnDesmarcarTodasColega = document.getElementById("btnDesmarcarTodasColegaTroca");
  if (btnDesmarcarTodasColega) {
    btnDesmarcarTodasColega.addEventListener("click", () => {
      document.querySelectorAll(".colega-troca-chk").forEach((chk) => {
        chk.checked = false;
        const item = chk.closest(".tempo-checkbox-item");
        if (item) item.classList.remove("selected");
      });
      atualizarResumoBalancoTroca();
    });
  }

  const btnConfirmarTroca = document.getElementById("btnConfirmarPropostaTroca");
  if (btnConfirmarTroca) {
    btnConfirmarTroca.addEventListener("click", executarPropostaTroca);
  }

  // Filtros e Exportações da Aba de Relatórios
  document.getElementById("filtroRelatorioTipo").addEventListener("change", renderizarRelatorios);
  document.getElementById("filtroRelatorioProf").addEventListener("change", renderizarRelatorios);
  document.getElementById("filtroRelatorioTurma").addEventListener("change", renderizarRelatorios);
  document.getElementById("btnImprimirRelatorio").addEventListener("click", () => {
    renderizarRelatorios();
    window.print();
  });
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

  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
  document.title = 'Painel Docente - IFS Campus Tobias Barreto';

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

  // Contador de Trocas Pendentes para o Usuário (Aba Trocas)
  const trocas = API.getTrocas();
  const trocasParaMim = trocas.filter(t => t.colega === usuarioLogado && t.status === "pendente").length;
  const badgeTrocas = document.getElementById("badgeQtdTrocas");
  if (badgeTrocas) {
    badgeTrocas.innerText = trocasParaMim;
    badgeTrocas.style.display = trocasParaMim > 0 ? "inline-block" : "none";
  }

  // Contador de E-mails / Avisos (Aba E-mails & Avisos)
  const emailsLogs = API.getEmailsLog();
  const badgeEmails = document.getElementById("badgeQtdEmails");
  if (badgeEmails) {
    badgeEmails.innerText = emailsLogs.length;
    badgeEmails.style.display = emailsLogs.length > 0 ? "inline-block" : "none";
  }

  // QUANTITATIVO TOTAL DE MUDANÇAS / ALERTAS ATIVOS
  const totalMudancas = totalLivres + trocasParaMim;

  // 1. Bolinha vermelha com o quantitativo no topo (cabeçalho visível permanente no mobile e tablet)
  const badgeGlobal = document.getElementById("badgeMudancasGlobal");
  if (badgeGlobal) {
    badgeGlobal.innerText = totalMudancas > 99 ? "99+" : totalMudancas;
    badgeGlobal.style.display = totalMudancas > 0 ? "inline-flex" : "none";
  }

  // 2. Banner no topo da tela inicial
  const banner = document.getElementById("alertBanner");
  const countAlertas = document.getElementById("countAlertas");
  const textoAlert = document.getElementById("textoAlertBanner");
  const btnVerAlertas = document.getElementById("btnVerAlertas");

  if (totalMudancas > 0) {
    if (countAlertas) countAlertas.innerText = totalMudancas;
    if (textoAlert) {
      if (totalLivres > 0 && trocasParaMim > 0) {
        textoAlert.innerText = `${totalLivres} aula(s) vaga(s) e ${trocasParaMim} permuta(s) pendente(s)!`;
      } else if (totalLivres > 0) {
        textoAlert.innerText = `${totalLivres} aula(s) disponível(is) para substituição!`;
      } else {
        textoAlert.innerText = `${trocasParaMim} proposta(s) de troca aguardando resposta!`;
      }
    }
    if (btnVerAlertas) {
      btnVerAlertas.innerText = totalLivres > 0 ? "Ver Aulas" : "Ver Trocas";
    }
    if (banner) banner.style.display = "flex";
  } else {
    if (banner) banner.style.display = "none";
  }

  // 3. Atualiza Badges nativos do PWA (Android / iPad / iPhone) e Favicon dinâmico
  atualizarBadgesPWA(totalMudancas);
}

// ============================================================================
// PWA BADGING API & FAVICON COM BOLINHA VERMELHA (MOBILE & TABLET)
// ============================================================================
function atualizarBadgesPWA(count) {
  // 1. Web Badging API oficial (Bolinha vermelha no ícone do PWA na tela inicial do celular/tablet)
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // 2. Notificação para o Service Worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      tipo: 'ATUALIZAR_BADGE',
      count: count
    });
  }

  // 3. Título da aba do navegador / PWA
  if (count > 0) {
    document.title = `(${count}) Painel Docente • IFS`;
  } else {
    document.title = 'Painel Docente - IFS Campus Tobias Barreto';
  }

  // 4. Desenha a bolinha vermelha dinâmica no Favicon
  desenharFaviconComBadge(count);
}

let faviconOriginalUrl = null;
function desenharFaviconComBadge(count) {
  try {
    const link = document.getElementById("faviconLink");
    if (!link) return;
    if (!faviconOriginalUrl) faviconOriginalUrl = link.href;

    if (count <= 0) {
      link.href = faviconOriginalUrl;
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = faviconOriginalUrl;
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 32, 32);

      // Círculo vermelho de fundo
      ctx.beginPath();
      ctx.arc(22, 10, 8, 0, 2 * Math.PI);
      ctx.fillStyle = "#d32f2f";
      ctx.fill();

      // Borda branca fina
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Número centralizado
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const texto = count > 9 ? "9+" : String(count);
      ctx.fillText(texto, 22, 10);

      link.href = canvas.toDataURL("image/png");
    };
  } catch (err) {
    console.warn("Aviso ao desenhar badge no favicon:", err);
  }
}

// ============================================================================
// MODAL: CENTRAL DE MUDANÇAS & ALERTAS (RESUMO RÁPIDO PARA MOBILE & TABLET)
// ============================================================================
function abrirModalMudancasAlertas() {
  const container = document.getElementById("corpoModalMudancas");
  if (!container) return;
  container.innerHTML = "";

  // 1. Aulas Livres para Substituição
  const aulasLivres = [];
  for (const prof in bancoDeDados) {
    bancoDeDados[prof].forEach((aula, idx) => {
      if (aula.status === "alert") {
        aulasLivres.push({ ...aula, profOriginal: prof, indexOriginal: idx });
      }
    });
  }

  // 2. Propostas de Permuta Pendentes
  const trocas = API.getTrocas();
  const trocasParaMim = trocas.filter(t => t.colega === usuarioLogado && t.status === "pendente");

  // 3. E-mails e Avisos Recentes
  const logs = API.getEmailsLog();
  const totalMudancas = aulasLivres.length + trocasParaMim.length;

  if (totalMudancas === 0 && logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 0;">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text" style="font-size: 15px; font-weight: 700; color: #166534;">
          Nenhuma alteração ou ausência pendente!
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
          Todas as aulas do campus estão confirmadas e você não tem propostas de permuta pendentes.
        </p>
      </div>`;
    abrirModal("modalMudancasAlertas");
    return;
  }

  let html = "";

  // Dica / Botão de ativação de permissão para iOS e Android se ainda não concedida
  if ('Notification' in window && Notification.permission === 'default') {
    html += `
      <div style="background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="font-size: 11px; color: #2e7d32; line-height: 1.35;">
          <strong>🔔 Bolinha vermelha no ícone do PWA:</strong> Ative para exibir o ponto de alerta no ícone da tela inicial do seu iPhone ou Android.
        </div>
        <button type="button" class="btn-notif-action" onclick="solicitarPermissaoNotificacoesPWA();">
          Ativar
        </button>
      </div>`;
  }

  // Seção 1: Aulas precisando de substituto
  if (aulasLivres.length > 0) {
    html += `
      <div class="notif-section-card alert-card">
        <div class="notif-section-header" style="color: #b91c1c;">
          <span>🔴 Aulas Precisando de Substituto (${aulasLivres.length})</span>
          <button type="button" class="btn-notif-action" onclick="fecharTodosModais(); alternarAba('tab-livres');">
            Ver Todas
          </button>
        </div>`;
    
    aulasLivres.slice(0, 3).forEach((aula) => {
      html += `
        <div class="notif-item-mini">
          <div class="notif-item-info">
            <span class="notif-item-title">${aula.disc} (${aula.turma})</span>
            <span class="notif-item-subtitle">Prof. ${aula.profOriginal} • 📅 ${aula.dia} (${aula.hora})</span>
          </div>
          <button type="button" class="btn-notif-action" style="background:#b91c1c;" onclick="fecharTodosModais(); prepararAssumirAula('${aula.profOriginal}', ${aula.indexOriginal});">
            Assumir
          </button>
        </div>`;
    });

    if (aulasLivres.length > 3) {
      html += `<div style="font-size:11px; color:#b91c1c; text-align:center; padding-top:4px;">+ ${aulasLivres.length - 3} outra(s) aula(s) disponível(is)</div>`;
    }
    html += `</div>`;
  }

  // Seção 2: Propostas de Permuta
  if (trocasParaMim.length > 0) {
    html += `
      <div class="notif-section-card swap-card">
        <div class="notif-section-header" style="color: #6b21a8;">
          <span>🔄 Permutas Pendentes para Você (${trocasParaMim.length})</span>
          <button type="button" class="btn-notif-action" style="background:#7b1fa2;" onclick="fecharTodosModais(); alternarAba('tab-trocas');">
            Ver Trocas
          </button>
        </div>`;
    
    trocasParaMim.forEach((troca) => {
      const qtdCedidas = (troca.aulasCedidas && troca.aulasCedidas.length) || 1;
      const qtdDesejadas = (troca.aulasDesejadas && troca.aulasDesejadas.length) || 1;
      html += `
        <div class="notif-item-mini">
          <div class="notif-item-info">
            <span class="notif-item-title">Proposta de Prof. ${troca.proponente}</span>
            <span class="notif-item-subtitle">${qtdCedidas} tempo(s) ofertado(s) ↔️ ${qtdDesejadas} tempo(s) seu(s)</span>
          </div>
          <button type="button" class="btn-notif-action" style="background:#7b1fa2;" onclick="fecharTodosModais(); aceitarTroca('${troca.id}');">
            Aceitar
          </button>
        </div>`;
    });
    html += `</div>`;
  }

  // Seção 3: Últimos avisos institucionais
  if (logs.length > 0) {
    html += `
      <div class="notif-section-card info-card">
        <div class="notif-section-header" style="color: #0369a1;">
          <span>📨 Últimos Comunicados Oficiais</span>
          <button type="button" class="btn-notif-action" style="background:#0288d1;" onclick="fecharTodosModais(); alternarAba('tab-emails');">
            Ver Todos
          </button>
        </div>`;
    
    logs.slice(0, 2).forEach((log) => {
      html += `
        <div class="notif-item-mini">
          <div class="notif-item-info">
            <span class="notif-item-title" style="font-size:11px;">${log.assunto}</span>
            <span class="notif-item-subtitle">🕒 ${log.data}</span>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
  abrirModal("modalMudancasAlertas");
}

async function solicitarPermissaoNotificacoesPWA() {
  if ('Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        mostrarToast("Alertas no ícone do PWA ativados com sucesso!");
        atualizarContadoresEAlerta();
        abrirModalMudancasAlertas();
      } else {
        mostrarToast("Permissão de notificação não foi concedida.");
      }
    } catch (e) {
      console.warn("Erro ao solicitar permissão de notificações:", e);
    }
  } else {
    alert("Para exibir notificações no ícone do iPhone, adicione o app à Tela de Início (Compartilhar > Adicionar à Tela de Início).");
  }
}

// Função utilitária global para ordenação por horário
function extrairMinutosDoHorario(horaStr) {
  if (!horaStr) return 0;
  const match = String(horaStr).match(/(\d{1,2})[:h](\d{2})/);
  return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : 0;
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
      aulasPorDia[dia].sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));
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

  const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
  aulasLivres.sort((a, b) => {
    const dDiff = diasOrdem.indexOf(a.dia) - diasOrdem.indexOf(b.dia);
    if (dDiff !== 0) return dDiff;
    return extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora);
  });

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

      const descCedidas = (t.aulasCedidas && t.aulasCedidas.length > 0)
        ? t.aulasCedidas.map(a => `• <strong>${a.dia} às ${a.hora}</strong>: ${a.disc} (${a.turma})`).join("<br>")
        : `• <strong>${t.aulaCedida.dia} às ${t.aulaCedida.hora}</strong>: ${t.aulaCedida.disc} (${t.aulaCedida.turma})`;

      const descDesejadas = (t.aulasDesejadas && t.aulasDesejadas.length > 0)
        ? t.aulasDesejadas.map(a => `• <strong>${a.dia} às ${a.hora}</strong>: ${a.disc} (${a.turma})`).join("<br>")
        : `• <strong>${t.aulaDesejada.dia} às ${t.aulaDesejada.hora}</strong>: ${t.aulaDesejada.disc} (${t.aulaDesejada.turma})`;

      const qtdCedidas = t.aulasCedidas ? t.aulasCedidas.length : 1;
      const qtdDesejadas = t.aulasDesejadas ? t.aulasDesejadas.length : 1;

      trocasHTML += `
        <div class="class-card swap-pending">
          <div class="card-top">
            <span style="font-size:13px; font-weight:800; color:var(--accent-swap);">Permuta de Horário (${qtdCedidas} ↔️ ${qtdDesejadas} tempos)</span>
            ${statusBadge}
          </div>
          <div class="swap-comparison-card">
            <div class="swap-side">
              <div class="swap-side-title">📤 Cedida(s) por Prof. ${t.proponente} (${qtdCedidas} tempos):</div>
              <div class="swap-side-desc" style="line-height:1.5;">${descCedidas}</div>
            </div>
            <div class="swap-side" style="margin-top:10px;">
              <div class="swap-side-title">📥 Em contrapartida com Prof. ${t.colega} (${qtdDesejadas} tempos):</div>
              <div class="swap-side-desc" style="line-height:1.5;">${descDesejadas}</div>
            </div>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); line-height: 1.4;">
            📅 Data Prevista: <strong>${formatarDataBR(t.dataPrevista)}</strong> ${t.motivo ? `• Justificativa: <em>${t.motivo}</em>` : ""}
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
            <div class="card-time">📅 ${formatarDataBR(r.data)} • 🕒 ${r.horario}</div>
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
      agrupado[dia].sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));
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
          <div class="row-data-main">${formatarDataBR(ev.data)}</div>
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

  const dataInfo = aula.dataFalta ? `<div class="card-note">📅 Ausência marcada para: <strong>${formatarDataBR(aula.dataFalta)}</strong></div>` : "";

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
// MODAL & AÇÃO: LIBERAR AULAS (AUSÊNCIA EM MÚLTIPLOS TEMPOS)
// ============================================================================
function abrirModalLiberar(prof, indexInicial) {
  try {
    if (!prof || !bancoDeDados[prof]) {
      prof = usuarioLogado;
    }
    if (!prof || !bancoDeDados[prof]) {
      const usuarioSalvo = localStorage.getItem("IFS_SAVED_USER") || sessionStorage.getItem("IFS_SESSION_USER");
      if (usuarioSalvo && bancoDeDados[usuarioSalvo]) {
        prof = usuarioSalvo;
        usuarioLogado = usuarioSalvo;
      }
    }

    const todasMinhasAulas = (bancoDeDados && bancoDeDados[prof]) ? bancoDeDados[prof] : [];

    if (todasMinhasAulas.length === 0) {
      mostrarToast("Você não possui aulas cadastradas na sua grade.");
      return;
    }

    // Obtém todos os dias da semana em que o docente leciona
    const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
    const diasComAula = [];
    diasOrdem.forEach((dia) => {
      if (todasMinhasAulas.some((a) => a.dia === dia)) {
        diasComAula.push(dia);
      }
    });

    const selectDia = document.getElementById("selectDiaFalta");
    if (selectDia) {
      selectDia.innerHTML = "";
      diasComAula.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.innerText = d;
        selectDia.appendChild(opt);
      });

      // Se clicou a partir de um card específico, foca no dia daquela aula
      let diaAlvo = diasComAula[0];
      if (indexInicial !== undefined && indexInicial !== null && todasMinhasAulas[indexInicial]) {
        diaAlvo = todasMinhasAulas[indexInicial].dia;
      }
      selectDia.value = diaAlvo;

      // Renderiza a checklist de tempos para aquele dia e pré-seleciona
      atualizarChecklistTemposFalta(prof, diaAlvo, indexInicial);

      // Calcula a data padrão sugerida (próxima ocorrência do dia ou hoje)
      const inputData = document.getElementById("inputDataFalta");
      if (inputData) {
        inputData.value = calcularProximaDataParaDia(diaAlvo);
      }
    }

    const inputMotivo = document.getElementById("inputMotivoFalta");
    if (inputMotivo) inputMotivo.value = "";

    abrirModal("modalLiberar");
  } catch (err) {
    console.error("Erro ao abrir modal de ausência:", err);
    mostrarToast("Erro ao abrir modal: " + err.message);
  }
}

function calcularProximaDataParaDia(diaSemanaStr) {
  const mapDias = {
    "Domingo": 0, "Segunda-feira": 1, "Terça-feira": 2,
    "Quarta-feira": 3, "Quinta-feira": 4, "Sexta-feira": 5, "Sábado": 6
  };
  const targetDay = mapDias[diaSemanaStr];
  const hoje = new Date();
  if (targetDay === undefined) {
    return formatarDataISO(hoje);
  }
  const currentDay = hoje.getDay();
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7; // Próxima semana
  const targetDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diff);
  return formatarDataISO(targetDate);
}

function atualizarChecklistTemposFalta(prof, diaSelecionado, indexPreselecionado) {
  prof = prof || usuarioLogado;
  const container = document.getElementById("listaTemposContainer");
  container.innerHTML = "";

  const todasAulas = bancoDeDados[prof] || [];
  const aulasDoDia = [];

  todasAulas.forEach((aula, idx) => {
    if (aula.dia === diaSelecionado) {
      aulasDoDia.push({ ...aula, indexOriginal: idx });
    }
  });

  if (aulasDoDia.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:10px;">Nenhuma aula cadastrada para ${diaSelecionado}.</div>`;
    atualizarContadorTemposSelecionados();
    return;
  }

  // Ordena por horário
  aulasDoDia.sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));

  // Identifica quais devem vir marcados por padrão:
  const indicesParaMarcar = new Set();
  if (indexPreselecionado !== undefined && indexPreselecionado !== null) {
    const aulaClicada = todasAulas[indexPreselecionado];
    if (aulaClicada) {
      const minClicado = extrairMinutosDoHorario(aulaClicada.hora);
      const ehNoturno = minClicado >= 18 * 60;
      aulasDoDia.forEach((a) => {
        const minA = extrairMinutosDoHorario(a.hora);
        const aNoturno = minA >= 18 * 60;
        // Se ambos são noturnos (ex: Subsequente) ou ambos diurnos da mesma turma, marca o bloco
        if ((ehNoturno && aNoturno) || (!ehNoturno && !aNoturno && a.turma === aulaClicada.turma)) {
          indicesParaMarcar.add(a.indexOriginal);
        }
      });
      indicesParaMarcar.add(indexPreselecionado);
    }
  } else {
    // Se abriu pelo botão do topo, marca todas as aulas do dia por padrão
    aulasDoDia.forEach((a) => indicesParaMarcar.add(a.indexOriginal));
  }

  aulasDoDia.forEach((aula) => {
    const isChecked = indicesParaMarcar.has(aula.indexOriginal);
    const itemLabel = document.createElement("label");
    itemLabel.className = `tempo-checkbox-item ${isChecked ? "selected" : ""}`;

    itemLabel.innerHTML = `
      <input type="checkbox" class="tempo-chk" value="${aula.indexOriginal}" ${isChecked ? "checked" : ""}>
      <div class="tempo-info">
        <div class="tempo-row-top">
          <span class="tempo-horario">⏰ ${aula.hora}</span>
          <span class="tempo-turma-badge">${aula.turma}</span>
        </div>
        <span class="tempo-disc">${aula.disc}</span>
      </div>
    `;

    const chk = itemLabel.querySelector(".tempo-chk");
    chk.addEventListener("change", () => {
      if (chk.checked) {
        itemLabel.classList.add("selected");
      } else {
        itemLabel.classList.remove("selected");
      }
      atualizarContadorTemposSelecionados();
    });

    container.appendChild(itemLabel);
  });

  atualizarContadorTemposSelecionados();
}

function atualizarContadorTemposSelecionados() {
  const selecionados = document.querySelectorAll(".tempo-chk:checked");
  const count = selecionados.length;
  const badge = document.getElementById("resumoTemposSelecionados");
  const btnTxt = document.getElementById("textoBtnConfirmarLiberar");

  if (badge) {
    badge.innerText = `${count} tempo${count !== 1 ? "s" : ""} selecionado${count !== 1 ? "s" : ""}`;
  }

  if (btnTxt) {
    btnTxt.innerText = count > 0 
      ? `Confirmar Falta (${count} tempo${count !== 1 ? "s" : ""})`
      : "Confirmar Falta";
  }

  // Notificação de Coordenadores baseada nas turmas marcadas
  const turmasSet = new Set();
  selecionados.forEach((chk) => {
    const idx = parseInt(chk.value, 10);
    if (bancoDeDados[usuarioLogado] && bancoDeDados[usuarioLogado][idx]) {
      turmasSet.add(bancoDeDados[usuarioLogado][idx].turma);
    }
  });

  const descCoordenadores = document.getElementById("modalLiberarDesc");
  if (descCoordenadores) {
    if (turmasSet.size > 0) {
      const dests = Array.from(turmasSet).map((t) => API.obterDestinatariosPorTurma(t)).join(", ");
      descCoordenadores.innerHTML = `📬 Coordenadores que receberão o aviso: <strong>${dests}</strong>`;
    } else {
      descCoordenadores.innerText = "Nenhum tempo selecionado.";
    }
  }
}

document.getElementById("btnConfirmarLiberar").addEventListener("click", () => {
  const checkboxes = Array.from(document.querySelectorAll(".tempo-chk:checked"));
  if (checkboxes.length === 0) {
    mostrarToast("Por favor, selecione pelo menos um tempo de aula.");
    return;
  }

  const indicesSelecionados = checkboxes.map((chk) => parseInt(chk.value, 10));
  const dataFalta = formatarDataBR(document.getElementById("inputDataFalta").value);
  const motivo = document.getElementById("inputMotivoFalta").value.trim();

  fecharTodosModais();

  const profAlvo = usuarioLogado || localStorage.getItem("IFS_SAVED_USER") || sessionStorage.getItem("IFS_SESSION_USER") || "Eber";
  const minhasAulas = (bancoDeDados && bancoDeDados[profAlvo]) || [];
  const aulasSelecionadas = indicesSelecionados.map((idx) => minhasAulas[idx]).filter(Boolean);
  const emailDocente = API.obterEmailProfessor(profAlvo);

  bancoDeDados = API.processarAcao({
    acao: "libertar_multiplos",
    profOriginal: profAlvo,
    indices: indicesSelecionados,
    aulas: aulasSelecionadas,
    emailDocente: emailDocente,
    dataFalta: dataFalta,
    motivo: motivo
  });

  renderizarTudo();
  mostrarToast(`Sucesso! Falta registrada para ${indicesSelecionados.length} tempos de aula.`);
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

document.getElementById("btnConfirmarAssumir").addEventListener("click", () => {
  if (!aulaSelecionadaParaAcao) return;
  const { profOriginal, index, aula } = aulaSelecionadaParaAcao;

  fecharTodosModais();

  const emailSubstituto = API.obterEmailProfessor(usuarioLogado);
  const emailOriginal = API.obterEmailProfessor(profOriginal);

  bancoDeDados = API.processarAcao({
    acao: "assumir",
    profOriginal,
    index,
    aula,
    substituto: usuarioLogado,
    emailSubstituto,
    emailOriginal
  });

  renderizarTudo();
  mostrarToast(`Sucesso! Aula de ${aula.disc} assumida.`);
});

function cancelarAusencia(prof, index) {
  const aula = bancoDeDados[prof][index];
  if (confirm(`Deseja cancelar a ausência e lecionar a aula de ${aula.disc} normalmente?`)) {
    const emailDocente = API.obterEmailProfessor(prof);
    bancoDeDados = API.processarAcao({ acao: "recuperar", profOriginal: prof, index, aula, emailDocente });
    renderizarTudo();
    mostrarToast("Aula restaurada na sua grade normal!");
  }
}

function desistirSubstituicao(profOriginal, index) {
  if (confirm("Deseja desistir desta substituição? A aula voltará a ficar disponível para outros colegas.")) {
    const aula = bancoDeDados[profOriginal][index];
    const emailDocente = API.obterEmailProfessor(profOriginal);
    bancoDeDados = API.processarAcao({ acao: "libertar", profOriginal, index, aula, emailDocente });
    renderizarTudo();
    mostrarToast("Substituição desfeita. A aula voltou para o mural de disponíveis.");
  }
}

// ============================================================================
// MODAL & AÇÃO: TROCA DE HORÁRIO (PERMUTA DE MÚLTIPLOS TEMPOS)
// ============================================================================
function iniciarTrocaPelaAba() {
  const minhasAulas = bancoDeDados[usuarioLogado] || [];
  if (minhasAulas.length === 0) {
    mostrarToast("Você não possui aulas cadastradas na sua grade para trocar.");
    return;
  }
  abrirModalTroca(usuarioLogado);
}

function abrirModalTroca(prof, indexInicial) {
  try {
    prof = prof || usuarioLogado;
    if (!prof || !bancoDeDados[prof]) {
      const usuarioSalvo = localStorage.getItem("IFS_SAVED_USER") || sessionStorage.getItem("IFS_SESSION_USER");
      if (usuarioSalvo && bancoDeDados[usuarioSalvo]) {
        prof = usuarioSalvo;
        usuarioLogado = usuarioSalvo;
      }
    }

    const minhasAulas = (bancoDeDados && bancoDeDados[prof]) ? bancoDeDados[prof] : [];
    if (minhasAulas.length === 0) {
      mostrarToast("Você não possui aulas cadastradas na sua grade para propor permuta.");
      return;
    }

    // 1. Configura os dias da semana do proponente
    const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
    const diasComAula = [];
    diasOrdem.forEach((dia) => {
      if (minhasAulas.some((a) => a.dia === dia)) {
        diasComAula.push(dia);
      }
    });

    const selectDiaMinhas = document.getElementById("selectDiaMinhasAulasTroca");
    if (selectDiaMinhas) {
      selectDiaMinhas.innerHTML = "";
      diasComAula.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.innerText = d;
        selectDiaMinhas.appendChild(opt);
      });

      let diaAlvo = diasComAula[0];
      if (indexInicial !== undefined && indexInicial !== null && minhasAulas[indexInicial]) {
        diaAlvo = minhasAulas[indexInicial].dia;
      }
      selectDiaMinhas.value = diaAlvo;

      // Renderiza checklist de aulas a ceder
      atualizarChecklistMinhasAulasTroca(prof, diaAlvo, indexInicial);
    }

    // 2. Configura a lista de colegas
    const selectColega = document.getElementById("selectColegaTroca");
    if (selectColega) {
      selectColega.innerHTML = '<option value="" disabled selected>Selecione o professor colega...</option>';
      const colegas = Object.keys(bancoDeDados).filter(c => c !== usuarioLogado).sort();
      colegas.forEach((colega) => {
        const opt = document.createElement("option");
        opt.value = colega;
        opt.innerText = `Prof. ${colega}`;
        selectColega.appendChild(opt);
      });
    }

    // Oculta área do colega até ser selecionado
    const containerColega = document.getElementById("containerAulasColegaTroca");
    if (containerColega) containerColega.style.display = "none";

    // 3. Data e Justificativa padrão
    const inputData = document.getElementById("inputDataTroca");
    if (inputData) {
      inputData.value = formatarDataISO(new Date());
    }
    const inputMotivo = document.getElementById("inputMotivoTroca");
    if (inputMotivo) inputMotivo.value = "";

    atualizarResumoBalancoTroca();
    abrirModal("modalTroca");
  } catch (err) {
    console.error("Erro ao abrir modal de troca:", err);
    mostrarToast("Erro ao abrir modal de permuta: " + err.message);
  }
}

function atualizarChecklistMinhasAulasTroca(prof, diaSelecionado, indexPreselecionado) {
  prof = prof || usuarioLogado;
  const container = document.getElementById("listaMinhasAulasTroca");
  if (!container) return;
  container.innerHTML = "";

  const todasAulas = (bancoDeDados && bancoDeDados[prof]) ? bancoDeDados[prof] : [];
  const aulasDoDia = [];

  todasAulas.forEach((aula, idx) => {
    if (aula.dia === diaSelecionado) {
      aulasDoDia.push({ ...aula, indexOriginal: idx });
    }
  });

  if (aulasDoDia.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:8px;">Nenhuma aula cadastrada para ${diaSelecionado}.</div>`;
    atualizarResumoBalancoTroca();
    return;
  }

  aulasDoDia.sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));

  // Pré-seleciona a aula clicada e suas irmãs contíguas (mesma turma/disciplina ou turno)
  const indicesParaMarcar = new Set();
  if (indexPreselecionado !== undefined && indexPreselecionado !== null) {
    const aulaClicada = todasAulas[indexPreselecionado];
    if (aulaClicada) {
      const minClicado = extrairMinutosDoHorario(aulaClicada.hora);
      const ehNoturno = minClicado >= 18 * 60;
      aulasDoDia.forEach((a) => {
        const minA = extrairMinutosDoHorario(a.hora);
        const aNoturno = minA >= 18 * 60;
        if ((ehNoturno && aNoturno) || (!ehNoturno && !aNoturno && a.turma === aulaClicada.turma)) {
          indicesParaMarcar.add(a.indexOriginal);
        }
      });
      indicesParaMarcar.add(indexPreselecionado);
    }
  } else {
    // Por padrão marca todas do dia
    aulasDoDia.forEach((a) => indicesParaMarcar.add(a.indexOriginal));
  }

  aulasDoDia.forEach((aula) => {
    const isChecked = indicesParaMarcar.has(aula.indexOriginal);
    const itemLabel = document.createElement("label");
    itemLabel.className = `tempo-checkbox-item ${isChecked ? "selected" : ""}`;

    itemLabel.innerHTML = `
      <input type="checkbox" class="minha-troca-chk" value="${aula.indexOriginal}" ${isChecked ? "checked" : ""}>
      <div class="tempo-info">
        <div class="tempo-row-top">
          <span class="tempo-horario">⏰ ${aula.hora}</span>
          <span class="tempo-turma-badge">${aula.turma}</span>
        </div>
        <span class="tempo-disc">${aula.disc}</span>
      </div>
    `;

    const chk = itemLabel.querySelector(".minha-troca-chk");
    chk.addEventListener("change", () => {
      if (chk.checked) {
        itemLabel.classList.add("selected");
      } else {
        itemLabel.classList.remove("selected");
      }
      atualizarResumoBalancoTroca();
    });

    container.appendChild(itemLabel);
  });

  atualizarResumoBalancoTroca();
}

function selecionarColegaTroca(colegaNome) {
  const containerColega = document.getElementById("containerAulasColegaTroca");
  if (!containerColega) return;

  const aulasColega = bancoDeDados[colegaNome] || [];
  if (aulasColega.length === 0) {
    containerColega.style.display = "none";
    mostrarToast("O professor selecionado não possui aulas cadastradas.");
    return;
  }

  containerColega.style.display = "block";

  const diasOrdem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
  const diasComAula = [];
  diasOrdem.forEach((dia) => {
    if (aulasColega.some((a) => a.dia === dia)) {
      diasComAula.push(dia);
    }
  });

  const selectDiaColega = document.getElementById("selectDiaColegaTroca");
  if (selectDiaColega) {
    selectDiaColega.innerHTML = "";
    diasComAula.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.innerText = d;
      selectDiaColega.appendChild(opt);
    });

    atualizarChecklistAulasColegaTroca(colegaNome, diasComAula[0]);
  }
}

function atualizarChecklistAulasColegaTroca(colegaNome, diaSelecionado) {
  const container = document.getElementById("listaAulasColegaTroca");
  if (!container) return;
  container.innerHTML = "";

  const todasAulas = bancoDeDados[colegaNome] || [];
  const aulasDoDia = [];

  todasAulas.forEach((aula, idx) => {
    if (aula.dia === diaSelecionado) {
      aulasDoDia.push({ ...aula, indexOriginal: idx });
    }
  });

  if (aulasDoDia.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:8px;">Nenhuma aula cadastrada para ${diaSelecionado}.</div>`;
    atualizarResumoBalancoTroca();
    return;
  }

  aulasDoDia.sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));

  aulasDoDia.forEach((aula, i) => {
    const isChecked = i === 0;
    const itemLabel = document.createElement("label");
    itemLabel.className = `tempo-checkbox-item ${isChecked ? "selected" : ""}`;

    itemLabel.innerHTML = `
      <input type="checkbox" class="colega-troca-chk" value="${aula.indexOriginal}" ${isChecked ? "checked" : ""}>
      <div class="tempo-info">
        <div class="tempo-row-top">
          <span class="tempo-horario">⏰ ${aula.hora}</span>
          <span class="tempo-turma-badge">${aula.turma}</span>
        </div>
        <span class="tempo-disc">${aula.disc}</span>
      </div>
    `;

    const chk = itemLabel.querySelector(".colega-troca-chk");
    chk.addEventListener("change", () => {
      if (chk.checked) {
        itemLabel.classList.add("selected");
      } else {
        itemLabel.classList.remove("selected");
      }
      atualizarResumoBalancoTroca();
    });

    container.appendChild(itemLabel);
  });

  atualizarResumoBalancoTroca();
}

function atualizarResumoBalancoTroca() {
  const qtdMinhas = document.querySelectorAll(".minha-troca-chk:checked").length;
  const qtdColega = document.querySelectorAll(".colega-troca-chk:checked").length;

  const badgeMinhas = document.getElementById("badgeMinhasAulasCedidas");
  const badgeColega = document.getElementById("badgeAulasColegaDesejadas");
  const boxBalanco = document.getElementById("resumoBalancoTroca");
  const btnTxt = document.getElementById("textoBtnConfirmarPropostaTroca");

  if (badgeMinhas) badgeMinhas.innerText = `${qtdMinhas} tempo${qtdMinhas !== 1 ? "s" : ""}`;
  if (badgeColega) badgeColega.innerText = `${qtdColega} tempo${qtdColega !== 1 ? "s" : ""}`;

  if (boxBalanco) {
    if (qtdMinhas > 0 && qtdColega > 0) {
      if (qtdMinhas === qtdColega) {
        boxBalanco.className = "swap-balance-indicator balanced";
        boxBalanco.innerHTML = `✅ <strong>Permuta Equilibrada:</strong> ${qtdMinhas} tempo(s) cedido(s) ↔️ ${qtdColega} tempo(s) recebido(s)`;
      } else {
        boxBalanco.className = "swap-balance-indicator";
        boxBalanco.innerHTML = `⚖️ <strong>Comparativo de Tempos:</strong> ${qtdMinhas} tempo(s) cedido(s) ↔️ ${qtdColega} tempo(s) recebido(s)`;
      }
    } else {
      boxBalanco.className = "swap-balance-indicator";
      boxBalanco.innerText = "⚖️ Selecione as suas aulas e as aulas do colega para comparar os tempos.";
    }
  }

  if (btnTxt) {
    if (qtdMinhas > 0 && qtdColega > 0) {
      btnTxt.innerText = `Enviar Proposta (${qtdMinhas} ↔️ ${qtdColega} tempos)`;
    } else {
      btnTxt.innerText = "Enviar Proposta de Troca";
    }
  }
}

async function executarPropostaTroca() {
  const chkMinhas = Array.from(document.querySelectorAll(".minha-troca-chk:checked"));
  const chkColega = Array.from(document.querySelectorAll(".colega-troca-chk:checked"));
  const colega = document.getElementById("selectColegaTroca").value;
  const rawDataTroca = document.getElementById("inputDataTroca").value;
  const dataPrevista = rawDataTroca ? formatarDataBR(rawDataTroca) : "A combinar";
  const motivo = document.getElementById("inputMotivoTroca").value.trim();

  if (chkMinhas.length === 0) {
    mostrarToast("Por favor, selecione pelo menos uma aula sua a ser cedida.");
    return;
  }

  if (!colega) {
    mostrarToast("Por favor, selecione o professor colega para a permuta.");
    return;
  }

  if (chkColega.length === 0) {
    mostrarToast("Por favor, selecione pelo menos uma aula do colega em contrapartida.");
    return;
  }

  const minhasAulasObjetos = chkMinhas.map(chk => {
    const idx = parseInt(chk.value, 10);
    return bancoDeDados[usuarioLogado][idx];
  }).filter(Boolean);

  const aulasColegaObjetos = chkColega.map(chk => {
    const idx = parseInt(chk.value, 10);
    return bancoDeDados[colega][idx];
  }).filter(Boolean);

  // Validação Cruzada de Conflitos em Lote
  for (const aulaDesejada of aulasColegaObjetos) {
    const conflitoEu = verificarConflito(aulaDesejada.dia, aulaDesejada.hora, usuarioLogado);
    if (conflitoEu.conflito) {
      alert(`⚠️ CONFLITO DETECTADO:\nVocê já possui aula agendada no horário:\n▶ ${aulaDesejada.dia} às ${aulaDesejada.hora} (${conflitoEu.descricao})`);
      return;
    }
  }

  for (const minhaAula of minhasAulasObjetos) {
    const conflitoColega = verificarConflito(minhaAula.dia, minhaAula.hora, colega);
    if (conflitoColega.conflito) {
      alert(`⚠️ CONFLITO DO COLEGA:\nO Prof. ${colega} já possui aula agendada no horário da aula cedida:\n▶ ${minhaAula.dia} às ${minhaAula.hora} (${conflitoColega.descricao})`);
      return;
    }
  }

  fecharTodosModais();

  const novaTroca = {
    id: "TR-" + Date.now(),
    proponente: usuarioLogado,
    colega,
    aulasCedidas: minhasAulasObjetos,
    aulasDesejadas: aulasColegaObjetos,
    aulaCedida: minhasAulasObjetos[0],
    aulaDesejada: aulasColegaObjetos[0],
    dataPrevista: dataPrevista || "A combinar",
    motivo: motivo || "Permuta de horários",
    status: "pendente",
    dataCriacao: new Date().toLocaleString("pt-BR")
  };

  bancoDeDados = API.processarAcao({
    acao: "propor_troca",
    troca: novaTroca,
    emailProponente: API.obterEmailProfessor(novaTroca.proponente),
    emailColega: API.obterEmailProfessor(novaTroca.colega)
  });

  renderizarTudo();
  mostrarToast(`Proposta de permuta (${minhasAulasObjetos.length} ↔️ ${aulasColegaObjetos.length} tempos) enviada ao Prof. ${colega}!`);
}

function aceitarTroca(trocaId) {
  const trocas = API.getTrocas();
  const troca = trocas.find(t => t.id === trocaId);
  if (!troca) return;

  if (confirm(`Confirmar o aceite da troca com o Prof. ${troca.proponente}?`)) {
    bancoDeDados = API.processarAcao({
      acao: "aceitar_troca",
      trocaId,
      troca,
      emailProponente: API.obterEmailProfessor(troca.proponente),
      emailColega: API.obterEmailProfessor(troca.colega)
    });
    renderizarTudo();
    mostrarToast("Permuta confirmada com sucesso!");
  }
}

function recusarTroca(trocaId) {
  if (confirm("Deseja recusar esta proposta de troca de aula?")) {
    bancoDeDados = API.processarAcao({ acao: "recusar_troca", trocaId });
    renderizarTudo();
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
  inputData.value = formatarDataISO(new Date());
  document.getElementById("inputHorarioReposicao").value = "";
  document.getElementById("inputSalaReposicao").value = "";
  document.getElementById("inputMotivoReposicao").value = "";

  abrirModal("modalReposicao");
}

function executarAgendarReposicao() {
  const val = document.getElementById("selectDisciplinaReposicao").value;
  const [disc, turma] = val.includes("|") ? val.split("|") : [val, "Geral"];
  const data = formatarDataBR(document.getElementById("inputDataReposicao").value);
  const horario = document.getElementById("inputHorarioReposicao").value.trim();
  const sala = document.getElementById("inputSalaReposicao").value.trim() || "Sala a definir";
  const motivo = document.getElementById("inputMotivoReposicao").value.trim();

  if (!horario) {
    alert("Por favor, informe o horário da reposição (Ex: 08:40 - 10:20)!");
    return;
  }

  fecharTodosModais();

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

  bancoDeDados = API.processarAcao({
    acao: "agendar_reposicao",
    reposicao: novaReposicao,
    emailDocente: API.obterEmailProfessor(usuarioLogado)
  });

  renderizarTudo();
  mostrarToast(`Reposição de aula cadastrada com sucesso!`);
}

function cancelarReposicao(id) {
  if (confirm("Deseja realmente cancelar este agendamento de reposição?")) {
    bancoDeDados = API.processarAcao({ acao: "cancelar_reposicao", id });
    renderizarTudo();
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
  document.getElementById("configEmailCoordSubsequente").value = config.emailCoordSubsequente || "coinf.tbarreto@ifs.edu.br";
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
    emailCoordSubsequente: document.getElementById("configEmailCoordSubsequente").value.trim() || "coinf.tbarreto@ifs.edu.br",
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
    localStorage.removeItem("IFS_DB_VERSION");
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

let sincronizacaoEmAndamento = false;

async function recarregarDados(silencioso = false) {
  if (sincronizacaoEmAndamento) return;
  sincronizacaoEmAndamento = true;

  if (!silencioso) atualizarIndicadorSincronismo("atualizando", "Sincronizando...");
  try {
    const resultado = await API.carregarGradeCompleta();
    bancoDeDados = resultado.data;
    renderizarTudo();

    if (resultado.online) {
      atualizarIndicadorSincronismo("online", "Conectado ao Google Sheets");
    } else {
      atualizarIndicadorSincronismo("local", "Modo Rápido / Base Local");
    }
    return resultado;
  } catch (err) {
    console.warn("Aviso ao recarregar dados:", err);
    atualizarIndicadorSincronismo("local", "Modo Rápido / Base Local");
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

// ============================================================================
// EXPOSIÇÃO GLOBAL PARA EVENTOS ONCLICK INLINE
// ============================================================================
window.abrirModalLiberar = abrirModalLiberar;
window.abrirModalTroca = abrirModalTroca;
window.cancelarAusencia = cancelarAusencia;
window.desistirSubstituicao = desistirSubstituicao;
window.prepararAssumirAula = prepararAssumirAula;
window.aceitarTroca = aceitarTroca;
window.recusarTroca = recusarTroca;
window.cancelarReposicao = cancelarReposicao;
window.abrirModalReposicao = abrirModalReposicao;
window.extrairMinutosDoHorario = extrairMinutosDoHorario;
window.abrirModal = abrirModal;
window.fecharTodosModais = fecharTodosModais;
