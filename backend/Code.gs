/**
 * ==============================================================================
 * BACKEND GOOGLE APPS SCRIPT - SISTEMA DE HORÁRIOS, TROCAS E REPOSIÇÕES IFS
 * Campus Tobias Barreto • Sergipe
 * ==============================================================================
 * Funcionalidades:
 * 1. Tratamento Real de Concorrência via LockService (Impede que 2 professores
 *    assumam a mesma aula simultaneamente).
 * 2. Roteamento Inteligente de E-mails por Curso:
 *    - Subsequente em Informática -> coinf.tbarreto@ifs.edu.br
 *    - Desenvolvimento de Sistemas (DS) -> coordenacao.ds.tb@ifs.edu.br
 *    - Administração (ADM) -> coordenacao.adm.tb@ifs.edu.br
 *    - Coordenação Pedagógica Geral (DEN) -> coordenacao.tobiasbarreto@ifs.edu.br
 *    - Cópia de confirmação direta para a caixa de entrada do professor!
 * 3. Localização Inteligente de Aulas (por ID, Conteúdo ou Auto-Inserção Dinâmica)
 *    Evita falhas por diferença de índice entre cliente e planilha.
 * 4. Gestão completa de Ausências, Substituições, Trocas (Permutas), Reposições e PIN.
 * 5. Inicialização e Sincronização Completa de todas as turmas e 24 docentes.
 */

var CONFIG_PADRAO = {
  EMAIL_COORD_DS: "coordenacao.ds.tb@ifs.edu.br",
  EMAIL_COORD_ADM: "coordenacao.adm.tb@ifs.edu.br",
  EMAIL_COORD_SUBSEQUENTE: "coinf.tbarreto@ifs.edu.br",
  EMAIL_COORD_GERAL: "coordenacao.tobiasbarreto@ifs.edu.br",
  EMAIL_COORD_GRADUACAO: "cobad.ctb@ifs.edu.br", // COBAD — Bacharelado em Administração
  EMAIL_DIRECAO: "direcao.tobiasbarreto@ifs.edu.br",
  DOMINIO_INSTITUCIONAL: "@ifs.edu.br",
  NOME_INSTITUICAO: "IFS Campus Tobias Barreto",
  LINK_PAINEL: "https://ebersantana.github.io/horarios-ifs/"
};

// Função universal para padronização de datas no padrão brasileiro DD-MM-YYYY
function formatarDataBR(dataStr) {
  if (!dataStr) return "";
  if (dataStr instanceof Date) {
    var dia = ("0" + dataStr.getDate()).slice(-2);
    var mes = ("0" + (dataStr.getMonth() + 1)).slice(-2);
    var ano = dataStr.getFullYear();
    return dia + "-" + mes + "-" + ano;
  }
  var str = String(dataStr).trim();
  if (!str) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  var matchIso = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (matchIso) {
    return matchIso[3] + "-" + matchIso[2] + "-" + matchIso[1];
  }
  var matchBarra = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchBarra) {
    return matchBarra[1] + "-" + matchBarra[2] + "-" + matchBarra[3];
  }
  return str;
}

var EMAILS_DOCENTES = {
  "Eber": "eber.santana@ifs.edu.br",
  "Adriano": "adriano.vilela@ifs.edu.br",
  "Alex": "alexmar.santos@ifs.edu.br",
  "Alyrio": "alyrio.neto@ifs.edu.br",
  "Ângelo": "angelo.santos@ifs.edu.br",
  "Christiano": "christiano.santos@ifs.edu.br",
  "Elliot": "elliott.chaves@ifs.edu.br",
  "Emerson": "emerson.santos@ifs.edu.br",
  "Eric": "eric.sampaio@ifs.edu.br",
  "Felippe": "felippe.barros@ifs.edu.br",
  "Fernanda": "fernanda.bezerra@ifs.edu.br",
  "Grayce": "grayceane.jesus@ifs.edu.br",
  "Pedro Ernesto": "pedro.cruz@ifs.edu.br",
  "Pedro Goes": "pedro.gois@ifs.edu.br",
  "Luiz Rafael Freitas": "luiz.freitas@ifs.edu.br",
  "Raisa": "raisa.silveira@ifs.edu.br",
  "Sanderson": "sanderson.silva@ifs.edu.br",
  "Sérgio": "sergio.costa@ifs.edu.br",
  "Vinicius": "vinicius.canhoto@ifs.edu.br",
  "Vitor": "vitor.almeida@ifs.edu.br",
  "Weder": "weder.almeida@ifs.edu.br",
  "Claifton": "claifton.carmo@ifs.edu.br",
  "Érica Delfino": "erica.maria@ifs.edu.br",
  "Welkson": "welkson.nascimento@ifs.edu.br"
};

