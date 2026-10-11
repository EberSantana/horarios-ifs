/**
 * ==============================================================================
 * BACKEND GOOGLE APPS SCRIPT - SISTEMA DE HORÁRIOS, TROCAS E REPOSIÇÕES IFS
 * Campus Tobias Barreto • Sergipe
 * ==============================================================================
 * Funcionalidades:
 * 1. Tratamento Real de Concorrência via LockService (Impede que 2 professores
 *    assumam a mesma aula simultaneamente).
 * 2. Roteamento Inteligente de E-mails por Curso:
 *    - Turmas de DS (1º, 2º e 3º DS) -> Notifica Coordenador de DS
 *    - Turmas de ADM (1º, 2º e 3º ADM) -> Notifica Coordenador de ADM
 *    - Coordenação Geral / Direção de Ensino em cópia
 * 3. Gestão de Ausências, Substituições, Trocas (Permutas), Reposições e PIN.
 * 4. Função Mágica 'configurarPlanilhaInicial()': Cria e preenche automaticamente
 *    todas as abas e horários com 1 clique no editor do Apps Script!
 */

var CONFIG_PADRAO = {
  EMAIL_COORD_DS: "coordenacao.ds.tb@ifs.edu.br",
  EMAIL_COORD_ADM: "coordenacao.adm.tb@ifs.edu.br",
  EMAIL_COORD_GERAL: "coordenacao.tobiasbarreto@ifs.edu.br",
  EMAIL_DIRECAO: "direcao.tobiasbarreto@ifs.edu.br",
  DOMINIO_INSTITUCIONAL: "@ifs.edu.br",
  NOME_INSTITUICAO: "IFS Campus Tobias Barreto",
  LINK_PAINEL: "https://ebersantana.github.io/horarios-ifs/"
};

/**
 * Roteia automaticamente o e-mail para o coordenador específico do curso da turma
 */
function obterEmailsPorTurma(turma, config) {
  var cfg = config || CONFIG_PADRAO;
  var dests = [];
  var t = (turma || "").toUpperCase();

  // Verifica se a turma é de Desenvolvimento de Sistemas (DS)
  if (t.indexOf("DS") !== -1) {
    var emailDS = cfg.emailCoordDS || CONFIG_PADRAO.EMAIL_COORD_DS;
    if (emailDS) dests.push(emailDS);
  }
  // Verifica se a turma é de Administração (ADM)
  else if (t.indexOf("ADM") !== -1) {
    var emailADM = cfg.emailCoordADM || CONFIG_PADRAO.EMAIL_COORD_ADM;
    if (emailADM) dests.push(emailADM);
  }

  // Adiciona a Coordenação Pedagógica Geral (DEN)
  var emailGeral = cfg.emailCoordGeral || cfg.emailCoordenacao || CONFIG_PADRAO.EMAIL_COORD_GERAL;
  if (emailGeral && dests.indexOf(emailGeral) === -1) {
    dests.push(emailGeral);
  }

  if (dests.length === 0) {
    dests.push(CONFIG_PADRAO.EMAIL_COORD_GERAL);
  }

  return dests.join(", ");
}

