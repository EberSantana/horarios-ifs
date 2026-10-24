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

// Liga um evento só se o elemento existir: um botão faltando no HTML
// não pode mais derrubar toda a inicialização do app (era o que travava a tela).
function ligarEvento(id, ...args) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(...args);
  else console.warn("Elemento não encontrado no HTML:", id);
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
let ultimaSincronizacao = 0;

document.addEventListener("DOMContentLoaded", () => {
  bancoDeDados = API.getLocalDatabase();
  try { registrarServiceWorker(); } catch (e) { console.error("Falha no Service Worker:", e); }
  try { configurarEventosInterface(); } catch (e) { console.error("Falha ao configurar a interface:", e); }

  migrarNomesAntigos();
  popularListaLogin();
  popularFiltrosTurma();
  const usuarioSalvo = localStorage.getItem("IFS_SAVED_USER") || sessionStorage.getItem("IFS_SESSION_USER");
  if (usuarioSalvo) {
    usuarioLogado = usuarioSalvo;
    entrarNoPainel();
  } else {
    document.getElementById("tela-login").style.display = "flex";
    document.getElementById("tela-painel").style.display = "none";
  }

  // Sincronização em segundo plano suave após a interface estar 100% pronta
  setTimeout(() => recarregarDados(true), 50);
});

// Filtros de turma do app seguem os cadastros do painel (cursos e turmas)
function popularFiltrosTurma() {
  const cad = API.getCadastros && API.getCadastros();
  if (!cad) return;
  const grupos = (cad.cursos || []).map((c) => ({ nome: c.nome, turmas: cad.turmas.filter((t) => t.curso === c.id).map((t) => t.nome) }))
    .filter((g) => g.turmas.length);
  const chave = JSON.stringify(grupos);
  [["filtroTurmaSelect", false], ["filtroRelatorioTurma", true]].forEach(([id, comTodas]) => {
    const sel = document.getElementById(id);
    if (!sel || sel.dataset.cad === chave) return;
    const atual = sel.value;
    sel.innerHTML = (comTodas ? '<option value="TODAS">Todas as Turmas</option>' : "") + grupos.map((g) =>
      `<optgroup label="${escAviso(g.nome)}">${g.turmas.map((t) => `<option value="${escAviso(t)}">${escAviso(t)}</option>`).join("")}</optgroup>`).join("");
    sel.dataset.cad = chave;
    const opcoes = [...sel.options].map((o) => o.value);
    sel.value = opcoes.includes(atual) ? atual : (opcoes.find((v) => v && atual && v.startsWith(atual)) || opcoes[0] || "");
  });
}

// "Prof." ou "Profa." antes do nome na lista do login
const PROFESSORAS = ["Fernanda", "Grayce", "Raisa", "Érica Delfino"];
function tratamentoProf(nome) {
  const primeiro = String(nome).split(" ")[0];
  return PROFESSORAS.includes(nome) || PROFESSORAS.includes(primeiro) || /^(Ana|Maria|Érica|Erica)\b/.test(nome) ? "Profa." : "Prof.";
}

// Lista do login vem da aba "Professores" (painel administrativo); sem ela, fica a lista fixa do index.html
function popularListaLogin() {
  try {
    const select = document.getElementById("loginProf");
    const lista = API.getProfessores && API.getProfessores();
    if (!select || !lista) return;
    const nomes = lista
      .filter((p) => p && p.nome && p.ativo !== false && p.nome !== "A definir")
      .map((p) => p.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (nomes.length === 0) return;
    const atual = select.value;
    const chave = nomes.join("|");
    if (select.dataset.lista === chave) return;
    select.dataset.lista = chave;
    select.innerHTML = '<option value="" disabled selected>Escolha seu nome...</option>' +
      nomes.map((n) => `<option value="${n.replace(/"/g, "&quot;")}">${tratamentoProf(n)} ${n.replace(/</g, "&lt;")}</option>`).join("");
    select.value = nomes.includes(atual) ? atual : "";
  } catch (e) { console.warn("Lista de professores:", e); }
}

// Professores que mudaram de nome no sistema: mantém login salvo no aparelho.
// O PIN em si não precisa migrar mais — ele vive no servidor, associado ao nome
// na planilha "Professores" (quem renomeia lá já resolve isso de um lado só).
const NOMES_ANTIGOS = { "Rafael": "Luiz Rafael Freitas" };
function migrarNomesAntigos() {
  try {
    for (const antigo in NOMES_ANTIGOS) {
      const novo = NOMES_ANTIGOS[antigo];
      if (localStorage.getItem("IFS_SAVED_USER") === antigo) localStorage.setItem("IFS_SAVED_USER", novo);
      if (sessionStorage.getItem("IFS_SESSION_USER") === antigo) sessionStorage.setItem("IFS_SESSION_USER", novo);
      // Uma sessão salva em nome do nome antigo não vale mais (o token era para o nome antigo);
      // melhor pedir login de novo do que arriscar um token associado ao professor errado.
      const sessao = API.getSession();
      if (sessao && sessao.professor === antigo) API.logout();
    }
  } catch (e) { console.warn("Aviso ao migrar nomes antigos:", e); }
}

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    // Só recarrega quando uma versão NOVA assume. Na primeira visita não havia controlador,
    // e o clients.claim() provocava um reload desnecessário (página carregava 2 vezes).
    const haviaControlador = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register("./sw.js")
      .then((reg) => {
        reg.update().catch(() => {});
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                mostrarToast("Nova versão do sistema detectada! Atualizando...");
              }
            });
          }
        });
      })
      .catch((err) => console.log("Falha ao registrar Service Worker:", err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!haviaControlador || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

// Recebe do Service Worker a aba a abrir quando o professor toca numa notificação
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.tipo === "ABRIR_ABA" && typeof alternarAba === "function") {
      alternarAba(event.data.aba);
    }
  });
}

window.addEventListener("online", () => { if (usuarioLogado) { falhasSeguidas = 0; recarregarDados(true); } });

// Detecta quando o usuário volta para o app no iOS / celular com throttle de 20s
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => reg.update().catch(() => {}));
    }
    const agora = Date.now();
    if (agora - ultimaSincronizacao > 10000 && usuarioLogado) {
      recarregarDados(true);
    }
  }
  if (usuarioLogado) iniciarPolling();
});