var GRADE_COMPLETA_OFICIAL = [
  ["AD-3","Adriano","Sexta-feira","12:40 - 13:30","3º DS","Artes","normal","","Aula confirmada",""],
  ["AD-4","Adriano","Sexta-feira","13:30 - 14:20","3º DS","Artes","normal","","Aula confirmada",""],
  ["AD-1","Adriano","Sexta-feira","14:20 - 15:10","1º ADM","Artes","normal","","Aula confirmada",""],
  ["AD-2","Adriano","Sexta-feira","15:10 - 16:00","1º ADM","Artes","normal","","Aula confirmada",""],
  ["AL-3","Alex","Quarta-feira","12:40 - 13:30","3º ADM","História","normal","","Aula confirmada",""],
  ["AL-4","Alex","Quarta-feira","13:30 - 14:20","3º ADM","História","normal","","Aula confirmada",""],
  ["AL-1","Alex","Quinta-feira","08:40 - 09:30","1º ADM","História","normal","","Aula confirmada",""],
  ["AL-5","Alex","Quinta-feira","09:30 - 10:20","1º ADM","História","normal","","Aula confirmada",""],
  ["AL-6","Alex","Quinta-feira","10:20 - 11:10","1º DS","História","normal","","Aula confirmada",""],
  ["AL-7","Alex","Quinta-feira","11:50 - 12:40","1º DS","História","normal","","Aula confirmada",""],
  ["AL-8","Alex","Sexta-feira","08:40 - 09:30","2º DS","História","normal","","Aula confirmada",""],
  ["AL-9","Alex","Sexta-feira","09:30 - 10:20","2º DS","História","normal","","Aula confirmada",""],
  ["AL-10","Alex","Sexta-feira","10:20 - 11:10","3º DS","História","normal","","Aula confirmada",""],
  ["AL-11","Alex","Sexta-feira","11:10 - 12:00","3º DS","História","normal","","Aula confirmada",""],
  ["AL-2","Alex","Sexta-feira","12:00 - 12:50","2º ADM","História","normal","","Aula confirmada",""],
  ["AL-12","Alex","Sexta-feira","13:30 - 14:20","2º ADM","História","normal","","Aula confirmada",""],
  ["AY-1","Alyrio","Segunda-feira","08:40 - 09:30","3º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-3","Alyrio","Segunda-feira","09:30 - 10:20","3º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-4","Alyrio","Segunda-feira","10:20 - 11:10","3º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-5","Alyrio","Segunda-feira","11:50 - 12:40","1º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-6","Alyrio","Segunda-feira","12:40 - 13:30","1º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-7","Alyrio","Segunda-feira","13:30 - 14:20","1º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-8","Alyrio","Segunda-feira","15:10 - 16:00","2º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-2","Alyrio","Terça-feira","08:40 - 09:30","1º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-9","Alyrio","Terça-feira","09:30 - 10:20","1º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-10","Alyrio","Terça-feira","10:20 - 11:10","2º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-11","Alyrio","Terça-feira","11:10 - 12:00","3º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-12","Alyrio","Terça-feira","12:40 - 13:30","3º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-13","Alyrio","Terça-feira","13:30 - 14:20","3º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-14","Alyrio","Terça-feira","14:20 - 15:10","2º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-15","Alyrio","Terça-feira","15:10 - 16:00","2º DS","Matemática","normal","","Aula confirmada",""],
  ["AY-16","Alyrio","Quarta-feira","08:40 - 09:30","1º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-17","Alyrio","Quarta-feira","10:20 - 11:10","2º ADM","Matemática","normal","","Aula confirmada",""],
  ["AY-18","Alyrio","Quarta-feira","11:10 - 12:00","2º ADM","Matemática","normal","","Aula confirmada",""],
  ["CH-1","Christiano","Terça-feira","08:40 - 09:30","3º DS","Tópicos Especiais","normal","","Aula confirmada",""],
  ["CH-2","Christiano","Terça-feira","09:30 - 10:20","3º DS","Tópicos Especiais","normal","","Aula confirmada",""],
  ["CH-3","Christiano","Terça-feira","10:20 - 11:10","3º DS","Tópicos Especiais","normal","","Aula confirmada",""],
  ["CH-4","Christiano","Quarta-feira","18:40 - 19:30","3º Info (Subsequente)","CS2","normal","","Aula confirmada",""],
  ["CH-5","Christiano","Quarta-feira","19:30 - 20:20","3º Info (Subsequente)","CS2","normal","","Aula confirmada",""],
  ["CH-6","Christiano","Quarta-feira","20:30 - 21:20","3º Info (Subsequente)","CS2","normal","","Aula confirmada",""],
  ["CH-7","Christiano","Quarta-feira","21:20 - 22:10","3º Info (Subsequente)","CS2","normal","","Aula confirmada",""],
  ["CH-8","Christiano","Sexta-feira","18:40 - 19:30","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["CH-9","Christiano","Sexta-feira","19:30 - 20:20","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["EB-4","Eber","Quinta-feira","14:20 - 15:10","1º DS","CS1 - A","normal","","Aula confirmada",""],
  ["EB-5","Eber","Quinta-feira","15:10 - 16:00","1º DS","CS1 - A","normal","","Aula confirmada",""],
  ["EB-1","Eber","Sexta-feira","12:00 - 12:50","2º DS","BD e ES","normal","","Aula confirmada",""],
  ["EB-13","Eber","Sexta-feira","12:50 - 13:30","2º DS","BD e ES","normal","","Aula confirmada",""],
  ["EB-3","Eber","Sexta-feira","13:30 - 14:20","2º DS","BD e ES","normal","","Aula confirmada",""],
  ["EB-6","Eber","Sexta-feira","14:20 - 15:10","1º DS","CS1 - B","normal","","Aula confirmada",""],
  ["EB-7","Eber","Sexta-feira","15:10 - 16:00","1º DS","CS1 - B","normal","","Aula confirmada",""],
  ["EB-8","Eber","Sexta-feira","18:40 - 19:30","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-9","Eber","Sexta-feira","19:30 - 20:20","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-10","Eber","Sexta-feira","20:30 - 21:20","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-11","Eber","Sexta-feira","21:20 - 22:10","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EL-14","Elliot","Segunda-feira","08:40 - 09:30","3º DS","Projeto Integrador 2","normal","","Aula confirmada",""],
  ["EL-15","Elliot","Segunda-feira","09:30 - 10:20","3º DS","Projeto Integrador 2","normal","","Aula confirmada",""],
  ["EL-16","Elliot","Segunda-feira","10:20 - 11:10","3º DS","Projeto Integrador 2","normal","","Aula confirmada",""],
  ["EL-17","Elliot","Segunda-feira","11:10 - 12:00","3º DS","Projeto Integrador 2","normal","","Aula confirmada",""],
  ["EL-8","Elliot","Segunda-feira","18:40 - 19:30","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-9","Elliot","Segunda-feira","19:30 - 20:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-10","Elliot","Segunda-feira","20:30 - 21:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-11","Elliot","Segunda-feira","21:20 - 22:10","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-18","Elliot","Terça-feira","11:50 - 12:40","1º DS","Introd. à Inform. - A","normal","","Aula confirmada",""],
  ["EL-19","Elliot","Terça-feira","12:40 - 13:30","1º DS","Introd. à Inform. - A","normal","","Aula confirmada",""],
  ["EL-20","Elliot","Terça-feira","13:30 - 14:20","1º DS","Introd. à Inform. - A","normal","","Aula confirmada",""],
  ["EL-12","Elliot","Terça-feira","18:40 - 19:30","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-13","Elliot","Terça-feira","19:30 - 20:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EM-16","Emerson","Segunda-feira","08:40 - 09:30","2º ADM","Informática Básica","normal","","Aula confirmada",""],
  ["EM-17","Emerson","Segunda-feira","09:30 - 10:20","2º ADM","Informática Básica","normal","","Aula confirmada",""],
  ["EM-18","Emerson","Segunda-feira","10:20 - 11:10","2º DS","Projeto Integrador 1","normal","","Aula confirmada",""],
  ["EM-19","Emerson","Segunda-feira","11:10 - 12:00","2º DS","Projeto Integrador 1","normal","","Aula confirmada",""],
  ["EM-20","Emerson","Segunda-feira","12:40 - 13:30","3º DS","Redes de Computadores e SI","normal","","Aula confirmada",""],
  ["EM-21","Emerson","Segunda-feira","13:30 - 14:20","3º DS","Redes de Computadores e SI","normal","","Aula confirmada",""],
  ["EM-22","Emerson","Segunda-feira","14:20 - 15:10","3º DS","Redes de Computadores e SI","normal","","Aula confirmada",""],
  ["EM-10","Emerson","Segunda-feira","20:30 - 21:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-11","Emerson","Segunda-feira","21:20 - 22:10","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-12","Emerson","Terça-feira","18:40 - 19:30","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-13","Emerson","Terça-feira","19:30 - 20:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-14","Emerson","Terça-feira","20:30 - 21:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-15","Emerson","Terça-feira","21:20 - 22:10","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-23","Emerson","Quarta-feira","08:40 - 09:30","2º DS","CS2 - A","normal","","Aula confirmada",""],
  ["EM-24","Emerson","Quarta-feira","09:30 - 10:20","2º DS","CS2 - A","normal","","Aula confirmada",""],
  ["ER-1","Eric","Quarta-feira","08:40 - 09:30","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-2","Eric","Quarta-feira","09:30 - 10:20","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-3","Eric","Quarta-feira","10:20 - 11:10","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-4","Eric","Quarta-feira","11:10 - 12:00","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-9","Eric","Quarta-feira","18:40 - 19:30","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-10","Eric","Quarta-feira","19:30 - 20:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-11","Eric","Quarta-feira","20:30 - 21:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-12","Eric","Quarta-feira","21:20 - 22:10","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-5","Eric","Quinta-feira","14:20 - 15:10","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-6","Eric","Quinta-feira","15:10 - 16:00","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-13","Eric","Quinta-feira","18:40 - 19:30","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-14","Eric","Quinta-feira","19:30 - 20:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-15","Eric","Quinta-feira","20:30 - 21:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-16","Eric","Quinta-feira","21:20 - 22:10","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-7","Eric","Sexta-feira","14:20 - 15:10","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-8","Eric","Sexta-feira","15:10 - 16:00","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["FL-1","Felippe","Quarta-feira","08:40 - 09:30","2º ADM","Matemática Financeira","normal","","Aula confirmada",""],
  ["FL-3","Felippe","Quarta-feira","09:30 - 10:20","2º ADM","Matemática Financeira","normal","","Aula confirmada",""],
  ["FL-2","Felippe","Quarta-feira","11:50 - 12:40","1º ADM","Noções de Economia","normal","","Aula confirmada",""],
  ["FL-4","Felippe","Quarta-feira","12:40 - 13:30","1º ADM","Noções de Economia","normal","","Aula confirmada",""],
  ["FE-1","Fernanda","Segunda-feira","08:40 - 09:30","1º DS","Inglês","normal","","Aula confirmada",""],
  ["FE-6","Fernanda","Segunda-feira","09:30 - 10:20","1º DS","Inglês","normal","","Aula confirmada",""],
  ["FE-7","Fernanda","Segunda-feira","10:20 - 11:10","1º ADM","Português","normal","","Aula confirmada",""],
  ["FE-8","Fernanda","Segunda-feira","11:50 - 12:40","1º ADM","Português","normal","","Aula confirmada",""],
  ["FE-9","Fernanda","Segunda-feira","12:40 - 13:30","1º ADM","Português","normal","","Aula confirmada",""],
  ["FE-10","Fernanda","Segunda-feira","14:20 - 15:10","2º ADM","Inglês","normal","","Aula confirmada",""],
  ["FE-11","Fernanda","Segunda-feira","15:10 - 16:00","2º ADM","Inglês","normal","","Aula confirmada",""],
  ["FE-4","Fernanda","Segunda-feira","18:40 - 19:30","1º Info (Subsequente)","Inglês Instrumental","normal","","Aula confirmada",""],
  ["FE-5","Fernanda","Segunda-feira","19:30 - 20:20","1º Info (Subsequente)","Inglês Instrumental","normal","","Aula confirmada",""],
  ["FE-12","Fernanda","Terça-feira","08:40 - 09:30","1º DS","Português","normal","","Aula confirmada",""],
  ["FE-13","Fernanda","Terça-feira","08:40 - 09:30","2º DS","Português","normal","","Aula confirmada",""],
  ["FE-14","Fernanda","Terça-feira","09:30 - 10:20","1º DS","Português","normal","","Aula confirmada",""],
  ["FE-15","Fernanda","Terça-feira","09:30 - 10:20","2º DS","Português","normal","","Aula confirmada",""],
  ["FE-16","Fernanda","Terça-feira","10:20 - 11:10","1º DS","Português","normal","","Aula confirmada",""],
  ["FE-2","Fernanda","Terça-feira","10:20 - 11:10","2º DS","Português","normal","","Aula confirmada",""],
  ["FE-17","Fernanda","Terça-feira","11:10 - 12:00","2º DS","Espanhol","normal","","Aula confirmada",""],
  ["FE-18","Fernanda","Terça-feira","12:00 - 12:50","2º DS","Espanhol","normal","","Aula confirmada",""],
  ["FE-19","Fernanda","Terça-feira","12:40 - 13:30","1º ADM","Inglês","normal","","Aula confirmada",""],
  ["FE-20","Fernanda","Terça-feira","13:30 - 14:20","1º ADM","Inglês","normal","","Aula confirmada",""],
  ["FE-21","Fernanda","Terça-feira","14:20 - 15:10","3º DS","Inglês","normal","","Aula confirmada",""],
  ["FE-22","Fernanda","Terça-feira","15:10 - 16:00","3º DS","Inglês","normal","","Aula confirmada",""],
  ["FE-23","Fernanda","Quarta-feira","08:40 - 09:30","3º ADM","Português","normal","","Aula confirmada",""],
  ["FE-24","Fernanda","Quarta-feira","09:30 - 10:20","3º ADM","Português","normal","","Aula confirmada",""],
  ["FE-25","Fernanda","Quarta-feira","10:20 - 11:10","3º ADM","Português","normal","","Aula confirmada",""],
  ["FE-26","Fernanda","Quarta-feira","11:10 - 12:00","3º ADM","Espanhol","normal","","Aula confirmada",""],
  ["FE-27","Fernanda","Quarta-feira","12:40 - 13:30","3º DS","Português","normal","","Aula confirmada",""],
  ["FE-28","Fernanda","Quarta-feira","13:30 - 14:20","3º DS","Português","normal","","Aula confirmada",""],
  ["FE-29","Fernanda","Quinta-feira","08:40 - 09:30","2º ADM","Português","normal","","Aula confirmada",""],
  ["FE-30","Fernanda","Quinta-feira","09:30 - 10:20","2º ADM","Português","normal","","Aula confirmada",""],
  ["FE-31","Fernanda","Quinta-feira","10:20 - 11:10","2º ADM","Português","normal","","Aula confirmada",""],
  ["FE-32","Fernanda","Quinta-feira","11:10 - 12:00","3º ADM","Espanhol","normal","","Aula confirmada",""],
  ["FE-33","Fernanda","Quinta-feira","12:40 - 13:30","3º DS","Português","normal","","Aula confirmada",""],
  ["FE-34","Fernanda","Quinta-feira","13:30 - 14:20","3º DS","Português","normal","","Aula confirmada",""],
  ["GR-1","Grayce","Segunda-feira","12:00 - 12:50","2º ADM","Gestão de Projetos","normal","","Aula confirmada",""],
  ["GR-3","Grayce","Segunda-feira","13:30 - 14:20","2º ADM","Gestão de Projetos","normal","","Aula confirmada",""],
  ["GR-2","Grayce","Terça-feira","10:20 - 11:10","3º ADM","Gestão Ambiental","normal","","Aula confirmada",""],
  ["GR-4","Grayce","Terça-feira","11:10 - 12:00","3º ADM","Gestão Ambiental","normal","","Aula confirmada",""],
  ["GR-5","Grayce","Terça-feira","12:40 - 13:30","3º ADM","Empreendedorismo","normal","","Aula confirmada",""],
  ["GR-6","Grayce","Terça-feira","13:30 - 14:20","3º ADM","Empreendedorismo","normal","","Aula confirmada",""],
  ["PE-3","Pedro Ernesto","Quarta-feira","10:20 - 11:10","3º DS","Química","normal","","Aula confirmada",""],
  ["PE-4","Pedro Ernesto","Quarta-feira","11:10 - 12:00","3º DS","Química","normal","","Aula confirmada",""],
  ["PE-5","Pedro Ernesto","Quarta-feira","12:00 - 12:50","2º ADM","Química","normal","","Aula confirmada",""],
  ["PE-6","Pedro Ernesto","Quarta-feira","13:30 - 14:20","2º ADM","Química","normal","","Aula confirmada",""],
  ["PE-7","Pedro Ernesto","Quinta-feira","12:00 - 12:50","2º DS","Química","normal","","Aula confirmada",""],
  ["PE-8","Pedro Ernesto","Quinta-feira","13:30 - 14:20","2º DS","Química","normal","","Aula confirmada",""],
  ["PE-9","Pedro Ernesto","Quinta-feira","14:20 - 15:10","1º ADM","Química","normal","","Aula confirmada",""],
  ["PE-10","Pedro Ernesto","Quinta-feira","15:10 - 16:00","1º ADM","Química","normal","","Aula confirmada",""],
  ["PE-1","Pedro Ernesto","Sexta-feira","08:40 - 09:30","1º DS","Química","normal","","Aula confirmada",""],
  ["PE-11","Pedro Ernesto","Sexta-feira","09:30 - 10:20","1º DS","Química","normal","","Aula confirmada",""],
  ["PE-12","Pedro Ernesto","Sexta-feira","10:20 - 11:10","3º ADM","Química","normal","","Aula confirmada",""],
  ["PE-13","Pedro Ernesto","Sexta-feira","11:10 - 12:00","3º ADM","Química","normal","","Aula confirmada",""],
  ["PG-2","Pedro Goes","Segunda-feira","10:20 - 11:10","2º ADM","Gestão de Pessoas","normal","","Aula confirmada",""],
  ["PG-3","Pedro Goes","Segunda-feira","11:10 - 12:00","2º ADM","Gestão de Pessoas","normal","","Aula confirmada",""],
  ["PG-1","Pedro Goes","Quarta-feira","09:30 - 10:20","1º ADM","Administração Geral","normal","","Aula confirmada",""],
  ["PG-4","Pedro Goes","Quarta-feira","10:20 - 11:10","1º ADM","Administração Geral","normal","","Aula confirmada",""],
  ["RF-10","Luiz Rafael Freitas","Quarta-feira","10:20 - 11:10","2º DS","CS2 - B","normal","","Aula confirmada",""],
  ["RF-11","Luiz Rafael Freitas","Quarta-feira","11:10 - 12:00","2º DS","CS2 - B","normal","","Aula confirmada",""],
  ["RF-12","Luiz Rafael Freitas","Quarta-feira","11:50 - 12:40","1º DS","Introd. à Inform. - B","normal","","Aula confirmada",""],
  ["RF-13","Luiz Rafael Freitas","Quarta-feira","12:40 - 13:30","1º DS","Introd. à Inform. - B","normal","","Aula confirmada",""],
  ["RF-14","Luiz Rafael Freitas","Quarta-feira","13:30 - 14:20","1º DS","Introd. à Inform. - B","normal","","Aula confirmada",""],
  ["RF-6","Luiz Rafael Freitas","Quinta-feira","18:40 - 19:30","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-7","Luiz Rafael Freitas","Quinta-feira","19:30 - 20:20","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-8","Luiz Rafael Freitas","Quinta-feira","20:30 - 21:20","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-9","Luiz Rafael Freitas","Quinta-feira","21:20 - 22:10","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RA-3","Raisa","Quinta-feira","08:40 - 09:30","3º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-4","Raisa","Quinta-feira","09:30 - 10:20","3º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-5","Raisa","Quinta-feira","10:20 - 11:10","2º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-6","Raisa","Quinta-feira","11:10 - 12:00","2º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-7","Raisa","Quinta-feira","12:40 - 13:30","1º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-8","Raisa","Quinta-feira","13:30 - 14:20","1º DS","Biologia","normal","","Aula confirmada",""],
  ["RA-9","Raisa","Sexta-feira","08:40 - 09:30","2º ADM","Biologia","normal","","Aula confirmada",""],
  ["RA-10","Raisa","Sexta-feira","09:30 - 10:20","2º ADM","Biologia","normal","","Aula confirmada",""],
  ["RA-1","Raisa","Sexta-feira","10:20 - 11:10","1º ADM","Biologia","normal","","Aula confirmada",""],
  ["RA-11","Raisa","Sexta-feira","11:50 - 12:40","1º ADM","Biologia","normal","","Aula confirmada",""],
  ["RA-12","Raisa","Sexta-feira","14:20 - 15:10","3º ADM","Biologia","normal","","Aula confirmada",""],
  ["RA-13","Raisa","Sexta-feira","15:10 - 16:00","3º ADM","Biologia","normal","","Aula confirmada",""],
  ["SA-1","Sanderson","Segunda-feira","08:40 - 09:30","1º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-3","Sanderson","Segunda-feira","09:30 - 10:20","1º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-4","Sanderson","Segunda-feira","13:30 - 14:20","2º DS","Educação Física","normal","","Aula confirmada",""],
  ["SA-5","Sanderson","Segunda-feira","14:20 - 15:10","2º DS","Educação Física","normal","","Aula confirmada",""],
  ["SA-6","Sanderson","Segunda-feira","15:10 - 16:00","3º DS","Educação Física","normal","","Aula confirmada",""],
  ["SA-7","Sanderson","Terça-feira","08:40 - 09:30","3º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-8","Sanderson","Terça-feira","09:30 - 10:20","3º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-9","Sanderson","Terça-feira","14:20 - 15:10","2º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-10","Sanderson","Terça-feira","15:10 - 16:00","2º ADM","Educação Física","normal","","Aula confirmada",""],
  ["SA-11","Sanderson","Quarta-feira","08:40 - 09:30","1º DS","Educação Física","normal","","Aula confirmada",""],
  ["SA-12","Sanderson","Quarta-feira","09:30 - 10:20","1º DS","Educação Física","normal","","Aula confirmada",""],
  ["SE-1","Sérgio","Segunda-feira","13:30 - 14:20","1º ADM","Administração Mercadológica","normal","","Aula confirmada",""],
  ["SE-3","Sérgio","Segunda-feira","14:20 - 15:10","1º ADM","Administração Mercadológica","normal","","Aula confirmada",""],
  ["SE-2","Sérgio","Terça-feira","11:10 - 12:00","2º ADM","Téc. Vendas e Atend","normal","","Aula confirmada",""],
  ["SE-4","Sérgio","Terça-feira","12:00 - 12:50","2º ADM","Téc. Vendas e Atend","normal","","Aula confirmada",""],
  ["VI-3","Vinicius","Quinta-feira","11:10 - 12:00","2º ADM","Filosofia","normal","","Aula confirmada",""],
  ["VI-4","Vinicius","Quinta-feira","12:00 - 12:50","2º ADM","Filosofia","normal","","Aula confirmada",""],
  ["VI-5","Vinicius","Sexta-feira","10:20 - 11:10","1º DS","Filosofia","normal","","Aula confirmada",""],
  ["VI-6","Vinicius","Sexta-feira","11:50 - 12:40","1º DS","Filosofia","normal","","Aula confirmada",""],
  ["VI-7","Vinicius","Sexta-feira","12:40 - 13:30","1º ADM","Ética e Relações Humanas","normal","","Aula confirmada",""],
  ["VI-8","Vinicius","Sexta-feira","13:30 - 14:20","1º ADM","Ética e Relações Humanas","normal","","Aula confirmada",""],
  ["VT-3","Vitor","Quinta-feira","08:40 - 09:30","2º DS","Geografia","normal","","Aula confirmada",""],
  ["VT-4","Vitor","Quinta-feira","09:30 - 10:20","2º DS","Geografia","normal","","Aula confirmada",""],
  ["VT-1","Vitor","Quinta-feira","10:20 - 11:10","1º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-5","Vitor","Quinta-feira","11:50 - 12:40","1º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-6","Vitor","Quinta-feira","12:40 - 13:30","3º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-7","Vitor","Quinta-feira","13:30 - 14:20","3º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-8","Vitor","Quinta-feira","14:20 - 15:10","2º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-9","Vitor","Quinta-feira","15:10 - 16:00","2º ADM","Geografia","normal","","Aula confirmada",""],
  ["VT-10","Vitor","Sexta-feira","08:40 - 09:30","3º DS","Geografia","normal","","Aula confirmada",""],
  ["VT-11","Vitor","Sexta-feira","09:30 - 10:20","3º DS","Geografia","normal","","Aula confirmada",""],
  ["VT-12","Vitor","Sexta-feira","12:40 - 13:30","1º DS","Geografia","normal","","Aula confirmada",""],
  ["VT-13","Vitor","Sexta-feira","13:30 - 14:20","1º DS","Geografia","normal","","Aula confirmada",""],
  ["WE-3","Weder","Segunda-feira","08:40 - 09:30","2º DS","Sociologia","normal","","Aula confirmada",""],
  ["WE-4","Weder","Segunda-feira","09:30 - 10:20","2º DS","Sociologia","normal","","Aula confirmada",""],
  ["WE-5","Weder","Segunda-feira","12:40 - 13:30","3º ADM","Sociologia","normal","","Aula confirmada",""],
  ["WE-6","Weder","Segunda-feira","13:30 - 14:20","3º ADM","Sociologia","normal","","Aula confirmada",""],
  ["WE-1","Weder","Terça-feira","08:40 - 09:30","2º ADM","Sociologia","normal","","Aula confirmada",""],
  ["WE-7","Weder","Terça-feira","09:30 - 10:20","2º ADM","Sociologia","normal","","Aula confirmada",""],
  ["WE-2","Weder","Terça-feira","10:20 - 11:10","1º ADM","Noções de Metodologia da Pesquisa","normal","","Aula confirmada",""],
  ["WE-8","Weder","Terça-feira","11:50 - 12:40","1º ADM","Noções de Metodologia da Pesquisa","normal","","Aula confirmada",""],
  ["WK-1","Welkson","Quinta-feira","08:40 - 09:30","3º ADM","Gestão da Operação","normal","","Aula confirmada",""],
  ["WK-3","Welkson","Quinta-feira","09:30 - 10:20","3º ADM","Gestão da Operação","normal","","Aula confirmada",""],
  ["WK-2","Welkson","Sexta-feira","08:40 - 09:30","3º ADM","Gestão Financeira","normal","","Aula confirmada",""],
  ["WK-4","Welkson","Sexta-feira","09:30 - 10:20","3º ADM","Gestão Financeira","normal","","Aula confirmada",""],
  ["WK-5","Welkson","Sexta-feira","14:20 - 15:10","2º ADM","Logística Empresarial","normal","","Aula confirmada",""],
  ["WK-6","Welkson","Sexta-feira","15:10 - 16:00","2º ADM","Logística Empresarial","normal","","Aula confirmada",""],
  ["AG-9","Ângelo","Segunda-feira","14:20 - 15:10","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-10","Ângelo","Segunda-feira","15:10 - 16:00","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-1","Ângelo","Terça-feira","11:50 - 12:40","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-2","Ângelo","Terça-feira","12:40 - 13:30","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-3","Ângelo","Terça-feira","13:30 - 14:20","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-4","Ângelo","Terça-feira","14:20 - 15:10","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-5","Ângelo","Terça-feira","15:10 - 16:00","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-11","Ângelo","Terça-feira","20:30 - 21:20","3º Info (Subsequente)","Tópicos Especiais 1","normal","","Aula confirmada",""],
  ["AG-12","Ângelo","Terça-feira","21:20 - 22:10","3º Info (Subsequente)","Tópicos Especiais 1","normal","","Aula confirmada",""],
  ["AG-6","Ângelo","Quarta-feira","11:50 - 12:40","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-7","Ângelo","Quarta-feira","12:40 - 13:30","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-8","Ângelo","Quarta-feira","13:30 - 14:20","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["VA-3","A definir","Quarta-feira","12:00 - 12:50","2º DS","Física","normal","","Aula confirmada",""],
  ["VA-4","A definir","Quarta-feira","13:30 - 14:20","2º DS","Física","normal","","Aula confirmada",""],
  ["VA-5","A definir","Quinta-feira","08:40 - 09:30","1º DS","Física","normal","","Aula confirmada",""],
  ["VA-6","A definir","Quinta-feira","09:30 - 10:20","1º DS","Física","normal","","Aula confirmada",""],
  ["VA-7","A definir","Quinta-feira","10:20 - 11:10","3º DS","Física","normal","","Aula confirmada",""],
  ["VA-8","A definir","Quinta-feira","11:10 - 12:00","3º DS","Física","normal","","Aula confirmada",""],
  ["VA-1","A definir","Sexta-feira","08:40 - 09:30","1º ADM","Física","normal","","Aula confirmada",""],
  ["VA-9","A definir","Sexta-feira","09:30 - 10:20","1º ADM","Física","normal","","Aula confirmada",""],
  ["VA-2","A definir","Sexta-feira","10:20 - 11:10","2º ADM","Física","normal","","Aula confirmada",""],
  ["VA-10","A definir","Sexta-feira","11:10 - 12:00","2º ADM","Física","normal","","Aula confirmada",""],
  ["VA-11","A definir","Sexta-feira","12:40 - 13:30","3º ADM","Física","normal","","Aula confirmada",""],
  ["VA-12","A definir","Sexta-feira","13:30 - 14:20","3º ADM","Física","normal","","Aula confirmada",""],
  // Bacharelado em Administração (graduação) — horário 2026.2 da COBAD
  ["GR-7","Grayce","Segunda-feira","18:40 - 19:30","Graduação ADM","Metodologia da Pesquisa I","normal","","Aula confirmada",""],
  ["GR-8","Grayce","Segunda-feira","19:30 - 20:20","Graduação ADM","Metodologia da Pesquisa I","normal","","Aula confirmada",""],
  ["FE-35","Fernanda","Segunda-feira","20:30 - 21:20","Graduação ADM","Português Instrumental","normal","","Aula confirmada",""],
  ["FE-36","Fernanda","Segunda-feira","21:20 - 22:00","Graduação ADM","Português Instrumental","normal","","Aula confirmada",""],
  ["PG-5","Pedro Goes","Terça-feira","18:40 - 19:30","Graduação ADM","Teoria Geral da Administração e das Organizações I","normal","","Aula confirmada",""],
  ["PG-6","Pedro Goes","Terça-feira","19:30 - 20:20","Graduação ADM","Teoria Geral da Administração e das Organizações I","normal","","Aula confirmada",""],
  ["PG-7","Pedro Goes","Terça-feira","20:30 - 21:20","Graduação ADM","Teoria Geral da Administração e das Organizações I","normal","","Aula confirmada",""],
  ["PG-8","Pedro Goes","Terça-feira","21:20 - 22:00","Graduação ADM","Teoria Geral da Administração e das Organizações I","normal","","Aula confirmada",""],
  ["WE-9","Weder","Quarta-feira","18:40 - 19:30","Graduação ADM","Sociologia das Organizações","normal","","Aula confirmada",""],
  ["WE-10","Weder","Quarta-feira","19:30 - 20:20","Graduação ADM","Sociologia das Organizações","normal","","Aula confirmada",""],
  ["WE-11","Weder","Quarta-feira","20:30 - 21:20","Graduação ADM","Sociologia das Organizações","normal","","Aula confirmada",""],
  ["WE-12","Weder","Quarta-feira","21:20 - 22:00","Graduação ADM","Sociologia das Organizações","normal","","Aula confirmada",""],
  ["CB-1","Claifton","Quinta-feira","18:40 - 19:30","Graduação ADM","Fundamentos de Matemática","normal","","Aula confirmada",""],
  ["CB-2","Claifton","Quinta-feira","19:30 - 20:20","Graduação ADM","Fundamentos de Matemática","normal","","Aula confirmada",""],
  ["CB-3","Claifton","Quinta-feira","20:30 - 21:20","Graduação ADM","Fundamentos de Matemática","normal","","Aula confirmada",""],
  ["CB-4","Claifton","Quinta-feira","21:20 - 22:00","Graduação ADM","Fundamentos de Matemática","normal","","Aula confirmada",""],
  ["CB-5","Claifton","Sexta-feira","18:40 - 19:30","Graduação ADM","Comunicação Empresarial","normal","","Aula confirmada",""],
  ["CB-6","Claifton","Sexta-feira","19:30 - 20:20","Graduação ADM","Comunicação Empresarial","normal","","Aula confirmada",""],
  ["ED-1","Érica Delfino","Sexta-feira","20:30 - 21:20","Graduação ADM","Introdução ao Direito","normal","","Aula confirmada",""],
  ["ED-2","Érica Delfino","Sexta-feira","21:20 - 22:00","Graduação ADM","Introdução ao Direito","normal","","Aula confirmada",""]
];


/**
 * Roteia automaticamente o e-mail para o coordenador específico do curso da turma
 */
function obterEmailsPorTurma(turma, config) {
  var cfg = config || CONFIG_PADRAO;
  var dests = [];
  var t = (turma || "").toUpperCase();

  // 0. Bacharelado em Administração (graduação) — coordenação própria (COBAD)
  if (t.indexOf("GRADUA") !== -1) {
    var emailGrad = cfg.emailCoordGraduacao || CONFIG_PADRAO.EMAIL_COORD_GRADUACAO || cfg.emailCoordADM || CONFIG_PADRAO.EMAIL_COORD_ADM;
    if (emailGrad && dests.indexOf(emailGrad) === -1) dests.push(emailGrad);
  }
  // 1. Subsequente em Informática
  else if (t.indexOf("SUBSEQUENTE") !== -1 || t.indexOf("INFO") !== -1) {
    var emailSub = cfg.emailCoordSubsequente || CONFIG_PADRAO.EMAIL_COORD_SUBSEQUENTE;
    if (emailSub && dests.indexOf(emailSub) === -1) dests.push(emailSub);
  }
  // 2. Desenvolvimento de Sistemas (DS)
  else if (t.indexOf("DS") !== -1) {
    var emailDS = cfg.emailCoordDS || CONFIG_PADRAO.EMAIL_COORD_DS;
    if (emailDS && dests.indexOf(emailDS) === -1) dests.push(emailDS);
  }
  // 3. Administração (ADM / Comércio)
  else if (t.indexOf("ADM") !== -1 || t.indexOf("COMÉRCIO") !== -1 || t.indexOf("COMERCIO") !== -1) {
    var emailADM = cfg.emailCoordADM || CONFIG_PADRAO.EMAIL_COORD_ADM;
    if (emailADM && dests.indexOf(emailADM) === -1) dests.push(emailADM);
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
 * Obtém o e-mail institucional oficial do docente
 */
function obterEmailProfessor(ss, prof) {
  if (!prof || prof === "A definir") return "";
  var mapa = mapaProfessores_(ss);
  var p = mapa[String(prof).trim().toLowerCase()];
  if (p && p.email) return p.email;
  if (EMAILS_DOCENTES[prof]) return EMAILS_DOCENTES[prof];
  return ""; // sem e-mail cadastrado: não inventa endereço
}

// Lê a aba Professores uma vez por execução: { "nome em minúsculas": {nome, email, curso, ativo, linha} }
var __mapaProfs = null;
function mapaProfessores_(ss) {
  if (__mapaProfs) return __mapaProfs;
  var mapa = {};
  try {
    var sh = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName("Professores");
    if (sh && sh.getLastRow() > 1) {
      var cols = Math.max(5, sh.getLastColumn());
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues();
      rows.forEach(function (r, i) {
        var nome = String(r[0] || "").trim();
        if (!nome) return;
        mapa[nome.toLowerCase()] = { nome: nome, email: String(r[1] || "").trim(), curso: String(r[2] || "").trim(),
                                     ativo: String(r[4] || "Sim").trim().toLowerCase() !== "não" && String(r[4] || "").trim().toLowerCase() !== "nao",
                                     linha: i + 2 };
      });
    }
  } catch (e) {}
  __mapaProfs = mapa;
  return mapa;
}
function limparMapaProfessores_() { __mapaProfs = null; }

/**
 * Localiza a linha exata da aula na planilha Horarios com segurança total:
 * 1. Busca por ID da aula (EB-1, EB-8, etc.)
 * 2. Busca por correspondência de campos (prof + dia + hora + turma)
 * 3. Fallback por índice numérico
 * 4. Se não existir, CRIA A LINHA AUTOMATICAMENTE para que nenhuma ação seja descartada!
 */
function encontrarOuCriarLinhaAula(sheet, prof, aulaObj, indexFallback) {
  var rows = sheet.getDataRange().getValues();
  
  var norm = function (v) { return String(v || "").trim().toLowerCase(); };

  // 1. Busca por ID da aula (Coluna A) — só aceita se dia/hora/turma também batem.
  //    Antes bastava o ID: com linhas antigas na planilha, a falta de quinta caía numa aula de quarta.
  if (aulaObj && aulaObj.id) {
    var idAlvo = String(aulaObj.id).trim().toUpperCase();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === idAlvo) {
        var mesmoHorario = !aulaObj.dia || !aulaObj.hora ||
          (norm(rows[i][2]) === norm(aulaObj.dia) && norm(rows[i][3]) === norm(aulaObj.hora) &&
           (!aulaObj.turma || norm(rows[i][4]) === norm(aulaObj.turma)));
        if (mesmoHorario) return i + 1;
        break; // ID existe mas aponta para outra aula: procura pelo horário abaixo
      }
    }
  }

  // 2. Busca por Correspondência de Conteúdo (Professor + Dia + Hora + Turma)
  if (aulaObj && aulaObj.dia && aulaObj.hora) {
    for (var j = 1; j < rows.length; j++) {
      var rProf = String(rows[j][1]).trim().toLowerCase();
      var rDia = String(rows[j][2]).trim().toLowerCase();
      var rHora = String(rows[j][3]).trim().toLowerCase();
      var rTurma = String(rows[j][4]).trim().toLowerCase();
      
      if (rProf === String(prof).trim().toLowerCase() &&
          rDia === String(aulaObj.dia).trim().toLowerCase() &&
          rHora === String(aulaObj.hora).trim().toLowerCase() &&
          (!aulaObj.turma || rTurma === String(aulaObj.turma).trim().toLowerCase())) {
        return j + 1;
      }
    }
  }

  // 3. Fallback por posição: só quando o app NÃO informou dia/hora (a posição pode
  //    apontar para outra aula se a planilha estiver em ordem diferente da do app)
  var temHorario = aulaObj && aulaObj.dia && aulaObj.hora;
  if (!temHorario && typeof indexFallback === "number" && indexFallback >= 0) {
    var contador = 0;
    for (var k = 1; k < rows.length; k++) {
      if (String(rows[k][1]).trim().toLowerCase() === String(prof).trim().toLowerCase()) {
        if (contador === indexFallback) return k + 1;
        contador++;
      }
    }
  }

  // 4. Se a aula não existe na planilha, CRIA AUTOMATICAMENTE!
  if (aulaObj) {
    var novoId = aulaObj.id || ("ID-" + (rows.length + 1));
    var dia = aulaObj.dia || "";
    var hora = aulaObj.hora || "";
    var turma = aulaObj.turma || "";
    var disc = aulaObj.disc || "";
    sheet.appendRow([novoId, prof, dia, hora, turma, disc, "normal", "", "Aula confirmada", ""]);
    return sheet.getLastRow();
  }

  return -1;
}

// Limpa o cache acelerado da grade para que a próxima leitura venha atualizada
var CHAVES_CACHE = ["BANCO_GRADE_IFS", "BANCO_TUDO_IFS_V2"];
function invalidarCacheGrade() {
  try {
    CacheService.getScriptCache().removeAll(CHAVES_CACHE);
  } catch (e) {}
}

// Monta o objeto { professor: [aulas] } a partir da aba Horarios
function montarGrade_(ss) {
  var sheetHorarios = ss.getSheetByName("Horarios");
  if (!sheetHorarios) {
    configurarPlanilhaInicial();
    sheetHorarios = ss.getSheetByName("Horarios");
  }
  var lastRow = sheetHorarios.getLastRow();
  var banco = {};
  if (lastRow < 2) return banco;
  var rows = sheetHorarios.getRange(2, 1, lastRow - 1, 10).getValues();

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var professor = r[1];
    if (!professor) continue;
    if (!banco[professor]) banco[professor] = [];
    banco[professor].push({
      id: r[0] || ("ID-" + (i + 2)),
      dia: r[2],
      hora: r[3],
      turma: r[4],
      disc: r[5],
      status: r[6] || "normal",
      substituto: r[7] || "",
      obs: r[8] || "",
      dataFalta: formatarDataBR(r[9] || ""),
      linhaExcel: i + 2
    });
  }
  return banco;
}

// Lê objetos JSON completos guardados na coluna 10 de Trocas_Permutas / Reposicoes
function lerObjetosJSON_(ss, nomeAba) {
  var sheet = ss.getSheetByName(nomeAba);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || sheet.getLastColumn() < 10) return [];
  var valores = sheet.getRange(2, 10, lastRow - 1, 1).getValues();
  var lista = [];
  for (var i = valores.length - 1; i >= 0; i--) { // mais recentes primeiro
    var txt = valores[i][0];
    if (!txt) continue;
    try { lista.push(JSON.parse(txt)); } catch (e) {}
    if (lista.length >= 200) break;
  }
  return lista;
}

// Localiza a linha (1-based) de um registro pelo ID (coluna B)
function linhaPorId_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Atualiza o status de uma troca na planilha (coluna 9) e no JSON (coluna 10)
function atualizarStatusTroca_(ss, trocaId, statusTexto, statusJson) {
  var sheet = obterOuCriarAba(ss, "Trocas_Permutas", CAB_TROCAS);
  var linha = linhaPorId_(sheet, trocaId);
  if (linha === -1) return false;
  sheet.getRange(linha, 9).setValue(statusTexto);
  var txt = sheet.getRange(linha, 10).getValue();
  if (txt) {
    try {
      var obj = JSON.parse(txt);
      obj.status = statusJson;
      sheet.getRange(linha, 10).setValue(JSON.stringify(obj));
    } catch (e) {}
  }
  return true;
}

var CAB_TROCAS = ["Data Registro", "ID", "Proponente", "Colega", "Aula Cedida", "Aula Desejada", "Data Prevista", "Justificativa", "Status", "JSON"];
var CAB_REPOSICOES = ["Data Registro", "ID", "Professor", "Disciplina", "Turma", "Data Reposição", "Horário", "Sala / Local", "Justificativa", "JSON"];

/**
 * 1. REQUISIÇÕES GET (Retorna os horários e dados para o frontend em alta velocidade)
 *    ?action=obterTudo  -> { grade, trocas, reposicoes, geradoEm }  (usado pelo app novo)
 *    ?action=obterGrade -> { professor: [aulas] }                   (formato antigo, compatibilidade)
 */
function doGet(e) {
  try {
    var acao = (e && e.parameter && e.parameter.action) || "obterGrade";
    var chave = acao === "obterTudo" ? "BANCO_TUDO_IFS_V2" : "BANCO_GRADE_IFS";
    var cache = CacheService.getScriptCache();
    var cached = cache.get(chave);
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resposta;
    if (acao === "obterTudo") {
      resposta = {
        grade: montarGrade_(ss),
        trocas: lerObjetosJSON_(ss, "Trocas_Permutas"),
        reposicoes: lerObjetosJSON_(ss, "Reposicoes"),
        professores: listaProfessoresPublica_(ss),
        geradoEm: new Date().getTime()
      };
    } else {
      resposta = montarGrade_(ss);
    }

    var jsonStr = JSON.stringify(resposta);
    try {
      // O cache agora é invalidado DEPOIS de cada gravação, então pode durar mais (6 h)
      cache.put(chave, jsonStr, 21600);
    } catch (eC) {}

    return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return criarRespostaJSON({ erro: err.toString() });
  }
}

/**
 * 2. REQUISIÇÕES POST (Processa Liberações, Substituições, Trocas, Reposições, PIN e Sincronização)
 */
function doPost(e) {
  var dadosAdm = null;
  try { dadosAdm = JSON.parse(e.postData.contents); } catch (eJ) {}
  if (dadosAdm && String(dadosAdm.acao || "").indexOf("admin_") === 0) {
    var respAdm = adminRouter_(dadosAdm);
    try { SpreadsheetApp.flush(); } catch (eF2) {}
    var soLeitura = /^admin_(login|sair|resumo|versoes|historico|config_ler|importar_previa|emails_listar|emails_acao|prof_listar|config_salvar)$/.test(dadosAdm.acao);
    if (!soLeitura) invalidarCacheGrade();
    return respAdm;
  }
  var resposta = doPostInterno_(e);
  // Garante que tudo foi gravado ANTES de limpar o cache. Antes o cache era limpo
  // no início do POST: um GET concorrente regravava dados velhos por 10 minutos.
  try { SpreadsheetApp.flush(); } catch (eF) {}
  invalidarCacheGrade();
  return resposta;
}

function doPostInterno_(e) {
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
    var config = lerConfigEmails_(); // destinatários da coordenação vêm do servidor, nunca do app

    // =========================================================================
    // CASO 1: ASSUMIR SUBSTITUIÇÃO (Com teste estrito de concorrência)
    // =========================================================================
    if (acao === "assumir") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var linhaAlvo = encontrarOuCriarLinhaAula(sheetHorarios, dados.profOriginal, dados.aula, dados.index);
      
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

      var emailsArray = [];
      var emailsStr = obterEmailsPorTurma(turma, config);
      emailsStr.split(",").forEach(function(em) {
        em = em.trim();
        if (em && emailsArray.indexOf(em) === -1) emailsArray.push(em);
      });

      var emailTitular = obterEmailProfessor(ss, dados.profOriginal);
      var emailSubs = obterEmailProfessor(ss, dados.substituto);
      if (emailTitular && emailsArray.indexOf(emailTitular) === -1) emailsArray.push(emailTitular);
      if (emailSubs && emailsArray.indexOf(emailSubs) === -1) emailsArray.push(emailSubs);

      var destFinal = emailsArray.join(", ");
      registrarHistorico(ss, "SUBSTITUICAO_ASSUMIDA", dados.profOriginal, dados.substituto, disc, turma, dia + " às " + hora, "");
      var resEnvio = dispararEmailSubstituicaoAssumida(destFinal, dados.profOriginal, dados.substituto, disc, turma, dia, hora);

      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "Substituição confirmada com sucesso!",
        destinatarios: destFinal,
        emailStatus: resEnvio
      });
    }

    // =========================================================================
    // CASO 2: LIBERTAR AULA (FALTA / AUSÊNCIA INDIVIDUAL OU MÚLTIPLOS TEMPOS)
    // =========================================================================
    else if (acao === "libertar" || acao === "libertar_multiplos") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var indices = acao === "libertar_multiplos" ? (dados.indices || []) : [dados.index];
      var aulasRecebidas = dados.aulas || (dados.aula ? [dados.aula] : []);
      var turmasSet = [];
      var discsSet = [];
      var contagem = 0;

      var qtd = Math.max(indices.length, aulasRecebidas.length);
      for (var k = 0; k < qtd; k++) {
        var idxAlvo = indices[k];
        var aulaAlvo = aulasRecebidas[k] || null;
        var linhaAlvo = encontrarOuCriarLinhaAula(sheetHorarios, dados.profOriginal, aulaAlvo, idxAlvo);
        
        if (linhaAlvo !== -1) {
          sheetHorarios.getRange(linhaAlvo, 7).setValue("alert");
          sheetHorarios.getRange(linhaAlvo, 8).setValue("");
          sheetHorarios.getRange(linhaAlvo, 9).setValue(dados.motivo ? "⚠️ " + dados.motivo : "⚠️ Prof. " + dados.profOriginal + " ausente");
          sheetHorarios.getRange(linhaAlvo, 10).setValue(formatarDataBR(dados.dataFalta) || "");

          var disc = sheetHorarios.getRange(linhaAlvo, 6).getValue() || (aulaAlvo ? aulaAlvo.disc : "");
          var turma = sheetHorarios.getRange(linhaAlvo, 5).getValue() || (aulaAlvo ? aulaAlvo.turma : "");
          var hora = sheetHorarios.getRange(linhaAlvo, 4).getValue() || (aulaAlvo ? aulaAlvo.hora : "");
          var dia = sheetHorarios.getRange(linhaAlvo, 3).getValue() || (aulaAlvo ? aulaAlvo.dia : "");

          if (turma && turmasSet.indexOf(turma) === -1) turmasSet.push(turma);
          if (disc && discsSet.indexOf(disc) === -1) discsSet.push(disc);
          contagem++;

          registrarHistorico(ss, "AULA_DISPONIBILIZADA", dados.profOriginal, "", disc, turma, dia + " às " + hora, formatarDataBR(dados.dataFalta));
        }
      }

      var resEnvio = { enviado: false };
      var destFinal = "";
      if (contagem > 0) {
        var emailsArray = [];
        turmasSet.forEach(function(t) {
          var emailsStr = obterEmailsPorTurma(t, config);
          emailsStr.split(",").forEach(function(em) {
            em = em.trim();
            if (em && emailsArray.indexOf(em) === -1) emailsArray.push(em);
          });
        });

        // Adiciona e-mail institucional do professor para cópia de confirmação
        var emailDocente = obterEmailProfessor(ss, dados.profOriginal);
        if (emailDocente && emailsArray.indexOf(emailDocente) === -1) {
          emailsArray.push(emailDocente);
        }

        destFinal = emailsArray.join(", ");
        var descDiscs = discsSet.join(", ");
        var descTurmas = turmasSet.join(", ");
        var labelTempos = contagem > 1 ? contagem + " tempos" : "1 tempo";
        resEnvio = dispararEmailAulaDisponibilizada(destFinal, dados.profOriginal, descDiscs, descTurmas, labelTempos, "", formatarDataBR(dados.dataFalta), dados.motivo);
      }

      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: contagem + " aula(s) liberada(s) e e-mail disparado para a coordenação e professor!",
        contagem: contagem,
        destinatarios: destFinal,
        emailStatus: resEnvio
      });
    }

    // =========================================================================
    // CASO 3: PROPOR OU ACEITAR TROCA DE AULA (PERMUTA)
    // =========================================================================
    else if (acao === "propor_troca") {
      var t = dados.troca;
      var sheetTrocas = obterOuCriarAba(ss, "Trocas_Permutas", CAB_TROCAS);
      if (linhaPorId_(sheetTrocas, t.id) !== -1) {
        lock.releaseLock();
        return criarRespostaJSON({ sucesso: true, mensagem: "Troca já registrada." });
      }
      t.status = "pendente";
      sheetTrocas.appendRow([
        new Date(),
        t.id,
        t.proponente,
        t.colega,
        (t.aulaCedida ? t.aulaCedida.disc + " (" + t.aulaCedida.turma + ") - " + t.aulaCedida.dia + " " + t.aulaCedida.hora : "-"),
        (t.aulaDesejada ? t.aulaDesejada.disc + " (" + t.aulaDesejada.turma + ") - " + t.aulaDesejada.dia + " " + t.aulaDesejada.hora : "-"),
        formatarDataBR(t.dataPrevista) || "-",
        t.motivo || "-",
        "Pendente",
        JSON.stringify(t)
      ]);

      var turmaTroca = (t.aulaCedida && t.aulaCedida.turma) || "";
      var emailsArray = [];
      var emailsStr = obterEmailsPorTurma(turmaTroca, config);
      emailsStr.split(",").forEach(function(em) {
        em = em.trim();
        if (em && emailsArray.indexOf(em) === -1) emailsArray.push(em);
      });

      var emailProp = obterEmailProfessor(ss, t.proponente);
      var emailColega = obterEmailProfessor(ss, t.colega);
      if (emailProp && emailsArray.indexOf(emailProp) === -1) emailsArray.push(emailProp);
      if (emailColega && emailsArray.indexOf(emailColega) === -1) emailsArray.push(emailColega);

      var destFinal = emailsArray.join(", ");
      var resEnvio = dispararEmailPropostaTroca(destFinal, t);

      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "Proposta de permuta enviada e notificada aos professores e coordenação!",
        destinatarios: destFinal,
        emailStatus: resEnvio
      });
    }

    else if (acao === "aceitar_troca") {
      var t = dados.troca;
      atualizarStatusTroca_(ss, dados.trocaId || t.id, "Aceita / Homologada", "aceita");

      var turmaTroca = (t.aulaCedida && t.aulaCedida.turma) || "";
      var emailsArray = [];
      var emailsStr = obterEmailsPorTurma(turmaTroca, config);
      emailsStr.split(",").forEach(function(em) {
        em = em.trim();
        if (em && emailsArray.indexOf(em) === -1) emailsArray.push(em);
      });

      var emailProp = obterEmailProfessor(ss, t.proponente);
      var emailColega = obterEmailProfessor(ss, t.colega);
      if (emailProp && emailsArray.indexOf(emailProp) === -1) emailsArray.push(emailProp);
      if (emailColega && emailsArray.indexOf(emailColega) === -1) emailsArray.push(emailColega);

      var destFinal = emailsArray.join(", ");
      var resEnvio = dispararEmailTrocaConfirmada(destFinal, t);

      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "Troca homologada com sucesso!",
        destinatarios: destFinal,
        emailStatus: resEnvio
      });
    }

    // =========================================================================
    // CASO 4: AGENDAR REPOSIÇÃO DE AULA
    // =========================================================================
    else if (acao === "agendar_reposicao") {
      var r = dados.reposicao;
      var sheetRep = obterOuCriarAba(ss, "Reposicoes", CAB_REPOSICOES);
      if (linhaPorId_(sheetRep, r.id) !== -1) {
        lock.releaseLock();
        return criarRespostaJSON({ sucesso: true, mensagem: "Reposição já registrada." });
      }
      r.data = formatarDataBR(r.data);
      sheetRep.appendRow([
        new Date(),
        r.id,
        r.professor,
        r.disciplina,
        r.turma,
        formatarDataBR(r.data),
        r.horario,
        r.sala,
        r.motivo || "-",
        JSON.stringify(r)
      ]);

      var emailsArray = [];
      var emailsStr = obterEmailsPorTurma(r.turma, config);
      emailsStr.split(",").forEach(function(em) {
        em = em.trim();
        if (em && emailsArray.indexOf(em) === -1) emailsArray.push(em);
      });

      var emailProf = obterEmailProfessor(ss, r.professor);
      if (emailProf && emailsArray.indexOf(emailProf) === -1) emailsArray.push(emailProf);

      var destFinal = emailsArray.join(", ");
      var resEnvio = dispararEmailReposicao(destFinal, r);

      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "Reposição de aula registrada e enviada ao professor e coordenador do curso!",
        destinatarios: destFinal,
        emailStatus: resEnvio
      });
    }

    // =========================================================================
    // CASO 5: RECUPERAR PIN ESQUECIDO (Reset para 1234 e envio por e-mail)
    // =========================================================================
    else if (acao === "recuperar_pin") {
      var prof = dados.professor;
      var emailProf = obterEmailProfessor(ss, prof);
      var sheetProfs = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
      var rows = sheetProfs.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === prof) {
          sheetProfs.getRange(i + 1, 4).setValue("1234");
          break;
        }
      }
      var resEnvio = dispararEmailRecuperacaoPin(emailProf, prof, "1234");
      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "PIN resetado para 1234 e notificado por e-mail!",
        destinatarios: emailProf,
        emailStatus: resEnvio
      });
    }

    // =========================================================================
    // CASO 6: RESTAURAR AULA AO NORMAL
    // =========================================================================
    else if (acao === "recuperar" || acao === "cancelar") {
      var sheetHorarios = ss.getSheetByName("Horarios");
      var linhaAlvo = encontrarOuCriarLinhaAula(sheetHorarios, dados.profOriginal, dados.aula, dados.index);
      if (linhaAlvo !== -1) {
        sheetHorarios.getRange(linhaAlvo, 7).setValue("normal");
        sheetHorarios.getRange(linhaAlvo, 8).setValue("");
        sheetHorarios.getRange(linhaAlvo, 9).setValue("Aula confirmada");
        sheetHorarios.getRange(linhaAlvo, 10).setValue("");
      }
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Aula restaurada ao estado original." });
    }

    // =========================================================================
    // CASO 6b: CANCELAR VÁRIAS AUSÊNCIAS DE UMA VEZ (antes não existia no backend)
    // =========================================================================
    else if (acao === "recuperar_multiplos") {
      var sheetH = ss.getSheetByName("Horarios");
      var lista = dados.aulas || [];
      var idxs = dados.indices || [];
      for (var q = 0; q < idxs.length; q++) {
        var linhaQ = encontrarOuCriarLinhaAula(sheetH, dados.profOriginal, lista[q] || null, idxs[q]);
        if (linhaQ !== -1) {
          sheetH.getRange(linhaQ, 7, 1, 4).setValues([["normal", "", "Aula confirmada", ""]]);
        }
      }
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Ausências canceladas." });
    }

    else if (acao === "recusar_troca") {
      atualizarStatusTroca_(ss, dados.trocaId, "Recusada", "recusada");
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Troca recusada." });
    }

    else if (acao === "cancelar_reposicao") {
      var sheetR2 = obterOuCriarAba(ss, "Reposicoes", CAB_REPOSICOES);
      var linhaR = linhaPorId_(sheetR2, dados.id);
      if (linhaR !== -1) sheetR2.deleteRow(linhaR);
      lock.releaseLock();
      return criarRespostaJSON({ sucesso: true, mensagem: "Reposição cancelada." });
    }

    // =========================================================================
    // CASO 7: SINCRONIZAR BANCO COMPLETO COM TODAS AS 121 AULAS E 24 PROFESSORES
    // =========================================================================
    else if (acao === "sincronizar_banco_completo") {
      var totalAdicionadas = sincronizarGradeCompleta(ss);
      corrigirGradeDivergente();
      sincronizarProfessores(ss);
      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "Grade sincronizada com sucesso! Aulas adicionadas: " + totalAdicionadas
      });
    }

    // =========================================================================
    // CASO 8: TESTE DIAGNÓSTICO DIRETO DE ENVIO DE E-MAIL
    // =========================================================================
    else if (acao === "testar_envio_email") {
      var dest = dados.destinatario || "eber.santana@ifs.edu.br";
      var resEnvio = dispararEmailTeste(dest);
      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: resEnvio.enviado,
        mensagem: resEnvio.enviado ? "E-mail de teste enviado com sucesso para " + dest : "Falha no envio de e-mail.",
        detalhes: resEnvio
      });
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
 * FUNÇÃO DE INICIALIZAÇÃO E SINCRONIZAÇÃO DA PLANILHA
 * ==============================================================================
 */
function configurarPlanilhaInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Aba Horarios
  var sheetH = obterOuCriarAba(ss, "Horarios", ["ID", "Professor", "Dia", "Hora", "Turma", "Disciplina", "Status", "Substituto", "Obs", "DataFalta"]);
  formatarCabecalho(sheetH, "#1b5e20");
  sincronizarGradeCompleta(ss);

  // 2. Aba Professores
  var sheetP = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
  formatarCabecalho(sheetP, "#1565c0");
  sincronizarProfessores(ss);

  // 3. Demais abas
  var sheetT = obterOuCriarAba(ss, "Trocas_Permutas", CAB_TROCAS);
  formatarCabecalho(sheetT, "#7b1fa2");

  var sheetR = obterOuCriarAba(ss, "Reposicoes", CAB_REPOSICOES);
  formatarCabecalho(sheetR, "#0288d1");

  var sheetHist = obterOuCriarAba(ss, "Historico", ["Data/Hora Registro", "Tipo de Ação", "Professor Titular", "Professor Substituto", "Disciplina", "Turma", "Horário", "Data da Aula"]);
  formatarCabecalho(sheetHist, "#455a64");

  Logger.log("Planilha configurada e sincronizada com sucesso!");
}

function sincronizarGradeCompleta(ss) {
  var sheetH = obterOuCriarAba(ss, "Horarios", ["ID", "Professor", "Dia", "Hora", "Turma", "Disciplina", "Status", "Substituto", "Obs", "DataFalta"]);
  var rows = sheetH.getDataRange().getValues();
  var idsExistentes = {};
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][0]).trim().toUpperCase();
    if (id) idsExistentes[id] = i + 1;
  }

  var adicionadas = 0;
  for (var j = 0; j < GRADE_COMPLETA_OFICIAL.length; j++) {
    var a = GRADE_COMPLETA_OFICIAL[j];
    var idA = String(a[0]).trim().toUpperCase();
    if (!idsExistentes[idA]) {
      sheetH.appendRow(a);
      idsExistentes[idA] = sheetH.getLastRow();
      adicionadas++;
    }
  }
  return adicionadas;
}