/**
 * 1. REQUISIÇÕES GET (Retorna os horários e dados para o GitHub Pages)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetHorarios = ss.getSheetByName("Horarios");
    
    if (!sheetHorarios) {
      return criarRespostaJSON({ erro: "Aba 'Horarios' não encontrada na planilha. Execute 'configurarPlanilhaInicial()' primeiro." });
    }

    var rows = sheetHorarios.getDataRange().getValues();
    var cabecalho = rows.shift(); // Remove cabeçalho
    
    var bancoFormatado = {};

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var id = r[0] || ("ID-" + (i + 1));
      var professor = r[1];
      var dia = r[2];
      var hora = r[3];
      var turma = r[4];
      var disc = r[5];
      var status = r[6] || "normal";
      var substituto = r[7] || "";
      var obs = r[8] || "";
      var dataFalta = r[9] || "";

      if (!professor) continue;

      if (!bancoFormatado[professor]) {
        bancoFormatado[professor] = [];
      }

      bancoFormatado[professor].push({
        id: id,
        dia: dia,
        hora: hora,
        turma: turma,
        disc: disc,
        status: status,
        substituto: substituto,
        obs: obs,
        dataFalta: dataFalta,
        linhaExcel: i + 2
      });
    }

    return criarRespostaJSON(bancoFormatado);
  } catch (err) {
    return criarRespostaJSON({ erro: err.toString() });
  }
}

/**
 * 2. REQUISIÇÕES POST (Processa Liberações, Substituições, Trocas, Reposições e PIN)
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockObtido = lock.tryLock(10000); // Aguarda até 10 segundos

  if (!lockObtido) {
    return criarRespostaJSON({
      sucesso: false,
      erro: "O sistema está com alta demanda de concorrência. Por favor, tente novamente em alguns instantes."
    });
  }

  try {
    var dados = JSON.parse(e.postData.contents);
    var acao = dados.acao;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var config = dados.emailsConfig || CONFIG_PADRAO;

    // =========================================================================
    // CASO 1: ASSUMIR SUBSTITUIÇÃO (Com teste estrito de concorrência)
    // =========================================================================
    if (acao === "assumir") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var linhaAlvo = encontrarLinhaAula(sheetHorarios, dados.profOriginal, dados.index);
      
      if (linhaAlvo === -1) {
        lock.releaseLock();
        return criarRespostaJSON({ sucesso: false, erro: "Aula não localizada na planilha." });
      }

      var statusAtual = sheetHorarios.getRange(linhaAlvo, 7).getValue();
      if (statusAtual === "assumed") {
        var profAtual = sheetHorarios.getRange(linhaAlvo, 8).getValue();
        lock.releaseLock();
        return criarRespostaJSON({
          sucesso: false,
          concorrencia: true,
          erro: "Esta aula acabou de ser assumida pelo Prof. " + profAtual + " segundos atrás."
        });
      }

      sheetHorarios.getRange(linhaAlvo, 7).setValue("assumed");
      sheetHorarios.getRange(linhaAlvo, 8).setValue(dados.substituto);
      sheetHorarios.getRange(linhaAlvo, 9).setValue("Assumida por Prof. " + dados.substituto);

      var disc = sheetHorarios.getRange(linhaAlvo, 6).getValue();
      var turma = sheetHorarios.getRange(linhaAlvo, 5).getValue();
      var hora = sheetHorarios.getRange(linhaAlvo, 4).getValue();
      var dia = sheetHorarios.getRange(linhaAlvo, 3).getValue();

      var emailDest = obterEmailsPorTurma(turma, config);

      registrarHistorico(ss, "SUBSTITUICAO_ASSUMIDA", dados.profOriginal, dados.substituto, disc, turma, dia + " às " + hora, "");
      dispararEmailSubstituicaoAssumida(emailDest, dados.profOriginal, dados.substituto, disc, turma, dia, hora);

      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Substituição confirmada com sucesso!" });
    }

    // =========================================================================
    // CASO 2: LIBERTAR AULA (FALTA / AUSÊNCIA INDIVIDUAL OU MÚLTIPLOS TEMPOS)
    // =========================================================================
    else if (acao === "libertar" || acao === "libertar_multiplos") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var indices = acao === "libertar_multiplos" ? (dados.indices || []) : [dados.index];
      var turmasSet = [];
      var discsSet = [];
      var contagem = 0;

      for (var k = 0; k < indices.length; k++) {
        var idxAlvo = indices[k];
        var linhaAlvo = encontrarLinhaAula(sheetHorarios, dados.profOriginal, idxAlvo);
        
        if (linhaAlvo !== -1) {
          sheetHorarios.getRange(linhaAlvo, 7).setValue("alert");
          sheetHorarios.getRange(linhaAlvo, 8).setValue("");
          sheetHorarios.getRange(linhaAlvo, 9).setValue(dados.motivo ? "⚠️ " + dados.motivo : "⚠️ Prof. " + dados.profOriginal + " ausente");
          sheetHorarios.getRange(linhaAlvo, 10).setValue(dados.dataFalta);

          var disc = sheetHorarios.getRange(linhaAlvo, 6).getValue();
          var turma = sheetHorarios.getRange(linhaAlvo, 5).getValue();
          var hora = sheetHorarios.getRange(linhaAlvo, 4).getValue();
          var dia = sheetHorarios.getRange(linhaAlvo, 3).getValue();

          if (turmasSet.indexOf(turma) === -1) turmasSet.push(turma);
          if (discsSet.indexOf(disc) === -1) discsSet.push(disc);
          contagem++;

          registrarHistorico(ss, "AULA_DISPONIBILIZADA", dados.profOriginal, "", disc, turma, dia + " às " + hora, dados.dataFalta);
        }
      }

      if (contagem > 0) {
        var emailDest = turmasSet.map(function(t) { return obterEmailsPorTurma(t, config); }).join(", ");
        var descDiscs = discsSet.join(", ");
        var descTurmas = turmasSet.join(", ");
        dispararEmailAulaDisponibilizada(emailDest, dados.profOriginal, descDiscs, descTurmas, contagem > 1 ? contagem + " tempos" : "1 tempo", "", dados.dataFalta, dados.motivo);
      }

      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: contagem + " aula(s) liberada(s) e e-mail disparado para a coordenação!" });
    }

    // =========================================================================
    // CASO 3: PROPOR OU ACEITAR TROCA DE AULA (PERMUTA)
    // =========================================================================
    else if (acao === "propor_troca") {
      var t = dados.troca;
      var sheetTrocas = obterOuCriarAba(ss, "Trocas_Permutas", ["Data Registro", "ID", "Proponente", "Colega", "Aula Cedida", "Aula Desejada", "Data Prevista", "Justificativa", "Status"]);
      sheetTrocas.appendRow([
        new Date(),
        t.id,
        t.proponente,
        t.colega,
        t.aulaCedida.disc + " (" + t.aulaCedida.turma + ") - " + t.aulaCedida.dia + " " + t.aulaCedida.hora,
        t.aulaDesejada.disc + " (" + t.aulaDesejada.turma + ") - " + t.aulaDesejada.dia + " " + t.aulaDesejada.hora,
        t.dataPrevista,
        t.motivo || "-",
        "Pendente"
      ]);

      var emailDest = obterEmailsPorTurma(t.aulaCedida.turma, config);
      dispararEmailPropostaTroca(emailDest, t);

      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Proposta de permuta enviada e notificada ao coordenador!" });
    }

    else if (acao === "aceitar_troca") {
      var t = dados.troca;
      var emailDest = obterEmailsPorTurma(t.aulaCedida.turma, config);
      dispararEmailTrocaConfirmada(emailDest, t);

      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Troca homologada com sucesso!" });
    }

    // =========================================================================
    // CASO 4: AGENDAR REPOSIÇÃO DE AULA
    // =========================================================================
    else if (acao === "agendar_reposicao") {
      var r = dados.reposicao;
      var sheetRep = obterOuCriarAba(ss, "Reposicoes", ["Data Registro", "ID", "Professor", "Disciplina", "Turma", "Data Reposição", "Horário", "Sala / Local", "Justificativa"]);
      sheetRep.appendRow([
        new Date(),
        r.id,
        r.professor,
        r.disciplina,
        r.turma,
        r.data,
        r.horario,
        r.sala,
        r.motivo || "-"
      ]);

      var emailDest = obterEmailsPorTurma(r.turma, config);
      dispararEmailReposicao(emailDest, r);

      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Reposição de aula registrada e enviada ao coordenador do curso!" });
    }

    // =========================================================================
    // CASO 5: RECUPERAR PIN ESQUECIDO (Reset para 1234 e envio por e-mail)
    // =========================================================================
    else if (acao === "recuperar_pin") {
      var prof = dados.professor;
      var emailProf = dados.email;
      var sheetProfs = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
      var rows = sheetProfs.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === prof) {
          sheetProfs.getRange(i + 1, 4).setValue("1234");
          break;
        }
      }
      dispararEmailRecuperacaoPin(emailProf, prof, "1234");
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "PIN resetado para 1234 e notificado por e-mail!" });
    }

    // =========================================================================
    // CASO 6: RESTAURAR AULA AO NORMAL
    // =========================================================================
    else if (acao === "recuperar" || acao === "cancelar") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var linhaAlvo = encontrarLinhaAula(sheetHorarios, dados.profOriginal, dados.index);
      if (linhaAlvo !== -1) {
        sheetHorarios.getRange(linhaAlvo, 7).setValue("normal");
        sheetHorarios.getRange(linhaAlvo, 8).setValue("");
        sheetHorarios.getRange(linhaAlvo, 9).setValue("Aula confirmada");
        sheetHorarios.getRange(linhaAlvo, 10).setValue("");
      }
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Aula restaurada ao estado original." });
    }

    lock.releaseLock();
    return criarRespostaJSON({ sucesso: false, erro: "Ação não suportada." });

  } catch (err) {
    lock.releaseLock();
    return criarRespostaJSON({ sucesso: false, erro: err.toString() });
  }
}

/**
 * ==============================================================================
 * FUNÇÃO MÁGICA: CONFIGURAR PLANILHA INICIAL (EXECUTE ESTA FUNÇÃO COM 1 CLIQUE!)
 * ==============================================================================
 * Cria automaticamente as 5 abas, preenche todos os 21 professores, seus e-mails,
 * seus PINs e a grade horária das turmas de DS (1º, 2º e 3º DS) e ADM (1º, 2º e 3º ADM).
 */
function configurarPlanilhaInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Aba 'Horarios'
  var sheetH = obterOuCriarAba(ss, "Horarios", ["ID", "Professor", "Dia", "Hora", "Turma", "Disciplina", "Status", "Substituto", "Obs", "DataFalta"]);
  formatarCabecalho(sheetH, "#1b5e20");

  var gradeExemplo = [
    ["EB-1", "Eber", "Quinta-feira", "14:20 - 15:10", "1º DS", "CS1 - A", "normal", "", "Aula confirmada", ""],
    ["EB-2", "Eber", "Quinta-feira", "15:10 - 16:00", "1º DS", "CS1 - B", "normal", "", "Aula confirmada", ""],
    ["EB-3", "Eber", "Sexta-feira", "12:00 - 12:40", "1º DS", "Banco de Dados e Eng. Soft", "normal", "", "Aula confirmada", ""],
    ["EB-4", "Eber", "Quarta-feira", "08:40 - 09:30", "3º DS", "Projeto Integrador", "normal", "", "Aula confirmada", ""],
    ["EB-5", "Eber", "Quarta-feira", "09:30 - 10:20", "3º DS", "Projeto Integrador", "normal", "", "Aula confirmada", ""],
    ["AD-1", "Adriano", "Sexta-feira", "14:20 - 15:10", "1º ADM", "Artes", "normal", "", "Aula confirmada", ""],
    ["AL-1", "Alex", "Quinta-feira", "08:40 - 09:30", "1º ADM", "História", "normal", "", "Aula confirmada", ""],
    ["AY-1", "Alyrio", "Segunda-feira", "08:40 - 09:30", "3º ADM", "Matemática", "normal", "", "Aula confirmada", ""],
    ["AY-2", "Alyrio", "Terça-feira", "08:40 - 09:30", "1º ADM", "Matemática", "alert", "", "⚠️ Prof. Alyrio ausente (Consulta Médica)", "Próxima Terça"],
    ["AG-1", "Ângelo", "Terça-feira", "11:50 - 12:40", "1º DS", "Programação 1 - A", "normal", "", "Aula confirmada", ""],
    ["CH-1", "Christiano", "Quarta-feira", "08:40 - 09:30", "1º DS", "Tópicos Especiais", "normal", "", "Aula confirmada", ""],
    ["CH-3", "Christiano", "Sexta-feira", "09:30 - 10:20", "3º DS", "Segurança de Sistemas", "normal", "", "Aula confirmada", ""],
    ["ER-1", "Eric", "Quinta-feira", "08:40 - 09:30", "2º DS", "Programação 2 - B", "normal", "", "Aula confirmada", ""],
    ["ER-3", "Eric", "Segunda-feira", "10:20 - 11:10", "3º DS", "Desenvolvimento Web & Mobile", "normal", "", "Aula confirmada", ""],
    ["FL-1", "Felippe", "Quarta-feira", "08:40 - 09:30", "2º ADM", "Matemática Financeira", "normal", "", "Aula confirmada", ""],
    ["FE-1", "Fernanda", "Segunda-feira", "08:40 - 09:30", "1º DS", "Inglês", "normal", "", "Aula confirmada", ""],
    ["FE-2", "Fernanda", "Terça-feira", "10:20 - 11:10", "2º DS", "Português", "assumed", "Luiz Felipe", "Substituição confirmada", ""],
    ["FE-3", "Fernanda", "Terça-feira", "11:50 - 12:40", "3º DS", "Inglês Instrumental", "normal", "", "Aula confirmada", ""],
    ["GR-1", "Grayce", "Segunda-feira", "12:00 - 12:50", "2º ADM", "Gestão de Projetos", "normal", "", "Aula confirmada", ""],
    ["LF-1", "Luiz Felipe", "Segunda-feira", "08:40 - 09:30", "2º ADM", "Informática Básica", "normal", "", "Aula confirmada", ""],
    ["PE-1", "Pedro Ernesto", "Sexta-feira", "08:40 - 09:30", "1º DS", "Química", "normal", "", "Aula confirmada", ""],
    ["PG-1", "Pedro Goes", "Quarta-feira", "09:30 - 10:20", "1º ADM", "Administração Geral", "normal", "", "Aula confirmada", ""],
    ["RA-1", "Raisa", "Sexta-feira", "10:20 - 11:10", "1º ADM", "Biologia", "normal", "", "Aula confirmada", ""],
    ["SA-1", "Sanderson", "Segunda-feira", "08:40 - 09:30", "1º ADM", "Educação Física", "normal", "", "Aula confirmada", ""],
    ["SE-1", "Sérgio", "Segunda-feira", "13:30 - 14:20", "1º ADM", "Administração Mercadológica", "normal", "", "Aula confirmada", ""],
    ["VA-1", "Vagner", "Sexta-feira", "08:40 - 09:30", "1º ADM", "Física", "normal", "", "Aula confirmada", ""],
    ["VI-1", "Vinicius", "Quarta-feira", "10:20 - 11:10", "1º DS", "Filosofia", "normal", "", "Aula confirmada", ""],
    ["VT-1", "Vitor", "Quinta-feira", "10:20 - 11:10", "1º ADM", "Geografia", "normal", "", "Aula confirmada", ""],
    ["WE-1", "Weder", "Terça-feira", "08:40 - 09:30", "2º ADM", "Sociologia", "normal", "", "Aula confirmada", ""],
    ["WK-1", "Welkson", "Quinta-feira", "08:40 - 09:30", "3º ADM", "Gestão da Operação", "normal", "", "Aula confirmada", ""]
  ];

  if (sheetH.getLastRow() <= 1) {
    for (var i = 0; i < gradeExemplo.length; i++) {
      sheetH.appendRow(gradeExemplo[i]);
    }
  }

  // 2. Aba 'Professores' (Com os 21 professores, seus e-mails e PINs)
  var sheetP = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
  formatarCabecalho(sheetP, "#1565c0");

  var listaProfs = [
    ["Eber", "eber.santana@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Adriano", "adriano@ifs.edu.br", "Administração", "1234"],
    ["Alex", "alex@ifs.edu.br", "Administração", "1234"],
    ["Alyrio", "alyrio@ifs.edu.br", "Administração", "1234"],
    ["Ângelo", "angelo@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Christiano", "christiano@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Eric", "eric@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Felippe", "felippe@ifs.edu.br", "Administração", "1234"],
    ["Fernanda", "fernanda@ifs.edu.br", "Propedêutica / Línguas", "1234"],
    ["Grayce", "grayce@ifs.edu.br", "Administração", "1234"],
    ["Luiz Felipe", "luiz.felipe@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Pedro Ernesto", "pedro.ernesto@ifs.edu.br", "Propedêutica / Química", "1234"],
    ["Pedro Goes", "pedro.goes@ifs.edu.br", "Administração", "1234"],
    ["Raisa", "raisa@ifs.edu.br", "Propedêutica / Biologia", "1234"],
    ["Sanderson", "sanderson@ifs.edu.br", "Propedêutica / Ed. Física", "1234"],
    ["Sérgio", "sergio@ifs.edu.br", "Administração", "1234"],
    ["Vagner", "vagner@ifs.edu.br", "Propedêutica / Física", "1234"],
    ["Vinicius", "vinicius@ifs.edu.br", "Propedêutica / Filosofia", "1234"],
    ["Vitor", "vitor@ifs.edu.br", "Propedêutica / Geografia", "1234"],
    ["Weder", "weder@ifs.edu.br", "Administração", "1234"],
    ["Welkson", "welkson@ifs.edu.br", "Administração", "1234"]
  ];

  if (sheetP.getLastRow() <= 1) {
    for (var j = 0; j < listaProfs.length; j++) {
      sheetP.appendRow(listaProfs[j]);
    }
  }

  // 3. Demais abas
  var sheetT = obterOuCriarAba(ss, "Trocas_Permutas", ["Data Registro", "ID", "Proponente", "Colega", "Aula Cedida", "Aula Desejada", "Data Prevista", "Justificativa", "Status"]);
  formatarCabecalho(sheetT, "#7b1fa2");

  var sheetR = obterOuCriarAba(ss, "Reposicoes", ["Data Registro", "ID", "Professor", "Disciplina", "Turma", "Data Reposição", "Horário", "Sala / Local", "Justificativa"]);
  formatarCabecalho(sheetR, "#0288d1");

  var sheetHist = obterOuCriarAba(ss, "Historico", ["Data/Hora Registro", "Tipo de Ação", "Professor Titular", "Professor Substituto", "Disciplina", "Turma", "Horário", "Data da Aula"]);
  formatarCabecalho(sheetHist, "#455a64");

  Logger.log("Planilha configurada com sucesso com todas as abas e professores!");
}