// ============================================================================
// CONFIGURAÇÃO DE EVENTOS DA INTERFACE
// ============================================================================
function configurarEventosInterface() {
  // Login e Recuperação de PIN
  ligarEvento("btnLogin", "click", executarLogin);
  ligarEvento("btnEsqueciPin", "click", abrirModalEsqueciPin);
  ligarEvento("btnConfirmarRecuperarPin", "click", executarRecuperarPin);
  ligarEvento("pinInput", "keyup", (e) => {
    if (e.key === "Enter") executarLogin();
  });

  // Logout
  ligarEvento("btnLogout", "click", executarLogout);

  // Troca de Abas
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      alternarAba(btn.getAttribute("data-tab"));
    });
  });

  // Refresh manual com feedback imediato
  ligarEvento("btnManualRefresh", "click", () => {
    const btn = document.getElementById("btnManualRefresh");
    if (btn) btn.innerText = "⏳...";
    mostrarToast("Verificando atualizações...");
    recarregarDados(false).then((resultado) => {
      if (btn) btn.innerText = "Atualizar";
      if (resultado && resultado.online) {
        mostrarToast("Grade sincronizada com o Google Sheets!");
      } else {
        mostrarToast("Não foi possível falar com o Google agora. Mostrando os dados salvos no aparelho.");
      }
    });
  });

  // Botão de Alerta no Banner
  ligarEvento("btnVerAlertas", "click", () => {
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
  ligarEvento("filtroTurmaSelect", "change", (e) => {
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

  ligarEvento("btnOpenModalReposicao", "click", abrirModalReposicao);
  ligarEvento("btnNovaReposicaoTab", "click", abrirModalReposicao);
  ligarEvento("btnConfirmarReposicao", "click", executarAgendarReposicao);
  ligarEvento("btnNovaTrocaTab", "click", iniciarTrocaPelaAba);

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
  ligarEvento("filtroRelatorioTipo", "change", renderizarRelatorios);
  ligarEvento("filtroRelatorioProf", "change", renderizarRelatorios);
  ligarEvento("filtroRelatorioTurma", "change", renderizarRelatorios);
  ligarEvento("btnImprimirRelatorio", "click", () => {
    renderizarRelatorios();
    window.print();
  });
  ligarEvento("btnExportarCsv", "click", exportarRelatorioCSV);
  ligarEvento("btnCopiarTabela", "click", copiarRelatorioTabela);

  // Modal Configurações
  ligarEvento("btnOpenSettings", "click", abrirModalConfig);
  ligarEvento("btnResetarDemo", "click", resetarDadosDemo);
  const btnForcarAtualizar = document.getElementById("btnForcarAtualizacaoApp");
  if (btnForcarAtualizar) {
    btnForcarAtualizar.addEventListener("click", forcarAtualizacaoApp);
  }

  // Modal Alterar PIN
  ligarEvento("btnSalvarNovoPin", "click", salvarNovoPin);

  // Fechamento de Modais
  document.querySelectorAll(".btn-close-modal, .btn-cancelar-modal").forEach((btn) => {
    btn.addEventListener("click", fecharTodosModais);
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
async function executarLogin() {
  const selectProf = document.getElementById("loginProf");
  const pinInput = document.getElementById("pinInput");
  const lembrarme = document.getElementById("lembrarAcesso").checked;
  const btnLogin = document.getElementById("btnLogin");

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

  if (btnLogin) btnLogin.disabled = true;
  let resultado;
  try {
    resultado = await API.login(prof, pin, lembrarme);
  } finally {
    if (btnLogin) btnLogin.disabled = false;
  }

  if (!resultado || !resultado.sucesso) {
    mostrarErroLogin((resultado && resultado.erro) || "PIN incorreto! Se você ainda não alterou, o padrão é 1234.");
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

// Chamado quando o servidor recusa uma ação por falta de sessão válida (token
// ausente, expirado, ou de outro professor). Volta para a tela de login sem
// apagar o nome selecionado, para o professor só precisar digitar o PIN de novo.
function onSessaoExpirada(motivo) {
  API.logout();
  const profAtual = usuarioLogado;
  usuarioLogado = null;
  localStorage.removeItem("IFS_SAVED_USER");
  sessionStorage.removeItem("IFS_SESSION_USER");
  document.getElementById("tela-painel").style.display = "none";
  document.getElementById("tela-login").style.display = "flex";
  if (profAtual) {
    const selectProf = document.getElementById("loginProf");
    if (selectProf) selectProf.value = profAtual;
  }
  mostrarErroLogin(motivo || "Sua sessão expirou. Digite seu PIN novamente para continuar.");
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
  // Não "chutamos" mais o e-mail a partir do nome (ex.: "eber@ifs.edu.br") — isso
  // ficava errado sempre que o e-mail real cadastrado não seguia esse padrão
  // (ex.: "eber.santana@ifs.edu.br"). O app também não tem acesso à lista real de
  // e-mails (de propósito, por privacidade — ver listaProfessoresPublica_ no
  // Code.gs), então o texto fica genérico; o e-mail de verdade, lido da planilha,
  // é usado no servidor na hora de enviar.
  document.getElementById("modalEsqueciPinDesc").innerText =
    `Professor(a): ${prof} • O aviso será enviado para o e-mail institucional já cadastrado no sistema.`;
  abrirModal("modalEsqueciPin");
}

async function executarRecuperarPin() {
  const prof = document.getElementById("loginProf").value;
  if (!prof) return;

  const btn = document.getElementById("btnConfirmarRecuperarPin");
  if (btn) btn.disabled = true;
  let res;
  try {
    res = await API.recuperarPin(prof);
  } finally {
    if (btn) btn.disabled = false;
  }

  fecharTodosModais();
  if (!res || !res.sucesso) {
    mostrarErroLogin((res && res.erro) || "Não foi possível redefinir o PIN agora. Tente de novo em instantes.");
    return;
  }
  document.getElementById("pinInput").value = "";
  mostrarToast("PIN temporário enviado ao seu e-mail institucional.");
  mostrarErroLogin("Enviamos um PIN temporário para o seu e-mail institucional. Digite-o no campo e entre; depois troque em ⚙️ Configurações.");
}

function entrarNoPainel() {
  document.getElementById("tela-login").style.display = "none";
  document.getElementById("tela-painel").style.display = "flex";
  document.getElementById("nomeUsuarioLogado").innerText = `Prof. ${usuarioLogado}`;

  renderizarTudo();
  iniciarPolling();
}

function executarLogout() {
  localStorage.removeItem("IFS_SAVED_USER");
  sessionStorage.removeItem("IFS_SESSION_USER");
  API.logout();
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
  if (tabId === "tab-emails") {
    marcarEmailsComoLidos();
  }
  renderizarAbaAtiva();
}

function marcarEmailsComoLidos() {
  if (usuarioLogado) API.marcarAvisosLidos(usuarioLogado);
  const badgeEmails = document.getElementById("badgeQtdEmails");
  if (badgeEmails) {
    badgeEmails.style.display = "none";
  }
}

function renderizarTudo() {
  atualizarContadoresEAlerta();
  renderizarAbaAtiva();
}

// Renderização cirúrgica rápida apenas da aba atualmente visível na tela
function renderizarAbaAtiva() {
  const activePane = document.querySelector(".tab-pane.active");
  const tabId = activePane ? activePane.id : "tab-minha";

  if (tabId === "tab-minha") {
    renderizarMinhaGrade();
  } else if (tabId === "tab-livres") {
    renderizarAulasLivres();
  } else if (tabId === "tab-banco") {
    renderizarBanco();
  } else if (tabId === "tab-trocas") {
    renderizarTrocasEReposicoes();
  } else if (tabId === "tab-turmas") {
    const select = document.getElementById("filtroTurmaSelect");
    renderizarGradePorTurma(select ? select.value : "1º DS");
  } else if (tabId === "tab-relatorios") {
    renderizarRelatorios();
  } else if (tabId === "tab-emails") {
    renderizarEmailsLog();
  }
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

  // Avisos não lidos: só os e-mails que chegaram para este professor, fora os arquivados
  const badgeEmails = document.getElementById("badgeQtdEmails");
  const tabEmailsPane = document.getElementById("tab-emails");
  if (tabEmailsPane && tabEmailsPane.classList.contains("active")) {
    if (usuarioLogado) API.marcarAvisosLidos(usuarioLogado);
    if (badgeEmails) badgeEmails.style.display = "none";
  } else if (badgeEmails && usuarioLogado) {
    const lidosEm = API.getAvisosLidosEm(usuarioLogado);
    const arq = new Set(API.getAvisosArquivados(usuarioLogado));
    const naoLidos = lidosEm ? API.getMeusAvisos(usuarioLogado).filter((a) => a.data > lidosEm && !arq.has(a.id)).length : 0;
    if (!lidosEm) API.marcarAvisosLidos(usuarioLogado);
    badgeEmails.innerText = naoLidos;
    badgeEmails.style.display = naoLidos > 0 ? "inline-block" : "none";
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
let ultimoCountFavicon = -1;
function desenharFaviconComBadge(count) {
  try {
    // Em celular / PWA não há abas de desktop, poupando processador e GPU
    if (typeof window !== "undefined" && window.innerWidth <= 768) return;
    if (count === ultimoCountFavicon) return;
    ultimoCountFavicon = count;

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
  const arqAv = new Set(API.getAvisosArquivados(usuarioLogado));
  const logs = API.getMeusAvisos(usuarioLogado).filter((a) => !arqAv.has(a.id));
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
            <span class="notif-item-title">${escAviso(aula.disc)} (${escAviso(aula.turma)})</span>
            <span class="notif-item-subtitle">Prof. ${escAviso(aula.profOriginal)} • 📅 ${escAviso(aula.dia)} (${escAviso(aula.hora)})</span>
          </div>
          <button type="button" class="btn-notif-action" style="background:#b91c1c;" onclick="fecharTodosModais(); prepararAssumirAula('${escAviso(aula.profOriginal)}', ${aula.indexOriginal});">
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
            <span class="notif-item-title">Proposta de Prof. ${escAviso(troca.proponente)}</span>
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
          <span>📨 Meus avisos recentes</span>
          <button type="button" class="btn-notif-action" style="background:#0288d1;" onclick="fecharTodosModais(); alternarAba('tab-emails');">
            Ver Todos
          </button>
        </div>`;
    
    logs.slice(0, 2).forEach((log) => {
      html += `
        <div class="notif-item-mini">
          <div class="notif-item-info">
            <span class="notif-item-title" style="font-size:11px;">${escAviso(log.assunto)}</span>
            <span class="notif-item-subtitle">🕒 ${escAviso(new Date(log.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>
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
        exibirNotificacao("🔔 Notificações ativadas", "Você será avisado de faltas, substituições e trocas.", "teste", "tab-minha");
        atualizarContadoresEAlerta();
        abrirModalMudancasAlertas();
      } else {
        mostrarToast("Permissão de notificação não foi concedida.");
      }
    } catch (e) {
      console.warn("Erro ao solicitar permissão de notificações:", e);
    }
  } else {
    avisar("Para exibir notificações no ícone do iPhone, adicione o app à Tela de Início (Compartilhar > Adicionar à Tela de Início).");
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

// ----------------------------------------------------------------------------
// ALMOÇO E INTERVALO: faixa entre dois cartões do dia (horários e tipos vêm dos cadastros do painel)
// ----------------------------------------------------------------------------
function faixaMin(h) { const m = String(h || "").match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/); return m ? [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])] : null; }
function pausaEntre(turma, aulaAnt, aulaProx) {
  const fa = faixaMin(aulaAnt.hora), fp = faixaMin(aulaProx.hora);
  if (!fa || !fp || fp[0] <= fa[0]) return null;
  const fmt = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const cad = API.getCadastros && API.getCadastros();
  const tempos = (cad && cad.tempos) || [];
  const t = (cad && (cad.turmas || []).find((x) => String(x.nome).toLowerCase() === String(turma).toLowerCase())) || null;
  const curso = t && (cad.cursos || []).find((c) => c.id === t.curso);
  const proprios = tempos.filter((h) => h.turma && String(h.turma).toLowerCase() === String(turma).toLowerCase());
  const doGrupo = proprios.length ? proprios : tempos.filter((h) => !h.turma && curso && (curso.turnos || [curso.turno]).includes(h.turno));
  const marcada = doGrupo.filter((h) => h.tipo).map((h) => ({ h, f: faixaMin(h.hora) })).find((x) => x.f && x.f[0] >= fa[1] - 1 && x.f[1] <= fp[0] + 1);
  if (marcada) return { tipo: marcada.h.tipo, hora: fmt(marcada.f[0]) + "–" + fmt(marcada.f[1]), min: marcada.f[1] - marcada.f[0] };
  const folga = fp[0] - fa[1];
  if (folga >= 10 && aulaAnt.turma === aulaProx.turma) return { tipo: folga >= 30 ? "Almoço" : "Intervalo", hora: fmt(fa[1]) + "–" + fmt(fp[0]), min: folga };
  return null;
}
function faixaPausaHTML(p) {
  return `<div class="pausa-faixa"><strong>${p.tipo === "Almoço" ? "Horário de almoço" : "Intervalo"}</strong><span>${p.hora}</span><span>${p.min} min</span></div>`;
}
// cartões do dia com a faixa de almoço/intervalo entre eles
function cartoesDoDia(aulas, contexto) {
  const out = [];
  aulas.forEach((aula, i) => {
    if (i > 0) { const p = pausaEntre(aulas[i - 1].turma, aulas[i - 1], aula); if (p) out.push(`</div>${faixaPausaHTML(p)}<div class="cards-grid">`); }
    out.push(criarCardHTML(aula, contexto));
  });
  return out.join("");
}

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

  atualizarBalizador(minhasAulas);

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

  const htmlChunks = [];
  diasOrdem.forEach((dia) => {
    if (aulasPorDia[dia] && aulasPorDia[dia].length > 0) {
      aulasPorDia[dia].sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));
      htmlChunks.push(`<div class="day-header">${dia}</div><div class="cards-grid">`);
      htmlChunks.push(cartoesDoDia(aulasPorDia[dia], "minha_grade"));
      htmlChunks.push(`</div>`);
    }
  });
  container.innerHTML = htmlChunks.join("");
}

// ----------------------------------------------------------------------------
// BALIZADOR: mostra a aula de agora (ou a próxima) como um bloco único,
// juntando tempos seguidos da mesma turma/disciplina.
// ----------------------------------------------------------------------------
let balizadorAulas = [];
// opcional: desligado por padrão, escolha guardada por professor neste aparelho
function balizadorAtivo() { try { return localStorage.getItem("IFS_BALIZADOR_" + usuarioLogado) === "1"; } catch (e) { return false; } }
function definirBalizadorAtivo(v) { try { localStorage.setItem("IFS_BALIZADOR_" + usuarioLogado, v ? "1" : "0"); } catch (e) {} atualizarBalizador(); }
function atualizarBalizador(aulas) {
  if (aulas) balizadorAulas = aulas;
  const el = document.getElementById("balizadorAula");
  if (!el) return;
  if (!balizadorAtivo()) { el.style.display = "none"; el.innerHTML = ""; return; }
  const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const faixa = (h) => { const m = String(h || "").match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/); return m ? [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])] : null; };
  const hh = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

  // só o que realmente é dado por mim
  const validas = balizadorAulas.filter(a => faixa(a.hora) && (a.ehMinha ? (a.status !== "alert" && a.status !== "assumed") : true));
  // blocos contínuos por dia
  const blocos = [];
  dias.forEach((dia, di) => {
    const doDia = validas.filter(a => a.dia === dia).map(a => ({ a, f: faixa(a.hora) })).sort((x, y) => x.f[0] - y.f[0]);
    doDia.forEach(({ a, f }) => {
      const ult = blocos[blocos.length - 1];
      if (ult && ult.di === di && ult.turma === a.turma && ult.disc === a.disc && f[0] - ult.fim <= 20) { ult.fim = f[1]; ult.tempos++; }
      else blocos.push({ di, dia, turma: a.turma, disc: a.disc, ini: f[0], fim: f[1], tempos: 1 });
    });
  });
  if (!blocos.length) { el.style.display = "none"; el.innerHTML = ""; return; }

  const agora = new Date();
  const hoje = agora.getDay();
  const min = agora.getHours() * 60 + agora.getMinutes();
  let atual = blocos.find(b => b.di === hoje && min >= b.ini && min < b.fim);
  let prox = null;
  if (!atual) {
    for (let d = 0; d < 7 && !prox; d++) {
      const di = (hoje + d) % 7;
      prox = blocos.filter(b => b.di === di && (d > 0 || b.ini > min)).sort((x, y) => x.ini - y.ini)[0] || null;
      if (prox) prox = { ...prox, daqui: d };
    }
  }
  const b = atual || prox;
  if (!b) { el.style.display = "none"; return; }
  const tempos = b.tempos > 1 ? b.tempos + " tempos" : "1 tempo";
  let topo, rodape = "", classe = "balizador";
  if (atual) {
    const pct = Math.round(((min - b.ini) / (b.fim - b.ini)) * 100);
    topo = "🟢 Em andamento";
    rodape = `<div class="balizador-barra"><span style="width:${pct}%"></span></div><div class="balizador-resto">Faltam ${b.fim - min} min</div>`;
    classe += " balizador-agora";
  } else {
    const quando = b.daqui === 0 ? "hoje" : b.daqui === 1 ? "amanhã" : b.dia.toLowerCase();
    const ate = b.daqui === 0 ? ` · começa em ${b.ini - min >= 60 ? Math.floor((b.ini - min) / 60) + " h " + ((b.ini - min) % 60) + " min" : (b.ini - min) + " min"}` : "";
    topo = "⏭️ Próxima aula · " + quando + ate;
  }
  el.className = classe;
  el.style.display = "block";
  el.innerHTML = `<div class="balizador-topo">${topo}</div>
    <div class="balizador-hora">${hh(b.ini)} – ${hh(b.fim)}</div>
    <div class="balizador-desc">${escAviso(b.disc)} · ${escAviso(b.turma)} <span>(${tempos})</span></div>${rodape}`;
}
setInterval(() => { if (usuarioLogado) atualizarBalizador(); }, 30000);

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
// ABA: BANCO DE AULAS (créditos por cobrir aulas sem titular, faltas e adiantamentos)
// ============================================================================
const NOMES_DIAS_BANCO = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
let bancoAulaAlvo = null;

function dataLocalISO(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dataBancoBR(iso) { const p = String(iso || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "—"; }

function renderizarBanco(jaCarregou) {
  const container = document.getElementById("bancoContainer");
  if (!container || !usuarioLogado) return;
  const dados = API.getMeuBanco(usuarioLogado) || { minhas: [], ocupadas: [], saldo: { creditos: 0, debitos: 0, saldo: 0, abonados: 0 } };
  const s = dados.saldo || { creditos: 0, debitos: 0, saldo: 0, abonados: 0 };
  const sinal = s.saldo > 0 ? "+" : "";
  const livres = (bancoDeDados["A definir"] || []).slice().sort((a, b) => {
    const ordem = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
    return ordem.indexOf(a.dia) - ordem.indexOf(b.dia) || extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora);
  });
  const porDisc = {};
  livres.forEach((a) => { (porDisc[a.disc + " · " + a.turma] = porDisc[a.disc + " · " + a.turma] || []).push(a); });

  const rotuloTipo = { VAGA: "Aula sem professor", AUSENCIA: "Cobertura de falta", ADIANTAMENTO: "Adiantamento" };
  const classeStatus = { pendente: "banco-et-pend", confirmado: "banco-et-ok", recusado: "banco-et-no", cancelado: "banco-et-cancel" };
  const textoStatus = { pendente: "Aguardando coordenação", confirmado: "Confirmado", recusado: "Recusado", cancelado: "Cancelado" };
  const minhasHTML = (dados.minhas || []).map((m) => {
    let efeito = "";
    if (m.status === "confirmado") {
      if (m.papel === "ministrou") efeito = `<strong class="banco-mais">+${m.tempos}</strong>`;
      else efeito = m.abonada === "Sim" ? `<span class="banco-neutro">falta abonada</span>` : `<strong class="banco-menos">−${m.tempos}</strong>`;
    }
    const quem = m.papel === "ministrou" ? (m.tipo === "AUSENCIA" ? `Você cobriu a falta de Prof. ${escAviso(m.titular)}` : "Você ministrou") : `Prof. ${escAviso(m.professor)} cobriu sua falta`;
    return `<div class="banco-linha">
        <div class="banco-linha-txt"><strong>${escAviso(m.disc)} · ${escAviso(m.turma)}</strong>
          <span>${escAviso(dataBancoBR(m.data))} · ${escAviso(m.hora)} · ${escAviso(rotuloTipo[m.tipo] || m.tipo)}</span>
          <span>${quem}</span></div>
        <div class="banco-linha-dir">${efeito}<span class="banco-et ${classeStatus[m.status] || ""}">${escAviso(textoStatus[m.status] || m.status)}</span>
          ${m.status === "pendente" && m.papel === "ministrou" ? `<button type="button" class="avisos-link" data-banco-acao="cancelar" data-id="${escAviso(m.id)}">Cancelar pedido</button>` : ""}</div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="banco-saldo">
      <div>
        <div class="banco-saldo-rotulo">Meu saldo no banco de aulas</div>
        <div class="banco-saldo-num ${s.saldo < 0 ? "negativo" : ""}">${sinal}${s.saldo} <small>tempo${Math.abs(s.saldo) === 1 ? "" : "s"}</small></div>
      </div>
      <div class="banco-saldo-det">${s.creditos} crédito${s.creditos === 1 ? "" : "s"} · ${s.debitos} débito${s.debitos === 1 ? "" : "s"}${s.abonados ? ` · ${s.abonados} falta${s.abonados === 1 ? "" : "s"} abonada${s.abonados === 1 ? "" : "s"}` : ""}</div>
    </div>
    <p class="banco-ajuda">Cada tempo que você ministra numa aula sem professor, ou que você cobre de um colega ausente, vira 1 crédito depois que a coordenação confirma. Só vale de hoje em diante.</p>
    <h3 class="banco-titulo">Aulas sem professor</h3>
    ${livres.length ? Object.keys(porDisc).map((k) => `<div class="banco-grupo"><div class="banco-grupo-nome">${escAviso(k)}</div>
        ${porDisc[k].map((a) => `<div class="banco-linha"><div class="banco-linha-txt"><strong>${escAviso(a.dia)} · ${escAviso(a.hora)}</strong></div>
          <div class="banco-linha-dir"><button type="button" class="btn-card btn-card-primary" data-banco-acao="assumir" data-id="${escAviso(a.id)}">Assumir</button></div></div>`).join("")}</div>`).join("")
      : `<div class="empty-state" style="padding: 20px;"><div class="empty-state-icon" style="font-size: 32px;">✅</div><div class="empty-state-text" style="font-size: 14px;">Todas as aulas têm professor no momento.</div></div>`}
    <h3 class="banco-titulo">Meus pedidos e lançamentos</h3>
    ${minhasHTML || `<div class="empty-state" style="padding: 20px;"><div class="empty-state-text" style="font-size: 14px;">Você ainda não tem lançamentos no banco de aulas.</div></div>`}`;
  if (!jaCarregou) API.carregarMeuBanco(usuarioLogado).then(() => renderizarBanco(true));
}

function abrirModalBanco(idAula) {
  const aula = (bancoDeDados["A definir"] || []).find((a) => a.id === idAula);
  if (!aula) return;
  const teste = verificarConflito(aula.dia, aula.hora);
  if (teste.conflito) {
    document.getElementById("modalConflitoTexto").innerText =
      `Você já tem aula nesse mesmo dia e horário:\n▶ ${teste.descricao}\n\nO sistema impede a sobreposição para nenhuma turma ficar sem acompanhamento.`;
    abrirModal("modalConflito");
    return;
  }
  const dados = API.getMeuBanco(usuarioLogado) || { ocupadas: [] };
  const alvoDia = NOMES_DIAS_BANCO.indexOf(aula.dia);
  const opcoes = [];
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 70 && opcoes.length < 8; i++, d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== alvoDia) continue;
    const iso = dataLocalISO(d);
    const oc = (dados.ocupadas || []).find((o) => o.aulaId === aula.id && o.data === iso);
    opcoes.push(`<option value="${iso}" ${oc ? "disabled" : ""}>${escAviso(aula.dia.replace("-feira", ""))}, ${dataBancoBR(iso)}${oc ? (oc.meu ? " (você já pediu)" : " (já pedida)") : ""}</option>`);
  }
  bancoAulaAlvo = aula;
  document.getElementById("modalBancoTexto").textContent = `${aula.disc} (${aula.turma}) · ${aula.dia} às ${aula.hora}`;
  document.getElementById("selectDataBanco").innerHTML = opcoes.join("");
  const livre = Array.from(document.querySelectorAll("#selectDataBanco option")).find((o) => !o.disabled);
  if (livre) document.getElementById("selectDataBanco").value = livre.value;
  document.getElementById("inputObsBanco").value = "";
  abrirModal("modalBanco");
}

ligarEvento("btnConfirmarBanco", "click", async () => {
  if (!bancoAulaAlvo) return;
  const sel = document.getElementById("selectDataBanco");
  if (!sel.value || sel.selectedOptions[0].disabled) { mostrarToast("Escolha uma data disponível."); return; }
  const btn = document.getElementById("btnConfirmarBanco");
  btn.disabled = true; btn.textContent = "Enviando…";
  const r = await API.solicitarBanco(usuarioLogado, [bancoAulaAlvo.id], sel.value, document.getElementById("inputObsBanco").value.trim());
  btn.disabled = false; btn.textContent = "Enviar pedido";
  if (!r.sucesso) { mostrarToast(r.erro || "Não foi possível enviar o pedido."); return; }
  fecharTodosModais();
  mostrarToast(r.mensagem || "Pedido enviado à coordenação.");
  bancoAulaAlvo = null;
  await API.carregarMeuBanco(usuarioLogado);
  renderizarBanco(true);
});

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-banco-acao]");
  if (!b || !usuarioLogado) return;
  if (b.dataset.bancoAcao === "assumir") abrirModalBanco(b.dataset.id);
  else if (b.dataset.bancoAcao === "cancelar" && await confirmar("Cancelar este pedido?")) {
    const r = await API.cancelarBanco(usuarioLogado, b.dataset.id);
    mostrarToast(r.sucesso ? "Pedido cancelado." : (r.erro || "Não foi possível cancelar."));
    await API.carregarMeuBanco(usuarioLogado);
    renderizarBanco(true);
  }
});

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
          acaoTroca = `<div style="font-size:13px; color:#7b1fa2; margin-top:10px; font-weight:600;">⏳ Proposta enviada para Prof. ${escAviso(t.colega)}. Aguardando confirmação.</div>`;
        }
      } else if (t.status === "aceita") {
        statusBadge = `<span style="background:#e8f5e9; color:#1b5e20; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">✅ Permuta Confirmada</span>`;
      } else if (t.status === "recusada") {
        statusBadge = `<span style="background:#ffebee; color:#d32f2f; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">Recusada</span>`;
      }

      const descCedidas = (t.aulasCedidas && t.aulasCedidas.length > 0)
        ? t.aulasCedidas.map(a => `• <strong>${escAviso(a.dia)} às ${escAviso(a.hora)}</strong>: ${escAviso(a.disc)} (${escAviso(a.turma)})`).join("<br>")
        : `• <strong>${t.aulaCedida.dia} às ${t.aulaCedida.hora}</strong>: ${t.aulaCedida.disc} (${t.aulaCedida.turma})`;

      const descDesejadas = (t.aulasDesejadas && t.aulasDesejadas.length > 0)
        ? t.aulasDesejadas.map(a => `• <strong>${escAviso(a.dia)} às ${escAviso(a.hora)}</strong>: ${escAviso(a.disc)} (${escAviso(a.turma)})`).join("<br>")
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
              <div class="swap-side-title">📤 Cedida(s) por Prof. ${escAviso(t.proponente)} (${qtdCedidas} tempos):</div>
              <div class="swap-side-desc" style="line-height:1.5;">${descCedidas}</div>
            </div>
            <div class="swap-side" style="margin-top:10px;">
              <div class="swap-side-title">📥 Em contrapartida com Prof. ${escAviso(t.colega)} (${qtdDesejadas} tempos):</div>
              <div class="swap-side-desc" style="line-height:1.5;">${descDesejadas}</div>
            </div>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); line-height: 1.4;">
            📅 Data Prevista: <strong>${formatarDataBR(t.dataPrevista)}</strong> ${t.motivo ? `• Justificativa: <em>${escAviso(t.motivo)}</em>` : ""}
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
            <div class="card-time">📅 ${formatarDataBR(r.data)} • 🕒 ${escAviso(r.horario)}</div>
            <span class="card-badge-room" style="background:#e1f5fe; color:#0288d1; font-weight:800;">${escAviso(r.turma)}</span>
          </div>
          <div class="card-title">${escAviso(r.disciplina)}</div>
          <div class="card-subtitle">Docente: Prof. <strong>${escAviso(r.professor)}</strong> • Local: <strong>${escAviso(r.sala)}</strong></div>
          <div class="card-note" style="color:#0288d1; font-size: 13px;">📌 ${escAviso(r.motivo || "Reposição de aula curricular")}</div>
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

  const htmlChunks = [];
  diasOrdem.forEach((dia) => {
    if (agrupado[dia] && agrupado[dia].length > 0) {
      agrupado[dia].sort((a, b) => extrairMinutosDoHorario(a.hora) - extrairMinutosDoHorario(b.hora));
      htmlChunks.push(`<div class="day-header">${dia}</div><div class="cards-grid">`);
      htmlChunks.push(cartoesDoDia(agrupado[dia], "grade_turma"));
      htmlChunks.push(`</div>`);
    }
  });
  container.innerHTML = htmlChunks.join("");
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

  const rowsHTML = [];
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

    rowsHTML.push(`
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
      </tr>`);
  });
  tbody.innerHTML = rowsHTML.join("");
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
    avisar("Não há dados para exportar com os filtros atuais.");
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
    avisar("Não há dados para copiar.");
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
    avisar("Não foi possível copiar automaticamente para a área de transferência.");
  });
}