function sincronizarProfessores(ss) {
  var sheetP = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
  var rows = sheetP.getDataRange().getValues();
  var profsExistentes = {};
  for (var i = 1; i < rows.length; i++) {
    var p = String(rows[i][0]).trim().toLowerCase();
    if (p) profsExistentes[p] = true;
  }

  var listaProfs = [
    ["Eber", "eber.santana@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Claifton", "claifton.carmo@ifs.edu.br", "Bacharelado em Administração", "1234"],
    ["Érica Delfino", "erica.maria@ifs.edu.br", "Bacharelado em Administração", "1234"],
    ["Adriano", "adriano.vilela@ifs.edu.br", "Administração", "1234"],
    ["Alex", "alexmar.santos@ifs.edu.br", "Administração", "1234"],
    ["Alyrio", "alyrio.neto@ifs.edu.br", "Administração", "1234"],
    ["Ângelo", "angelo.santos@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Christiano", "christiano.santos@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Elliot", "elliott.chaves@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Emerson", "emerson.santos@ifs.edu.br", "Subsequente em Informática", "1234"],
    ["Eric", "eric.sampaio@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Felippe", "felippe.barros@ifs.edu.br", "Administração", "1234"],
    ["Fernanda", "fernanda.bezerra@ifs.edu.br", "Propedêutica / Línguas", "1234"],
    ["Grayce", "grayceane.jesus@ifs.edu.br", "Administração", "1234"],
    ["Pedro Ernesto", "pedro.cruz@ifs.edu.br", "Propedêutica / Química", "1234"],
    ["Pedro Goes", "pedro.gois@ifs.edu.br", "Administração", "1234"],
    ["Luiz Rafael Freitas", "luiz.freitas@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Raisa", "raisa.silveira@ifs.edu.br", "Propedêutica / Biologia", "1234"],
    ["Sanderson", "sanderson.silva@ifs.edu.br", "Propedêutica / Ed. Física", "1234"],
    ["Sérgio", "sergio.costa@ifs.edu.br", "Administração", "1234"],
    ["Vinicius", "vinicius.canhoto@ifs.edu.br", "Propedêutica / Filosofia", "1234"],
    ["Vitor", "vitor.almeida@ifs.edu.br", "Propedêutica / Geografia", "1234"],
    ["Weder", "weder.almeida@ifs.edu.br", "Administração", "1234"],
    ["Welkson", "welkson.nascimento@ifs.edu.br", "Administração", "1234"]
  ];

  for (var k = 0; k < listaProfs.length; k++) {
    var pNome = listaProfs[k][0].trim().toLowerCase();
    if (!profsExistentes[pNome]) {
      sheetP.appendRow(listaProfs[k]);
      profsExistentes[pNome] = true;
    }
  }
}

