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

  // Curso cadastrado (Cadastros → Turmas/Cursos) tem prioridade sobre as regras pelo nome
  try {
    var curso = cursoDaTurma_(lerCadastros_(), turma);
    if (curso && curso.email) {
      dests.push(curso.email);
      var geral = cfg.emailCoordGeral || CONFIG_PADRAO.EMAIL_COORD_GERAL;
      if (geral && dests.indexOf(geral) === -1) dests.push(geral);
      return dests.join(", ");
    }
  } catch (eCad) {}

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
      obs: obsPublica_(r[6], r[8]),
      dataFalta: formatarDataBR(r[9] || ""),
      linhaExcel: i + 2
    });
  }
  return banco;
}

// O motivo da ausência (ex.: consulta médica) é dado pessoal: fica na planilha e no e-mail
// para a coordenação, mas não vai para a lista pública que todos os aparelhos baixam.
function obsPublica_(status, obs) {
  obs = String(obs || "");
  if (status === "alert") return "⚠️ Ausência registrada";
  return obs;
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
    if (acao === "meusAvisos") return criarRespostaJSON(meusAvisos_(e.parameter.professor));
    if (acao === "meuBanco") return criarRespostaJSON(meuBanco_(e.parameter.professor));
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
        coordenacoes: lerConfigEmails_(),
        cadastros: cadastrosPublicos_(ss),
        servidor: lerUrlServidor_(),
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
    var soLeitura = /^admin_(cadastros_ler|login|primeiro_acesso|convidar|remover_admin|versao_apagar|historico_arquivar|banco_listar|banco_decidir|banco_lancar|sair|resumo|versoes|historico|config_ler|importar_previa|emails_listar|emails_acao|prof_listar|config_salvar)$/.test(dadosAdm.acao);
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
    var dados = limparEntrada_(JSON.parse(e.postData.contents));
    var acao = dados.acao;
    var limite = limiteDeUso_(acao, dados);
    if (limite) { lock.releaseLock(); return criarRespostaJSON({ sucesso: false, erro: limite }); }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var negada = sessaoProfessorExigida_(ss, acao, dados);
    if (negada) { lock.releaseLock(); return criarRespostaJSON(negada); }
    if (acao === "login_professor") { lock.releaseLock(); return criarRespostaJSON(loginProfessor_(ss, dados)); }
    if (acao === "trocar_pin") { lock.releaseLock(); return criarRespostaJSON(trocarPinProfessor_(ss, dados)); }
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
      bancoRegistrarCobertura_(ss, sheetHorarios.getRange(linhaAlvo, 1).getValue(), dados.profOriginal, dados.substituto, sheetHorarios.getRange(linhaAlvo, 10).getValue(), dia, hora, turma, disc);
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
          bancoCancelarPendentesDaAula_(ss, sheetHorarios.getRange(linhaAlvo, 1).getValue(), "AUSENCIA");
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
      // PIN temporário aleatório, enviado SÓ ao e-mail cadastrado do professor (nunca devolvido na resposta)
      var prof = String(dados.professor || "").trim();
      var emailProf = obterEmailProfessor(ss, prof);
      var regPin = prof ? linhaPinProfessor_(ss, prof) : null;
      if (!regPin || !emailProf) {
        lock.releaseLock();
        return criarRespostaJSON({ sucesso: false, erro: "Este professor não tem e-mail cadastrado. Fale com a coordenação para redefinir o PIN." });
      }
      var temp = ("" + (100000 + Math.floor(Math.random() * 900000)));
      var saltT = Utilities.getUuid();
      regPin.sh.getRange(regPin.linha, 4).setNumberFormat("@").setValue("h1$" + saltT + "$" + hashSenha_(saltT, temp));
      var resEnvio = dispararEmailRecuperacaoPin(emailProf, regPin.nome, temp);
      lock.releaseLock();
      return criarRespostaJSON({
        sucesso: true,
        mensagem: "PIN temporário enviado ao e-mail institucional.",
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
        bancoCancelarPendentesDaAula_(ss, sheetHorarios.getRange(linhaAlvo, 1).getValue(), "AUSENCIA");
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

    else if (acao === "banco_assumir" || acao === "banco_cancelar") {
      var respBanco;
      try { respBanco = acao === "banco_assumir" ? bancoAssumir_(ss, dados) : bancoCancelarDoProfessor_(ss, dados); }
      catch (eB) { respBanco = { sucesso: false, erro: String(eB && eB.message || eB) }; }
      lock.releaseLock();
      return criarRespostaJSON(respBanco);
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
    // "sincronizar_banco_completo" e "testar_envio_email" foram retiradas do acesso público:
    // reescreviam a grade e enviavam e-mail para qualquer endereço sem login.
    // Para testar e-mail: execute dispararEmailTeste("seu@email") no editor do Apps Script.

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
        coordenacoes: lerConfigEmails_(),
        cadastros: cadastrosPublicos_(ss),
        servidor: lerUrlServidor_(),
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

// Remove caracteres de marcação e limita o tamanho de todo texto que chega do app
function limparEntrada_(v, prof) {
  prof = prof || 0;
  if (prof > 6) return null;
  if (typeof v === "string") return v.replace(/[<>]/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 600);
  if (Array.isArray(v)) return v.slice(0, 200).map(function (x) { return limparEntrada_(x, prof + 1); });
  if (v && typeof v === "object") {
    var o = {};
    Object.keys(v).slice(0, 80).forEach(function (k) { o[k] = limparEntrada_(v[k], prof + 1); });
    return o;
  }
  return v;
}


/**
 * ==============================================================================
 * LOGIN DO PROFESSOR: o PIN é conferido AQUI, nunca no navegador
 * ==============================================================================
 * - PIN guardado na aba Professores (coluna PIN). Vazio = PIN padrão 1234.
 *   Depois que o professor troca, fica gravado só o "hash" (não dá para ler o PIN na planilha).
 * - O login devolve um token assinado (30 dias). Sem token válido, as ações em nome
 *   do professor (liberar, assumir, trocar, repor, banco de aulas) são recusadas.
 * - Trocar o PIN ou resetá-lo invalida os tokens antigos.
 */
var PIN_PADRAO_ = "1234";

function linhaPinProfessor_(ss, prof) {
  var sh = obterOuCriarAba(ss, "Professores", ["Professor", "Email", "Curso / Departamento", "PIN"]);
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (normTxt_(rows[i][0]) === normTxt_(prof)) return { sh: sh, linha: i + 2, nome: String(rows[i][0]).trim(), pin: rows[i][3] };
  }
  return null;
}

function pinConfere_(guardado, digitado) {
  var g = String(guardado === null || guardado === undefined ? "" : guardado).trim();
  var d = String(digitado || "").trim();
  if (!d) return false;
  if (g.indexOf("h1$") === 0) {
    var partes = g.split("$");
    return partes.length === 3 && hashSenha_(partes[1], d) === partes[2];
  }
  if (!g) g = PIN_PADRAO_;
  if (/^\d{1,3}$/.test(g)) g = ("0000" + g).slice(-4); // planilha tirou os zeros à esquerda
  return g === d;
}

function carimboPin_(guardado) {
  var g = String(guardado === null || guardado === undefined ? "" : guardado);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "pin|" + g, Utilities.Charset.UTF_8)).slice(0, 10);
}

function segredoSessao_() {
  var props = PropertiesService.getScriptProperties();
  var seg = props.getProperty("SEGREDO_SESSAO");
  if (!seg) { seg = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("SEGREDO_SESSAO", seg); }
  return seg;
}

function assinar_(texto) {
  var bytes = Utilities.computeHmacSha256Signature(texto, segredoSessao_());
  return Utilities.base64EncodeWebSafe(bytes);
}

function emitirTokenProfessor_(nome, pinGuardado) {
  var exp = new Date().getTime() + 30 * 24 * 3600 * 1000;
  var carga = nome + "|" + exp + "|" + carimboPin_(pinGuardado);
  return Utilities.base64EncodeWebSafe(carga) + "." + assinar_(carga);
}

// Devolve o nome do professor dono do token, ou "" se inválido/expirado
function professorDoToken_(ss, token) {
  try {
    var partes = String(token || "").split(".");
    if (partes.length !== 2) return "";
    var bytes = Utilities.base64DecodeWebSafe(partes[0]);
    var carga = Utilities.newBlob(bytes).getDataAsString("UTF-8");
    if (assinar_(carga) !== partes[1]) return "";
    var c = carga.split("|");
    if (c.length !== 3 || parseInt(c[1], 10) < new Date().getTime()) return "";
    var reg = linhaPinProfessor_(ss, c[0]);
    if (!reg || carimboPin_(reg.pin) !== c[2]) return "";
    var mapa = mapaProfessores_(ss)[String(reg.nome).toLowerCase()];
    if (mapa && mapa.ativo === false) return "";
    return reg.nome;
  } catch (e) { return ""; }
}

function loginProfessor_(ss, d) {
  var prof = String(d.professor || "").trim();
  var reg = prof ? linhaPinProfessor_(ss, prof) : null;
  var generico = { sucesso: false, erro: "Professor ou PIN incorretos. Se você ainda não alterou, o PIN padrão é " + PIN_PADRAO_ + "." };
  if (!reg) return generico;
  var m = mapaProfessores_(ss)[String(reg.nome).toLowerCase()];
  if (m && m.ativo === false) return { sucesso: false, erro: "Este professor está inativo. Fale com a coordenação." };
  if (!pinConfere_(reg.pin, d.pin)) return generico;
  return { sucesso: true, professor: reg.nome, token: emitirTokenProfessor_(reg.nome, reg.pin), pinPadrao: !String(reg.pin || "").trim() || String(reg.pin).trim() === PIN_PADRAO_ };
}

function trocarPinProfessor_(ss, d) {
  var dono = professorDoToken_(ss, d.token);
  if (!dono) return { sucesso: false, sessaoExpirada: true, erro: "Sessão expirada. Faça login novamente." };
  var prof = String(d.professor || "").trim();
  if (normTxt_(prof) !== normTxt_(dono)) return { sucesso: false, erro: "Sessão de outro professor." };
  var reg = linhaPinProfessor_(ss, dono);
  if (!reg) return { sucesso: false, erro: "Professor não encontrado." };
  if (!pinConfere_(reg.pin, d.pinAtual)) return { sucesso: false, erro: "O PIN atual está incorreto." };
  var novo = String(d.pinNovo || "").trim();
  if (!/^\d{4,8}$/.test(novo)) return { sucesso: false, erro: "O novo PIN deve ter de 4 a 8 números." };
  if (novo === PIN_PADRAO_) return { sucesso: false, erro: "Escolha um PIN diferente do padrão (" + PIN_PADRAO_ + ")." };
  var salt = Utilities.getUuid();
  var guardado = "h1$" + salt + "$" + hashSenha_(salt, novo);
  reg.sh.getRange(reg.linha, 4).setNumberFormat("@").setValue(guardado);
  registrarHistorico(ss, "PIN_ALTERADO", dono, "", "-", "-", "-", "");
  return { sucesso: true, mensagem: "PIN alterado.", token: emitirTokenProfessor_(dono, guardado) };
}

// Ações em nome do professor só valem com sessão válida (e do próprio professor, quando o corpo diz quem é)
var ACOES_COM_SESSAO_ = { libertar: "profOriginal", libertar_multiplos: "profOriginal", recuperar: "profOriginal", recuperar_multiplos: "profOriginal",
  cancelar: "profOriginal", assumir: "substituto", propor_troca: "", aceitar_troca: "", recusar_troca: "", agendar_reposicao: "", cancelar_reposicao: "",
  banco_assumir: "professor", banco_cancelar: "professor" };

function sessaoProfessorExigida_(ss, acao, d) {
  if (!Object.prototype.hasOwnProperty.call(ACOES_COM_SESSAO_, acao)) return null;
  var dono = professorDoToken_(ss, d.token);
  if (!dono) return { sucesso: false, sessaoExpirada: true, erro: "Sessão expirada. Entre novamente com o seu PIN." };
  var campo = ACOES_COM_SESSAO_[acao];
  if (campo && d[campo] && normTxt_(d[campo]) !== normTxt_(dono)) return { sucesso: false, sessaoExpirada: true, erro: "Esta ação pertence a outro professor." };
  return null;
}

// Limite de uso para as ações que enviam e-mail (evita disparo em massa)
function limiteDeUso_(acao, dados) {
  var regras = { login_professor: [12, 900], trocar_pin: [8, 900], recuperar_pin: [3, 3600], libertar: [30, 3600], libertar_multiplos: [30, 3600], assumir: [30, 3600],
                 propor_troca: [15, 3600], aceitar_troca: [15, 3600], agendar_reposicao: [15, 3600], banco_assumir: [20, 3600], banco_cancelar: [30, 3600] };
  var r = regras[acao];
  if (!r) return "";
  var quem = String(dados.professor || dados.profOriginal || dados.substituto || (dados.troca && dados.troca.proponente) || (dados.reposicao && dados.reposicao.professor) || "?");
  var cache = CacheService.getScriptCache();
  var chaves = ["RL_" + acao + "_" + quem.toLowerCase(), "RL_GLOBAL"];
  var limites = [r[0], 200];
  for (var i = 0; i < chaves.length; i++) {
    var n = parseInt(cache.get(chaves[i]) || "0", 10);
    if (n >= limites[i]) return "Muitas solicitações em pouco tempo. Tente de novo mais tarde.";
    cache.put(chaves[i], String(n + 1), r[1]);
  }
  return "";
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
  try {
    completarTurmas_(ss, novas.map(function (r) { return r[4]; }));
    completarDisciplinas_(ss, novas.map(function (r) { return { turma: r[4], disc: r[5] }; }));
  } catch (eCad) { Logger.log("Cadastros: " + eCad); }
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

/**
 * Avisos de UM professor: só os e-mails em que o e-mail dele está entre os destinatários.
 * Não devolve corpo nem a lista de destinatários (só o que ele precisa ver).
 */
function meusAvisos_(professor) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var email = obterEmailProfessor(ss, String(professor || "").trim()).toLowerCase();
  if (!email) return { sucesso: true, avisos: [] };
  var sh = ss.getSheetByName(ABA_EMAILS);
  if (!sh || sh.getLastRow() < 2) return { sucesso: true, avisos: [] };
  var n = Math.min(sh.getLastRow() - 1, 1500);
  var rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 6).getValues();
  var lista = [];
  for (var i = rows.length - 1; i >= 0 && lista.length < 80; i--) {
    var r = rows[i];
    if (!r[0] || String(r[3]).toLowerCase().indexOf(email) === -1) continue;
    lista.push({ id: r[0], data: new Date(r[1]).getTime(), tipo: r[2], assunto: r[4], status: r[5] === "Erro" ? "Erro" : "Enviado" });
  }
  return { sucesso: true, avisos: lista };
}

