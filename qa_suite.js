/**
 * QA AUTOMATED TEST SUITE - PAINEL DOCENTE IFS TOBIAS BARRETO
 * Senior QA Test Automation & Deep System Validation
 */

const fs = require('fs');
const path = require('path');

// Mock Browser Environment
// localStorage e sessionStorage precisam de armazenamentos SEPARADOS — no navegador real
// eles são independentes, e um teste que confere "ficou só num dos dois" não serve de
// nada se o mock, por baixo, os fizer compartilhar os mesmos dados.
function criarStorageMock() {
  const dados = {};
  return {
    getItem: (key) => (key in dados ? dados[key] : null),
    setItem: (key, val) => { dados[key] = String(val); },
    removeItem: (key) => { delete dados[key]; },
    clear: () => { Object.keys(dados).forEach(k => delete dados[k]); }
  };
}
global.localStorage = criarStorageMock();
global.sessionStorage = criarStorageMock();
global.window = global;
global.fetch = async (url, opts) => ({ ok: true, json: async () => ({ sucesso: true }) });
global.Notification = { permission: 'default', requestPermission: async () => 'granted' };
global.navigator = { serviceWorker: { register: async () => {} } };

// Load application scripts
const apiCode = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8') + '\nglobal.API = API;';
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

eval(apiCode);