function formatarCabecalho(sheet, corFundo) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  header.setBackground(corFundo);
  header.setFontColor("#ffffff");
  header.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function obterOuCriarAba(ss, nome, cabecalhos) {
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    sheet.appendRow(cabecalhos);
  } else if (cabecalhos && sheet.getLastColumn() < cabecalhos.length) {
    // Acrescenta colunas novas (ex.: "JSON") em abas criadas por versões antigas
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col, 1, cabecalhos.length - col + 1).setValues([cabecalhos.slice(col - 1)]);
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
      "    <strong>Horário / Quantidade:</strong> " + dia + (hora ? " às " + hora : "") + "<br>" +
      "    <strong>Data Prevista:</strong> " + (dataFalta || "Próxima ocorrência") + "<br>" +
      (motivo ? "<strong>Motivo / Justificativa:</strong> " + motivo + "<br>" : "") + "</p>" +
      "    <p style='margin-top: 20px;'><a href='" + CONFIG_PADRAO.LINK_PAINEL + "' style='background: #1b5e20; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;'>Acessar Painel para Assumir</a></p>" +
      "    <p style='font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;'>Este e-mail foi gerado automaticamente pelo Sistema de Horários e Substituições do IFS Campus Tobias Barreto.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de falta: " + e.toString());
    return { enviado: false, erro: e.toString() };
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
      "    <p style='font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;'>Este e-mail foi gerado automaticamente pelo Sistema de Horários e Substituições do IFS Campus Tobias Barreto.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de substituição: " + e.toString());
    return { enviado: false, erro: e.toString() };
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
      "    <p>📤 <strong>Aula cedida:</strong> " + (t.aulaCedida ? t.aulaCedida.disc + " (" + t.aulaCedida.turma + ") - " + t.aulaCedida.dia + " às " + t.aulaCedida.hora : "-") + "<br>" +
      "    📥 <strong>Aula desejada:</strong> " + (t.aulaDesejada ? t.aulaDesejada.disc + " (" + t.aulaDesejada.turma + ") - " + t.aulaDesejada.dia + " às " + t.aulaDesejada.hora : "-") + "<br>" +
      "    📅 <strong>Data Prevista:</strong> " + (t.dataPrevista || "-") + "<br>" +
      "    📌 <strong>Motivo:</strong> " + (t.motivo || "Acordo mútuo") + "</p>" +
      "    <p>Para aceitar ou recusar, acesse o painel na aba <em>Trocas & Reposições</em>.</p>" +
      "    <p style='font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;'>Este e-mail foi gerado automaticamente pelo Sistema de Horários e Substituições do IFS Campus Tobias Barreto.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de permuta: " + e.toString());
    return { enviado: false, erro: e.toString() };
  }
}

function dispararEmailTrocaConfirmada(destinatario, t) {
  try {
    var assunto = "✅ [PERMUTA CONFIRMADA] Troca aceita entre Prof. " + t.proponente + " e Prof. " + t.colega;
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #1b5e20; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Permuta Homologada com Sucesso</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>A proposta de troca de horário entre o <strong>Prof. " + t.proponente + "</strong> e o <strong>Prof. " + t.colega + "</strong> foi <strong>confirmada e registrada</strong>.</p>" +
      "    <p style='font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;'>Este e-mail foi gerado automaticamente pelo Sistema de Horários e Substituições do IFS Campus Tobias Barreto.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao confirmar permuta: " + e.toString());
    return { enviado: false, erro: e.toString() };
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
      (r.motivo ? "<strong>Justificativa / Conteúdo:</strong> " + r.motivo : "") + "</p>" +
      "    <p style='font-size: 12px; color: #777; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;'>Este e-mail foi gerado automaticamente pelo Sistema de Horários e Substituições do IFS Campus Tobias Barreto.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de reposição: " + e.toString());
    return { enviado: false, erro: e.toString() };
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

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de recuperação de PIN: " + e.toString());
    return { enviado: false, erro: e.toString() };
  }
}

function dispararEmailTeste(destinatario) {
  try {
    var assunto = "🔔 [TESTE DIAGNÓSTICO] Sistema de Horários IFS Campus Tobias Barreto";
    var corpoHtml = "" +
      "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #1b5e20; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background-color: #1b5e20; color: white; padding: 18px 24px;'>" +
      "    <h2 style='margin: 0; font-size: 20px;'>Teste de Conexão e Envio de E-mail</h2>" +
      "    <p style='margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;'>IFS Campus Tobias Barreto</p>" +
      "  </div>" +
      "  <div style='padding: 24px; color: #333; line-height: 1.5;'>" +
      "    <p>Este é um e-mail de teste confirmando que a integração com o Gmail e Google Apps Script está 100% operacional.</p>" +
      "    <p><strong>Destinatário verificado:</strong> " + destinatario + "<br>" +
      "    <strong>Data/Hora do envio:</strong> " + (new Date()).toLocaleString('pt-BR') + "</p>" +
      "    <p style='color: #2e7d32; font-weight: bold;'>Todas as permissões do MailApp foram concedidas com sucesso.</p>" +
      "  </div>" +
      "</div>";

    enviarEmailRegistrado_({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
    return { enviado: true, destinatario: destinatario };
  } catch (e) {
    Logger.log("Erro ao enviar e-mail de teste: " + e.toString());
    return { enviado: false, erro: e.toString() };
  }
}

function criarRespostaJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * ==============================================================================
 * MANTER O SERVIDOR "ACORDADO" (evita respostas de 10-20 s por arranque a frio)
 * ==============================================================================
 * Execute UMA VEZ a função instalarGatilhoAquecimento() pelo editor do Apps Script.
 * Ela agenda manterAquecido() a cada 5 minutos, que deixa o script ativo e o
 * cache da grade sempre pronto para os professores.
 */
function manterAquecido() {
  var cache = CacheService.getScriptCache();
  if (!cache.get("BANCO_TUDO_IFS_V2")) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resposta = {
      grade: montarGrade_(ss),
      trocas: lerObjetosJSON_(ss, "Trocas_Permutas"),
      reposicoes: lerObjetosJSON_(ss, "Reposicoes"),
      professores: listaProfessoresPublica_(ss),
      geradoEm: new Date().getTime()
    };
    try { cache.put("BANCO_TUDO_IFS_V2", JSON.stringify(resposta), 21600); } catch (e) {}
  }
}

function instalarGatilhoAquecimento() {
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === "manterAquecido") ScriptApp.deleteTrigger(g);
  });
  ScriptApp.newTrigger("manterAquecido").timeBased().everyMinutes(5).create();
  manterAquecido();
  Logger.log("Gatilho de aquecimento instalado: manterAquecido a cada 5 minutos.");
}