// Endereço oficial do servidor (definido no painel admin). Vazio = os apps usam o endereço embutido.
var RX_URL_SERVIDOR = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
function lerUrlServidor_() {
  return PropertiesService.getScriptProperties().getProperty("URL_SERVIDOR") || "";
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

/**
 * PRIMEIRO ACESSO SEM MENU: selecione esta função no editor do Apps Script e clique em Executar.
 * O código aparece no "Registro de execução" e vale por 30 minutos, para 1 cadastro.
 * Depois abra admin.html → "Primeiro acesso" e informe e-mail, código e a senha nova.
 */
function gerarCodigoAdministrador() {
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  PropertiesService.getScriptProperties().setProperty("ADMIN_SETUP", JSON.stringify({
    salt: "setup", hash: hashSenha_("setup", codigo), expira: new Date().getTime() + 30 * 60000, tentativas: 0
  }));
  Logger.log("CÓDIGO DE PRIMEIRO ACESSO: " + codigo + "  (vale 30 minutos, para cadastrar 1 administrador)");
  Logger.log("Abra " + CONFIG_PADRAO.LINK_PAINEL + "admin.html → Primeiro acesso");
  return codigo;
}

function lerConvites_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("ADMIN_CONVITES") || "{}"); } catch (e) { return {}; }
}
function gravarConvites_(c) {
  var agora = new Date().getTime();
  Object.keys(c).forEach(function (k) { if (c[k].expira < agora) delete c[k]; });
  PropertiesService.getScriptProperties().setProperty("ADMIN_CONVITES", JSON.stringify(c));
}

function adminPrimeiroAcesso_(d) {
  var props = PropertiesService.getScriptProperties();
  var email = String(d.email || "").trim().toLowerCase();
  var codigo = String(d.codigo || "").trim();
  var agora = new Date().getTime();

  // a) convite feito por outro administrador (vale só para aquele e-mail)
  var convites = lerConvites_();
  var cv = convites[email];
  if (cv && agora <= cv.expira) {
    if (hashSenha_("convite", codigo) === cv.hash) {
      var novo = salvarAdmin_(email, d.senha);
      delete convites[email]; gravarConvites_(convites);
      return adminLogin_({ email: novo, senha: d.senha });
    }
    cv.tentativas = (cv.tentativas || 0) + 1;
    if (cv.tentativas >= 5) delete convites[email];
    gravarConvites_(convites);
    Utilities.sleep(800);
    return { sucesso: false, erro: cv.tentativas >= 5 ? "Código bloqueado após 5 erros. Peça um convite novo." : "Código incorreto." };
  }

  // b) código geral gerado no Apps Script (gerarCodigoAdministrador)
  var setup = null;
  try { setup = JSON.parse(props.getProperty("ADMIN_SETUP") || "null"); } catch (e) {}
  if (!setup || agora > setup.expira) return { sucesso: false, erro: "Código inexistente ou vencido para este e-mail. Peça um convite novo a um administrador." };
  if (hashSenha_("setup", codigo) !== setup.hash) {
    setup.tentativas = (setup.tentativas || 0) + 1;
    if (setup.tentativas >= 5) props.deleteProperty("ADMIN_SETUP"); else props.setProperty("ADMIN_SETUP", JSON.stringify(setup));
    Utilities.sleep(800);
    return { sucesso: false, erro: setup.tentativas >= 5 ? "Código bloqueado após 5 erros. Gere outro." : "Código incorreto." };
  }
  var emailSalvo = salvarAdmin_(email, d.senha);
  props.deleteProperty("ADMIN_SETUP");
  return adminLogin_({ email: emailSalvo, senha: d.senha });
}