function formatarCabecalho(sheet, corFundo) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  header.setBackground(corFundo);
  header.setFontColor("#ffffff");
  header.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/**
 * Funções Auxiliares de Busca e Planilhas
 */
function encontrarLinhaAula(sheet, prof, indexAlvo) {
  var rows = sheet.getDataRange().getValues();
  var contador = 0;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === prof) {
      if (contador === indexAlvo) return i + 1;
      contador++;
    }
  }
  return -1;
}

function obterOuCriarAba(ss, nome, cabecalhos) {
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    sheet.appendRow(cabecalhos);
  }
  return sheet;
}

function registrarHistorico(ss, tipo, profOrig, profSubs, disc, turma, horario, dataAula) {
  try {
    var sheetHist = obterOuCriarAba(ss, "Historico", ["Data/Hora Registro", "Tipo de Ação", "Professor Titular", "Professor Substituto", "Disciplina", "Turma", "Horário", "Data da Aula"]);
    sheetHist.appendRow([new Date(), tipo, profOrig, profSubs || "-", disc, turma, horario, dataAula || "-"]);
  } catch (e) {
    console.warn("Aviso ao registrar histórico:", e);
  }
}

/**
 * ==============================================================================
 * DISPARADORES DE E-MAIL INSTITUCIONAL VIA GMAIL / APPS SCRIPT
 * ==============================================================================
 */