/**
 * ==============================================================================
 * REPARO DA GRADE: corrige linhas antigas cujo ID aponta para outro dia/horário
 * ==============================================================================
 * Execute UMA VEZ pelo editor: corrigirGradeDivergente()
 * - Ajusta Professor/Dia/Hora/Turma/Disciplina de cada ID conforme GRADE_COMPLETA_OFICIAL
 * - PRESERVA Status, Substituto, Obs e DataFalta (faltas já lançadas vão para a aula certa)
 * - Registra cada alteração na aba "Correcoes_Grade" (dados antigos x novos)
 */
function corrigirGradeDivergente() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Horarios");
  var lastRow = sheet.getLastRow();
  var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var oficial = {};
  GRADE_COMPLETA_OFICIAL.forEach(function (a) { oficial[String(a[0]).trim().toUpperCase()] = a; });

  var log = obterOuCriarAba(ss, "Correcoes_Grade", ["Data", "Linha", "ID", "Antes (prof | dia | hora | turma | disc)", "Depois (prof | dia | hora | turma | disc)", "Status preservado"]);
  var corrigidas = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var id = String(r[0]).trim().toUpperCase();
    var of = oficial[id];
    if (!of) continue;
    var difere = false;
    for (var c = 1; c <= 5; c++) {
      if (String(r[c]).trim() !== String(of[c]).trim()) { difere = true; break; }
    }
    if (!difere) continue;
    var antes = [r[1], r[2], r[3], r[4], r[5]].join(" | ");
    var depois = [of[1], of[2], of[3], of[4], of[5]].join(" | ");
    sheet.getRange(i + 2, 2, 1, 5).setValues([[of[1], of[2], of[3], of[4], of[5]]]);
    log.appendRow([new Date(), i + 2, id, antes, depois, (r[6] || "normal") + (r[9] ? " (" + r[9] + ")" : "")]);
    corrigidas++;
  }
  SpreadsheetApp.flush();
  invalidarCacheGrade();
  Logger.log("Linhas corrigidas: " + corrigidas + ". Detalhes na aba Correcoes_Grade.");
  return corrigidas;
}

/**
 * ==============================================================================
 * GRADE: APLICAR UMA LISTA DE AULAS NA ABA HORARIOS (oficial, importação ou restauração)
 * ==============================================================================
 * - Faz cópia de segurança "Horarios_backup_AAAA-MM-DD_HHmm" antes de mudar
 * - Preserva Status/Substituto/Obs/DataFalta das aulas que continuam existindo
 * - Registra em Correcoes_Grade as aulas removidas que tinham falta/substituição
 * linhas: [[id, prof, dia, hora, turma, disc, status, substituto, obs, dataFalta], ...]
 */
function aplicarLinhasNaGrade_(linhas, origem) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Horarios");
  var lastRow = sheet.getLastRow();
  var antigas = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 10).getValues() : [];

  var carimbo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  var nomeBackup = "Horarios_backup_" + carimbo;
  var extra = 1;
  while (ss.getSheetByName(nomeBackup)) { nomeBackup = "Horarios_backup_" + carimbo + "_" + (++extra); }
  sheet.copyTo(ss).setName(nomeBackup);

  var norm = function (v) { return String(v || "").trim().toLowerCase(); };
  var chaveSlot = function (prof, dia, hora, turma) { return [norm(prof), norm(dia), norm(hora), norm(turma)].join("|"); };
  var porId = {}, porSlot = {};
  antigas.forEach(function (r) {
    porId[String(r[0]).trim().toUpperCase()] = r;
    porSlot[chaveSlot(r[1], r[2], r[3], r[4])] = r;
  });

  var usadas = {};
  var novas = linhas.map(function (a) {
    var slot = chaveSlot(a[1], a[2], a[3], a[4]);
    var velha = porId[String(a[0]).toUpperCase()];
    var mesmoHorario = velha && norm(velha[2]) === norm(a[2]) && norm(velha[3]) === norm(a[3]) && norm(velha[4]) === norm(a[4]);
    if (!mesmoHorario) velha = porSlot[slot];
    if (velha) usadas[String(velha[0]).toUpperCase() + "|" + chaveSlot(velha[1], velha[2], velha[3], velha[4])] = true;
    var obsPadrao = a[8] || "Aula confirmada";
    var temStatus = velha && velha[6] && velha[6] !== "normal";
    return [a[0], a[1], a[2], a[3], a[4], a[5],
            velha ? (velha[6] || "normal") : (a[6] || "normal"),
            velha ? velha[7] : (a[7] || ""),
            temStatus ? velha[8] : obsPadrao,
            velha ? velha[9] : (a[9] || "")];
  });

  var log = obterOuCriarAba(ss, "Correcoes_Grade", ["Data", "Linha", "ID", "Antes (prof | dia | hora | turma | disc)", "Depois (prof | dia | hora | turma | disc)", "Status preservado"]);
  var removidasComStatus = 0;
  antigas.forEach(function (r, i) {
    var k = String(r[0]).trim().toUpperCase() + "|" + chaveSlot(r[1], r[2], r[3], r[4]);
    if (!usadas[k] && r[6] && r[6] !== "normal") {
      log.appendRow([new Date(), i + 2, r[0], [r[1], r[2], r[3], r[4], r[5]].join(" | "), "REMOVIDA (" + (origem || "grade") + ")", r[6] + (r[9] ? " (" + r[9] + ")" : "")]);
      removidasComStatus++;
    }
  });

  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, Math.max(10, sheet.getLastColumn())).clearContent();
  if (novas.length) sheet.getRange(2, 1, novas.length, 10).setValues(novas);
  SpreadsheetApp.flush();
  invalidarCacheGrade();
  Logger.log("Grade aplicada (" + (origem || "") + "): " + novas.length + " aulas (antes: " + antigas.length + "). " +
             "Removidas com falta/substituição: " + removidasComStatus + ". Backup: " + nomeBackup);
  return { total: novas.length, antes: antigas.length, removidasComStatus: removidasComStatus, backup: nomeBackup };
}

/** Executar pelo editor: aplica GRADE_COMPLETA_OFICIAL (o código) na planilha. */
function aplicarGradeOficial() {
  var r = aplicarLinhasNaGrade_(GRADE_COMPLETA_OFICIAL, "grade oficial do código");
  atualizarAbaProfessores();
  Logger.log("Grade oficial aplicada: " + r.total + " aulas (antes: " + r.antes + "). Removidas com falta/substituição: " + r.removidasComStatus + ".");
  return r.total;
}

/**
 * Completa a aba Professores sem apagar o que o administrador editou:
 * - acrescenta quem tem aula e não está na aba (e-mail do código)
 * - troca só e-mails vazios ou do padrão antigo inventado (nome@ifs.edu.br)
 * - marca Ativo = "Não" quem não tem mais aula (não apaga a linha)
 */
function atualizarAbaProfessores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = obterOuCriarAba(ss, "Professores", CAB_PROFESSORES);
  var last = sheet.getLastRow();
  var atuais = last > 1 ? sheet.getRange(2, 1, last - 1, 5).getValues() : [];
  var naGrade = {};
  var hl = ss.getSheetByName("Horarios");
  if (hl && hl.getLastRow() > 1) hl.getRange(2, 2, hl.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) naGrade[String(r[0]).trim()] = true; });
  var vistos = {};
  var linhas = atuais.filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    var nome = String(r[0]).trim(); vistos[nome] = true;
    var email = String(r[1] || "").trim();
    var local = email.split("@")[0] || "";
    if ((!email || local.indexOf(".") === -1) && EMAILS_DOCENTES[nome]) email = EMAILS_DOCENTES[nome];
    var ativo = naGrade[nome] ? "Sim" : (String(r[4] || "").trim() || "Não");
    if (!naGrade[nome]) ativo = "Não";
    return [nome, email, r[2], r[3] || "1234", ativo];
  });
  Object.keys(naGrade).forEach(function (nome) {
    if (vistos[nome] || nome === "A definir") return;
    linhas.push([nome, EMAILS_DOCENTES[nome] || "", "", "1234", "Sim"]);
  });
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(5, sheet.getLastColumn())).clearContent();
  if (linhas.length) sheet.getRange(2, 1, linhas.length, 5).setValues(linhas);
  limparMapaProfessores_();
  Logger.log("Aba Professores atualizada: " + linhas.filter(function (l) { return l[4] === "Sim"; }).length + " professores ativos.");
  return linhas.length;
}

var CAB_PROFESSORES = ["Professor", "Email", "Curso / Departamento", "PIN", "Ativo"];

// Lista sem e-mails, que o app dos professores usa para a tela de login
function listaProfessoresPublica_(ss) {
  var mapa = mapaProfessores_(ss);
  return Object.keys(mapa).map(function (k) { return { nome: mapa[k].nome, curso: mapa[k].curso, ativo: mapa[k].ativo }; });
}

/**
 * ==============================================================================
 * E-MAILS: TODO ENVIO FICA REGISTRADO NA ABA "E-mails_Enviados"
 * ==============================================================================
 */
var ABA_EMAILS = "E-mails_Enviados";
var CAB_EMAILS = ["ID", "Data", "Tipo", "Destinatários", "Assunto", "Status", "Erro", "Corpo"];

function tipoPorAssunto_(assunto) {
  var a = String(assunto || "").toUpperCase();
  if (a.indexOf("SUBSTITUIÇÃO DISPONÍVEL") !== -1) return "Falta";
  if (a.indexOf("SUBSTITUIÇÃO") !== -1) return "Substituição";
  if (a.indexOf("PERMUTA") !== -1 || a.indexOf("TROCA") !== -1) return "Troca";
  if (a.indexOf("REPOSIÇÃO") !== -1) return "Reposição";
  if (a.indexOf("PIN") !== -1) return "PIN";
  if (a.indexOf("TESTE") !== -1) return "Teste";
  return "Aviso";
}

function registrarEmail_(reg) {
  try {
    var sh = obterOuCriarAba(SpreadsheetApp.getActiveSpreadsheet(), ABA_EMAILS, CAB_EMAILS);
    sh.appendRow([reg.id, new Date(), reg.tipo, reg.para, reg.assunto, reg.status, reg.erro || "", String(reg.corpo || "").slice(0, 45000)]);
  } catch (e) { Logger.log("Aviso: não registrou e-mail: " + e); }
}

function enviarEmailRegistrado_(opts) {
  var reg = { id: "EM-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000), tipo: tipoPorAssunto_(opts.subject),
              para: opts.to, assunto: opts.subject, corpo: opts.htmlBody };
  if (!opts.to) { reg.status = "Erro"; reg.erro = "Sem destinatário cadastrado"; registrarEmail_(reg); throw new Error(reg.erro); }
  try {
    MailApp.sendEmail(opts);
    reg.status = "Enviado";
    registrarEmail_(reg);
  } catch (e) {
    reg.status = "Erro"; reg.erro = e.toString();
    registrarEmail_(reg);
    throw e;
  }
}

/** Destinatários da coordenação: guardados no servidor (o admin altera no painel) */
function lerConfigEmails_() {
  var cfg = {
    emailCoordDS: CONFIG_PADRAO.EMAIL_COORD_DS, emailCoordADM: CONFIG_PADRAO.EMAIL_COORD_ADM,
    emailCoordSubsequente: CONFIG_PADRAO.EMAIL_COORD_SUBSEQUENTE, emailCoordGeral: CONFIG_PADRAO.EMAIL_COORD_GERAL,
    emailCoordGraduacao: CONFIG_PADRAO.EMAIL_COORD_GRADUACAO
  };
  try {
    var salvo = JSON.parse(PropertiesService.getScriptProperties().getProperty("EMAILS_CONFIG") || "{}");
    Object.keys(cfg).forEach(function (k) { if (salvo[k]) cfg[k] = salvo[k]; });
  } catch (e) {}
  return cfg;
}

/**
 * ==============================================================================
 * ADMINISTRADORES — senha guardada só como hash nas Propriedades do Script
 * ==============================================================================
 * Cadastro pelo menu "Painel Docente" da planilha (só quem edita a planilha consegue).
 */
function lerAdmins_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("ADMINS") || "{}"); } catch (e) { return {}; }
}
function gravarAdmins_(admins) { PropertiesService.getScriptProperties().setProperty("ADMINS", JSON.stringify(admins)); }

function hashSenha_(salt, senha) {
  var valor = salt + "|" + senha;
  for (var i = 0; i < 300; i++) {
    valor = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, valor + salt, Utilities.Charset.UTF_8));
  }
  return valor;
}

function salvarAdmin_(email, senha) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  if (String(senha || "").length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  var admins = lerAdmins_();
  var salt = Utilities.getUuid();
  admins[email] = { salt: salt, hash: hashSenha_(salt, senha), criadoEm: new Date().toISOString() };
  gravarAdmins_(admins);
  return email;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Painel Docente")
    .addItem("Cadastrar ou alterar administrador", "menuCadastrarAdmin")
    .addItem("Remover administrador", "menuRemoverAdmin")
    .addItem("Listar administradores", "menuListarAdmins")
    .addSeparator()
    .addItem("Abrir painel administrativo", "menuAbrirPainel")
    .addToUi();
}