// "Esqueci a senha": envia um código de 6 números (vale 30 min) ao e-mail do administrador.
// A resposta é sempre a mesma, exista o e-mail ou não (não revela quem é administrador).
// O código é usado na mesma tela de "Primeiro acesso" (admin_primeiro_acesso), que grava a senha nova.
function adminEsqueciSenha_(d) {
  var email = String(d.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { sucesso: false, erro: "Digite um e-mail válido." };
  var resposta = { sucesso: true, mensagem: "Se este e-mail for de um administrador, enviamos um código de 6 números para ele. Confira também a caixa de spam." };
  var cache = CacheService.getScriptCache();
  var chaves = ["RL_ADMESQ_" + email, "RL_ADMESQ_GLOBAL"], limites = [3, 20];
  for (var i = 0; i < chaves.length; i++) {
    var n = parseInt(cache.get(chaves[i]) || "0", 10);
    if (n >= limites[i]) return { sucesso: false, erro: "Muitos pedidos em pouco tempo. Tente de novo em cerca de 1 hora." };
    cache.put(chaves[i], String(n + 1), 3600);
  }
  if (!lerAdmins_()[email]) return resposta;
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var convites = lerConvites_();
  convites[email] = { hash: hashSenha_("convite", codigo), expira: new Date().getTime() + 30 * 60000, tentativas: 0, por: "esqueci-senha" };
  gravarConvites_(convites);
  var link = CONFIG_PADRAO.LINK_PAINEL + "admin.html";
  try {
    enviarEmailRegistrado_({ to: email, subject: "Código para redefinir sua senha (Painel Docente IFS)",
      htmlBody: "<div style='font-family:Arial,sans-serif;font-size:15px;color:#1c2420'>" +
        "<p>Recebemos um pedido para redefinir a senha de administrador do <strong>Painel Docente — IFS Campus Tobias Barreto</strong>.</p>" +
        "<p>Informe o código abaixo em <a href='" + link + "'>" + link + "</a> (tela de redefinição) e crie uma senha nova:</p>" +
        "<p style='font-size:26px;font-weight:bold;letter-spacing:4px'>" + codigo + "</p>" +
        "<p style='color:#5b6660'>O código vale 30 minutos. Se não foi você, ignore este e-mail: a senha atual continua valendo.</p></div>" });
  } catch (e) { Logger.log("Falha ao enviar código de redefinição: " + (e && e.message || e)); }
  return resposta;
}

// Convite: gera código de 6 números para um e-mail (vale 48 h) e envia por e-mail
function admConvidar_(d, quem) {
  var email = String(d.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var convites = lerConvites_();
  convites[email] = { hash: hashSenha_("convite", codigo), expira: new Date().getTime() + 48 * 3600000, tentativas: 0, por: quem };
  gravarConvites_(convites);
  var link = CONFIG_PADRAO.LINK_PAINEL + "admin.html";
  var enviado = true, erroEnvio = "";
  try {
    enviarEmailRegistrado_({ to: email, subject: "Convite: acesso ao painel administrativo (Painel Docente IFS)",
      htmlBody: "<div style='font-family:Arial,sans-serif;font-size:15px;color:#1c2420'>" +
        "<p>Você recebeu acesso de administrador ao <strong>Painel Docente — IFS Campus Tobias Barreto</strong>.</p>" +
        "<p>1. Abra <a href='" + link + "'>" + link + "</a><br>2. Clique em <strong>Primeiro acesso (tenho um código)</strong><br>" +
        "3. Informe este e-mail (" + email + "), o código abaixo e crie sua senha.</p>" +
        "<p style='font-size:26px;font-weight:bold;letter-spacing:4px'>" + codigo + "</p>" +
        "<p style='color:#5b6660'>O código vale 48 horas e só funciona para este e-mail. Convite enviado por " + quem + ".</p></div>" });
  } catch (e) { enviado = false; erroEnvio = String(e.message || e); }
  return { sucesso: true, codigo: codigo, enviado: enviado, erroEnvio: erroEnvio, link: link };
}

function admRemoverAdmin_(d, quem) {
  var email = String(d.email || "").trim().toLowerCase();
  if (email === quem) throw new Error("Você não pode remover o seu próprio acesso.");
  var admins = lerAdmins_();
  if (admins[email]) { delete admins[email]; gravarAdmins_(admins); }
  var convites = lerConvites_();
  if (convites[email]) { delete convites[email]; gravarConvites_(convites); }
  return { sucesso: true };
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
    if (d.acao === "admin_esqueci_senha") {
      var lockES = LockService.getScriptLock(); lockES.tryLock(10000);
      try { return criarRespostaJSON(adminEsqueciSenha_(d)); } finally { lockES.releaseLock(); }
    }
    if (d.acao === "admin_primeiro_acesso") {
      var lockPA = LockService.getScriptLock(); lockPA.tryLock(10000);
      try { return criarRespostaJSON(adminPrimeiroAcesso_(d)); } finally { lockPA.releaseLock(); }
    }
    var email = d.token ? CacheService.getScriptCache().get("ADMTOK_" + d.token) : null;
    if (email && !lerAdmins_()[email]) { CacheService.getScriptCache().remove("ADMTOK_" + d.token); email = null; }
    if (!email) return criarRespostaJSON({ sucesso: false, sessaoExpirada: true, erro: "Sessão expirada. Entre novamente." });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var leitura = { admin_cadastros_ler: 1, admin_banco_listar: 1, admin_resumo: 1, admin_emails_listar: 1, admin_prof_listar: 1, admin_versoes: 1, admin_historico: 1, admin_config_ler: 1, admin_importar_previa: 1 };
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
    case "admin_versao_apagar": return admVersaoApagar_(ss, d, email);
    case "admin_historico": return admHistorico_(ss, d);
    case "admin_historico_arquivar": return admHistoricoArquivar_(ss, email);
    case "admin_config_ler":
      var conv = lerConvites_(), agoraCv = new Date().getTime();
      return { sucesso: true, config: lerConfigEmails_(), admins: Object.keys(lerAdmins_()), eu: email, servidorUrl: lerUrlServidor_(),
               convites: Object.keys(conv).filter(function (k) { return conv[k].expira > agoraCv; }).map(function (k) { return { email: k, expira: conv[k].expira }; }) };
    case "admin_convidar": return admConvidar_(d, email);
    case "admin_servidor_salvar":
      var u = String(d.url || "").trim();
      if (u && !RX_URL_SERVIDOR.test(u)) throw new Error("Endereço inválido. Use o link do Apps Script que termina em /exec.");
      if (u) PropertiesService.getScriptProperties().setProperty("URL_SERVIDOR", u); else PropertiesService.getScriptProperties().deleteProperty("URL_SERVIDOR");
      return { sucesso: true, servidorUrl: u };
    case "admin_remover_admin": return admRemoverAdmin_(d, email);
    case "admin_config_salvar": return admConfigSalvar_(d);
    case "admin_cadastros_ler": return admCadastrosLer_(ss);
    case "admin_cadastro_salvar": return admCadastroSalvar_(ss, d, email);
    case "admin_cadastro_excluir": return admCadastroExcluir_(ss, d, email);
    case "admin_turnos_organizar": return admTurnosOrganizar_(ss, d, email);
    case "admin_tempos_copiar": return admTemposCopiar_(ss, d, email);
    case "admin_tempos_definir": return admTemposDefinir_(ss, d, email);
    case "admin_tempos_pausas": return admTemposPausas_(ss, d, email);
    case "admin_banco_listar": return admBancoListar_(ss);
    case "admin_banco_decidir": return admBancoDecidir_(ss, d, email);
    case "admin_banco_lancar": return admBancoLancar_(ss, d, email);
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
           conflitos: conflitos, emails: emails, ultimaVersao: versoes[0] || null,
           bancoPendentes: lerBanco_(ss).filter(function (b) { return b.status === "pendente"; }).length };
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
  var cadA = lerCadastros_(ss);
  if (cadA.turmas.length && !cadA.turmas.some(function (t) { return normTxt_(t.nome) === normTxt_(a.turma); }))
    throw new Error("A turma “" + a.turma + "” não está cadastrada. Cadastre em Grade → Cadastros → Turmas.");
  var conf = conflitosDaAula_(linhas, a, a.id ? [a.id] : []);
  if (conf.length && !d.forcar) return { sucesso: false, conflitos: conf };
  completarDisciplinas_(ss, [{ turma: a.turma, disc: a.disc }]);
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
    bancoRegistrarCobertura_(ss, r[0], r[1], d.substituto, r[9], r[2], r[3], r[4], r[5]);
    try {
      var cfg = lerConfigEmails_();
      var dest = [obterEmailsPorTurma(r[4], cfg), obterEmailProfessor(ss, r[1]), obterEmailProfessor(ss, d.substituto)].filter(String).join(", ");
      dispararEmailSubstituicaoAssumida(dest, r[1], d.substituto, r[5], r[4], r[2], r[3]);
    } catch (e) {}
  } else if (d.tipo === "liberar") {
    sh.getRange(r.__linha, 7, 1, 3).setValues([["alert", "", "⚠️ Substituto indisponível — aula liberada pela coordenação"]]);
    registrarHistorico(ss, "AULA_LIBERADA_ADMIN", r[1], r[7], r[5], r[4], r[2] + " às " + r[3], formatarDataBR(r[9]));
    bancoCancelarPendentesDaAula_(ss, r[0], "AUSENCIA");
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
  if (existente && original !== nome) {
    var shDp = ss.getSheetByName("Disciplinas");
    if (shDp && shDp.getLastRow() >= 2) lerTabela_(ss, "Disciplinas", CAB_DISCIPLINAS).forEach(function (r) {
      if (normTxt_(r[3]) === original.toLowerCase()) shDp.getRange(r.__linha, 4).setValue(nome);
    });
  }
  limparMapaProfessores_();
  limparCadastros_();
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
  var cadI = lerCadastros_(ss), discNovas = {}, horasFora = {};
  var erros = [], avisos = [], novas = [];
  entrada.forEach(function (l, i) {
    var n = i + 2;
    var prof = String(l.professor || "").trim(), dia = normDia_(l.dia), hora = normHora_(l.horario || l.hora), turma = String(l.turma || "").trim(), disc = String(l.disciplina || l.disc || "").trim();
    if (!prof || !dia || !hora || !turma || !disc) { erros.push("Linha " + n + ": falta " + [!prof && "Professor", !dia && "Dia", !hora && "Horário", !turma && "Turma", !disc && "Disciplina"].filter(Boolean).join(", ")); return; }
    var p = mapa[prof.toLowerCase()];
    if (prof !== "A definir" && !p) { erros.push("Linha " + n + ": professor “" + prof + "” não está cadastrado. Cadastre antes em Professores."); return; }
    if (p) prof = p.nome;
    if (p && !p.ativo) avisos.push("Linha " + n + ": " + prof + " está desligado(a)");
    if (cadI.turmas.length) {
      var tc = cadI.turmas.filter(function (t) { return normTxt_(t.nome) === normTxt_(turma); })[0];
      if (!tc) { erros.push("Linha " + n + ": turma “" + turma + "” não está cadastrada. Cadastre em Grade → Cadastros → Turmas."); return; }
      turma = tc.nome;
      var cc = cursoDaTurma_(cadI, turma);
      if (cc && !cadI.disciplinas.some(function (x) { return x.curso === cc.id && normTxt_(x.nome) === normTxt_(disc); })) discNovas[cc.id + "|" + disc] = disc + " (" + cc.nome + ")";
      if (cc && temposDaTurma_(cadI, cc, turma).length && !tempoDaAula_(cadI, cc, turma, hora)) horasFora[turma + " " + hora] = 1;
    }
    novas.push({ professor: prof, dia: dia, hora: hora, turma: turma, disc: disc, sala: String(l.sala || "").trim() });
  });
  Object.keys(discNovas).forEach(function (k) { avisos.push("Disciplina nova, será cadastrada: " + discNovas[k]); });
  Object.keys(horasFora).forEach(function (k) { avisos.push("Horário fora dos tempos cadastrados do turno: " + k); });
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
  r.disciplinasNovas = completarDisciplinas_(ss, linhas.map(function (l) { return { turma: l[4], disc: l[5] }; }));
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

function admVersaoApagar_(ss, d, admin) {
  var nome = String(d.nome || "");
  var sh = ss.getSheetByName(nome);
  if (!sh || nome.indexOf("Horarios_backup_") !== 0) throw new Error("Versão não encontrada.");
  ss.deleteSheet(sh);
  registrarHistorico(ss, "ADMIN_APAGOU_VERSAO", admin, "", nome, "", "", "");
  return { sucesso: true };
}

// ---------- histórico e configurações ----------
var CAB_HIST = ["Data/Hora Registro", "Tipo de Ação", "Professor Titular", "Professor Substituto", "Disciplina", "Turma", "Horário", "Data da Aula"];
function lerHist_(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().filter(function (r) { return r[0] || r[1]; })
    .map(function (r) { var d = new Date(r[0]); r[0] = isNaN(d) ? String(r[0]) : Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"); return r; });
}
// d.arquivo: lista o arquivo; d.incluirArquivo: atual + arquivo (para exportar)
function admHistorico_(ss, d) {
  d = d || {};
  var atual = lerHist_(ss, "Historico"), arq = lerHist_(ss, "Historico_Arquivo");
  var linhas = d.arquivo ? arq : d.incluirArquivo ? arq.concat(atual) : atual;
  return { sucesso: true, cabecalho: ["Data/Hora", "Tipo", "Titular", "Substituto", "Disciplina", "Turma", "Horário", "Data da aula"],
           linhas: linhas.reverse(), totalAtual: atual.length, totalArquivo: arq.length };
}

// Move os registros do Histórico para a aba Historico_Arquivo (nada é apagado)
function admHistoricoArquivar_(ss, admin) {
  var sh = ss.getSheetByName("Historico");
  if (!sh || sh.getLastRow() < 2) return { sucesso: true, arquivados: 0 };
  var n = sh.getLastRow() - 1;
  var valores = sh.getRange(2, 1, n, 8).getValues();
  var arq = obterOuCriarAba(ss, "Historico_Arquivo", CAB_HIST.concat(["Arquivado em", "Arquivado por"]));
  var agora = new Date();
  var linhas = valores.map(function (r) { return r.concat([agora, admin]); });
  arq.getRange(arq.getLastRow() + 1, 1, linhas.length, 10).setValues(linhas);
  sh.deleteRows(2, n);
  return { sucesso: true, arquivados: n };
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

/**
 * ==============================================================================
 * CADASTROS: CURSOS, TURMAS, DISCIPLINAS E HORÁRIOS (TEMPOS DE AULA)
 * ==============================================================================
 * Abas: Cursos, Turmas, Disciplinas, Tempos. Na primeira leitura são preenchidas
 * a partir da grade atual. O curso da turma define o e-mail da coordenação.
 */
var CAB_CURSOS = ["ID", "Curso", "Turno", "E-mail coordenação", "Ativo"];
var CAB_TURMAS = ["Turma", "Curso (ID)", "Ativo"];
var CAB_DISCIPLINAS = ["Disciplina", "Curso (ID)", "Ativo", "Professor"];
var CAB_TEMPOS = ["Turno", "Horário", "Ordem", "Turma", "Tipo"];
// Tipo do horário: "" = aula; "Almoço" ou "Intervalo" = pausa (não recebe aulas)
function tipoPausa_(v) {
  var t = String(v || "").trim().toLowerCase().normalize ? String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : String(v || "").trim().toLowerCase();
  if (t.indexOf("almoco") !== -1) return "Almoço";
  if (t.indexOf("interval") !== -1) return "Intervalo";
  return "";
}
var TURNOS = ["Matutino", "Vespertino", "Diurno", "Noturno"];

// Um curso pode ter mais de um turno (ex.: integral = "Matutino, Vespertino")
function turnosDe_(v) {
  var l = String(v || "").split(/[,;\/]+/).map(function (t) { return t.trim(); }).filter(function (t) { return TURNOS.indexOf(t) !== -1; });
  return l.length ? l : ["Diurno"];
}
// turno (do curso) em que a hora está cadastrada; "" se não houver
function turnoDaHora_(cad, curso, hora, turma) {
  var h = tempoDaAula_(cad, curso, turma, hora);
  return h ? h.turno : "";
}
// Horários que valem para uma turma: os próprios dela (aba Tempos, coluna Turma);
// se ela não tem nenhum, os padrões (coluna Turma vazia) dos turnos do curso.
function temposDaTurma_(cad, curso, turma) {
  var t = normTxt_(turma);
  if (t) {
    var proprios = cad.tempos.filter(function (h) { return h.turma && normTxt_(h.turma) === t; });
    if (proprios.length) return proprios;
  }
  var ts = curso ? curso.turnos : [];
  return cad.tempos.filter(function (h) { return !h.turma && ts.indexOf(h.turno) !== -1; });
}
function tempoDaAula_(cad, curso, turma, hora) {
  return temposDaTurma_(cad, curso, turma).filter(function (h) { return h.hora === hora; })[0] || null;
}
function horaEmMin_(hora) { var m = String(hora || "").match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
function horaFimMin_(hora) { var m = String(hora || "").match(/-\s*(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }

var __cadastros = null;
function limparCadastros_() { __cadastros = null; }

function lerTabela_(ss, nome, cab) {
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).getValues()
    .map(function (r, i) { r.__linha = i + 2; return r; })
    .filter(function (r) { return String(r[0]).trim() !== ""; });
}
function ativoTxt_(v) { var t = String(v || "Sim").trim().toLowerCase(); return t !== "não" && t !== "nao"; }

function cursoPorRegra_(turma) {
  var t = String(turma || "").toUpperCase();
  if (t.indexOf("GRADUA") !== -1) return "GRAD";
  if (/(^|[^A-Z])FIC([^A-Z]|$)/.test(t)) return "FIC";
  if (t.indexOf("SUBSEQUENTE") !== -1 || t.indexOf("INFO") !== -1) return "INFO";
  if (t.indexOf("COMÉRCIO") !== -1 || t.indexOf("COMERCIO") !== -1) return "COM";
  if (t.indexOf("DS") !== -1) return "DS";
  if (t.indexOf("ADM") !== -1) return "ADM";
  return "";
}

function semearCadastros_(ss) {
  var cfg = lerConfigEmails_();
  var linhas = lerLinhasHorarios_(ss);
  var cursosBase = [
    ["DS", "Técnico Integrado em Desenvolvimento de Sistemas", "Diurno", cfg.emailCoordDS, "Sim"],
    ["ADM", "Técnico Integrado em Administração", "Diurno", cfg.emailCoordADM, "Sim"],
    ["INFO", "Técnico Subsequente em Informática", "Noturno", cfg.emailCoordSubsequente, "Sim"],
    ["GRAD", "Bacharelado em Administração", "Noturno", cfg.emailCoordGraduacao || "", "Sim"]
  ];
  var turmas = {}, discs = {}, tempos = {};
  linhas.forEach(function (r) {
    var c = cursoPorRegra_(r[4]) || "DS";
    turmas[r[4]] = c;
    discs[c + "|" + r[5]] = [r[5], c];
    var turno = cursosBase.filter(function (x) { return x[0] === c; })[0];
    tempos[(turno ? turno[2] : "Diurno") + "|" + r[3]] = [turno ? turno[2] : "Diurno", r[3]];
  });
  var shC = obterOuCriarAba(ss, "Cursos", CAB_CURSOS);
  if (shC.getLastRow() < 2) shC.getRange(2, 1, cursosBase.length, 5).setValues(cursosBase);
  var shT = obterOuCriarAba(ss, "Turmas", CAB_TURMAS);
  var lt = Object.keys(turmas).sort().map(function (t) { return [t, turmas[t], "Sim"]; });
  if (shT.getLastRow() < 2 && lt.length) shT.getRange(2, 1, lt.length, 3).setValues(lt);
  var shD = obterOuCriarAba(ss, "Disciplinas", CAB_DISCIPLINAS);
  var ld = Object.keys(discs).sort().map(function (k) { return [discs[k][0], discs[k][1], "Sim"]; });
  if (shD.getLastRow() < 2 && ld.length) shD.getRange(2, 1, ld.length, 3).setValues(ld);
  var shH = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
  var lh = Object.keys(tempos).map(function (k) { return tempos[k]; })
    .sort(function (a, b) { return a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1); });
  var ordem = {};
  lh = lh.map(function (x) { ordem[x[0]] = (ordem[x[0]] || 0) + 1; return [x[0], x[1], ordem[x[0]]]; });
  if (shH.getLastRow() < 2 && lh.length) shH.getRange(2, 1, lh.length, 3).setValues(lh);
}

function lerCadastros_(ss) {
  if (__cadastros) return __cadastros;
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("Cursos")) { try { semearCadastros_(ss); } catch (e) { Logger.log("Cadastros: " + e); } }
  var cursos = lerTabela_(ss, "Cursos", CAB_CURSOS).map(function (r) {
    return { id: String(r[0]).trim(), nome: String(r[1]).trim(), turnos: turnosDe_(r[2]), turno: turnosDe_(r[2]).join(", "), email: String(r[3]).trim(), ativo: ativoTxt_(r[4]), linha: r.__linha };
  });
  var turmas = lerTabela_(ss, "Turmas", CAB_TURMAS).map(function (r) {
    return { nome: String(r[0]).trim(), curso: String(r[1]).trim(), ativo: ativoTxt_(r[2]), linha: r.__linha };
  });
  var disciplinas = lerTabela_(ss, "Disciplinas", CAB_DISCIPLINAS).map(function (r) {
    return { nome: String(r[0]).trim(), curso: String(r[1]).trim(), ativo: ativoTxt_(r[2]), professor: String(r[3] || "").trim(), linha: r.__linha };
  });
  var tempos = lerTabela_(ss, "Tempos", CAB_TEMPOS).map(function (r) {
    return { turno: String(r[0]).trim(), hora: String(r[1]).trim(), ordem: Number(r[2]) || 0, turma: String(r[3] || "").trim(), tipo: tipoPausa_(r[4]), linha: r.__linha };
  }).sort(function (a, b) {
    if (a.turno !== b.turno) return a.turno < b.turno ? -1 : 1;
    if (a.turma !== b.turma) return a.turma < b.turma ? -1 : 1;
    return a.ordem - b.ordem || (a.hora < b.hora ? -1 : 1);
  });
  __cadastros = { cursos: cursos, turmas: turmas, disciplinas: disciplinas, tempos: tempos };
  return __cadastros;
}

function cursoDaTurma_(cad, turma) {
  var t = cad.turmas.filter(function (x) { return normTxt_(x.nome) === normTxt_(turma); })[0];
  var id = t ? t.curso : cursoPorRegra_(turma);
  return cad.cursos.filter(function (c) { return c.id === id; })[0] || null;
}

// Lista pública para o app dos professores (sem nada sensível)
function cadastrosPublicos_(ss) {
  try {
    var cad = lerCadastros_(ss);
    return {
      cursos: cad.cursos.filter(function (c) { return c.ativo; }).map(function (c) { return { id: c.id, nome: c.nome, turno: c.turno, turnos: c.turnos, email: c.email }; }),
      turmas: cad.turmas.filter(function (t) { return t.ativo; }).map(function (t) { return { nome: t.nome, curso: t.curso }; }),
      tempos: cad.tempos.map(function (h) { return { turno: h.turno, hora: h.hora, turma: h.turma, tipo: h.tipo }; })
    };
  } catch (e) { return null; }
}

function admCadastrosLer_(ss) {
  var cad = lerCadastros_(ss);
  var uso = { turma: {}, disc: {}, hora: {} };
  lerLinhasHorarios_(ss).forEach(function (r) {
    var c = cursoDaTurma_(cad, r[4]);
    uso.turma[normTxt_(r[4])] = (uso.turma[normTxt_(r[4])] || 0) + 1;
    var kd = (c ? c.id : "") + "|" + normTxt_(r[5]);
    uso.disc[kd] = (uso.disc[kd] || 0) + 1;
    var th = c ? tempoDaAula_(cad, c, r[4], r[3]) : null;
    if (th) { var kh = th.turno + "|" + th.turma + "|" + th.hora; uso.hora[kh] = (uso.hora[kh] || 0) + 1; }
  });
  return {
    sucesso: true, turnos: TURNOS,
    cursos: cad.cursos.map(function (c) { return { id: c.id, nome: c.nome, turno: c.turno, turnos: c.turnos, email: c.email, ativo: c.ativo,
      turmas: cad.turmas.filter(function (t) { return t.curso === c.id; }).length }; }),
    turmas: cad.turmas.map(function (t) { return { nome: t.nome, curso: t.curso, ativo: t.ativo, aulas: uso.turma[normTxt_(t.nome)] || 0 }; }),
    disciplinas: cad.disciplinas.map(function (d) { return { nome: d.nome, curso: d.curso, ativo: d.ativo, professor: d.professor, aulas: uso.disc[d.curso + "|" + normTxt_(d.nome)] || 0 }; }),
    tempos: cad.tempos.map(function (h) { return { turno: h.turno, hora: h.hora, ordem: h.ordem, turma: h.turma, tipo: h.tipo, aulas: uso.hora[h.turno + "|" + h.turma + "|" + h.hora] || 0 }; })
  };
}

function admCadastroSalvar_(ss, d, admin) {
  var cad = lerCadastros_(ss), it = d.item || {}, orig = d.original || null, tipo = d.tipo;
  var hs = ss.getSheetByName("Horarios");
  var nome = String(it.nome || "").trim();
  var resp = { sucesso: true, atualizadas: 0 };
  if (tipo === "curso") {
    if (!nome) throw new Error("Informe o nome do curso.");
    var listaT = (it.turnos && it.turnos.length ? it.turnos : [it.turno]).filter(function (t) { return TURNOS.indexOf(t) !== -1; });
    if (!listaT.length) throw new Error("Escolha pelo menos um turno.");
    it.turno = listaT.join(", ");
    var email = String(it.email || "").trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    var sh = obterOuCriarAba(ss, "Cursos", CAB_CURSOS);
    var atual = orig ? cad.cursos.filter(function (c) { return c.id === orig; })[0] : null;
    if (atual) sh.getRange(atual.linha, 2, 1, 4).setValues([[nome, it.turno, email, it.ativo === false ? "Não" : "Sim"]]);
    else {
      var base = nome.normalize ? nome.normalize("NFD").replace(/[̀-ͯ]/g, "") : nome;
      var id = base.split(/\s+/).filter(function (w) { return w.length > 2 && /^[A-Za-z]/.test(w); }).map(function (w) { return w[0]; }).join("").toUpperCase().slice(0, 5) || "CUR";
      var n = 2, idf = id;
      while (cad.cursos.some(function (c) { return c.id === idf; })) idf = id + (n++);
      sh.appendRow([idf, nome, it.turno, email, "Sim"]);
      resp.id = idf;
    }
  } else if (tipo === "turma") {
    if (!nome) throw new Error("Informe o nome da turma.");
    if (!cad.cursos.some(function (c) { return c.id === it.curso; })) throw new Error("Escolha o curso.");
    var shT = obterOuCriarAba(ss, "Turmas", CAB_TURMAS);
    var tAtual = orig ? cad.turmas.filter(function (t) { return t.nome === orig; })[0] : null;
    if (cad.turmas.some(function (t) { return normTxt_(t.nome) === normTxt_(nome) && t !== tAtual; })) throw new Error("Já existe uma turma com esse nome.");
    if (tAtual) {
      shT.getRange(tAtual.linha, 1, 1, 3).setValues([[nome, it.curso, it.ativo === false ? "Não" : "Sim"]]);
      if (nome !== tAtual.nome) {
        var shTp = ss.getSheetByName("Tempos");
        cad.tempos.forEach(function (h) { if (shTp && h.turma === tAtual.nome) shTp.getRange(h.linha, 4).setValue(nome); });
      }
      if (nome !== tAtual.nome) lerLinhasHorarios_(ss).forEach(function (r) { if (r[4] === tAtual.nome) { hs.getRange(r.__linha, 5).setValue(nome); resp.atualizadas++; } });
    } else shT.appendRow([nome, it.curso, "Sim"]);
  } else if (tipo === "disciplina") {
    if (!nome) throw new Error("Informe o nome da disciplina.");
    if (!cad.cursos.some(function (c) { return c.id === it.curso; })) throw new Error("Escolha o curso.");
    var shD = obterOuCriarAba(ss, "Disciplinas", CAB_DISCIPLINAS);
    var dAtual = orig ? cad.disciplinas.filter(function (x) { return x.nome === orig.nome && x.curso === orig.curso; })[0] : null;
    if (cad.disciplinas.some(function (x) { return x !== dAtual && x.curso === it.curso && normTxt_(x.nome) === normTxt_(nome); })) throw new Error("Essa disciplina já existe nesse curso.");
    // professor responsável (opcional)
    var profDisc = String(it.professor || "").trim();
    if (profDisc) {
      var pm = mapaProfessores_(ss)[normTxt_(profDisc)];
      if (!pm) throw new Error("Professor não cadastrado: " + profDisc);
      profDisc = pm.nome;
    }
    // aplica às aulas dessa disciplina que estão sem professor ("A definir")
    var aplicar = [];
    if (dAtual && profDisc && it.aplicarAulas) {
      var linhasA = lerLinhasHorarios_(ss);
      aplicar = linhasA.filter(function (r) {
        var cc = cursoDaTurma_(cad, r[4]);
        return r[5] === dAtual.nome && cc && cc.id === dAtual.curso && normTxt_(r[1]) === "a definir";
      });
      var confl = [];
      aplicar.forEach(function (r) {
        conflitosDaAula_(linhasA, { professor: profDisc, dia: r[2], hora: r[3], turma: r[4], disc: r[5] }, aplicar.map(function (x) { return x[0]; }))
          .forEach(function (m) { if (m.indexOf("Prof. ") === 0) confl.push(r[2] + " " + r[3] + ": " + m); });
      });
      if (confl.length && !d.forcar) return { sucesso: false, conflitos: confl };
    }
    if (shD.getLastRow() >= 1 && String(shD.getRange(1, 4).getValue() || "").trim() === "") shD.getRange(1, 4).setValue("Professor");
    if (dAtual) {
      shD.getRange(dAtual.linha, 1, 1, 4).setValues([[nome, it.curso, it.ativo === false ? "Não" : "Sim", profDisc]]);
      if (nome !== dAtual.nome) lerLinhasHorarios_(ss).forEach(function (r) {
        var c = cursoDaTurma_(cad, r[4]);
        if (r[5] === dAtual.nome && c && c.id === dAtual.curso) { hs.getRange(r.__linha, 6).setValue(nome); resp.atualizadas++; }
      });
      aplicar.forEach(function (r) {
        hs.getRange(r.__linha, 2).setValue(profDisc);
        registrarHistorico(ss, "ADMIN_ATRIBUIU_AULA", r[1], profDisc, nome, r[4], r[2] + " às " + r[3], admin);
      });
      resp.atribuidas = aplicar.length;
    } else shD.appendRow([nome, it.curso, "Sim", profDisc]);
  } else if (tipo === "tempo") {
    var hora = normHora_(it.hora);
    if (!hora) throw new Error("Horário no formato 08:40 - 09:30.");
    if (TURNOS.indexOf(it.turno) === -1) throw new Error("Escolha o turno.");
    var turmaH = String(it.turma || "").trim();
    if (turmaH) {
      var tObj = cad.turmas.filter(function (t) { return normTxt_(t.nome) === normTxt_(turmaH); })[0];
      if (!tObj) throw new Error("Turma não cadastrada.");
      turmaH = tObj.nome;
    }
    var shH = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
    var mesmo = function (h, o) { return h.turno === o.turno && h.hora === o.hora && (h.turma || "") === (o.turma || ""); };
    var hAtual = orig ? cad.tempos.filter(function (h) { return mesmo(h, orig); })[0] : null;
    if (cad.tempos.some(function (h) { return h !== hAtual && h.turno === it.turno && h.hora === hora && (h.turma || "") === turmaH; })) throw new Error(turmaH ? "Esse horário já existe para essa turma." : "Esse horário já existe nesse turno.");
    var ordem = Number(it.ordem) || (cad.tempos.filter(function (h) { return h.turno === it.turno && (h.turma || "") === turmaH; }).length + 1);
    var tipoH = tipoPausa_(it.tipoTempo);
    if (tipoH && hAtual) {
      var usam = lerLinhasHorarios_(ss).filter(function (r) { var c0 = cursoDaTurma_(cad, r[4]); return r[3] === hAtual.hora && c0 && tempoDaAula_(cad, c0, r[4], r[3]) === hAtual; }).length;
      if (usam) throw new Error("Há " + usam + " aula(s) na grade neste horário. Mude essas aulas para outro horário antes de marcá-lo como " + tipoH.toLowerCase() + ".");
    }
    if (hAtual) {
      // aulas que usavam o horário antigo (antes da troca)
      var afetadas = hora !== hAtual.hora ? lerLinhasHorarios_(ss).filter(function (r) {
        var c = cursoDaTurma_(cad, r[4]);
        return r[3] === hAtual.hora && c && tempoDaAula_(cad, c, r[4], r[3]) === hAtual;
      }) : [];
      shH.getRange(hAtual.linha, 1, 1, 5).setValues([[it.turno, hora, ordem, turmaH, tipoH]]);
      afetadas.forEach(function (r) { hs.getRange(r.__linha, 4).setValue(hora); resp.atualizadas++; });
    } else shH.appendRow([it.turno, hora, ordem, turmaH, tipoH]);
  } else throw new Error("Tipo inválido.");
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_CADASTRO_" + tipo.toUpperCase(), admin, "", nome || it.hora, "", "", orig ? "editado" : "novo");
  return resp;
}

/**
 * Organiza os horários em Matutino / Vespertino / Noturno.
 * - horário do Diurno que começa antes das 12:00 vai para o Matutino; a partir das 12:00, Vespertino
 * - cursos de turno Diurno passam a usar Matutino + Vespertino
 * - a ordem de cada turno é renumerada pelo horário de início
 * Sem d.aplicar só devolve a prévia. Nunca altera nem apaga aulas da grade.
 */
function admTurnosOrganizar_(ss, d, admin) {
  var cad = lerCadastros_(ss);
  var linhas = lerLinhasHorarios_(ss);
  var plano = [];
  cad.tempos.forEach(function (h) {
    var novo = h.turno;
    if (h.turno === "Diurno") novo = horaEmMin_(h.hora) < 720 ? "Matutino" : "Vespertino";
    plano.push({ de: h.turno, para: novo, hora: h.hora, turma: h.turma || "", tipo: h.tipo || "", linha: h.linha });
  });
  // sem duplicar hora dentro do mesmo turno
  var vistos = {};
  plano.forEach(function (p) { var k = p.para + "|" + p.turma + "|" + p.hora; p.duplicado = !!vistos[k]; vistos[k] = true; });
  var cursos = cad.cursos.filter(function (c) { return c.turnos.indexOf("Diurno") !== -1; }).map(function (c) {
    var novos = [];
    c.turnos.forEach(function (t) { (t === "Diurno" ? ["Matutino", "Vespertino"] : [t]).forEach(function (x) { if (novos.indexOf(x) === -1) novos.push(x); }); });
    return { id: c.id, nome: c.nome, de: c.turno, para: novos.join(", "), linha: c.linha };
  });
  // sobreposições dentro do mesmo turno (só para o administrador decidir)
  var porTurno = {};
  plano.filter(function (p) { return !p.duplicado; }).forEach(function (p) { (porTurno[p.para + "\u0001" + p.turma] = porTurno[p.para + "\u0001" + p.turma] || []).push(p); });
  var uso = {};
  linhas.forEach(function (r) { uso[r[3]] = (uso[r[3]] || 0) + 1; });
  var sobrepostos = [];
  Object.keys(porTurno).forEach(function (g) {
    var t = g.split("\u0001")[0], l = porTurno[g];
    for (var i = 0; i < l.length; i++) for (var j = i + 1; j < l.length; j++) {
      if (l[i].tipo || l[j].tipo) continue;
      if (horaEmMin_(l[i].hora) < horaFimMin_(l[j].hora) && horaEmMin_(l[j].hora) < horaFimMin_(l[i].hora))
        sobrepostos.push({ turno: t, turma: l[0].turma, a: l[i].hora, b: l[j].hora, aulasA: uso[l[i].hora] || 0, aulasB: uso[l[j].hora] || 0 });
    }
  });
  var resumo = { sucesso: true, aplicado: false,
    mover: plano.filter(function (p) { return p.de !== p.para; }).length,
    cursos: cursos, sobrepostos: sobrepostos, porTurno: {} };
  Object.keys(porTurno).forEach(function (g) { var t = g.split("\u0001")[0]; resumo.porTurno[t] = (resumo.porTurno[t] || 0) + porTurno[g].length; });
  if (!d.aplicar) return resumo;

  var shH = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
  var shC = obterOuCriarAba(ss, "Cursos", CAB_CURSOS);
  // reescreve a aba Tempos inteira, já ordenada e renumerada
  var final = [];
  var chaveOrd = function (g) { return TURNOS.indexOf(g.split("\u0001")[0]) * 1000 + (g.split("\u0001")[1] ? 1 : 0); };
  Object.keys(porTurno).sort(function (a, b) { return chaveOrd(a) - chaveOrd(b) || (a < b ? -1 : 1); }).forEach(function (g) {
    var t = g.split("\u0001")[0];
    porTurno[g].sort(function (x, y) { return horaEmMin_(x.hora) - horaEmMin_(y.hora) || horaFimMin_(x.hora) - horaFimMin_(y.hora); })
      .forEach(function (p, i) { final.push([t, p.hora, i + 1, p.turma, p.tipo || ""]); });
  });
  var ult = shH.getLastRow();
  if (ult > 1) shH.getRange(2, 1, ult - 1, 5).clearContent();
  if (final.length) shH.getRange(2, 1, final.length, 5).setValues(final);
  cursos.forEach(function (c) { shC.getRange(c.linha, 3).setValue(c.para); });
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_ORGANIZOU_TURNOS", admin, "", final.length + " horários", "", "", "");
  resumo.aplicado = true;
  return resumo;
}

/**
 * Cria horários próprios para uma turma copiando os padrões dos turnos do curso dela.
 * Só funciona se a turma ainda não tem horários próprios. Não mexe em aulas.
 */
function admTemposCopiar_(ss, d, admin) {
  var cad = lerCadastros_(ss);
  var t = cad.turmas.filter(function (x) { return normTxt_(x.nome) === normTxt_(d.turma); })[0];
  if (!t) throw new Error("Turma não cadastrada.");
  if (cad.tempos.some(function (h) { return normTxt_(h.turma) === normTxt_(t.nome); })) throw new Error("Essa turma já tem horários próprios.");
  var c = cursoDaTurma_(cad, t.nome);
  var base = c ? cad.tempos.filter(function (h) { return !h.turma && c.turnos.indexOf(h.turno) !== -1; }) : [];
  if (!base.length) throw new Error("Não há horários padrão para copiar. Cadastre os horários do turno primeiro.");
  var linhas = base.map(function (h) { return [h.turno, h.hora, h.ordem, t.nome, h.tipo || ""]; });
  var sh = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
  sh.getRange(sh.getLastRow() + 1, 1, linhas.length, 5).setValues(linhas);
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_TEMPOS_COPIADOS", admin, "", t.nome + ": " + linhas.length + " horários", "", "", "");
  return { sucesso: true, copiados: linhas.length };
}

/**
 * Define os horários próprios de várias turmas de uma vez (substitui os que elas já tinham).
 * d.turmas = nomes; d.horas = lista "08:40 - 09:30". Sem d.aplicar só devolve a prévia.
 * O turno de cada horário sai do curso da turma (antes das 12:00 = Matutino, depois = Vespertino,
 * quando o curso tem os dois). Nunca altera aulas da grade.
 */
function admTemposDefinir_(ss, d, admin) {
  var cad = lerCadastros_(ss);
  var nomes = (d.turmas || []).map(function (n) { return String(n); });
  if (!nomes.length) throw new Error("Escolha ao menos uma turma.");
  if (nomes.length > 60) throw new Error("Turmas demais de uma vez.");
  var vistos = {}, horas = [], tiposH = {};
  (d.horas || []).forEach(function (h) {
    var n = normHora_(String(h).split("|")[0]);
    if (n && String(h).indexOf("|") !== -1) tiposH[n] = tipoPausa_(String(h).split("|")[1]);
    if (!String(h || "").trim()) return;
    if (!n) throw new Error("Horário inválido: " + String(h).slice(0, 30) + " (use 08:40 - 09:30).");
    if (!vistos[n]) { vistos[n] = true; horas.push(n); }
  });
  if (!horas.length) throw new Error("Informe ao menos um horário.");
  if (horas.length > 20) throw new Error("Horários demais (máx. 20).");
  horas.sort(function (a, b) { return horaEmMin_(a) - horaEmMin_(b); });
  var alvo = nomes.map(function (n) {
    var t = cad.turmas.filter(function (x) { return normTxt_(x.nome) === normTxt_(n); })[0];
    if (!t) throw new Error("Turma não cadastrada: " + n);
    return t;
  });
  var linhasH = lerLinhasHorarios_(ss);
  var turnoDe = function (curso, hora) {
    var ts = curso ? curso.turnos : [];
    if (ts.length > 1 && (ts.indexOf("Matutino") !== -1 || ts.indexOf("Vespertino") !== -1)) {
      var pref = horaEmMin_(hora) < 720 ? "Matutino" : "Vespertino";
      if (ts.indexOf(pref) !== -1) return pref;
    }
    return ts[0] || "Diurno";
  };
  var previa = alvo.map(function (t) {
    var c = cursoDaTurma_(cad, t.nome);
    var fora = linhasH.filter(function (r) { return normTxt_(r[4]) === normTxt_(t.nome) && horas.indexOf(r[3]) === -1; }).length;
    return { nome: t.nome, antes: cad.tempos.filter(function (h) { return normTxt_(h.turma) === normTxt_(t.nome); }).length, depois: horas.length, aulasForaDosHorarios: fora, curso: c ? c.nome : "" };
  });
  var resumo = { sucesso: true, aplicado: false, horas: horas, turmas: previa };
  if (!d.aplicar) return resumo;
  var sh = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
  var nm = alvo.map(function (t) { return normTxt_(t.nome); });
  cad.tempos.filter(function (h) { return h.turma && nm.indexOf(normTxt_(h.turma)) !== -1; })
    .sort(function (a, b) { return b.linha - a.linha; }).forEach(function (h) { sh.deleteRow(h.linha); });
  var novas = [];
  alvo.forEach(function (t) {
    var c = cursoDaTurma_(cad, t.nome);
    horas.forEach(function (h, i) { novas.push([turnoDe(c, h), h, i + 1, t.nome, tiposH[h] || ""]); });
  });
  sh.getRange(sh.getLastRow() + 1, 1, novas.length, 5).setValues(novas);
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_TEMPOS_DEFINIDOS", admin, "", alvo.length + " turmas: " + horas.length + " horários", "", "", "");
  resumo.aplicado = true;
  return resumo;
}

/**
 * Ajusta os intervalos de uma vez:
 *  - horário sem nenhuma aula, que não é um tempo de 50 min e está entre outros dois (ex.: 12:00–12:40)
 *    vira "Horário de almoço" (30 min ou mais) ou "Intervalo" (menos que isso);
 *  - lacuna de 10 min ou mais entre dois horários de aula vira uma linha própria, editável.
 * Sem d.aplicar só devolve a prévia. Nunca mexe nas aulas da grade.
 */
function admTemposPausas_(ss, d, admin) {
  var cad = lerCadastros_(ss);
  var uso = {};
  lerLinhasHorarios_(ss).forEach(function (r) {
    var c = cursoDaTurma_(cad, r[4]); var th = c ? tempoDaAula_(cad, c, r[4], r[3]) : null;
    if (th) { var k = th.turno + "|" + th.turma + "|" + th.hora; uso[k] = (uso[k] || 0) + 1; }
  });
  var grupos = {}, ordemG = [];
  cad.tempos.forEach(function (h) {
    var g = h.turno + "\u0001" + h.turma;
    if (!grupos[g]) { grupos[g] = []; ordemG.push(g); }
    grupos[g].push({ turno: h.turno, hora: h.hora, turma: h.turma, tipo: h.tipo || "", aulas: uso[h.turno + "|" + h.turma + "|" + h.hora] || 0, novo: false });
  });
  var mudancas = [];
  var nomePausa = function (min) { return min >= 30 ? "Almoço" : "Intervalo"; };
  ordemG.forEach(function (g) {
    var l = grupos[g].sort(function (a, b) { return horaEmMin_(a.hora) - horaEmMin_(b.hora); });
    // 1) horários vazios no meio do dia
    l.forEach(function (h, i) {
      var dur = horaFimMin_(h.hora) - horaEmMin_(h.hora);
      if (!h.tipo && !h.aulas && i > 0 && i < l.length - 1 && dur !== 50 && dur >= 15 && dur <= 120) {
        h.tipo = nomePausa(dur);
        mudancas.push({ acao: "marcar", turno: h.turno, turma: h.turma, hora: h.hora, tipo: h.tipo, min: dur });
      }
    });
    // 2) lacunas entre tempos
    var novas = [];
    for (var i = 1; i < l.length; i++) {
      var fimAnt = horaFimMin_(l[i - 1].hora), iniAtual = horaEmMin_(l[i].hora), folga = iniAtual - fimAnt;
      if (folga >= 10 && !l[i - 1].tipo && !l[i].tipo) {
        var fm = function (m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); };
        var hr = fm(fimAnt) + " - " + fm(iniAtual), tp = nomePausa(folga);
        novas.push({ turno: l[i].turno, hora: hr, turma: l[i].turma, tipo: tp, aulas: 0, novo: true });
        mudancas.push({ acao: "criar", turno: l[i].turno, turma: l[i].turma, hora: hr, tipo: tp, min: folga });
      }
    }
    grupos[g] = l.concat(novas);
  });
  var resumo = { sucesso: true, aplicado: false, mudancas: mudancas };
  if (!d.aplicar || !mudancas.length) return resumo;
  var sh = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
  var final = [];
  ordemG.forEach(function (g) {
    grupos[g].sort(function (a, b) { return horaEmMin_(a.hora) - horaEmMin_(b.hora); })
      .forEach(function (h, i) { final.push([h.turno, h.hora, i + 1, h.turma, h.tipo || ""]); });
  });
  var ult = sh.getLastRow();
  if (ult > 1) sh.getRange(2, 1, ult - 1, 5).clearContent();
  sh.getRange(2, 1, final.length, 5).setValues(final);
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_TEMPOS_PAUSAS", admin, "", mudancas.length + " intervalos ajustados", "", "", "");
  resumo.aplicado = true;
  return resumo;
}

function admCadastroExcluir_(ss, d, admin) {
  var cad = lerCadastros_(ss), ch = d.chave || {}, tipo = d.tipo, sh, alvo;
  var linhas = lerLinhasHorarios_(ss);
  if (tipo === "curso") {
    alvo = cad.cursos.filter(function (c) { return c.id === ch.id; })[0];
    if (alvo && cad.turmas.some(function (t) { return t.curso === alvo.id; })) throw new Error("Esse curso tem turmas. Mova ou exclua as turmas antes, ou desative o curso.");
    sh = ss.getSheetByName("Cursos");
  } else if (tipo === "turma") {
    alvo = cad.turmas.filter(function (t) { return t.nome === ch.nome; })[0];
    if (alvo && linhas.some(function (r) { return r[4] === alvo.nome; })) throw new Error("Essa turma tem aulas na grade. Desative-a ou mova as aulas antes.");
    sh = ss.getSheetByName("Turmas");
    // horários próprios da turma saem junto (de baixo para cima, para não deslocar as linhas)
    var shTe = ss.getSheetByName("Tempos");
    if (alvo && shTe) cad.tempos.filter(function (h) { return h.turma === alvo.nome; }).sort(function (a, b) { return b.linha - a.linha; }).forEach(function (h) { shTe.deleteRow(h.linha); });
  } else if (tipo === "disciplina") {
    alvo = cad.disciplinas.filter(function (x) { return x.nome === ch.nome && x.curso === ch.curso; })[0];
    if (alvo && linhas.some(function (r) { var c = cursoDaTurma_(cad, r[4]); return r[5] === alvo.nome && c && c.id === alvo.curso; })) throw new Error("Essa disciplina tem aulas na grade. Desative-a em vez de excluir.");
    sh = ss.getSheetByName("Disciplinas");
  } else if (tipo === "tempo") {
    alvo = cad.tempos.filter(function (h) { return h.turno === ch.turno && h.hora === ch.hora && (h.turma || "") === (ch.turma || ""); })[0];
    // horário é só um modelo de linha: aulas que o usam continuam na grade
    sh = ss.getSheetByName("Tempos");
  } else throw new Error("Tipo inválido.");
  if (!alvo) throw new Error("Item não encontrado.");
  sh.deleteRow(alvo.linha);
  limparCadastros_();
  registrarHistorico(ss, "ADMIN_EXCLUIU_" + tipo.toUpperCase(), admin, "", alvo.nome || alvo.hora || alvo.id, "", "", "");
  return { sucesso: true };
}

// Turmas que estão na grade e ainda não estão cadastradas entram (curso deduzido pelo nome)
function completarTurmas_(ss, turmasUsadas) {
  if (!ss.getSheetByName("Cursos")) return 0; // ainda não semeado: a semeadura já pega tudo
  var cad = lerCadastros_(ss), novas = {};
  turmasUsadas.forEach(function (t) {
    if (!t || cad.turmas.some(function (x) { return normTxt_(x.nome) === normTxt_(t); })) return;
    var c = cursoPorRegra_(t);
    if (!cad.cursos.some(function (x) { return x.id === c; })) c = cad.cursos.length ? cad.cursos[0].id : "";
    novas[t] = [t, c, "Sim"];
  });
  var l = Object.keys(novas).map(function (k) { return novas[k]; });
  if (l.length) { var sh = obterOuCriarAba(ss, "Turmas", CAB_TURMAS); sh.getRange(sh.getLastRow() + 1, 1, l.length, 3).setValues(l); limparCadastros_(); }
  return l.length;
}

// Disciplinas usadas na grade que ainda não estão cadastradas entram automaticamente
function completarDisciplinas_(ss, aulas) {
  var cad = lerCadastros_(ss), novas = {};
  aulas.forEach(function (a) {
    var c = cursoDaTurma_(cad, a.turma);
    if (!c || !a.disc) return;
    var existe = cad.disciplinas.some(function (x) { return x.curso === c.id && normTxt_(x.nome) === normTxt_(a.disc); });
    if (!existe) novas[c.id + "|" + a.disc] = [a.disc, c.id, "Sim"];
  });
  var l = Object.keys(novas).map(function (k) { return novas[k]; });
  if (l.length) { var sh = obterOuCriarAba(ss, "Disciplinas", CAB_DISCIPLINAS); sh.getRange(sh.getLastRow() + 1, 1, l.length, 3).setValues(l); limparCadastros_(); }
  return l.length;
}


/**
 * ==============================================================================
 * CURSO FIC (Formação Inicial e Continuada) — noturno
 * ==============================================================================
 * Rode UMA vez no editor do Apps Script: escolha "cadastrarFIC" e clique em Executar.
 * Pode rodar de novo sem duplicar nada. Não mexe nas aulas já existentes.
 * Cria: curso, turma, disciplinas, professores que faltam, horários próprios da turma
 * (com o intervalo 20:20–20:30) e as 16 aulas de segunda a quinta.
 * Depois, em Cadastros → Cursos, informe o e-mail da coordenação do FIC e, em Professores,
 * o nome completo e o e-mail de Adson e Calisto.
 */
var FIC_TURMA = "FIC";
var FIC_AULAS_ = [
  // [dia, tempo (índice), disciplina, professor, sigla do ID]
  ["Segunda-feira", "Princípios de Administração e Empreendedorismo", "Adson", [0, 1]],
  ["Segunda-feira", "Marketing e Vendas", "Adson", [2, 3]],
  ["Terça-feira", "Gestão de Pessoas e Rotinas de Pessoal", "Grayce Jesus", [0, 1]],
  ["Quarta-feira", "Gestão Financeira e Contábil", "Calisto", [0, 1]],
  ["Quarta-feira", "Gerenciamento das Rotinas de Trabalho e Comunicação Organizacional", "A definir", [2, 3]],
  ["Quinta-feira", "Ética, Relações Interpessoais e Resolução de Conflitos", "Vinicius Canhoto", [0, 1, 2, 3]]
];
var FIC_TEMPOS_ = ["18:40 - 19:30", "19:30 - 20:20", "20:30 - 21:20", "21:20 - 22:10"];

function cadastrarFIC() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    lerCadastros_(ss); // garante as abas de cadastros
    limparCadastros_();
    var log = [];
    // 1) curso
    var cad = lerCadastros_(ss);
    if (!cad.cursos.some(function (c) { return c.id === "FIC"; })) {
      obterOuCriarAba(ss, "Cursos", CAB_CURSOS).appendRow(["FIC", "Formação Inicial e Continuada (FIC)", "Noturno", "", "Sim"]);
      log.push("Curso FIC criado (informe o e-mail da coordenação em Cadastros → Cursos).");
    }
    // 2) turma
    limparCadastros_(); cad = lerCadastros_(ss);
    if (!cad.turmas.some(function (t) { return normTxt_(t.nome) === normTxt_(FIC_TURMA); })) {
      obterOuCriarAba(ss, "Turmas", CAB_TURMAS).appendRow([FIC_TURMA, "FIC", "Sim"]);
      log.push("Turma FIC criada.");
    }
    // 3) disciplinas
    limparCadastros_(); cad = lerCadastros_(ss);
    var shD = obterOuCriarAba(ss, "Disciplinas", CAB_DISCIPLINAS);
    FIC_AULAS_.forEach(function (a) {
      if (!cad.disciplinas.some(function (x) { return x.curso === "FIC" && normTxt_(x.nome) === normTxt_(a[1]); })) {
        shD.appendRow([a[1], "FIC", "Sim", a[2] === "A definir" ? "" : a[2]]);
        cad.disciplinas.push({ curso: "FIC", nome: a[1] });
        log.push("Disciplina: " + a[1]);
      }
    });
    // 4) professores que faltam (sem e-mail: complete depois em Professores)
    var mapa = mapaProfessores_(ss), shP = obterOuCriarAba(ss, "Professores", CAB_PROFESSORES);
    ["Adson", "Calisto"].forEach(function (n) {
      if (!mapa[n.toLowerCase()]) {
        shP.appendRow([n, "", "Administração", "", "Sim"]);
        log.push("Professor cadastrado: " + n + " (falta sobrenome e e-mail).");
      }
    });
    __mapaProfs = null;
    // 5) horários próprios da turma FIC (a noite do FIC termina 22:10)
    limparCadastros_(); cad = lerCadastros_(ss);
    if (!cad.tempos.some(function (h) { return normTxt_(h.turma) === normTxt_(FIC_TURMA); })) {
      var shT = obterOuCriarAba(ss, "Tempos", CAB_TEMPOS);
      var linhasT = [["Noturno", "18:40 - 19:30", 1, FIC_TURMA, ""], ["Noturno", "19:30 - 20:20", 2, FIC_TURMA, ""],
                     ["Noturno", "20:20 - 20:30", 3, FIC_TURMA, "Intervalo"], ["Noturno", "20:30 - 21:20", 4, FIC_TURMA, ""], ["Noturno", "21:20 - 22:10", 5, FIC_TURMA, ""]];
      shT.getRange(shT.getLastRow() + 1, 1, linhasT.length, 5).setValues(linhasT);
      log.push("Horários da turma FIC criados.");
    }
    // 6) aulas
    var existentes = lerLinhasHorarios_(ss), novas = [], conflitos = [], n = 0;
    FIC_AULAS_.forEach(function (a) {
      a[3].forEach(function (ti) {
        var hora = FIC_TEMPOS_[ti];
        var ja = existentes.some(function (r) { return normTxt_(r[4]) === normTxt_(FIC_TURMA) && normTxt_(r[2]) === normTxt_(a[0]) && r[3] === hora; });
        if (ja) return;
        n++;
        var linha = ["FIC-" + n, a[2], a[0], hora, FIC_TURMA, a[1], "normal", "", "Aula confirmada", ""];
        var ids = existentes.map(function (r) { return String(r[0]); });
        while (ids.indexOf(linha[0]) !== -1) { n++; linha[0] = "FIC-" + n; }
        var c = conflitosDaAula_(existentes.concat(novas.map(function (x) { return x; })), { professor: a[2], dia: a[0], hora: hora, turma: FIC_TURMA, disc: a[1] }, []);
        if (c.length) conflitos = conflitos.concat(c);
        novas.push(linha);
      });
    });
    if (novas.length) {
      var shH = ss.getSheetByName("Horarios");
      shH.getRange(shH.getLastRow() + 1, 1, novas.length, 10).setValues(novas);
      log.push(novas.length + " aulas do FIC adicionadas.");
    } else log.push("As aulas do FIC já estavam na grade.");
    if (conflitos.length) log.push("ATENÇÃO, choques de horário: " + conflitos.join(" | "));
    limparCadastros_();
    invalidarCacheGrade();
    registrarHistorico(ss, "CADASTRO_FIC", "-", "-", "FIC", FIC_TURMA, novas.length + " aulas", "");
    Logger.log(log.join("\n"));
    return log;
  } finally { lock.releaseLock(); }
}

/**
 * ==============================================================================
 * BANCO DE AULAS: créditos e débitos de cobertura e adiantamento
 * ==============================================================================
 * Cada linha da aba "Banco_Aulas" é UM tempo de aula (1 tempo = 1 crédito).
 * Tipos:
 *   VAGA          aula sem titular ("A definir") ministrada por um professor.
 *                 Crédito ao professor; débito INSTITUCIONAL (não é cobrado de ninguém).
 *   AUSENCIA      aula de um titular ausente coberta por outro professor.
 *                 Crédito a quem cobriu; débito ao ausente, a menos que seja "abonada" (padrão).
 *   ADIANTAMENTO  aula adiantada/extra lançada pela coordenação. Crédito de reserva.
 * Status: pendente → confirmado | recusado | cancelado. Só "confirmado" entra no saldo.
 * Nada é retroativo: o professor só solicita datas de hoje em diante (a coordenação pode lançar manualmente).
 */
var ABA_BANCO = "Banco_Aulas";
var CAB_BANCO = ["ID", "Registrado em", "Tipo", "Professor (ministrou)", "Titular", "Data da aula", "Dia", "Horário", "Turma",
                 "Disciplina", "Tempos", "Status", "Abonada", "Decidido por", "Decidido em", "Observação", "ID da aula"];
var TIPOS_BANCO = ["VAGA", "AUSENCIA", "ADIANTAMENTO"];
var NOMES_DIAS_ = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function hojeISO_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Bahia", "yyyy-MM-dd"); }

// Aceita Date, 2026-10-21, 21-10-2026 e 21/10/2026; devolve 2026-10-21 (ou "" se inválida)
function normData_(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, Session.getScriptTimeZone() || "America/Bahia", "yyyy-MM-dd");
  var s = String(v).trim(), m;
  var a, mes, dia;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { a = +m[1]; mes = +m[2]; dia = +m[3]; }
  else if ((m = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/))) { a = +m[3]; mes = +m[2]; dia = +m[1]; }
  else return "";
  var dt = new Date(a, mes - 1, dia);
  if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) return "";
  return a + "-" + ("0" + mes).slice(-2) + "-" + ("0" + dia).slice(-2);
}
function diaDaSemanaDe_(iso) { var p = iso.split("-"); return NOMES_DIAS_[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
function dataBRdeISO_(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }

function abaBanco_(ss) {
  var sh = ss.getSheetByName(ABA_BANCO);
  if (!sh) {
    sh = obterOuCriarAba(ss, ABA_BANCO, CAB_BANCO);
    formatarCabecalho(sh, "#1b5e20");
    sh.getRange("F:F").setNumberFormat("@");
    sh.setFrozenRows(1);
  }
  return sh;
}

function lerBanco_(ss) {
  var sh = ss.getSheetByName(ABA_BANCO);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CAB_BANCO.length).getValues().map(function (r, i) {
    return { linha: i + 2, id: String(r[0] || ""), criado: r[1] instanceof Date ? r[1].getTime() : 0, tipo: String(r[2] || ""),
             professor: String(r[3] || ""), titular: String(r[4] || ""), data: normData_(r[5]), dia: String(r[6] || ""),
             hora: String(r[7] || ""), turma: String(r[8] || ""), disc: String(r[9] || ""), tempos: parseInt(r[10], 10) || 1,
             status: String(r[11] || ""), abonada: String(r[12] || ""), decididoPor: String(r[13] || ""),
             decididoEm: r[14] instanceof Date ? r[14].getTime() : 0, obs: String(r[15] || ""), aulaId: String(r[16] || "") };
  }).filter(function (x) { return x.id; });
}

function gravarBanco_(ss, e) {
  var sh = abaBanco_(ss);
  var id = "BA-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  var linha = sh.getLastRow() + 1;
  sh.getRange(linha, 1, 1, CAB_BANCO.length).setValues([[id, new Date(), e.tipo, e.professor, e.titular || "", e.data || "", e.dia || "", e.hora || "",
    e.turma || "", e.disc || "", e.tempos || 1, e.status || "pendente", e.abonada || "", e.decididoPor || "", e.decididoPor ? new Date() : "", e.obs || "", e.aulaId || ""]]);
  return id;
}

function bancoAtualizar_(ss, entrada, campos) {
  var sh = ss.getSheetByName(ABA_BANCO);
  var col = { status: 12, abonada: 13, decididoPor: 14, decididoEm: 15, obs: 16 };
  Object.keys(campos).forEach(function (k) { if (col[k]) sh.getRange(entrada.linha, col[k]).setValue(campos[k]); });
}

// Saldo de cada professor. Só entradas confirmadas contam.
function bancoSaldos_(entradas) {
  var s = {}, inst = { vaga: 0, adiantamento: 0, ausenciaAbonada: 0 };
  function get(n) { return s[n] || (s[n] = { professor: n, creditos: 0, debitos: 0, abonados: 0, vaga: 0, ausencia: 0, adiantamento: 0 }); }
  entradas.forEach(function (e) {
    if (e.status !== "confirmado") return;
    if (e.professor) {
      var p = get(e.professor);
      p.creditos += e.tempos;
      if (e.tipo === "VAGA") p.vaga += e.tempos; else if (e.tipo === "AUSENCIA") p.ausencia += e.tempos; else p.adiantamento += e.tempos;
    }
    if (e.tipo === "VAGA") inst.vaga += e.tempos;
    if (e.tipo === "ADIANTAMENTO") inst.adiantamento += e.tempos;
    if (e.tipo === "AUSENCIA" && e.titular && e.titular !== "A definir") {
      if (e.abonada === "Sim") { get(e.titular).abonados += e.tempos; inst.ausenciaAbonada += e.tempos; }
      else get(e.titular).debitos += e.tempos;
    }
  });
  var lista = Object.keys(s).map(function (k) { s[k].saldo = s[k].creditos - s[k].debitos; return s[k]; });
  lista.sort(function (a, b) { return b.saldo - a.saldo || a.professor.localeCompare(b.professor); });
  return { saldos: lista, institucional: inst };
}

// Professor solicita assumir aula(s) sem titular numa data (hoje em diante). Fica pendente até a coordenação confirmar.
function bancoAssumir_(ss, d) {
  var prof = String(d.professor || "").trim();
  var p = mapaProfessores_(ss)[prof.toLowerCase()];
  if (!p || !p.ativo) throw new Error("Professor não encontrado.");
  var data = normData_(d.data);
  if (!data) throw new Error("Informe a data da aula.");
  if (data < hojeISO_()) throw new Error("A data não pode ser anterior a hoje. O banco de aulas não vale para aulas que já passaram.");
  var ids = (d.ids && d.ids.length ? d.ids : (d.aulaId ? [d.aulaId] : [])).slice(0, 12);
  if (!ids.length) throw new Error("Escolha ao menos uma aula.");
  var linhas = lerLinhasHorarios_(ss), banco = lerBanco_(ss), dia = diaDaSemanaDe_(data), criadas = [], resumo = [];
  ids.forEach(function (idAula) {
    var r = null; linhas.forEach(function (x) { if (String(x[0]).toUpperCase() === String(idAula).toUpperCase()) r = x; });
    if (!r) throw new Error("Aula não encontrada.");
    if (r[1] !== "A definir") throw new Error(r[5] + " (" + r[4] + ") já tem professor titular.");
    if (normTxt_(r[2]) !== normTxt_(dia)) throw new Error("A aula de " + r[5] + " (" + r[4] + ") é na " + r[2] + ", mas " + dataBRdeISO_(data) + " é " + dia + ".");
    banco.forEach(function (b) {
      if (b.aulaId.toUpperCase() === String(r[0]).toUpperCase() && b.data === data && (b.status === "pendente" || b.status === "confirmado"))
        throw new Error("Esta aula em " + dataBRdeISO_(data) + " já foi solicitada" + (b.professor === prof ? " por você." : " por outro professor."));
      if (normTxt_(b.professor) === normTxt_(prof) && b.data === data && normTxt_(b.hora) === normTxt_(r[3]) && (b.status === "pendente" || b.status === "confirmado"))
        throw new Error("Você já tem outra aula do banco em " + dataBRdeISO_(data) + " às " + r[3] + ".");
    });
    var conf = conflitosDaAula_(linhas, { professor: prof, dia: r[2], hora: r[3], turma: r[4], disc: r[5] }, [r[0]]).filter(function (m) { return m.indexOf("Prof. ") === 0; });
    if (conf.length) throw new Error(conf[0]);
    criadas.push(r);
  });
  var novosIds = criadas.map(function (r) {
    resumo.push(r[5] + " (" + r[4] + ") " + r[3]);
    registrarHistorico(ss, "BANCO_AULA_SOLICITADA", "A definir", prof, r[5], r[4], r[2] + " às " + r[3], dataBRdeISO_(data));
    return gravarBanco_(ss, { tipo: "VAGA", professor: prof, titular: "A definir", data: data, dia: r[2], hora: r[3], turma: r[4], disc: r[5],
                               tempos: 1, status: "pendente", aulaId: String(r[0]), obs: String(d.obs || "").slice(0, 200) });
  });
  try {
    var cfg = lerConfigEmails_(), turmas = [];
    criadas.forEach(function (r) { if (turmas.indexOf(r[4]) === -1) turmas.push(r[4]); });
    var dest = []; turmas.forEach(function (t) { String(obterEmailsPorTurma(t, cfg)).split(",").forEach(function (em) { em = em.trim(); if (em && dest.indexOf(em) === -1) dest.push(em); }); });
    if (dest.length) enviarEmailRegistrado_({ to: dest.join(", "), subject: "[BANCO DE AULAS] Prof. " + prof + " pede para assumir aula em " + dataBRdeISO_(data),
      htmlBody: "<div style='font-family:Arial,sans-serif;max-width:600px'><h3>Pedido no Banco de aulas</h3><p>O(a) <b>Prof. " + prof + "</b> quer ministrar, em <b>" + dataBRdeISO_(data) + "</b> (" + dia + "):</p><ul><li>" + resumo.join("</li><li>") +
        "</li></ul><p>Confirme ou recuse em <b>Painel administrativo → Banco de aulas</b>. Ao confirmar, cada tempo vira 1 crédito para o professor.</p></div>" });
  } catch (eM) {}
  return { sucesso: true, ids: novosIds, mensagem: "Pedido enviado à coordenação. O crédito vale depois da confirmação." };
}

function bancoCancelarDoProfessor_(ss, d) {
  var prof = String(d.professor || "").trim(), alvo = null;
  lerBanco_(ss).forEach(function (b) { if (b.id === String(d.id)) alvo = b; });
  if (!alvo || normTxt_(alvo.professor) !== normTxt_(prof)) throw new Error("Pedido não encontrado.");
  if (alvo.status !== "pendente") throw new Error("Só dá para cancelar pedidos que ainda aguardam confirmação.");
  bancoAtualizar_(ss, alvo, { status: "cancelado", decididoPor: prof, decididoEm: new Date() });
  return { sucesso: true };
}

// Quando uma aula volta a ser liberada/normalizada, os pedidos AUSENCIA pendentes dela perdem o sentido
function bancoCancelarPendentesDaAula_(ss, aulaId, tipo) {
  try {
    if (!aulaId || !ss.getSheetByName(ABA_BANCO)) return;
    lerBanco_(ss).forEach(function (b) {
      if (b.status === "pendente" && b.tipo === (tipo || "AUSENCIA") && b.aulaId.toUpperCase() === String(aulaId).toUpperCase())
        bancoAtualizar_(ss, b, { status: "cancelado", decididoPor: "sistema", decididoEm: new Date(), obs: "Aula voltou ao estado anterior" });
    });
  } catch (e) {}
}

// Chamado quando alguém assume a aula de um titular ausente: abre o pedido de crédito (pendente)
function bancoRegistrarCobertura_(ss, aulaId, titular, substituto, dataTxt, dia, hora, turma, disc) {
  try {
    if (!substituto || !titular || titular === "A definir") return;
    var data = normData_(dataTxt);
    bancoCancelarPendentesDaAula_(ss, aulaId, "AUSENCIA");
    gravarBanco_(ss, { tipo: "AUSENCIA", professor: substituto, titular: titular, data: data, dia: dia, hora: hora, turma: turma, disc: disc,
                       tempos: 1, status: "pendente", abonada: "Sim", aulaId: String(aulaId || ""), obs: data ? "" : "Data da falta não informada" });
  } catch (e) { Logger.log("Banco de aulas: não registrou cobertura: " + e); }
}

function meuBanco_(professor) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), prof = String(professor || "").trim();
  if (!prof) return { sucesso: true, minhas: [], ocupadas: [], saldo: null };
  var todas = lerBanco_(ss);
  var minhas = todas.filter(function (b) { return normTxt_(b.professor) === normTxt_(prof) || (normTxt_(b.titular) === normTxt_(prof) && b.tipo === "AUSENCIA"); })
    .sort(function (a, b) { return b.criado - a.criado; }).slice(0, 80)
    .map(function (b) { return { id: b.id, tipo: b.tipo, status: b.status, data: b.data, dia: b.dia, hora: b.hora, turma: b.turma, disc: b.disc, tempos: b.tempos,
                                  papel: normTxt_(b.professor) === normTxt_(prof) ? "ministrou" : "ausente", titular: b.titular, professor: b.professor, abonada: b.abonada }; });
  var ocupadas = todas.filter(function (b) { return b.tipo === "VAGA" && (b.status === "pendente" || b.status === "confirmado") && b.data >= hojeISO_(); })
    .map(function (b) { return { aulaId: b.aulaId, data: b.data, meu: normTxt_(b.professor) === normTxt_(prof) }; });
  var s = bancoSaldos_(todas).saldos.filter(function (x) { return normTxt_(x.professor) === normTxt_(prof); })[0] ||
          { professor: prof, creditos: 0, debitos: 0, abonados: 0, saldo: 0 };
  return { sucesso: true, minhas: minhas, ocupadas: ocupadas, saldo: s, hoje: hojeISO_() };
}