function dispararEmailAulaDisponibilizada(destinatario, prof, disc, turma, dia, hora, dataFalta, motivo) {
  try {
    var assunto = "🔴 [SUBSTITUIÇÃO DISPONÍVEL] " + disc + " (" + turma + ") - Prof. " + prof;
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #d32f2f; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Aviso de Horário para Substituição</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>O <strong>Prof. " + prof + "</strong> informou ausência e liberou o seguinte horário no painel:</p>" +
      "    <p><strong>Disciplina:</strong> " + disc + " (" + turma + ")<br>" +
      "    <strong>Horário:</strong> " + dia + " às " + hora + "<br>" +
      "    <strong>Data Prevista:</strong> " + (dataFalta || "Próxima ocorrência") + "<br>" +
      (motivo ? "<strong>Motivo:</strong> " + motivo : "") + "</p>" +
      "    <p style='margin-top: 20px;'><a href='" + CONFIG_PADRAO.LINK_PAINEL + "' style='background: #1b5e20; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;'>Acessar Painel para Assumir</a></p>" +
      "  </div>" +
      "</div>";

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao enviar e-mail de falta:", e);
  }
}

function dispararEmailSubstituicaoAssumida(destinatario, profOrig, profSubs, disc, turma, dia, hora) {
  try {
    var assunto = "✅ [SUBSTITUIÇÃO CONFIRMADA] " + disc + " (" + turma + ") assumida por Prof. " + profSubs;
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #1b5e20; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Substituição Homologada</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>A aula de <strong>" + disc + " (" + turma + ")</strong> do <strong>Prof. " + profOrig + "</strong> (" + dia + " às " + hora + ") foi <strong>assumida pelo Prof. " + profSubs + "</strong>.</p>" +
      "    <p style='color: #2e7d32; font-weight: bold;'>O registro oficial foi atualizado na planilha de horários.</p>" +
      "  </div>" +
      "</div>";

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao enviar e-mail de substituição:", e);
  }
}

