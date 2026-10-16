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
  "Luiz Felipe": "luiz.felipe@ifs.edu.br",
  "Pedro Ernesto": "pedro.cruz@ifs.edu.br",
  "Pedro Goes": "pedro.gois@ifs.edu.br",
  "Rafael": "rafael@ifs.edu.br",
  "Raisa": "raisa.silveira@ifs.edu.br",
  "Sanderson": "sanderson.silva@ifs.edu.br",
  "Sérgio": "sergio.costa@ifs.edu.br",
  "Vagner": "vagner@ifs.edu.br",
  "Vinicius": "vinicius.canhoto@ifs.edu.br",
  "Vitor": "vitor.almeida@ifs.edu.br",
  "Weder": "weder.almeida@ifs.edu.br",
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
  ["EB-12","Eber","Sexta-feira","11:10 - 12:00","2º DS","Banco de Dados e Eng de Soft.","normal","","Aula confirmada",""],
  ["EB-1","Eber","Sexta-feira","12:00 - 12:50","2º DS","Banco de Dados e Eng de Soft.","normal","","Aula confirmada",""],
  ["EB-3","Eber","Sexta-feira","13:30 - 14:20","2º DS","Banco de Dados e Eng de Soft.","normal","","Aula confirmada",""],
  ["EB-6","Eber","Sexta-feira","14:20 - 15:10","1º DS","CS1 - B","normal","","Aula confirmada",""],
  ["EB-7","Eber","Sexta-feira","15:10 - 16:00","1º DS","CS1 - B","normal","","Aula confirmada",""],
  ["EB-8","Eber","Sexta-feira","18:40 - 19:30","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-9","Eber","Sexta-feira","19:30 - 20:20","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-10","Eber","Sexta-feira","20:30 - 21:20","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EB-11","Eber","Sexta-feira","21:20 - 22:10","1º Info (Subsequente)","Informática Básica","normal","","Aula confirmada",""],
  ["EL-8","Elliot","Segunda-feira","18:40 - 19:30","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-9","Elliot","Segunda-feira","19:30 - 20:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-10","Elliot","Segunda-feira","20:30 - 21:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-11","Elliot","Segunda-feira","21:20 - 22:10","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-12","Elliot","Terça-feira","18:40 - 19:30","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EL-13","Elliot","Terça-feira","19:30 - 20:20","3º Info (Subsequente)","Programação 3","normal","","Aula confirmada",""],
  ["EM-10","Emerson","Segunda-feira","20:30 - 21:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-11","Emerson","Segunda-feira","21:20 - 22:10","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-12","Emerson","Terça-feira","18:40 - 19:30","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-13","Emerson","Terça-feira","19:30 - 20:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-14","Emerson","Terça-feira","20:30 - 21:20","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["EM-15","Emerson","Terça-feira","21:20 - 22:10","1º Info (Subsequente)","Org. Comp. e SO","normal","","Aula confirmada",""],
  ["ER-1","Eric","Quarta-feira","08:40 - 09:30","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-2","Eric","Quarta-feira","09:30 - 10:20","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-3","Eric","Quarta-feira","10:20 - 11:10","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-4","Eric","Quarta-feira","11:10 - 12:00","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-5","Eric","Quinta-feira","14:20 - 15:10","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-6","Eric","Quinta-feira","15:10 - 16:00","2º DS","Programação 2 - A","normal","","Aula confirmada",""],
  ["ER-7","Eric","Sexta-feira","14:20 - 15:10","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-8","Eric","Sexta-feira","15:10 - 16:00","2º DS","Programação 2 - B","normal","","Aula confirmada",""],
  ["ER-9","Eric","Quarta-feira","18:40 - 19:30","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-10","Eric","Quarta-feira","19:30 - 20:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-11","Eric","Quarta-feira","20:30 - 21:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-12","Eric","Quarta-feira","21:20 - 22:10","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-13","Eric","Quinta-feira","18:40 - 19:30","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-14","Eric","Quinta-feira","19:30 - 20:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-15","Eric","Quinta-feira","20:30 - 21:20","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
  ["ER-16","Eric","Quinta-feira","21:20 - 22:10","1º Info (Subsequente)","Programação 1","normal","","Aula confirmada",""],
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
  ["FE-4","Fernanda","Segunda-feira","18:40 - 19:30","1º Info (Subsequente)","Inglês Instrumental","normal","","Aula confirmada",""],
  ["FE-5","Fernanda","Segunda-feira","19:30 - 20:20","1º Info (Subsequente)","Inglês Instrumental","normal","","Aula confirmada",""],
  ["GR-1","Grayce","Segunda-feira","12:00 - 12:50","2º ADM","Gestão de Projetos","normal","","Aula confirmada",""],
  ["GR-3","Grayce","Segunda-feira","13:30 - 14:20","2º ADM","Gestão de Projetos","normal","","Aula confirmada",""],
  ["GR-2","Grayce","Terça-feira","10:20 - 11:10","3º ADM","Gestão Ambiental","normal","","Aula confirmada",""],
  ["GR-4","Grayce","Terça-feira","11:10 - 12:00","3º ADM","Gestão Ambiental","normal","","Aula confirmada",""],
  ["GR-5","Grayce","Terça-feira","12:40 - 13:30","3º ADM","Empreendedorismo","normal","","Aula confirmada",""],
  ["GR-6","Grayce","Terça-feira","13:30 - 14:20","3º ADM","Empreendedorismo","normal","","Aula confirmada",""],
  ["LF-2","Luiz Felipe","Segunda-feira","08:40 - 09:30","2º ADM","Informática Básica","normal","","Aula confirmada",""],
  ["LF-3","Luiz Felipe","Segunda-feira","09:30 - 10:20","2º ADM","Informática Básica","normal","","Aula confirmada",""],
  ["LF-4","Luiz Felipe","Segunda-feira","10:20 - 11:10","2º DS","Projeto Integrador 1","normal","","Aula confirmada",""],
  ["LF-5","Luiz Felipe","Segunda-feira","11:10 - 12:00","2º DS","Projeto Integrador 1","normal","","Aula confirmada",""],
  ["LF-6","Luiz Felipe","Segunda-feira","12:40 - 13:30","3º DS","Redes de Comp. e Seg. da Inf.","normal","","Aula confirmada",""],
  ["LF-7","Luiz Felipe","Segunda-feira","13:30 - 14:20","3º DS","Redes de Comp. e Seg. da Inf.","normal","","Aula confirmada",""],
  ["LF-8","Luiz Felipe","Segunda-feira","14:20 - 15:10","3º DS","Redes de Comp. e Seg. da Inf.","normal","","Aula confirmada",""],
  ["LF-9","Luiz Felipe","Quarta-feira","08:40 - 09:30","2º DS","Construção de Sites 2 - A","normal","","Aula confirmada",""],
  ["LF-10","Luiz Felipe","Quarta-feira","09:30 - 10:20","2º DS","Construção de Sites 2 - A","normal","","Aula confirmada",""],
  ["LF-11","Luiz Felipe","Quarta-feira","10:20 - 11:10","2º DS","Construção de Sites 2 - B","normal","","Aula confirmada",""],
  ["LF-12","Luiz Felipe","Quarta-feira","11:10 - 12:00","2º DS","Construção de Sites 2 - B","normal","","Aula confirmada",""],
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
  ["RF-6","Rafael","Quinta-feira","18:40 - 19:30","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-7","Rafael","Quinta-feira","19:30 - 20:20","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-8","Rafael","Quinta-feira","20:30 - 21:20","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
  ["RF-9","Rafael","Quinta-feira","21:20 - 22:10","3º Info (Subsequente)","Eng. Software","normal","","Aula confirmada",""],
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
  ["VA-3","Vagner","Quarta-feira","12:00 - 12:50","2º DS","Física","normal","","Aula confirmada",""],
  ["VA-4","Vagner","Quarta-feira","13:30 - 14:20","2º DS","Física","normal","","Aula confirmada",""],
  ["VA-5","Vagner","Quinta-feira","08:40 - 09:30","1º DS","Física","normal","","Aula confirmada",""],
  ["VA-6","Vagner","Quinta-feira","09:30 - 10:20","1º DS","Física","normal","","Aula confirmada",""],
  ["VA-7","Vagner","Quinta-feira","10:20 - 11:10","3º DS","Física","normal","","Aula confirmada",""],
  ["VA-8","Vagner","Quinta-feira","11:10 - 12:00","3º DS","Física","normal","","Aula confirmada",""],
  ["VA-1","Vagner","Sexta-feira","08:40 - 09:30","1º ADM","Física","normal","","Aula confirmada",""],
  ["VA-9","Vagner","Sexta-feira","09:30 - 10:20","1º ADM","Física","normal","","Aula confirmada",""],
  ["VA-2","Vagner","Sexta-feira","10:20 - 11:10","2º ADM","Física","normal","","Aula confirmada",""],
  ["VA-10","Vagner","Sexta-feira","11:10 - 12:00","2º ADM","Física","normal","","Aula confirmada",""],
  ["VA-11","Vagner","Sexta-feira","12:40 - 13:30","3º ADM","Física","normal","","Aula confirmada",""],
  ["VA-12","Vagner","Sexta-feira","13:30 - 14:20","3º ADM","Física","normal","","Aula confirmada",""],
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
  ["AG-1","Ângelo","Terça-feira","11:50 - 12:40","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-2","Ângelo","Terça-feira","12:40 - 13:30","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-3","Ângelo","Terça-feira","13:30 - 14:20","1º DS","Programação 1 - A","normal","","Aula confirmada",""],
  ["AG-4","Ângelo","Terça-feira","14:20 - 15:10","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-5","Ângelo","Terça-feira","15:10 - 16:00","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-6","Ângelo","Quarta-feira","11:50 - 12:40","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-7","Ângelo","Quarta-feira","12:40 - 13:30","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-8","Ângelo","Quarta-feira","13:30 - 14:20","1º DS","Programação 1 - B","normal","","Aula confirmada",""],
  ["AG-11","Ângelo","Terça-feira","20:30 - 21:20","3º Info (Subsequente)","Tópicos Especiais 1","normal","","Aula confirmada",""],
  ["AG-12","Ângelo","Terça-feira","21:20 - 22:10","3º Info (Subsequente)","Tópicos Especiais 1","normal","","Aula confirmada",""]
];


/**
 * Roteia automaticamente o e-mail para o coordenador específico do curso da turma
 */
function obterEmailsPorTurma(turma, config) {
  var cfg = config || CONFIG_PADRAO;
  var dests = [];
  var t = (turma || "").toUpperCase();

  // 1. Subsequente em Informática
  if (t.indexOf("SUBSEQUENTE") !== -1 || t.indexOf("INFO") !== -1) {
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
  if (!prof) return "";
  if (EMAILS_DOCENTES[prof]) return EMAILS_DOCENTES[prof];
  try {
    if (ss) {
      var sheetProfs = ss.getSheetByName("Professores");
      if (sheetProfs) {
        var rows = sheetProfs.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]).trim().toLowerCase() === String(prof).trim().toLowerCase()) {
            var em = String(rows[i][1]).trim();
            if (em) return em;
          }
        }
      }
    }
  } catch (e) {}
  return String(prof).toLowerCase().replace(/[^a-z0-9.]/g, "") + "@ifs.edu.br";
}

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
    var config = dados.emailsConfig || CONFIG_PADRAO;

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

      var emailTitular = dados.emailOriginal || obterEmailProfessor(ss, dados.profOriginal);
      var emailSubs = dados.emailSubstituto || obterEmailProfessor(ss, dados.substituto);
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
        var emailDocente = dados.emailDocente || obterEmailProfessor(ss, dados.profOriginal);
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

      var emailProp = dados.emailProponente || obterEmailProfessor(ss, t.proponente);
      var emailColega = dados.emailColega || obterEmailProfessor(ss, t.colega);
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

      var emailProp = dados.emailProponente || obterEmailProfessor(ss, t.proponente);
      var emailColega = dados.emailColega || obterEmailProfessor(ss, t.colega);
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

      var emailProf = dados.emailDocente || obterEmailProfessor(ss, r.professor);
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
      var emailProf = dados.email || obterEmailProfessor(ss, prof);
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
    ["Luiz Felipe", "luiz.felipe@ifs.edu.br", "Desenvolvimento de Sistemas", "1234"],
    ["Pedro Ernesto", "pedro.cruz@ifs.edu.br", "Propedêutica / Química", "1234"],
    ["Pedro Goes", "pedro.gois@ifs.edu.br", "Administração", "1234"],
    ["Rafael", "rafael@ifs.edu.br", "Desenvolvimento de Sistemas / Subsequente", "1234"],
    ["Raisa", "raisa.silveira@ifs.edu.br", "Propedêutica / Biologia", "1234"],
    ["Sanderson", "sanderson.silva@ifs.edu.br", "Propedêutica / Ed. Física", "1234"],
    ["Sérgio", "sergio.costa@ifs.edu.br", "Administração", "1234"],
    ["Vagner", "vagner@ifs.edu.br", "Propedêutica / Física", "1234"],
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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

    MailApp.sendEmail({ to: destinatario, subject: assunto, htmlBody: corpoHtml });
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
 * APLICAR A GRADE OFICIAL (PDF 2026.2) NA PLANILHA — execute UMA VEZ pelo editor
 * ==============================================================================
 * - Reescreve a aba Horarios exatamente com GRADE_COMPLETA_OFICIAL
 * - Preserva Status/Substituto/Obs/DataFalta das aulas que continuam existindo
 *   (procura pelo ID com o mesmo horário; depois só pelo horário)
 * - Aulas que saíram da grade e tinham falta/substituição ficam registradas
 *   na aba Correcoes_Grade, para a coordenação conferir
 * - Faz uma cópia de segurança da aba antes: "Horarios_backup_AAAA-MM-DD_HHmm"
 */