// ----- painel administrativo -----
function admBancoListar_(ss) {
  var todas = lerBanco_(ss).sort(function (a, b) { return b.criado - a.criado; });
  var s = bancoSaldos_(todas);
  return { sucesso: true, entradas: todas.slice(0, 1500), saldos: s.saldos, institucional: s.institucional,
           pendentes: todas.filter(function (b) { return b.status === "pendente"; }).length, hoje: hojeISO_() };
}

function admBancoDecidir_(ss, d, admin) {
  var alvo = null;
  lerBanco_(ss).forEach(function (b) { if (b.id === String(d.id)) alvo = b; });
  if (!alvo) throw new Error("Lançamento não encontrado.");
  var dec = String(d.decisao || "");
  var mapaStatus = { confirmar: "confirmado", recusar: "recusado", reabrir: "pendente", cancelar: "cancelado" };
  if (!mapaStatus[dec]) throw new Error("Decisão inválida.");
  if (dec === "confirmar" && alvo.tipo === "AUSENCIA" && !alvo.data && !normData_(d.data)) throw new Error("Informe a data da falta para confirmar.");
  var campos = { status: mapaStatus[dec], decididoPor: dec === "reabrir" ? "" : admin, decididoEm: dec === "reabrir" ? "" : new Date() };
  if (d.obs !== undefined) campos.obs = String(d.obs).slice(0, 200);
  if (alvo.tipo === "AUSENCIA") campos.abonada = d.abonada === false || d.abonada === "Não" ? "Não" : "Sim";
  bancoAtualizar_(ss, alvo, campos);
  var nd = normData_(d.data);
  if (nd && !alvo.data) { ss.getSheetByName(ABA_BANCO).getRange(alvo.linha, 6).setNumberFormat("@").setValue(nd); }
  registrarHistorico(ss, "BANCO_AULA_" + dec.toUpperCase(), alvo.titular || "-", alvo.professor, alvo.disc, alvo.turma, alvo.dia + " às " + alvo.hora, dataBRdeISO_(alvo.data));
  if (dec === "confirmar" || dec === "recusar") {
    try {
      var em = obterEmailProfessor(ss, alvo.professor);
      if (em) enviarEmailRegistrado_({ to: em, subject: "[BANCO DE AULAS] Seu pedido foi " + (dec === "confirmar" ? "confirmado" : "recusado"),
        htmlBody: "<div style='font-family:Arial,sans-serif;max-width:600px'><p>Prof. " + alvo.professor + ", seu lançamento de <b>" + alvo.disc + " (" + alvo.turma + ")</b> em <b>" + dataBRdeISO_(alvo.data) + "</b> às " + alvo.hora +
          " foi <b>" + (dec === "confirmar" ? "confirmado: +" + alvo.tempos + " crédito(s) no seu banco de aulas" : "recusado pela coordenação") + "</b>.</p></div>" });
    } catch (eM) {}
  }
  return { sucesso: true };
}