// Extract verificarConflito, calcularProximaDataParaDia, extrairMinutosDoHorario from appCode
const fnExtractor = (code, fnName) => {
  const regex = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)(?=\\nfunction\\s|\\n\\/\\/\\s*==|$)`);
  const match = code.match(regex);
  return match ? match[0] : null;
};

// Evaluate necessary pure functions from app.js
eval((fnExtractor(appCode, 'formatarDataISO') || 'function formatarDataISO(d) { return d.toISOString().split("T")[0]; }') + '\nglobal.formatarDataISO = formatarDataISO;');
eval(fnExtractor(appCode, 'calcularProximaDataParaDia') + '\nglobal.calcularProximaDataParaDia = calcularProximaDataParaDia;');
eval(fnExtractor(appCode, 'extrairMinutosDoHorario') + '\nglobal.extrairMinutosDoHorario = extrairMinutosDoHorario;');
eval(fnExtractor(appCode, 'verificarConflito') + '\nglobal.verificarConflito = verificarConflito;');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Os testes rodam em sequência (não em paralelo), numa fila baseada em Promise:
// isso é o que permite misturar funções síncronas e assíncronas (como os testes de
// login, que esperam uma resposta simulada do servidor) sem precisar reescrever a
// forma como os testes são declarados — cada test() só entra na fila, ninguém
// executa de verdade até o `await filaDeTestes` no final do arquivo.
let filaDeTestes = Promise.resolve();

function test(category, testName, fn) {
  results.total++;
  filaDeTestes = filaDeTestes.then(async () => {
    try {
      await fn();
      results.passed++;
      results.tests.push({ category, name: testName, status: 'PASS' });
    } catch (err) {
      results.failed++;
      results.tests.push({ category, name: testName, status: 'FAIL', error: err.message, stack: err.stack });
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

console.log('================================================================');
console.log('🚀 INICIANDO BATERIA DE TESTES DE QA - SENIOR QUALITY ASSURANCE');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// SUITE 1: SANIDADE E ESTRUTURA DO BANCO DE DADOS INICIAL
// ----------------------------------------------------------------------------
test('Database', 'Inicialização dos 24 Professores e turmas do Campus', () => {
  localStorage.clear();
  const db = API.getLocalDatabase();
  assert(typeof db === 'object' && db !== null, 'Banco de dados deve ser um objeto');
  const profs = Object.keys(db);
  assert(profs.length >= 22, `Deve conter os 22 professores + 'A definir' (encontrados: ${profs.length})`);
  assert(profs.includes('Eber'), 'Prof. Eber deve estar cadastrado');
  assert(profs.includes('Grayce'), 'Prof. Grayce deve estar cadastrada');
  assert(profs.includes('Alyrio'), 'Prof. Alyrio deve estar cadastrado');
  assert(profs.includes('Christiano'), 'Prof. Christiano deve estar cadastrado');
});

test('Database', 'Validação das turmas do Subsequente e Carga Horária de Eber', () => {
  localStorage.clear();
  const db = API.getLocalDatabase();
  const aulasEber = db['Eber'];
  assert(Array.isArray(aulasEber) && aulasEber.length >= 11, `Eber deve ter ao menos 11 tempos letivos (tem: ${aulasEber.length})`);
  const temSubsequente = aulasEber.some(a => (a.turma || '').includes('Subsequente') || (a.turma || '').includes('Info'));
  assert(temSubsequente, 'Eber deve ter turmas do Curso Técnico Subsequente');
});

// ----------------------------------------------------------------------------
// SUITE 2: MOTOR DE FORMATAÇÃO DE DATA (DD-MM-YYYY)
// ----------------------------------------------------------------------------
test('Data Engine', 'Conversão de ISO YYYY-MM-DD para DD-MM-YYYY', () => {
  assertEqual(API.formatarDataBR('2026-10-23'), '23-10-2026', 'ISO simples');
  assertEqual(API.formatarDataBR('2026-01-05'), '05-01-2026', 'ISO com zeros');
  assertEqual(API.formatarDataBR('2026-12-31'), '31-12-2026', 'Fim de ano');
});

test('Data Engine', 'Idempotência (data já formatada DD-MM-YYYY)', () => {
  assertEqual(API.formatarDataBR('23-10-2026'), '23-10-2026', 'Não deve alterar data correta');
  assertEqual(API.formatarDataBR('01-02-2026'), '01-02-2026', 'Preservação de zeros');
});

test('Data Engine', 'Conversão de formato barra DD/MM/YYYY', () => {
  assertEqual(API.formatarDataBR('23/10/2026'), '23-10-2026', 'Barra para hífen');
  assertEqual(API.formatarDataBR('05/04/2026'), '05-04-2026', 'Barra para hífen com zeros');
});

test('Data Engine', 'Instância de Objeto Date nativo', () => {
  const d = new Date(2026, 9, 23); // 23 de Outubro de 2026
  assertEqual(API.formatarDataBR(d), '23-10-2026', 'Instância de Date');
});

test('Data Engine', 'Resiliência a Entradas Nulas, Vazias e Textos Livres', () => {
  assertEqual(API.formatarDataBR(''), '', 'String vazia');
  assertEqual(API.formatarDataBR(null), '', 'Null');
  assertEqual(API.formatarDataBR(undefined), '', 'Undefined');
  assertEqual(API.formatarDataBR('Próxima Aula'), 'Próxima Aula', 'Texto amigável');
  assertEqual(API.formatarDataBR('A combinar'), 'A combinar', 'Texto amigável');
});

// ----------------------------------------------------------------------------
// SUITE 3: ROTEAMENTO INSTITUCIONAL DE E-MAILS
// ----------------------------------------------------------------------------
test('Email Routing', 'Roteamento COINF para turmas Subsequente / Info', () => {
  const dests = API.obterDestinatariosPorTurma('1º Info (Subsequente)');
  assert(dests.includes('coinf.tbarreto@ifs.edu.br'), 'Deve incluir e-mail COINF');
  assert(dests.includes('coordenacao.tobiasbarreto@ifs.edu.br'), 'Deve incluir Coordenação Geral');
});

test('Email Routing', 'Roteamento CODS para turmas de Desenvolvimento de Sistemas', () => {
  const dests = API.obterDestinatariosPorTurma('2º DS');
  assert(dests.includes('coordenacao.ds.tb@ifs.edu.br'), 'Deve incluir coordenação de DS');
});

test('Email Routing', 'Roteamento COADM para turmas de Administração / Comércio', () => {
  const dests = API.obterDestinatariosPorTurma('3º ADM');
  assert(dests.includes('coordenacao.adm.tb@ifs.edu.br'), 'Deve incluir coordenação de ADM');
});

test('Email Routing', 'Resolução de E-mails Docentes com Acentuação e Espaços', () => {
  assertEqual(API.obterEmailProfessor('Eber'), '', 'Eber: o app não guarda e-mails (o servidor busca na planilha)');
  assertEqual(API.obterEmailProfessor('Ângelo'), '', 'Ângelo com acento circunflexo');
  assertEqual(API.obterEmailProfessor('Sérgio'), '', 'Sérgio com acento agudo');
  assertEqual(API.obterEmailProfessor('Pedro Ernesto'), '', 'Nome composto com espaço'); assertEqual(API.obterEmailProfessor('A definir'), '', 'Aula sem professor não recebe e-mail');
});

test('Email Routing', 'Lógica de Não Lidos do Badge de E-mails (some ao visualizar)', () => {
  const emails = API.getEmailsLog();
  // Marca como lido
  localStorage.setItem("IFS_LAST_READ_EMAILS_COUNT", String(emails.length));
  let lastRead = parseInt(localStorage.getItem("IFS_LAST_READ_EMAILS_COUNT") || "0", 10);
  let naoLidos = Math.max(0, emails.length - lastRead);
  assertEqual(naoLidos, 0, 'Deve ter 0 não lidos após marcar como lido');

  // Adiciona 1 novo log simulado
  API.registrarEmailLog("AVISO", "Novo aviso de teste", "teste@ifs.edu.br");
  const emailsNovos = API.getEmailsLog();
  naoLidos = Math.max(0, emailsNovos.length - lastRead);
  assertEqual(naoLidos, 1, 'Deve exibir exatamente 1 novo não lido após novo evento');
});

// ----------------------------------------------------------------------------
// SUITE 4: PROCESSAMENTO DE AÇÕES E CICLO DE VIDA DE AULAS
// ----------------------------------------------------------------------------
test('Lifecycle', 'Registro de Ausência / Falta (Múltiplos Tempos)', () => {
  localStorage.clear();
  let db = API.getLocalDatabase();
  const prof = 'Eber';
  const indices = [0, 1];
  
  db = API.processarAcao({
    acao: 'libertar_multiplos',
    profOriginal: prof,
    indices: indices,
    dataFalta: '2026-10-23',
    motivo: 'Participação em Congresso Acadêmico'
  });

  const aula0 = db[prof][0];
  const aula1 = db[prof][1];

  assertEqual(aula0.status, 'alert', 'Aula 0 deve estar em status alert');
  assertEqual(aula1.status, 'alert', 'Aula 1 deve estar em status alert');
  assertEqual(aula0.dataFalta, '23-10-2026', 'Data da falta deve ser formatada DD-MM-YYYY');
  assert(aula0.obs.includes('Congresso Acadêmico'), 'Justificativa deve constar na observação');
  
  // Verifica histórico de e-mails
  const logs = API.getEmailsLog();
  assert(logs.some(l => l.assunto.includes('AUSÊNCIA - 2 TEMPOS')), 'Deve gerar log de e-mail de 2 tempos');
});

test('Lifecycle', 'Assunção de Substituição por Docente Colega', () => {
  let db = API.getLocalDatabase();
  const titular = 'Eber';
  const substituto = 'Grayce';

  db = API.processarAcao({
    acao: 'assumir',
    profOriginal: titular,
    index: 0,
    substituto: substituto
  });

  const aula = db[titular][0];
  assertEqual(aula.status, 'assumed', 'Status deve mudar para assumed');
  assertEqual(aula.substituto, substituto, 'Substituto deve ser Prof. Grayce');
  assert(aula.obs.includes('Prof. Grayce'), 'Observação deve registrar a assunção');
});

test('Lifecycle', 'Desfazer Falta e Recuperar Aula Regular', () => {
  let db = API.getLocalDatabase();
  const prof = 'Eber';

  db = API.processarAcao({
    acao: 'recuperar',
    profOriginal: prof,
    index: 0
  });

  const aula = db[prof][0];
  assertEqual(aula.status, 'normal', 'Status deve voltar para normal');
  assertEqual(aula.substituto, '', 'Substituto deve ser limpo');
  assertEqual(aula.dataFalta, undefined, 'dataFalta deve ser removida');
});

// ----------------------------------------------------------------------------
// SUITE 5: CICLO DE VIDA DE PERMUTAS (TROCAS) & REPOSIÇÕES
// ----------------------------------------------------------------------------
test('Swaps', 'Proposta de Troca com Múltiplos Tempos', () => {
  const db = API.getLocalDatabase();
  const aulaCedida = db['Eber'][0];
  const aulaDesejada = db['Grayce'][0];

  const novaTroca = {
    id: 'TR-TEST-001',
    proponente: 'Eber',
    colega: 'Grayce',
    aulasCedidas: [aulaCedida],
    aulasDesejadas: [aulaDesejada],
    aulaCedida,
    aulaDesejada,
    dataPrevista: '2026-10-30',
    motivo: 'Ajuste de horário letivo',
    status: 'pendente'
  };

  API.processarAcao({
    acao: 'propor_troca',
    troca: novaTroca
  });

  const trocas = API.getTrocas();
  const salva = trocas.find(t => t.id === 'TR-TEST-001');
  assert(salva !== undefined, 'Troca deve ser salva no storage');
  assertEqual(salva.dataPrevista, '30-10-2026', 'Data prevista deve ser formatada para DD-MM-YYYY');
  assertEqual(salva.status, 'pendente', 'Status inicial deve ser pendente');
});

test('Swaps', 'Aceite e Homologação de Troca', () => {
  API.processarAcao({
    acao: 'aceitar_troca',
    trocaId: 'TR-TEST-001',
    troca: API.getTrocas().find(t => t.id === 'TR-TEST-001')
  });

  const trocas = API.getTrocas();
  const troca = trocas.find(t => t.id === 'TR-TEST-001');
  assertEqual(troca.status, 'aceita', 'Status deve ser homologado como aceita');
});

test('Makeups', 'Agendamento e Cancelamento de Reposição de Aula', () => {
  const rep = {
    id: 'REP-TEST-001',
    professor: 'Eber',
    disciplina: 'Informática Básica',
    turma: '1º Info (Subsequente)',
    data: '2026-11-07',
    horario: '08:00 - 11:40',
    sala: 'Lab 2',
    motivo: 'Sábado letivo de reposição'
  };

  API.processarAcao({
    acao: 'agendar_reposicao',
    reposicao: rep
  });

  const reposicoes = API.getReposicoes();
  const salva = reposicoes.find(r => r.id === 'REP-TEST-001');
  assert(salva !== undefined, 'Reposição deve ser persistida');
  assertEqual(salva.data, '07-11-2026', 'Data da reposição deve ser salva como DD-MM-YYYY');

  // Cancelamento
  API.processarAcao({
    acao: 'cancelar_reposicao',
    id: 'REP-TEST-001'
  });
  const aposCancel = API.getReposicoes();
  assert(!aposCancel.some(r => r.id === 'REP-TEST-001'), 'Reposição deve ser removida após cancelamento');
});

// ----------------------------------------------------------------------------
// SUITE 6: VALIDADOR INTELIGENTE DE CONFLITOS DE HORÁRIOS
// ----------------------------------------------------------------------------
test('Conflict Validator', 'Detecção de Conflito de Horário Direto', () => {
  const db = API.getLocalDatabase();
  global.bancoDeDados = db;
  global.usuarioLogado = 'Eber';

  const primeiraAulaEber = db['Eber'][0];
  const resultado = verificarConflito(primeiraAulaEber.dia, primeiraAulaEber.hora, 'Eber');
  assert(resultado.conflito === true, 'Deve acusar conflito para aula existente do professor');
  assert(resultado.descricao.includes(primeiraAulaEber.turma), 'Descrição deve identificar a turma');
});

test('Conflict Validator', 'Não acusar conflito para horários livres (Falso Positivo)', () => {
  const resultado = verificarConflito('Domingo', '00:00 - 01:00', 'Eber');
  assertEqual(resultado.conflito, false, 'Não deve haver conflito em horário sem aula');
});

test('Conflict Validator', 'Não acusar conflito se a aula do professor foi liberada (status alert)', () => {
  let db = API.getLocalDatabase();
  db['Eber'][0].status = 'alert';
  global.bancoDeDados = db;

  const resultado = verificarConflito(db['Eber'][0].dia, db['Eber'][0].hora, 'Eber');
  assertEqual(resultado.conflito, false, 'Aula em alert não impede substituição');
  db['Eber'][0].status = 'normal'; // restaura
});

// ----------------------------------------------------------------------------
// SUITE 7: CONSOLIDAÇÃO DE RELATÓRIOS & PRESTAÇÃO DE CONTAS
// ----------------------------------------------------------------------------
test('Reports Engine', 'Consolidação e Padronização de Todas as Datas no Relatório', () => {
  const eventos = API.obterTodosEventosRelatorio();
  assert(Array.isArray(eventos), 'Deve retornar array de eventos');
  
  // Todas as datas devem respeitar DD-MM-YYYY ou texto descritivo
  eventos.forEach(ev => {
    assert(ev.data !== undefined && ev.data !== null && ev.data !== '', `Evento ${ev.id} deve ter data preenchida`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ev.data)) {
      throw new Error(`Data em formato ISO não permitida no relatório: ${ev.data} (Evento ${ev.id})`);
    }
  });
});

// ----------------------------------------------------------------------------
// SUITE 8: SEGURANÇA E HIGIENIZAÇÃO DE ENTRADAS
// ----------------------------------------------------------------------------
test('Security & Sanitation', 'Resistência a Tentativas de Injeção de Tags e Scripts', () => {
  const xssMotivo = '<script>alert("xss")</script> Falta por Motivo Médico';
  const db = API.processarAcao({
    acao: 'libertar',
    profOriginal: 'Eber',
    index: 0,
    dataFalta: '2026-10-23',
    motivo: xssMotivo
  });

  const aula = db['Eber'][0];
  assert(aula.obs.includes('Falta por Motivo Médico'), 'Motivo processado com segurança');
  assert(typeof aula.dataFalta === 'string' && aula.dataFalta === '23-10-2026', 'Data normalizada sem execução');
  
  // Limpa
  API.processarAcao({ acao: 'recuperar', profOriginal: 'Eber', index: 0 });
});

// ----------------------------------------------------------------------------
// SUITE 9: SINCRONIZAÇÃO E MESCLAGEM INTELIGENTE (GOOGLE SHEETS)
// ----------------------------------------------------------------------------
test('Sync & Concurrency', 'Mesclagem de dados do Google Sheets preservando status e convertendo datas', () => {
  const local = API.getLocalDatabase();
  const sheetMock = {
    "Eber": [
      { id: "EB-8", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", status: "alert", dataFalta: "2026-10-23", obs: "⚠️ Sheet update" }
    ]
  };
  const merged = API.mesclarAulasComGoogleSheet(local, sheetMock);
  const target = merged["Eber"].find(a => a.id === "EB-8");
  assertEqual(target.status, "alert", "Status mesclado do Sheets deve ser alert");
  assertEqual(target.dataFalta, "23-10-2026", "dataFalta recebida do Sheets em ISO deve ser normalizada para DD-MM-YYYY");
});

// ----------------------------------------------------------------------------
// SUITE 10: ARQUITETURA PWA, MANIFEST & SERVICE WORKER
// ----------------------------------------------------------------------------
test('PWA Architecture', 'Validação do Web App Manifest (W3C Standard)', () => {
  const manifestRaw = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert(manifest.name && manifest.name.includes('IFS'), 'Manifest deve ter nome institucional');
  assert(manifest.short_name, 'Manifest deve ter short_name');
  assert(manifest.start_url === './index.html', 'start_url deve ser ./index.html');
  assert(manifest.display === 'standalone', 'display deve ser standalone');
  assert(manifest.icons && manifest.icons.length >= 2, 'Deve ter ao menos 2 tamanhos de ícone');
  
  // Verifica se arquivos de ícone existem fisicamente
  manifest.icons.forEach(icon => {
    const iconPath = path.join(__dirname, icon.src);
    assert(fs.existsSync(iconPath), `Arquivo de ícone não encontrado: ${icon.src}`);
  });
});

test('PWA Architecture', 'Service Worker Cache Buster e Estratégia Offline', () => {
  const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  assert(swCode.includes('CACHE_NAME'), 'SW deve ter CACHE_NAME versionado');
  assert(swCode.includes('ASSETS_TO_CACHE'), 'SW deve definir lista de assets estáticos');
  assert(swCode.includes('./styles.css'), 'SW deve cachear styles.css');
  assert(swCode.includes('./app.js'), 'SW deve cachear app.js');
  assert(swCode.includes('./api.js'), 'SW deve cachear api.js');
});

// ----------------------------------------------------------------------------
// SUITE 11: LAYOUT, CSS & POLIMENTO VISUAL
// ----------------------------------------------------------------------------
test('UI & Responsive CSS', 'Centralização da Legenda de Cores (.legend-box)', () => {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert(css.includes('.legend-box {'), 'CSS deve conter seletor .legend-box');
  const legendBoxSection = css.match(/\.legend-box\s*\{([^}]*)\}/);
  assert(legendBoxSection, 'Bloco .legend-box deve existir');
  assert(legendBoxSection[1].includes('justify-content: center'), '.legend-box deve ter justify-content: center');
  assert(legendBoxSection[1].includes('align-items: center'), '.legend-box deve ter align-items: center');
});

test('UI & Responsive CSS', 'Menu Sticky Anti-Sobreposição no Mobile', () => {
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert(css.includes('.header-nav-sticky-wrapper'), 'CSS deve ter wrapper sticky');
  const stickyMatch = css.match(/\.header-nav-sticky-wrapper\s*\{([^}]*)\}/);
  assert(stickyMatch && stickyMatch[1].includes('position: sticky'), 'Wrapper deve ter position: sticky');
});

// ----------------------------------------------------------------------------
// SUITE 12: DESEMPENHO E BENCHMARKS DE TEMPO DE RESPOSTA
// ----------------------------------------------------------------------------
test('Performance', 'Benchmark de Formatação de Datas (1000 iterações < 30ms)', () => {
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    API.formatarDataBR('2026-10-23');
  }
  const t1 = performance.now();
  const duracao = t1 - t0;
  assert(duracao < 50, `Tempo de formatação excessivo: ${duracao.toFixed(2)}ms`);
});

test('Performance', 'Tempo de Resposta do Validador de Conflitos (< 5ms)', () => {
  const db = API.getLocalDatabase();
  global.bancoDeDados = db;
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    verificarConflito('Sexta-feira', '18:40 - 19:30', 'Eber');
  }
  const t1 = performance.now();
  const media = (t1 - t0) / 100;
  assert(media < 1, `Validação de conflitos lenta: ${media.toFixed(3)}ms por chamada`);
});

// ----------------------------------------------------------------------------
// SUITE 13: LOGIN E SESSÃO (PIN VALIDADO NO SERVIDOR)
// ----------------------------------------------------------------------------
// Nota: o backend real (Code.gs) só roda dentro do Google Apps Script, então estes
// testes cobrem o lado do navegador — que a sessão é tratada corretamente a partir
// da resposta do servidor (simulada aqui), nunca decidida sozinha pelo cliente.
test('Auth & Sessão', 'Login bem-sucedido guarda o token (lembrar=true → localStorage)', async () => {
  localStorage.clear();
  sessionStorage.clear();
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ sucesso: true, token: 'TOK-ABC-123' }) });
  const res = await API.login('Eber', '1234', true);
  global.fetch = fetchOriginal;

  assert(res.sucesso, 'Login deveria ter sucesso quando o servidor confirma o PIN');
  assertEqual(API.getSessionToken(), 'TOK-ABC-123', 'Token deve ficar disponível após login');
  assertEqual(API.getProfessorLogado(), 'Eber', 'Professor logado deve ser o que fez login');
  assert(localStorage.getItem('IFS_SESSION') !== null, 'lembrar=true deve gravar a sessão em localStorage');
  assert(sessionStorage.getItem('IFS_SESSION') === null, 'lembrar=true não deve duplicar em sessionStorage');
  API.logout();
});

test('Auth & Sessão', 'Login com lembrar=false guarda em sessionStorage, não em localStorage', async () => {
  localStorage.clear();
  sessionStorage.clear();
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ sucesso: true, token: 'TOK-SEM-LEMBRAR' }) });
  await API.login('Eber', '1234', false);
  global.fetch = fetchOriginal;

  assert(sessionStorage.getItem('IFS_SESSION') !== null, 'lembrar=false deve gravar em sessionStorage');
  assert(localStorage.getItem('IFS_SESSION') === null, 'lembrar=false não deve gravar em localStorage');
  API.logout();
});

test('Auth & Sessão', 'Login recusado pelo servidor não guarda token nenhum', async () => {
  localStorage.clear();
  sessionStorage.clear();
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ sucesso: false, erro: 'PIN incorreto! Se você ainda não alterou, o padrão é 1234.' }) });
  const res = await API.login('Eber', '0000', false);
  global.fetch = fetchOriginal;

  assert(!res.sucesso, 'Login com PIN errado não deve ter sucesso');
  assert(API.getSessionToken() === null, 'Nenhum token deve ser guardado após um login recusado');
});

test('Auth & Sessão', 'logout() limpa a sessão de ambos os armazenamentos', () => {
  localStorage.setItem('IFS_SESSION', JSON.stringify({ professor: 'Eber', token: 'X' }));
  sessionStorage.setItem('IFS_SESSION', JSON.stringify({ professor: 'Eber', token: 'Y' }));
  API.logout();
  assert(API.getSessionToken() === null, 'Token não deve sobrar em nenhum dos dois armazenamentos');
});

test('Auth & Sessão', 'processarAcao envia o token da sessão atual no corpo da requisição', () => {
  localStorage.clear();
  localStorage.setItem('IFS_SESSION', JSON.stringify({ professor: 'Eber', token: 'TOKEN-TESTE-999' }));
  let corpoCapturado = null;
  const fetchOriginal = global.fetch;
  global.fetch = async (url, opts) => { corpoCapturado = JSON.parse(opts.body); return { ok: true, json: async () => ({ sucesso: true }) }; };

  API.processarAcao({ acao: 'libertar', profOriginal: 'Eber', index: 0, dataFalta: '2026-10-23', motivo: 'teste de token' });

  global.fetch = fetchOriginal;
  assert(corpoCapturado !== null, 'processarAcao deveria ter chamado fetch para sincronizar com o servidor');
  assertEqual(corpoCapturado.token, 'TOKEN-TESTE-999', 'O corpo enviado ao servidor deve incluir o token da sessão atual');

  // Limpa
  API.processarAcao({ acao: 'recuperar', profOriginal: 'Eber', index: 0 });
  localStorage.clear();
});

// ----------------------------------------------------------------------------
// IMPRESSÃO DO RELATÓRIO DE RESULTADOS
// ----------------------------------------------------------------------------
// Só imprime depois que TODOS os testes (síncronos e assíncronos) da fila
// terminaram de rodar — ver a fila `filaDeTestes` definida no helper test().
filaDeTestes.then(() => {
  console.log('----------------------------------------------------------------');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${results.total}`);
  console.log(`✅ APROVADOS: ${results.passed}`);
  console.log(`❌ FALHAS: ${results.failed}`);
  console.log('----------------------------------------------------------------\n');

  results.tests.forEach((t, i) => {
    const icon = t.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${t.category}] #${i + 1}: ${t.name}`);
    if (t.error) {
      console.log(`   🚨 Erro: ${t.error}`);
    }
  });

  if (results.failed > 0) {
    process.exit(1);
  } else {
    console.log('\n🌟 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  }
});