function menuCadastrarAdmin() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt("Administrador", "E-mail do administrador (ex.: eber.santana@ifs.edu.br):", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt("Senha", "Crie a senha (mínimo 8 caracteres). Ela não é mostrada depois e só fica guardada como código protegido:", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  try { var em = salvarAdmin_(r1.getResponseText(), r2.getResponseText()); ui.alert("Administrador salvo: " + em); }
  catch (e) { ui.alert("Não foi possível salvar: " + e.message); }
}
function menuRemoverAdmin() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("Remover administrador", "E-mail a remover:", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var admins = lerAdmins_(); var em = r.getResponseText().trim().toLowerCase();
  if (!admins[em]) { ui.alert("Não encontrado: " + em); return; }
  delete admins[em]; gravarAdmins_(admins); ui.alert("Removido: " + em);
}
function menuListarAdmins() {
  var lista = Object.keys(lerAdmins_());
  SpreadsheetApp.getUi().alert(lista.length ? "Administradores:\n\n" + lista.join("\n") : "Nenhum administrador cadastrado ainda.");
}
function menuAbrirPainel() {
  var url = CONFIG_PADRAO.LINK_PAINEL + "admin.html";
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<p style="font-family:Arial">Abra o painel em:<br><a href="' + url + '" target="_blank">' + url + '</a></p>').setWidth(420).setHeight(110), "Painel administrativo");
}

/**
 * ==============================================================================
 * ROTEADOR DAS AÇÕES DE ADMINISTRAÇÃO (doPost com acao "admin_*")
 * ==============================================================================
 */
function adminRouter_(d) {
  try {
    if (d.acao === "admin_login") return criarRespostaJSON(adminLogin_(d));
    var email = d.token ? CacheService.getScriptCache().get("ADMTOK_" + d.token) : null;
    if (!email) return criarRespostaJSON({ sucesso: false, sessaoExpirada: true, erro: "Sessão expirada. Entre novamente." });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var leitura = { admin_resumo: 1, admin_emails_listar: 1, admin_prof_listar: 1, admin_versoes: 1, admin_historico: 1, admin_config_ler: 1, admin_importar_previa: 1 };
    if (leitura[d.acao]) return criarRespostaJSON(adminExecutar_(d, ss, email));
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return criarRespostaJSON({ sucesso: false, erro: "Sistema ocupado. Tente de novo em alguns segundos." });
    try { return criarRespostaJSON(adminExecutar_(d, ss, email)); }
    finally { lock.releaseLock(); }
  } catch (err) {
    return criarRespostaJSON({ sucesso: false, erro: String(err && err.message || err) });
  }
}

function adminLogin_(d) {
  var cache = CacheService.getScriptCache();
  var email = String(d.email || "").trim().toLowerCase();
  var chaveFalhas = "ADMFAIL_" + email;
  var falhas = parseInt(cache.get(chaveFalhas) || "0", 10);
  if (falhas >= 5) return { sucesso: false, erro: "Muitas tentativas. Aguarde 15 minutos." };
  var a = lerAdmins_()[email];
  if (!a || hashSenha_(a.salt, String(d.senha || "")) !== a.hash) {
    cache.put(chaveFalhas, String(falhas + 1), 900);
    Utilities.sleep(800);
    return { sucesso: false, erro: "E-mail ou senha incorretos." };
  }
  cache.remove(chaveFalhas);
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  cache.put("ADMTOK_" + token, email, 21600);
  return { sucesso: true, token: token, email: email };
}

function adminExecutar_(d, ss, email) {
  switch (d.acao) {
    case "admin_sair": CacheService.getScriptCache().remove("ADMTOK_" + d.token); return { sucesso: true };
    case "admin_resumo": return admResumo_(ss);
    case "admin_emails_listar": return admEmailsListar_(ss, d);
    case "admin_emails_acao": return admEmailsAcao_(ss, d);
    case "admin_aula_salvar": return admAulaSalvar_(ss, d, email);
    case "admin_aula_excluir": return admAulaExcluir_(ss, d, email);
    case "admin_aulas_atribuir": return admAulasAtribuir_(ss, d, email);
    case "admin_aula_status": return admAulaStatus_(ss, d, email);
    case "admin_prof_listar": return admProfListar_(ss);
    case "admin_prof_salvar": return admProfSalvar_(ss, d, email);
    case "admin_prof_desligar": return admProfDesligar_(ss, d, email);
    case "admin_importar_previa": return admImportarPrevia_(ss, d);
    case "admin_importar_aplicar": return admImportarAplicar_(ss, d, email);
    case "admin_versoes": return admVersoes_(ss);
    case "admin_restaurar": return admRestaurar_(ss, d, email);
    case "admin_historico": return admHistorico_(ss);
    case "admin_config_ler": return { sucesso: true, config: lerConfigEmails_(), admins: Object.keys(lerAdmins_()) };
    case "admin_config_salvar": return admConfigSalvar_(d);
  }
  return { sucesso: false, erro: "Ação desconhecida." };
}

// ---------- utilidades da grade ----------
function lerLinhasHorarios_(ss) {
  var sh = ss.getSheetByName("Horarios");
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().map(function (r, i) { r.__linha = i + 2; return r; }).filter(function (r) { return r[0] && r[1]; });
}
function normTxt_(v) { return String(v || "").trim().toLowerCase(); }
function ehDivisaoAB_(disc) { return /\s-\s?[AB]$/i.test(String(disc || "").trim()); }

// Choques: o professor em 2 lugares, ou a turma com 2 aulas (exceto divisão A/B do mesmo horário)
function conflitosDaAula_(linhas, aula, ignorarIds) {
  var ign = {}; (ignorarIds || []).forEach(function (i) { ign[String(i).toUpperCase()] = true; });
  var msgs = [];
  linhas.forEach(function (r) {
    if (ign[String(r[0]).toUpperCase()] || normTxt_(r[2]) !== normTxt_(aula.dia) || normTxt_(r[3]) !== normTxt_(aula.hora)) return;
    if (aula.professor !== "A definir" && normTxt_(r[1]) === normTxt_(aula.professor) && normTxt_(r[4]) !== normTxt_(aula.turma))
      msgs.push("Prof. " + r[1] + " já tem aula nesse horário: " + r[5] + " (" + r[4] + ")");
    if (normTxt_(r[4]) === normTxt_(aula.turma) && !(ehDivisaoAB_(r[5]) && ehDivisaoAB_(aula.disc)))
      msgs.push("A turma " + r[4] + " já tem " + r[5] + " (Prof. " + r[1] + ") nesse horário");
  });
  return msgs;
}

function prefixoDoProfessor_(linhas, prof) {
  for (var i = 0; i < linhas.length; i++) if (normTxt_(linhas[i][1]) === normTxt_(prof)) return String(linhas[i][0]).split("-")[0];
  var base = String(prof).normalize ? String(prof).normalize("NFD").replace(/[̀-ͯ]/g, "") : String(prof);
  var letras = base.replace(/[^A-Za-z ]/g, "").split(" ").filter(String);
  var cand = (letras.length > 1 ? letras[0][0] + letras[letras.length - 1][0] : (letras[0] || "PX").slice(0, 2)).toUpperCase();
  var usados = {}; linhas.forEach(function (r) { usados[String(r[0]).split("-")[0]] = String(r[1]); });
  var tentativa = cand, n = 2;
  while (usados[tentativa] && normTxt_(usados[tentativa]) !== normTxt_(prof)) tentativa = cand + (n++);
  return tentativa;
}
function proximoId_(linhas, prefixo) {
  var max = 0;
  linhas.forEach(function (r) { var p = String(r[0]).split("-"); if (p[0] === prefixo) max = Math.max(max, parseInt(p[1], 10) || 0); });
  return prefixo + "-" + (max + 1);
}

// ---------- visão geral ----------
function admResumo_(ss) {
  var linhas = lerLinhasHorarios_(ss);
  var mapa = mapaProfessores_(ss);
  var ativos = Object.keys(mapa).filter(function (k) { return mapa[k].ativo; });
  var faltas = [], assumidasInativo = [], aDefinir = 0;
  linhas.forEach(function (r) {
    if (r[1] === "A definir") aDefinir++;
    if (r[6] === "alert" && !r[7]) faltas.push({ id: r[0], prof: r[1], dia: r[2], hora: r[3], turma: r[4], disc: r[5], obs: r[8], data: formatarDataBR(r[9]) });
    if (r[6] === "assumed" && r[7]) { var p = mapa[normTxt_(r[7])]; if (!p || !p.ativo) assumidasInativo.push({ id: r[0], prof: r[1], dia: r[2], hora: r[3], turma: r[4], disc: r[5], substituto: r[7] }); }
  });
  var conflitos = [], vistos = {};
  linhas.forEach(function (r) {
    if (r[1] === "A definir") return;
    var k = normTxt_(r[1]) + "|" + normTxt_(r[2]) + "|" + normTxt_(r[3]);
    if (vistos[k] && normTxt_(vistos[k][4]) !== normTxt_(r[4])) conflitos.push({ prof: r[1], dia: r[2], hora: r[3], turmas: vistos[k][4] + " e " + r[4] });
    vistos[k] = r;
  });
  var emails = { total: 0, erros: 0 };
  var sh = ss.getSheetByName(ABA_EMAILS);
  if (sh && sh.getLastRow() > 1) {
    var limite = new Date().getTime() - 7 * 86400000;
    sh.getRange(2, 2, sh.getLastRow() - 1, 5).getValues().forEach(function (r) {
      if (new Date(r[0]).getTime() >= limite) { emails.total++; if (r[4] === "Erro") emails.erros++; }
    });
  }
  var versoes = admVersoes_(ss).versoes;
  return { sucesso: true, totalAulas: linhas.length, aDefinir: aDefinir, professoresAtivos: ativos.length,
           professoresInativos: Object.keys(mapa).length - ativos.length, faltas: faltas, assumidasInativo: assumidasInativo,
           conflitos: conflitos, emails: emails, ultimaVersao: versoes[0] || null };
}

// ---------- e-mails ----------
function admEmailsListar_(ss, d) {
  var sh = ss.getSheetByName(ABA_EMAILS);
  if (!sh || sh.getLastRow() < 2) return { sucesso: true, emails: [] };
  var total = sh.getLastRow() - 1, limite = Math.min(total, d.limite || 500);
  var rows = sh.getRange(sh.getLastRow() - limite + 1, 1, limite, 7).getValues();
  var lista = rows.reverse().filter(function (r) { return r[0]; }).map(function (r) {
    return { id: r[0], data: new Date(r[1]).getTime(), tipo: r[2], para: r[3], assunto: r[4], status: r[5], erro: r[6] };
  });
  return { sucesso: true, emails: lista, total: total };
}

function admEmailsAcao_(ss, d) {
  var sh = ss.getSheetByName(ABA_EMAILS);
  if (!sh || sh.getLastRow() < 2) return { sucesso: true, afetados: 0 };
  var alvo = {}; (d.ids || []).forEach(function (i) { alvo[i] = true; });
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var linhas = [];
  ids.forEach(function (r, i) { if (alvo[r[0]]) linhas.push(i + 2); });
  if (d.tipo === "apagar") {
    linhas.sort(function (a, b) { return b - a; }).forEach(function (l) { sh.deleteRow(l); });
  } else if (d.tipo === "arquivar" || d.tipo === "desarquivar") {
    linhas.forEach(function (l) {
      var st = sh.getRange(l, 6).getValue();
      if (d.tipo === "arquivar" && st !== "Arquivado") sh.getRange(l, 6, 1, 2).setValues([["Arquivado", (sh.getRange(l, 7).getValue() || "") + (st ? " [antes: " + st + "]" : "")]]);
      if (d.tipo === "desarquivar" && st === "Arquivado") {
        var antes = String(sh.getRange(l, 7).getValue()).match(/\[antes: (\w+)\]/);
        sh.getRange(l, 6).setValue(antes ? antes[1] : "Enviado");
        sh.getRange(l, 7).setValue(String(sh.getRange(l, 7).getValue()).replace(/\s?\[antes: \w+\]/, ""));
      }
    });
  } else if (d.tipo === "reenviar") {
    var enviados = 0, falhas = [];
    linhas.forEach(function (l) {
      var r = sh.getRange(l, 1, 1, 8).getValues()[0];
      try { enviarEmailRegistrado_({ to: r[3], subject: r[4], htmlBody: r[7] || r[4] }); enviados++; sh.getRange(l, 6).setValue("Reenviado"); }
      catch (e) { falhas.push(r[4] + ": " + e.message); }
    });
    return { sucesso: falhas.length === 0, afetados: enviados, falhas: falhas };
  } else {
    return { sucesso: false, erro: "Ação inválida." };
  }
  return { sucesso: true, afetados: linhas.length };
}

// ---------- aulas ----------
function admAulaSalvar_(ss, d, admin) {
  var a = d.aula || {};
  ["professor", "dia", "hora", "turma", "disc"].forEach(function (c) { if (!String(a[c] || "").trim()) throw new Error("Preencha o campo " + c + "."); });
  var sh = ss.getSheetByName("Horarios");
  var linhas = lerLinhasHorarios_(ss);
  var conf = conflitosDaAula_(linhas, a, a.id ? [a.id] : []);
  if (conf.length && !d.forcar) return { sucesso: false, conflitos: conf };
  var obs = a.sala ? "Aula confirmada (" + a.sala + ")" : "Aula confirmada";
  var linhaA = -1;
  if (a.id) linhas.forEach(function (r) { if (String(r[0]).toUpperCase() === String(a.id).toUpperCase()) linhaA = r.__linha; });
  if (a.id && linhaA !== -1) {
    var atual = sh.getRange(linhaA, 1, 1, 10).getValues()[0];
    var mudouProf = normTxt_(atual[1]) !== normTxt_(a.professor);
    sh.getRange(linhaA, 2, 1, 5).setValues([[a.professor, a.dia, a.hora, a.turma, a.disc]]);
    if (atual[6] === "normal" || !atual[6]) sh.getRange(linhaA, 9).setValue(obs);
    registrarHistorico(ss, "ADMIN_EDITOU_AULA", atual[1], mudouProf ? a.professor : "", a.disc, a.turma, a.dia + " às " + a.hora, admin);
    return { sucesso: true, id: a.id };
  }
  var id = proximoId_(linhas, prefixoDoProfessor_(linhas, a.professor));
  sh.appendRow([id, a.professor, a.dia, a.hora, a.turma, a.disc, "normal", "", obs, ""]);
  registrarHistorico(ss, "ADMIN_CRIOU_AULA", a.professor, "", a.disc, a.turma, a.dia + " às " + a.hora, admin);
  return { sucesso: true, id: id };
}

function admAulaExcluir_(ss, d, admin) {
  var sh = ss.getSheetByName("Horarios");
  var linhas = lerLinhasHorarios_(ss), alvo = null;
  linhas.forEach(function (r) { if (String(r[0]).toUpperCase() === String(d.id).toUpperCase()) alvo = r; });
  if (!alvo) throw new Error("Aula não encontrada.");
  sh.deleteRow(alvo.__linha);
  registrarHistorico(ss, "ADMIN_EXCLUIU_AULA", alvo[1], "", alvo[5], alvo[4], alvo[2] + " às " + alvo[3], admin);
  return { sucesso: true };
}

function admAulasAtribuir_(ss, d, admin) {
  var sh = ss.getSheetByName("Horarios");
  var linhas = lerLinhasHorarios_(ss);
  var alvo = {}; (d.ids || []).forEach(function (i) { alvo[String(i).toUpperCase()] = true; });
  var selecionadas = linhas.filter(function (r) { return alvo[String(r[0]).toUpperCase()]; });
  if (!selecionadas.length) throw new Error("Nenhuma aula selecionada.");
  var conf = [];
  selecionadas.forEach(function (r) {
    conflitosDaAula_(linhas, { professor: d.professor, dia: r[2], hora: r[3], turma: r[4], disc: r[5] }, d.ids)
      .forEach(function (m) { if (m.indexOf("Prof. ") === 0) conf.push(r[2] + " " + r[3] + ": " + m); });
  });
  if (conf.length && !d.forcar) return { sucesso: false, conflitos: conf };
  selecionadas.forEach(function (r) {
    sh.getRange(r.__linha, 2).setValue(d.professor);
    registrarHistorico(ss, "ADMIN_ATRIBUIU_AULA", r[1], d.professor, r[5], r[4], r[2] + " às " + r[3], admin);
  });
  return { sucesso: true, afetadas: selecionadas.length };
}

function admAulaStatus_(ss, d, admin) {
  var sh = ss.getSheetByName("Horarios");
  var linhas = lerLinhasHorarios_(ss), r = null;
  linhas.forEach(function (x) { if (String(x[0]).toUpperCase() === String(d.id).toUpperCase()) r = x; });
  if (!r) throw new Error("Aula não encontrada.");
  if (d.tipo === "assumir") {
    if (!d.substituto) throw new Error("Escolha o substituto.");
    var conf = conflitosDaAula_(linhas, { professor: d.substituto, dia: r[2], hora: r[3], turma: r[4], disc: r[5] }, [r[0]]).filter(function (m) { return m.indexOf("Prof. ") === 0; });
    if (conf.length && !d.forcar) return { sucesso: false, conflitos: conf };
    sh.getRange(r.__linha, 7, 1, 3).setValues([["assumed", d.substituto, "Substituição indicada pela coordenação"]]);
    registrarHistorico(ss, "SUBSTITUICAO_INDICADA_ADMIN", r[1], d.substituto, r[5], r[4], r[2] + " às " + r[3], formatarDataBR(r[9]));
    try {
      var cfg = lerConfigEmails_();
      var dest = [obterEmailsPorTurma(r[4], cfg), obterEmailProfessor(ss, r[1]), obterEmailProfessor(ss, d.substituto)].filter(String).join(", ");
      dispararEmailSubstituicaoAssumida(dest, r[1], d.substituto, r[5], r[4], r[2], r[3]);
    } catch (e) {}
  } else if (d.tipo === "liberar") {
    sh.getRange(r.__linha, 7, 1, 3).setValues([["alert", "", "⚠️ Substituto indisponível — aula liberada pela coordenação"]]);
    registrarHistorico(ss, "AULA_LIBERADA_ADMIN", r[1], r[7], r[5], r[4], r[2] + " às " + r[3], formatarDataBR(r[9]));
  } else if (d.tipo === "normal") {
    sh.getRange(r.__linha, 7, 1, 4).setValues([["normal", "", "Aula confirmada", ""]]);
    registrarHistorico(ss, "AULA_NORMALIZADA_ADMIN", r[1], "", r[5], r[4], r[2] + " às " + r[3], "");
  } else throw new Error("Ação inválida.");
  return { sucesso: true };
}

// ---------- professores ----------
function admProfListar_(ss) {
  var mapa = mapaProfessores_(ss);
  var contagem = {};
  lerLinhasHorarios_(ss).forEach(function (r) { var k = normTxt_(r[1]); contagem[k] = (contagem[k] || 0) + 1; });
  var lista = Object.keys(mapa).map(function (k) { var p = mapa[k]; return { nome: p.nome, email: p.email, curso: p.curso, ativo: p.ativo, aulas: contagem[k] || 0 }; });
  lista.sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
  return { sucesso: true, professores: lista, aDefinir: contagem["a definir"] || 0 };
}

function admProfSalvar_(ss, d, admin) {
  var nome = String(d.nome || "").trim(), email = String(d.email || "").trim().toLowerCase();
  if (!nome) throw new Error("Informe o nome.");
  if (nome.toLowerCase() === "a definir") throw new Error("Nome reservado.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  var sh = obterOuCriarAba(ss, "Professores", CAB_PROFESSORES);
  var mapa = mapaProfessores_(ss);
  var original = String(d.nomeOriginal || nome).trim();
  var existente = mapa[original.toLowerCase()];
  if (original.toLowerCase() !== nome.toLowerCase() && mapa[nome.toLowerCase()]) throw new Error("Já existe um professor com esse nome.");
  var linha = [nome, email, String(d.curso || "").trim(), existente ? (sh.getRange(existente.linha, 4).getValue() || "1234") : "1234", d.ativo === false ? "Não" : "Sim"];
  if (existente) sh.getRange(existente.linha, 1, 1, 5).setValues([linha]); else sh.appendRow(linha);
  // Renomear: atualiza a grade (titular e substituto)
  var renomeadas = 0;
  if (existente && original !== nome) {
    var hs = ss.getSheetByName("Horarios");
    lerLinhasHorarios_(ss).forEach(function (r) {
      if (normTxt_(r[1]) === original.toLowerCase()) { hs.getRange(r.__linha, 2).setValue(nome); renomeadas++; }
      if (normTxt_(r[7]) === original.toLowerCase()) hs.getRange(r.__linha, 8).setValue(nome);
    });
  }
  limparMapaProfessores_();
  registrarHistorico(ss, existente ? "ADMIN_EDITOU_PROFESSOR" : "ADMIN_CADASTROU_PROFESSOR", nome, "", email, "", "", admin);
  return { sucesso: true, renomeadas: renomeadas };
}

function admProfDesligar_(ss, d, admin) {
  var mapa = mapaProfessores_(ss), p = mapa[normTxt_(d.nome)];
  if (!p) throw new Error("Professor não encontrado.");
  var destino = d.transferirPara || "A definir";
  var linhas = lerLinhasHorarios_(ss).filter(function (r) { return normTxt_(r[1]) === normTxt_(d.nome); });
  if (destino !== "A definir") {
    var todas = lerLinhasHorarios_(ss), ids = linhas.map(function (r) { return r[0]; }), conf = [];
    linhas.forEach(function (r) { conflitosDaAula_(todas, { professor: destino, dia: r[2], hora: r[3], turma: r[4], disc: r[5] }, ids).forEach(function (m) { if (m.indexOf("Prof. ") === 0) conf.push(r[2] + " " + r[3] + ": " + m); }); });
    if (conf.length && !d.forcar) return { sucesso: false, conflitos: conf };
  }
  var hs = ss.getSheetByName("Horarios");
  linhas.forEach(function (r) { hs.getRange(r.__linha, 2).setValue(destino); });
  ss.getSheetByName("Professores").getRange(p.linha, 5).setValue("Não");
  limparMapaProfessores_();
  registrarHistorico(ss, "ADMIN_DESLIGOU_PROFESSOR", d.nome, destino, linhas.length + " aulas transferidas", "", "", admin);
  return { sucesso: true, transferidas: linhas.length };
}

// ---------- importação ----------
var DIAS_VALIDOS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
function normDia_(v) {
  var t = normTxt_(v).normalize ? normTxt_(v).normalize("NFD").replace(/[̀-ͯ]/g, "") : normTxt_(v);
  var mapa = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5 };
  var k = t.slice(0, 3);
  return mapa.hasOwnProperty(k) ? DIAS_VALIDOS[mapa[k]] : "";
}
function normHora_(v) {
  var m = String(v || "").match(/(\d{1,2})\s*[:hH]\s*(\d{2})\D+(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!m) return "";
  var p = function (n) { return ("0" + parseInt(n, 10)).slice(-2); };
  return p(m[1]) + ":" + m[2] + " - " + p(m[3]) + ":" + m[4];
}

function admImportarPrevia_(ss, d) {
  var entrada = d.linhas || [];
  if (!entrada.length) throw new Error("O arquivo não tem aulas.");
  if (entrada.length > 2000) throw new Error("Arquivo grande demais (máx. 2000 aulas).");
  var mapa = mapaProfessores_(ss);
  var erros = [], avisos = [], novas = [];
  entrada.forEach(function (l, i) {
    var n = i + 2;
    var prof = String(l.professor || "").trim(), dia = normDia_(l.dia), hora = normHora_(l.horario || l.hora), turma = String(l.turma || "").trim(), disc = String(l.disciplina || l.disc || "").trim();
    if (!prof || !dia || !hora || !turma || !disc) { erros.push("Linha " + n + ": falta " + [!prof && "Professor", !dia && "Dia", !hora && "Horário", !turma && "Turma", !disc && "Disciplina"].filter(Boolean).join(", ")); return; }
    var p = mapa[prof.toLowerCase()];
    if (prof !== "A definir" && !p) { erros.push("Linha " + n + ": professor “" + prof + "” não está cadastrado. Cadastre antes em Professores."); return; }
    if (p) prof = p.nome;
    if (p && !p.ativo) avisos.push("Linha " + n + ": " + prof + " está desligado(a)");
    novas.push({ professor: prof, dia: dia, hora: hora, turma: turma, disc: disc, sala: String(l.sala || "").trim() });
  });
  // choques dentro do próprio arquivo
  var conflitos = [], porProf = {}, porTurma = {};
  novas.forEach(function (a) {
    var kp = normTxt_(a.professor) + "|" + a.dia + "|" + a.hora, kt = normTxt_(a.turma) + "|" + a.dia + "|" + a.hora;
    if (a.professor !== "A definir" && porProf[kp] && normTxt_(porProf[kp].turma) !== normTxt_(a.turma)) conflitos.push("Prof. " + a.professor + " em " + porProf[kp].turma + " e " + a.turma + " · " + a.dia + " " + a.hora);
    if (porTurma[kt] && !(ehDivisaoAB_(porTurma[kt].disc) && ehDivisaoAB_(a.disc))) conflitos.push(a.turma + " com " + porTurma[kt].disc + " e " + a.disc + " · " + a.dia + " " + a.hora);
    porProf[kp] = a; porTurma[kt] = a;
  });
  // comparação com a grade atual
  var atuais = lerLinhasHorarios_(ss);
  var porSlotProf = {}, porSlotDisc = {};
  atuais.forEach(function (r) { porSlotProf[[normTxt_(r[1]), normTxt_(r[2]), normTxt_(r[3]), normTxt_(r[4])].join("|")] = r; porSlotDisc[[normTxt_(r[2]), normTxt_(r[3]), normTxt_(r[4]), normTxt_(r[5])].join("|")] = r; });
  var usados = {}, mudancas = [], cont = { entram: 0, saem: 0, professor: 0, disciplina: 0, iguais: 0 };
  var trabalho = atuais.slice(); var linhasFinais = [];
  novas.forEach(function (a) {
    var r = porSlotProf[[normTxt_(a.professor), normTxt_(a.dia), normTxt_(a.hora), normTxt_(a.turma)].join("|")];
    if (r && usados[r[0]]) r = null;
    var tipo;
    if (r) { tipo = normTxt_(r[5]) === normTxt_(a.disc) ? "igual" : "disciplina"; }
    else {
      r = porSlotDisc[[normTxt_(a.dia), normTxt_(a.hora), normTxt_(a.turma), normTxt_(a.disc)].join("|")];
      if (r && usados[r[0]]) r = null;
      tipo = r ? "professor" : "entra";
    }
    var id = r ? r[0] : proximoId_(trabalho, prefixoDoProfessor_(trabalho, a.professor));
    if (!r) trabalho.push([id, a.professor]);
    if (r) usados[r[0]] = true;
    if (tipo === "igual") cont.iguais++; else if (tipo === "entra") cont.entram++; else cont[tipo]++;
    if (tipo !== "igual") mudancas.push({ tipo: tipo, aula: a.disc + " · " + a.turma, antes: r ? (tipo === "professor" ? r[1] : r[5]) : "", depois: tipo === "disciplina" ? a.disc : a.professor + " · " + a.dia + " " + a.hora });
    linhasFinais.push([id, a.professor, a.dia, a.hora, a.turma, a.disc, "normal", "", a.sala ? "Aula confirmada (" + a.sala + ")" : "Aula confirmada", ""]);
  });
  var preservados = [], perdidos = [];
  atuais.forEach(function (r) {
    var temStatus = r[6] && r[6] !== "normal";
    if (!usados[r[0]]) { cont.saem++; mudancas.push({ tipo: "sai", aula: r[5] + " · " + r[4], antes: r[1] + " · " + r[2] + " " + r[3], depois: "" }); if (temStatus) perdidos.push(r[1] + " · " + r[5] + " (" + r[4] + ") " + r[2] + " " + r[3]); }
    else if (temStatus) preservados.push((r[6] === "alert" ? "Falta" : "Substituição") + " · " + r[1] + " · " + r[5] + " (" + r[4] + ")");
  });
  if (erros.length) return { sucesso: false, erros: erros.slice(0, 50), totalErros: erros.length };
  var previaId = Utilities.getUuid();
  var json = JSON.stringify(linhasFinais);
  // O cache aceita até 100 KB por chave: guarda em partes de 30 mil caracteres (acentos ocupam mais bytes)
  var cache = CacheService.getScriptCache(), partes = Math.ceil(json.length / 30000);
  for (var i = 0; i < partes; i++) cache.put("IMPORT_" + previaId + "_" + i, json.slice(i * 30000, (i + 1) * 30000), 1800);
  cache.put("IMPORT_" + previaId, String(partes), 1800);
  return { sucesso: true, previaId: previaId, total: linhasFinais.length, contagem: cont, mudancas: mudancas.slice(0, 400),
           conflitos: conflitos, avisos: avisos, preservados: preservados, perdidos: perdidos };
}

function admImportarAplicar_(ss, d, admin) {
  var cache = CacheService.getScriptCache(), partes = parseInt(cache.get("IMPORT_" + d.previaId) || "0", 10);
  if (!partes) throw new Error("A prévia expirou (30 min). Envie o arquivo de novo.");
  var json = ""; for (var i = 0; i < partes; i++) json += cache.get("IMPORT_" + d.previaId + "_" + i) || "";
  var linhas = JSON.parse(json);
  var r = aplicarLinhasNaGrade_(linhas, "importação por " + admin);
  cache.remove("IMPORT_" + d.previaId);
  registrarHistorico(ss, "ADMIN_IMPORTOU_GRADE", admin, "", r.total + " aulas", "", "", r.backup);
  return { sucesso: true, resultado: r };
}

// ---------- versões ----------
function admVersoes_(ss) {
  var lista = ss.getSheets().map(function (sh) { return sh.getName(); }).filter(function (n) { return n.indexOf("Horarios_backup_") === 0; })
    .map(function (n) { var sh = ss.getSheetByName(n); return { nome: n, aulas: Math.max(0, sh.getLastRow() - 1) }; });
  lista.sort(function (a, b) { return a.nome < b.nome ? 1 : -1; });
  return { sucesso: true, versoes: lista };
}

function admRestaurar_(ss, d, admin) {
  var sh = ss.getSheetByName(d.nome);
  if (!sh || String(d.nome).indexOf("Horarios_backup_") !== 0) throw new Error("Versão não encontrada.");
  var linhas = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().filter(function (r) { return r[0] && r[1]; }) : [];
  var r = aplicarLinhasNaGrade_(linhas, "restauração de " + d.nome + " por " + admin);
  registrarHistorico(ss, "ADMIN_RESTAUROU_GRADE", admin, "", d.nome, "", "", r.backup);
  return { sucesso: true, resultado: r };
}

// ---------- histórico e configurações ----------
function admHistorico_(ss) {
  var sh = ss.getSheetByName("Historico");
  if (!sh || sh.getLastRow() < 2) return { sucesso: true, linhas: [] };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().map(function (r) { r[0] = Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"); return r; });
  return { sucesso: true, cabecalho: ["Data/Hora", "Tipo", "Titular", "Substituto", "Disciplina", "Turma", "Horário", "Data da aula"], linhas: rows.reverse() };
}

function admConfigSalvar_(d) {
  var c = d.config || {}, limpo = {};
  ["emailCoordDS", "emailCoordADM", "emailCoordSubsequente", "emailCoordGeral", "emailCoordGraduacao"].forEach(function (k) {
    var v = String(c[k] || "").trim().toLowerCase();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("E-mail inválido: " + v);
    if (v) limpo[k] = v;
  });
  PropertiesService.getScriptProperties().setProperty("EMAILS_CONFIG", JSON.stringify(limpo));
  return { sucesso: true, config: lerConfigEmails_() };
}