function dispararEmailPropostaTroca(destinatario, t) {
  try {
    var assunto = "🔄 [PROPOSTA DE PERMUTA] Prof. " + t.proponente + " solicitou troca com Prof. " + t.colega;
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #7b1fa2; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Proposta de Troca de Horários (Permuta)</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>O <strong>Prof. " + t.proponente + "</strong> propôs uma troca de horários com o <strong>Prof. " + t.colega + "</strong>:</p>" +
      "    <p>📤 <strong>Aula cedida:</strong> " + t.aulaCedida.disc + " (" + t.aulaCedida.turma + ") - " + t.aulaCedida.dia + " às " + t.aulaCedida.hora + "<br>" +
      "    📥 <strong>Aula desejada:</strong> " + t.aulaDesejada.disc + " (" + t.aulaDesejada.turma + ") - " + t.aulaDesejada.dia + " às " + t.aulaDesejada.hora + "<br>" +
      "    📅 <strong>Data Prevista:</strong> " + t.dataPrevista + "<br>" +
      "    📌 <strong>Motivo:</strong> " + (t.motivo || "Acordo mútuo") + "</p>" +
      "    <p>Para aceitar ou recusar, acesse o painel na aba <em>Trocas & Reposições</em>.</p>" +
      "  </div>" +
      "</div>";

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao enviar e-mail de permuta:", e);
  }
}