function admBancoLancar_(ss, d, admin) {
  var tipo = String(d.tipo || "");
  if (TIPOS_BANCO.indexOf(tipo) === -1) throw new Error("Tipo inválido.");
  var prof = String(d.professor || "").trim();
  var p = mapaProfessores_(ss)[prof.toLowerCase()];
  if (!p) throw new Error("Escolha o professor que ministrou a aula.");
  var data = normData_(d.data);
  if (!data) throw new Error("Informe a data da aula.");
  var tempos = Math.max(1, Math.min(10, parseInt(d.tempos, 10) || 1));
  var titular = String(d.titular || "").trim();
  if (tipo === "AUSENCIA" && (!titular || titular === "A definir")) throw new Error("Informe o professor que faltou.");
  if (tipo === "AUSENCIA" && normTxt_(titular) === normTxt_(prof)) throw new Error("Quem cobriu e quem faltou não podem ser a mesma pessoa.");
  var id = gravarBanco_(ss, { tipo: tipo, professor: prof, titular: tipo === "VAGA" ? "A definir" : titular, data: data, dia: diaDaSemanaDe_(data),
    hora: String(d.hora || "").slice(0, 30), turma: String(d.turma || "").slice(0, 30), disc: String(d.disc || "").slice(0, 80), tempos: tempos,
    status: "confirmado", abonada: tipo === "AUSENCIA" ? (d.abonada === false || d.abonada === "Não" ? "Não" : "Sim") : "", decididoPor: admin, obs: String(d.obs || "").slice(0, 200) });
  registrarHistorico(ss, "BANCO_AULA_LANCADA", titular || "-", prof, d.disc || "-", d.turma || "-", (d.hora || "-"), dataBRdeISO_(data));
  return { sucesso: true, id: id };
}