function aplicarGradeOficial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Horarios");
  var lastRow = sheet.getLastRow();
  var antigas = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 10).getValues() : [];

  // 1. Cópia de segurança
  var carimbo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  sheet.copyTo(ss).setName("Horarios_backup_" + carimbo);

  var norm = function (v) { return String(v || "").trim().toLowerCase(); };
  var chaveSlot = function (prof, dia, hora, turma) { return [norm(prof), norm(dia), norm(hora), norm(turma)].join("|"); };
  var porId = {}, porSlot = {};
  antigas.forEach(function (r) {
    porId[String(r[0]).trim().toUpperCase()] = r;
    porSlot[chaveSlot(r[1], r[2], r[3], r[4])] = r;
  });

  // 2. Monta as novas linhas preservando o estado de cada aula
  var usadas = {};
  var novas = GRADE_COMPLETA_OFICIAL.map(function (a) {
    var slot = chaveSlot(a[1], a[2], a[3], a[4]);
    var velha = porId[String(a[0]).toUpperCase()];
    if (!velha || chaveSlot(velha[1], velha[2], velha[3], velha[4]) !== slot) velha = porSlot[slot];
    if (velha) usadas[String(velha[0]).toUpperCase() + "|" + slot] = true;
    return [a[0], a[1], a[2], a[3], a[4], a[5],
            velha ? (velha[6] || "normal") : "normal",
            velha ? velha[7] : "",
            velha ? (velha[8] || "Aula confirmada") : "Aula confirmada",
            velha ? velha[9] : ""];
  });

  // 3. Registra aulas removidas que tinham falta ou substituição
  var log = obterOuCriarAba(ss, "Correcoes_Grade", ["Data", "Linha", "ID", "Antes (prof | dia | hora | turma | disc)", "Depois (prof | dia | hora | turma | disc)", "Status preservado"]);
  var removidasComStatus = 0;
  antigas.forEach(function (r, i) {
    var k = String(r[0]).trim().toUpperCase() + "|" + chaveSlot(r[1], r[2], r[3], r[4]);
    if (!usadas[k] && r[6] && r[6] !== "normal") {
      log.appendRow([new Date(), i + 2, r[0], [r[1], r[2], r[3], r[4], r[5]].join(" | "), "REMOVIDA da grade oficial", r[6] + (r[9] ? " (" + r[9] + ")" : "")]);
      removidasComStatus++;
    }
  });

  // 4. Grava tudo de uma vez
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  sheet.getRange(2, 1, novas.length, 10).setValues(novas);
  SpreadsheetApp.flush();
  invalidarCacheGrade();
  Logger.log("Grade oficial aplicada: " + novas.length + " aulas (antes: " + antigas.length + "). " +
             "Aulas removidas que tinham falta/substituição: " + removidasComStatus + " (ver Correcoes_Grade).");
  return novas.length;
}