function dispararEmailTrocaConfirmada(destinatario, t) {
  try {
    var assunto = "✅ [PERMUTA CONFIRMADA] Troca aceita entre Prof. " + t.proponente + " e Prof. " + t.colega;
    var corpoHtml = "<p>A proposta de troca de horário entre o <strong>Prof. " + t.proponente + "</strong> e o <strong>Prof. " + t.colega + "</strong> foi <strong>confirmada e registrada</strong>.</p>";
    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao confirmar permuta:", e);
  }
}

function dispararEmailReposicao(destinatario, r) {
  try {
    var assunto = "📅 [REPOSIÇÃO AGENDADA] " + r.disciplina + " (" + r.turma + ") - Prof. " + r.professor;
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #0288d1; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Agendamento de Reposição de Aula</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>O <strong>Prof. " + r.professor + "</strong> agendou uma reposição de aula:</p>" +
      "    <p><strong>Disciplina:</strong> " + r.disciplina + " (" + r.turma + ")<br>" +
      "    <strong>Data da Reposição:</strong> " + r.data + "<br>" +
      "    <strong>Horário:</strong> " + r.horario + "<br>" +
      "    <strong>Local / Sala:</strong> " + r.sala + "<br>" +
      (r.motivo ? "<strong>Justificativa / Referência:</strong> " + r.motivo : "") + "</p>" +
      "  </div>" +
      "</div>";

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao enviar e-mail de reposição:", e);
  }
}

function dispararEmailRecuperacaoPin(destinatario, prof, pinPadrao) {
  try {
    var assunto = "🔑 [SEGURANÇA IFS] Redefinição de PIN de Acesso - Painel Docente";
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #1b5e20; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Recuperação de PIN de Acesso</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>Olá, <strong>Prof. " + prof + "</strong>,</p>" +
      "    <p>Recebemos uma solicitação de redefinição de PIN para o seu perfil no Painel Docente.</p>" +
      "    <p>O seu PIN foi redefinido temporariamente para:</p>" +
      "    <p style='text-align: center; margin: 20px 0;'><span style='background: #e8f5e9; color: #1b5e20; font-size: 28px; font-weight: 800; letter-spacing: 6px; padding: 10px 24px; border-radius: 8px; display: inline-block;'>" + pinPadrao + "</span></p>" +
      "    <p>Assim que acessar o painel, você pode alterá-lo no menu de configurações (⚙️) no canto superior direito.</p>" +
      "  </div>" +
      "</div>";

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
  } catch (e) {
    console.warn("Erro ao enviar e-mail de recuperação de PIN:", e);
  }
}

function criarRespostaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