// ============================================================================
// 6. ABA: CENTRAL DE E-MAILS & NOTIFICAÇÕES
// ============================================================================
let mostrarAvisosArquivados = false;
function escAviso(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const ROTULO_AVISO = { Falta: "Falta", "Substituição": "Substituição", Troca: "Troca", "Reposição": "Reposição", PIN: "PIN", Teste: "Teste", Aviso: "Aviso" };
const CLASSE_AVISO = { Falta: "AUSENCIA", "Substituição": "SUBSTITUICAO", Troca: "PERMUTA_PROPOSTA", "Reposição": "REPOSICAO" };

function renderizarEmailsLog(jaCarregou) {
  marcarEmailsComoLidos();
  const container = document.getElementById("emailsLogContainer");
  if (!container || !usuarioLogado) return;
  const todos = API.getMeusAvisos(usuarioLogado);
  const arquivados = new Set(API.getAvisosArquivados(usuarioLogado));
  const visiveis = todos.filter((a) => mostrarAvisosArquivados ? arquivados.has(a.id) : !arquivados.has(a.id));
  const qtdArq = todos.filter((a) => arquivados.has(a.id)).length;

  const barra = `<div class="avisos-barra">
      <span>${mostrarAvisosArquivados ? `${qtdArq} arquivado${qtdArq === 1 ? "" : "s"}` : `${visiveis.length} aviso${visiveis.length === 1 ? "" : "s"}`}</span>
      <span class="avisos-acoes">
        ${!mostrarAvisosArquivados && visiveis.length > 1 ? `<button type="button" class="avisos-link" data-aviso-acao="arquivar-todos">Arquivar todos</button>` : ""}
        ${qtdArq || mostrarAvisosArquivados ? `<button type="button" class="avisos-link" data-aviso-acao="alternar">${mostrarAvisosArquivados ? "Voltar à caixa de entrada" : `Ver arquivados (${qtdArq})`}</button>` : ""}
      </span></div>`;

  if (!visiveis.length) {
    container.innerHTML = barra + `
      <div class="empty-state">
        <div class="empty-state-icon">✉️</div>
        <div class="empty-state-text">${mostrarAvisosArquivados ? "Nenhum aviso arquivado." : "Nenhum aviso para você. Quando o sistema mandar um e-mail para você, ele aparece aqui."}</div>
      </div>`;
  } else {
    container.innerHTML = barra + visiveis.map((a) => `
      <div class="email-log-item">
        <div class="email-log-top">
          <span class="email-tag ${CLASSE_AVISO[a.tipo] || ""}">${escAviso(ROTULO_AVISO[a.tipo] || a.tipo)}</span>
          <span class="email-log-date">${escAviso(new Date(a.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>
        </div>
        <div class="email-log-subject">${escAviso(a.assunto)}</div>
        <div class="email-log-rodape">
          <span class="email-log-status ${a.status === "Erro" ? "erro" : ""}">${a.status === "Erro" ? "Não foi entregue" : "✓ Enviado para o seu e-mail"}</span>
          <button type="button" class="avisos-link" data-aviso-acao="${mostrarAvisosArquivados ? "desarquivar" : "arquivar"}" data-id="${escAviso(a.id)}">${mostrarAvisosArquivados ? "Desarquivar" : "Arquivar"}</button>
        </div>
      </div>`).join("");
  }
  if (!jaCarregou) API.carregarMeusAvisos(usuarioLogado).then(() => { renderizarEmailsLog(true); atualizarContadoresEAlerta(); });
}

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-aviso-acao]");
  if (!b || !usuarioLogado) return;
  const arq = API.getAvisosArquivados(usuarioLogado);
  const acao = b.dataset.avisoAcao;
  if (acao === "arquivar") API.setAvisosArquivados(usuarioLogado, [...arq, b.dataset.id]);
  else if (acao === "desarquivar") API.setAvisosArquivados(usuarioLogado, arq.filter((id) => id !== b.dataset.id));
  else if (acao === "arquivar-todos") API.setAvisosArquivados(usuarioLogado, [...arq, ...API.getMeusAvisos(usuarioLogado).map((a) => a.id)]);
  else if (acao === "alternar") mostrarAvisosArquivados = !mostrarAvisosArquivados;
  renderizarEmailsLog(true);
  atualizarContadoresEAlerta();
});

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
      subtitle = `Turma: ${escAviso(aula.turma)} • Sala de Aula`;
      botaoHTML = `
        <div class="card-actions-row">
          <button class="btn-card btn-card-release" onclick="abrirModalLiberar('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
            ⚠️ Informar Falta
          </button>
          <button class="btn-card btn-card-swap" onclick="abrirModalTroca('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
            🔄 Propor Troca
          </button>
        </div>`;
    } else if (aula.status === "alert") {
      subtitle = `Turma: ${escAviso(aula.turma)} • <strong>Você disponibilizou este horário</strong>`;
      botaoHTML = `<button class="btn-card btn-card-cancel" onclick="cancelarAusencia('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
        ↩️ Desfazer falta (Vou lecionar normalmente)
      </button>`;
    } else if (aula.status === "assumed") {
      if (ehSubstituto) {
        subtitle = `Turma: ${escAviso(aula.turma)} • Substituição da aula de Prof. ${escAviso(aula.profOriginal)}`;
        botaoHTML = `<button class="btn-card btn-card-cancel" onclick="desistirSubstituicao('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
          Desistir desta substituição
        </button>`;
      } else {
        subtitle = `Turma: ${escAviso(aula.turma)} • Assumida por Prof. ${escAviso(aula.substituto)}`;
        botaoHTML = `<button class="btn-card btn-card-static">✅ Substituída por Prof. ${escAviso(aula.substituto)}</button>`;
      }
    }
  } else if (contexto === "aulas_livres") {
    subtitle = `Cedida por: Prof. ${escAviso(aula.profOriginal)} (${escAviso(aula.turma)})`;
    if (ehDono) {
      botaoHTML = `<button class="btn-card btn-card-cancel" onclick="cancelarAusencia('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
        ↩️ Desfazer falta (Recuperar minha aula)
      </button>`;
    } else {
      botaoHTML = `<button class="btn-card btn-card-take" onclick="prepararAssumirAula('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
        🙋‍♂️ Assumir esta Aula
      </button>`;
    }
  } else if (contexto === "grade_turma") {
    subtitle = `Prof. Titular: ${escAviso(aula.profOriginal)} • ${escAviso(aula.turma)}`;
    if (aula.status === "assumed") {
      botaoHTML = `<button class="btn-card btn-card-static">👤 Assumida por: Prof. ${escAviso(aula.substituto)}</button>`;
    } else if (aula.status === "alert") {
      botaoHTML = `<button class="btn-card btn-card-take" onclick="prepararAssumirAula('${escAviso(aula.profOriginal)}', ${aula.indexOriginal})">
        🔴 Disponível para Substituição
      </button>`;
    } else {
      botaoHTML = `<button class="btn-card btn-card-release" style="pointer-events:none;">Aula Regular Confirmada</button>`;
    }
  }

  return `
    <div class="class-card ${statusClass}">
      <div class="card-top">
        <div class="card-time">🕒 ${escAviso(aula.hora)} (${escAviso(aula.dia)})</div>
        <span class="card-badge-room">${escAviso(aula.turma)}</span>
      </div>
      <div class="card-title">${escAviso(aula.disc)}</div>
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
      migrarNomesAntigos();
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
          <span class="tempo-horario">⏰ ${escAviso(aula.hora)}</span>
          <span class="tempo-turma-badge">${escAviso(aula.turma)}</span>
        </div>
        <span class="tempo-disc">${escAviso(aula.disc)}</span>
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

ligarEvento("btnConfirmarLiberar", "click", () => {
  const checkboxes = Array.from(document.querySelectorAll(".tempo-chk:checked"));
  if (checkboxes.length === 0) {
    mostrarToast("Por favor, selecione pelo menos um tempo de aula.");
    return;
  }

  const indicesSelecionados = checkboxes.map((chk) => parseInt(chk.value, 10));
  const dataFalta = formatarDataBR(document.getElementById("inputDataFalta").value);
  const motivo = document.getElementById("inputMotivoFalta").value.trim();
  if (!document.getElementById("inputDataFalta").value) {
    mostrarToast("Informe a data da falta.");
    document.getElementById("inputDataFalta").focus();
    return;
  }
  if (!motivo) {
    mostrarToast("Informe o motivo da falta (vai no e-mail para a coordenação).");
    document.getElementById("inputMotivoFalta").focus();
    return;
  }

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
    `Confirmar que você (Prof. ${usuarioLogado}) vai assumir a aula de ${escAviso(aula.disc)} (${escAviso(aula.turma)}) no lugar do Prof. ${profOriginal} no dia ${escAviso(aula.dia)} às ${escAviso(aula.hora)}?`;
  abrirModal("modalAssumir");
}

ligarEvento("btnConfirmarAssumir", "click", () => {
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

async function cancelarAusencia(prof, index) {
  const aula = bancoDeDados[prof][index];
  if (await confirmar(`Deseja cancelar a ausência e lecionar a aula de ${aula.disc} normalmente?`)) {
    const emailDocente = API.obterEmailProfessor(prof);
    bancoDeDados = API.processarAcao({ acao: "recuperar", profOriginal: prof, index, aula, emailDocente });
    renderizarTudo();
    mostrarToast("Aula restaurada na sua grade normal!");
  }
}

async function desistirSubstituicao(profOriginal, index) {
  if (await confirmar("Deseja desistir desta substituição? A aula voltará a ficar disponível para outros colegas.")) {
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
      migrarNomesAntigos();
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
      const colegas = Object.keys(bancoDeDados).filter(c => c !== usuarioLogado && c !== "A definir").sort();
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
          <span class="tempo-horario">⏰ ${escAviso(aula.hora)}</span>
          <span class="tempo-turma-badge">${escAviso(aula.turma)}</span>
        </div>
        <span class="tempo-disc">${escAviso(aula.disc)}</span>
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
          <span class="tempo-horario">⏰ ${escAviso(aula.hora)}</span>
          <span class="tempo-turma-badge">${escAviso(aula.turma)}</span>
        </div>
        <span class="tempo-disc">${escAviso(aula.disc)}</span>
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
      avisar(`⚠️ CONFLITO DETECTADO:\nVocê já possui aula agendada no horário:\n▶ ${aulaDesejada.dia} às ${aulaDesejada.hora} (${conflitoEu.descricao})`);
      return;
    }
  }

  for (const minhaAula of minhasAulasObjetos) {
    const conflitoColega = verificarConflito(minhaAula.dia, minhaAula.hora, colega);
    if (conflitoColega.conflito) {
      avisar(`⚠️ CONFLITO DO COLEGA:\nO Prof. ${colega} já possui aula agendada no horário da aula cedida:\n▶ ${minhaAula.dia} às ${minhaAula.hora} (${conflitoColega.descricao})`);
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

async function aceitarTroca(trocaId) {
  const trocas = API.getTrocas();
  const troca = trocas.find(t => t.id === trocaId);
  if (!troca) return;

  if (await confirmar(`Confirmar o aceite da troca com o Prof. ${troca.proponente}?`)) {
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

async function recusarTroca(trocaId) {
  if (await confirmar("Deseja recusar esta proposta de troca de aula?")) {
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
      selectDisc.innerHTML += `<option value="${escAviso(aula.disc)}|${escAviso(aula.turma)}">${escAviso(aula.disc)} (${escAviso(aula.turma)})</option>`;
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
    avisar("Por favor, informe o horário da reposição (Ex: 08:40 - 10:20)!");
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

async function cancelarReposicao(id) {
  if (await confirmar("Deseja realmente cancelar este agendamento de reposição?")) {
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
  const cad = API.getCadastros();
  const destinos = (cad && cad.cursos && cad.cursos.length
    ? cad.cursos.map((c) => [c.nome, c.email]).concat([["Coordenação geral (todos os avisos)", config.emailCoordGeral]])
    : [
      ["Desenvolvimento de Sistemas (DS)", config.emailCoordDS],
      ["Administração (ADM)", config.emailCoordADM],
      ["Subsequente em Informática", config.emailCoordSubsequente],
      ["Bacharelado em Administração", config.emailCoordGraduacao],
      ["Coordenação geral (todos os avisos)", config.emailCoordGeral]
    ]).filter(([, e]) => e);
  const lista = document.getElementById("listaDestinosAvisos");
  if (lista) lista.innerHTML = destinos.map(([rotulo, email]) =>
    `<div><dt>${escAviso(rotulo)}</dt><dd>${escAviso(email)}</dd></div>`).join("");
  const chk = document.getElementById("chkBalizador");
  if (chk) { chk.checked = balizadorAtivo(); chk.onchange = () => definirBalizadorAtivo(chk.checked); }
  const bs = document.getElementById("btnAbrirSinal");
  if (bs) bs.onclick = () => { fecharTodosModais(); abrirModalSinal(); };
  abrirModal("modalConfig");
}

// ---------- Sinal escolar (calendário .ics com os toques das minhas aulas) ----------
function aulasParaSinal() {
  const out = [];
  Object.keys(bancoDeDados || {}).forEach((prof) => (bancoDeDados[prof] || []).forEach((a) => {
    if (prof === usuarioLogado ? (a.status !== "alert" && a.status !== "assumed") : (a.status === "assumed" && a.substituto === usuarioLogado)) out.push(a);
  }));
  return out;
}
function abrirModalSinal() {
  const aulas = aulasParaSinal();
  const sem = SinalEscolar.eventosSemana(aulas);
  const dias = SinalEscolar.DIAS.filter((d) => sem[d]);
  const per = SinalEscolar.periodo();
  const fim = SinalEscolar.br(per.fim);
  document.getElementById("sinalFim").textContent = fim;
  const venc = document.getElementById("sinalVencido");
  if (venc) venc.hidden = !per.vencido;
  const chk = document.getElementById("chkSinalNome");
  const btn = document.getElementById("btnBaixarSinal");
  const resumo = document.getElementById("sinalResumo");
  const wDias = document.getElementById("sinalDias");
  const lista = document.getElementById("sinalLista");
  let dia;
  const hoje = SinalEscolar.DIAS[new Date().getDay() - 1];
  dia = dias.includes(hoje) ? hoje : dias[0];
  const total = SinalEscolar.totalEventos(aulas);
  if (!dias.length) {
    resumo.textContent = "Você ainda não tem aulas na grade.";
    wDias.innerHTML = ""; lista.innerHTML = ""; btn.disabled = true;
    abrirModal("modalSinal"); return;
  }
  btn.disabled = false;
  resumo.innerHTML = `<strong>${total} avisos por semana</strong><span>${per.nome ? escAviso(per.nome) + " · " : ""}${dias.map((d) => d.replace("-feira", "")).join(", ")} · até ${fim}</span>`;
  const desenhar = () => {
    wDias.innerHTML = dias.map((d) => `<button type="button" class="sinal-dia${d === dia ? " ativo" : ""}" data-dia="${d}" role="tab" aria-selected="${d === dia}">${d.replace("-feira", "")}</button>`).join("");
    lista.innerHTML = sem[dia].map((e) => `<div class="sinal-ev sinal-${e.tipo}"><span class="sinal-hora">${SinalEscolar.hhmm(e.min)}</span><span class="sinal-tipo">${escAviso(SinalEscolar.titulo(e, false))}</span><span class="sinal-txt">${chk.checked && e.tipo !== "intervalo" ? escAviso(e.turma + " · " + e.disc) : ""}</span></div>`).join("");
  };
  wDias.onclick = (ev) => { const b = ev.target.closest("[data-dia]"); if (b) { dia = b.dataset.dia; desenhar(); } };
  chk.onchange = desenhar;
  btn.onclick = () => {
    const ics = SinalEscolar.gerarICS(usuarioLogado, aulas, { comNome: chk.checked });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = SinalEscolar.nomeArquivo(usuarioLogado);
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  desenhar();
  abrirModal("modalSinal");
}

function salvarConfiguracoes() { fecharTodosModais(); }

async function salvarNovoPin() {
  const pinAtual = document.getElementById("inputPinAtual").value.trim();
  const novoPin = document.getElementById("inputNovoPin").value.trim();
  const confirmaPin = document.getElementById("inputConfirmaPin").value.trim();

  if (!/^\d{4,8}$/.test(novoPin)) {
    avisar("O novo PIN deve ter de 4 a 8 números!");
    return;
  }
  if (novoPin !== confirmaPin) {
    avisar("Os novos PINs não coincidem!");
    return;
  }

  const btn = document.getElementById("btnSalvarNovoPin");
  if (btn) btn.disabled = true;
  let res;
  try {
    res = await API.trocarPin(pinAtual, novoPin);
  } finally {
    if (btn) btn.disabled = false;
  }

  if (!res || !res.sucesso) {
    avisar((res && res.erro) || "O PIN atual informado está incorreto!");
    return;
  }

  fecharTodosModais();
  document.getElementById("inputPinAtual").value = "";
  document.getElementById("inputNovoPin").value = "";
  document.getElementById("inputConfirmaPin").value = "";
  mostrarToast("Novo PIN cadastrado com sucesso!");
}

async function resetarDadosDemo() {
  if (await confirmar("Deseja restaurar os horários, trocas e e-mails para o padrão de demonstração do IFS?")) {
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
  const intervalo = document.visibilityState === "visible" ? 30000 : 90000;
  pollingInterval = setInterval(async () => {
    await recarregarDados(true);
  }, intervalo);
}

function pararPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
}

let sincronizacaoEmAndamento = false;
let assinaturaUltimosDados = "";
let falhasSeguidas = 0;
let ultimoSucesso = null;
let timerNovaTentativa = null;

// Assinatura simples para saber se algo mudou (evita redesenhar a tela toda a cada 30 s)
function assinaturaDados() {
  try {
    return JSON.stringify(bancoDeDados) + "|" +
      JSON.stringify(API.getTrocas().map(t => t.id + t.status)) + "|" +
      JSON.stringify(API.getReposicoes().map(r => r.id));
  } catch (e) {
    return String(Date.now());
  }
}

async function recarregarDados(silencioso = false) {
  if (sincronizacaoEmAndamento) return;
  sincronizacaoEmAndamento = true;
  ultimaSincronizacao = Date.now();

  if (!silencioso || !ultimoSucesso) atualizarIndicadorSincronismo("atualizando", "Sincronizando com o Google...");
  try {
    const resultado = await API.carregarGradeCompleta();
    bancoDeDados = resultado.data;
    if (resultado.online) {
      popularListaLogin();
      popularFiltrosTurma();
      if (usuarioLogado) API.carregarMeusAvisos(usuarioLogado).then(() => atualizarContadoresEAlerta()).catch(() => {});
    }

    const assinatura = assinaturaDados();
    if (!silencioso || assinatura !== assinaturaUltimosDados) {
      assinaturaUltimosDados = assinatura;
      renderizarTudo();
    }
    if (resultado.online && !resultado.adiado) {
      verificarNovidadesENotificar();
    }

    if (resultado.online) {
      falhasSeguidas = 0;
      ultimoSucesso = new Date();
      atualizarIndicadorSincronismo("online", "Conectado ao Google Sheets");
    } else {
      falhasSeguidas++;
      const motivo = resultado.motivo ? ` (${resultado.motivo})` : "";
      const hora = ultimoSucesso ? ultimoSucesso.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      if (ultimoSucesso && (Date.now() - ultimoSucesso.getTime()) < 5 * 60 * 1000) {
        // Falha pontual logo após sincronizar: os dados ainda são recentes, não alarma o professor
        atualizarIndicadorSincronismo("online", `Atualizado às ${hora}`);
        clearTimeout(timerNovaTentativa);
        timerNovaTentativa = setTimeout(() => recarregarDados(true), 5000);
      } else if (falhasSeguidas <= 3) {
        // Tenta de novo rápido em vez de esperar 30 s: 3 s, 6 s, 12 s
        atualizarIndicadorSincronismo("atualizando", hora ? `Atualizado às ${hora} • reconectando...` : `Conectando ao Google${motivo}...`);
        clearTimeout(timerNovaTentativa);
        timerNovaTentativa = setTimeout(() => recarregarDados(true), 3000 * Math.pow(2, falhasSeguidas - 1));
      } else {
        atualizarIndicadorSincronismo("local", hora ? `Sem conexão desde ${hora}${motivo}` : `Sem conexão – dados salvos no aparelho${motivo}`);
      }
    }
    return resultado;
  } catch (err) {
    console.warn("Aviso ao recarregar dados:", err);
    atualizarIndicadorSincronismo("local", "Sem conexão – dados salvos no aparelho");
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

// ============================================================================
// NOTIFICAÇÕES DO SISTEMA (iPhone 16.4+ com o app na Tela de Início, Android e PC)
// Antes o app só pedia permissão, mas nunca chamava showNotification().
// ============================================================================
const STORAGE_KEY_VISTOS = "IFS_NOTIF_VISTOS_V1";

function verificarNovidadesENotificar() {
  if (!usuarioLogado) return;

  const atuais = {};
  // Aulas de colegas precisando de substituto
  for (const prof in bancoDeDados) {
    (bancoDeDados[prof] || []).forEach((a) => {
      if (a.status === "alert" && prof !== usuarioLogado) {
        atuais[`falta:${prof}:${a.id}:${a.dataFalta || ""}`] =
          { titulo: "🔴 Aula precisando de substituto", corpo: `${escAviso(a.disc)} (${escAviso(a.turma)}) – ${escAviso(a.dia)} ${escAviso(a.hora)} • Prof. ${prof}`, aba: "tab-livres" };
      }
      // Alguém assumiu uma aula minha
      if (a.status === "assumed" && prof === usuarioLogado && a.substituto) {
        atuais[`assumida:${a.id}:${a.substituto}:${a.dataFalta || ""}`] =
          { titulo: "✅ Sua aula foi assumida", corpo: `${escAviso(a.disc)} (${escAviso(a.turma)}) por Prof. ${a.substituto}`, aba: "tab-minha" };
      }
    });
  }
  // Trocas propostas para mim / respostas às minhas propostas
  API.getTrocas().forEach((t) => {
    if (t.colega === usuarioLogado && t.status === "pendente") {
      atuais[`troca:${t.id}`] = { titulo: "🔄 Nova proposta de troca", corpo: `Prof. ${escAviso(t.proponente)} quer trocar horários com você`, aba: "tab-trocas" };
    }
    if (t.proponente === usuarioLogado && (t.status === "aceita" || t.status === "recusada")) {
      atuais[`resp:${t.id}:${t.status}`] = { titulo: t.status === "aceita" ? "✅ Troca aceita" : "❌ Troca recusada", corpo: `Prof. ${escAviso(t.colega)} ${t.status} sua proposta`, aba: "tab-trocas" };
    }
  });

  let vistos = null;
  try { vistos = JSON.parse(localStorage.getItem(STORAGE_KEY_VISTOS + ":" + usuarioLogado)); } catch (e) {}
  const primeiraVez = !Array.isArray(vistos);
  const setVistos = new Set(primeiraVez ? [] : vistos);

  const novidades = Object.keys(atuais).filter(k => !setVistos.has(k));
  localStorage.setItem(STORAGE_KEY_VISTOS + ":" + usuarioLogado, JSON.stringify(Object.keys(atuais)));

  if (primeiraVez || novidades.length === 0) return; // não notifica o que já existia no 1º acesso

  if (novidades.length === 1) {
    const n = atuais[novidades[0]];
    exibirNotificacao(n.titulo, n.corpo, novidades[0], n.aba);
  } else {
    exibirNotificacao("📢 Painel Docente", `${novidades.length} novidades na grade e nas trocas`, "resumo", "tab-livres");
  }
}

function exibirNotificacao(titulo, corpo, tag, aba) {
  if (document.visibilityState === "visible") {
    mostrarToast(`${titulo}: ${corpo}`);
  }
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.showNotification(titulo, {
      body: corpo,
      tag: tag,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { aba: aba || "tab-minha" }
    }).catch(() => {});
  });
}

// Força a atualização do app no iPhone/navegador limpando caches e reiniciando
async function forcarAtualizacaoApp() {
  mostrarToast("Limpando cache e atualizando sistema...");
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  } catch (e) {
    console.warn("Aviso ao limpar caches:", e);
  }
  setTimeout(() => {
    window.location.href = window.location.origin + window.location.pathname + "?v_reload=" + Date.now();
  }, 400);
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
window.forcarAtualizacaoApp = forcarAtualizacaoApp;


// ============================================================================
// JANELAS DE AVISO E CONFIRMAÇÃO NO VISUAL DO APP (no lugar de alert/confirm)
// ============================================================================
function dialogoApp_(mensagem, comCancelar, rotuloOk) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "modal-overlay active dialogo-app";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "modal-card";
    const corpo = document.createElement("div");
    corpo.className = "modal-body dialogo-texto";
    corpo.textContent = String(mensagem == null ? "" : mensagem);
    const acoes = document.createElement("div");
    acoes.className = "dialogo-acoes";
    const fim = (v) => { document.removeEventListener("keydown", tecla, true); ov.remove(); resolve(v); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); fim(false); } };
    if (comCancelar) {
      const bc = document.createElement("button");
      bc.type = "button"; bc.className = "btn-dialogo btn-dialogo-sec"; bc.textContent = "Cancelar";
      bc.onclick = () => fim(false);
      acoes.appendChild(bc);
    }
    const bo = document.createElement("button");
    bo.type = "button"; bo.className = "btn-dialogo btn-dialogo-ok"; bo.textContent = rotuloOk || (comCancelar ? "Confirmar" : "Entendi");
    bo.onclick = () => fim(true);
    acoes.appendChild(bo);
    card.appendChild(corpo); card.appendChild(acoes); ov.appendChild(card);
    ov.addEventListener("click", (e) => { if (e.target === ov) fim(false); });
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(ov);
    setTimeout(() => bo.focus(), 30);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector(".dialogo-app") && document.querySelector(".modal-overlay.active")) fecharTodosModais();
});
function avisar(mensagem) { return dialogoApp_(mensagem, false); }
function confirmar(mensagem, rotuloOk) { return dialogoApp_(mensagem, true, rotuloOk); }
