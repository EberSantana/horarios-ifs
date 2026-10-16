/**
 * ============================================================================
 * API.JS - Comunicação entre GitHub Pages e Google Apps Script (Backend)
 * ============================================================================
 * Gerencia a leitura, escrita, concorrência, trocas/permutas, reposições de
 * aula, configuração de e-mails institucionais e histórico de notificações.
 */

const STORAGE_KEY_API_URL = 'IFS_BACKEND_URL';
const STORAGE_KEY_LOCAL_DB = 'IFS_LOCAL_DATABASE';
const STORAGE_KEY_DB_VERSION = 'IFS_DB_VERSION';
const STORAGE_KEY_PINS = 'IFS_TEACHER_PINS';
const STORAGE_KEY_EMAILS_CONFIG = 'IFS_EMAILS_CONFIG';
const STORAGE_KEY_EMAILS_LOG = 'IFS_EMAILS_LOG';
const STORAGE_KEY_TROCAS = 'IFS_TROCAS_PERMUTAS';
const STORAGE_KEY_REPOSICOES = 'IFS_REPOSICOES_AULAS';

// Versão do banco para auto-atualizar clientes com as turmas do Subsequente e novos docentes
const CURRENT_DB_VERSION = 'v3_subsequente_multitempos_2026';

// URL Oficial de Produção do Google Apps Script (Conectado ao Google Sheets do IFS)
const DEFAULT_BACKEND_URL = "https://script.google.com/macros/s/AKfycbwlITC2JrJ3lFYl__oER1B86JFlHpsrjq75BRGD_q-iIhlKIphfdIcQkbIwRMtTjy2kjg/exec";

// Configurações padrão de E-mails Institucionais por Curso
const DEFAULT_EMAILS_CONFIG = {
  emailCoordDS: "coordenacao.ds.tb@ifs.edu.br",
  emailCoordADM: "coordenacao.adm.tb@ifs.edu.br",
  emailCoordSubsequente: "coinf.tbarreto@ifs.edu.br",
  emailCoordGeral: "coordenacao.tobiasbarreto@ifs.edu.br",
  emailDirecao: "direcao.tobiasbarreto@ifs.edu.br",
  notificarFalta: true,
  notificarTroca: true,
  notificarReposicao: true,
  notificarSubstituicao: true
};

// Dados base dos 24 professores e turmas integradas e subsequentes do IFS Campus Tobias Barreto
const DADOS_INICIAIS_IFS = {
  "Adriano": [
    { id: "AD-1", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "1º ADM", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AD-2", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "1º ADM", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Alex": [
    { id: "AL-1", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-2", dia: "Sexta-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Alyrio": [
    { id: "AY-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-2", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Matemática", status: "alert", obs: "⚠️ Prof. Alyrio ausente (Consulta Médica)", substituto: "", dataFalta: "Próxima Aula" }
  ],
  "Christiano": [
    { id: "CH-1", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-2", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-3", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-4", dia: "Quarta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "CH-5", dia: "Quarta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "CH-6", dia: "Quarta-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "CH-7", dia: "Quarta-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "CH-8", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "CH-9", dia: "Sexta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" }
  ],
  "Eber": [
    { id: "EB-1", dia: "Sexta-feira", hora: "12:00 - 12:50", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada (Banco de Dados e Eng. Soft)", substituto: "" },
    { id: "EB-2", dia: "Sexta-feira", hora: "12:50 - 13:30", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada (Banco de Dados e Eng. Soft)", substituto: "" },
    { id: "EB-3", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada (Banco de Dados e Eng. Soft)", substituto: "" },
    { id: "EB-4", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "CS1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-5", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "CS1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-6", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "CS1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-7", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "CS1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-8", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EB-9", dia: "Sexta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EB-10", dia: "Sexta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EB-11", dia: "Sexta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" }
  ],
  "Elliot": [
    { id: "EL-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-2", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-3", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-4", dia: "Segunda-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-5", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Introd. à Inform. – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-6", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Introd. à Inform. – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-7", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Introd. à Inform. – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-8", dia: "Segunda-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EL-9", dia: "Segunda-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EL-10", dia: "Segunda-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EL-11", dia: "Segunda-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EL-12", dia: "Terça-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "EL-13", dia: "Terça-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" }
  ],
  "Emerson": [
    { id: "EM-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-2", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-3", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Projeto Integrador 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-4", dia: "Segunda-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Projeto Integrador 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-5", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "CS2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-6", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "CS2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-7", dia: "Segunda-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-8", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-9", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-10", dia: "Segunda-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "EM-11", dia: "Segunda-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "EM-12", dia: "Terça-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "EM-13", dia: "Terça-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "EM-14", dia: "Terça-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "EM-15", dia: "Terça-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" }
  ],
  "Eric": [
    { id: "ER-1", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "Programação 2 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-2", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "Programação 2 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-3", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Programação 2 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-4", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Programação 2 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-5", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Programação 2 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-6", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Programação 2 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-7", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Programação 2 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-8", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Programação 2 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-9", dia: "Quarta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-10", dia: "Quarta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-11", dia: "Quarta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-12", dia: "Quarta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-13", dia: "Quinta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-14", dia: "Quinta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-15", dia: "Quinta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "ER-16", dia: "Quinta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" }
  ],
  "Felippe": [
    { id: "FL-1", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Matemática Financeira", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FL-2", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Noções de Economia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Fernanda": [
    { id: "FE-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Português", status: "assumed", obs: "Substituição confirmada", substituto: "Luiz Felipe" },
    { id: "FE-3", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "3º DS", disc: "Inglês Instrumental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-4", dia: "Segunda-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Inglês Instrumental", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "FE-5", dia: "Segunda-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Inglês Instrumental", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" }
  ],
  "Grayce": [
    { id: "GR-1", dia: "Segunda-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Gestão de Projetos", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "3º ADM", disc: "Gestão Ambiental", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Luiz Felipe": [
    { id: "LF-1", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Proj. Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Pedro Ernesto": [
    { id: "PE-1", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-2", dia: "Sexta-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Química", status: "alert", obs: "⚠️ Ausência programada (Banca Externa)", substituto: "", dataFalta: "Próxima Sexta" }
  ],
  "Pedro Goes": [
    { id: "PG-1", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "Administração Geral", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-2", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Gestão de Pessoas", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Rafael": [
    { id: "RF-1", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "CS2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-2", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "CS2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-3", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Introd. à Inform. – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-4", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Introd. à Inform. – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-5", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Introd. à Inform. – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-6", dia: "Quinta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "RF-7", dia: "Quinta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "RF-8", dia: "Quinta-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" },
    { id: "RF-9", dia: "Quinta-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada (Lab 1)", substituto: "" }
  ],
  "Raisa": [
    { id: "RA-1", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-2", dia: "Sexta-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Sanderson": [
    { id: "SA-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-2", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Sérgio": [
    { id: "SE-1", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "1º ADM", disc: "Administração Mercadológica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SE-2", dia: "Terça-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Téc. Vendas e Atend.", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Vagner": [
    { id: "VA-1", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-2", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Vinicius": [
    { id: "VI-1", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "1º DS", disc: "Filosofia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-2", dia: "Quinta-feira", hora: "12:40 - 13:30", turma: "1º ADM", disc: "Ética e Relações Humanas", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Vitor": [
    { id: "VT-1", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-2", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "2º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Weder": [
    { id: "WE-1", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Metodologia da Pesquisa", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Welkson": [
    { id: "WK-1", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Gestão da Operação", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-2", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Gestão Financeira", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Ângelo": [
    { id: "AG-1", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Programação 1 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-2", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Programação 1 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-3", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Programação 1 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-4", dia: "Terça-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "Programação 1 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-5", dia: "Terça-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "Programação 1 – B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-6", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Programação 1 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-7", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Programação 1 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-8", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Programação 1 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-9", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "Programação 1 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-10", dia: "Segunda-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "Programação 1 – A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-11", dia: "Terça-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Tópicos Especiais 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" },
    { id: "AG-12", dia: "Terça-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Tópicos Especiais 1", status: "normal", obs: "Aula confirmada (Lab 2)", substituto: "" }
  ]
};

// Exemplos iniciais para a Central de Notificações / Histórico de E-mails
const EMAILS_LOG_INICIAL = [
  {
    id: "EM-1",
    data: new Date(Date.now() - 3600000 * 4).toLocaleString('pt-BR'),
    tipo: "AUSENCIA",
    destinatario: "coordenacao.tobiasbarreto@ifs.edu.br",
    assunto: "🔴 [SUBSTITUIÇÃO DISPONÍVEL] Matemática (1º ADM) - Prof. Alyrio",
    status: "Enviado com Sucesso"
  },
  {
    id: "EM-2",
    data: new Date(Date.now() - 3600000 * 2).toLocaleString('pt-BR'),
    tipo: "SUBSTITUICAO",
    destinatario: "coordenacao.tobiasbarreto@ifs.edu.br, fernanda@ifs.edu.br",
    assunto: "✅ [SUBSTITUIÇÃO HOMOLOGADA] Português (2º DS) assumida por Prof. Luiz Felipe",
    status: "Enviado com Sucesso"
  }
];

const DEFAULT_PIN = "1234";

// E-mails institucionais oficiais dos 24 docentes do IFS Campus Tobias Barreto
const EMAILS_DOCENTES_IFS = {
  "Eber": "eber.santana@ifs.edu.br",
  "Adriano": "adriano@ifs.edu.br",
  "Alex": "alex@ifs.edu.br",
  "Alyrio": "alyrio@ifs.edu.br",
  "Ângelo": "angelo@ifs.edu.br",
  "Christiano": "christiano@ifs.edu.br",
  "Elliot": "elliot@ifs.edu.br",
  "Emerson": "emerson@ifs.edu.br",
  "Eric": "eric@ifs.edu.br",
  "Felippe": "felippe@ifs.edu.br",
  "Fernanda": "fernanda@ifs.edu.br",
  "Grayce": "grayce@ifs.edu.br",
  "Luiz Felipe": "luiz.felipe@ifs.edu.br",
  "Pedro Ernesto": "pedro.ernesto@ifs.edu.br",
  "Pedro Goes": "pedro.goes@ifs.edu.br",
  "Rafael": "rafael@ifs.edu.br",
  "Raisa": "raisa@ifs.edu.br",
  "Sanderson": "sanderson@ifs.edu.br",
  "Sérgio": "sergio@ifs.edu.br",
  "Vagner": "vagner@ifs.edu.br",
  "Vinicius": "vinicius@ifs.edu.br",
  "Vitor": "vitor@ifs.edu.br",
  "Weder": "weder@ifs.edu.br",
  "Welkson": "welkson@ifs.edu.br"
};

// Função universal para padronização de datas no formato DD-MM-YYYY (padrão brasileiro)
function formatarDataBR(dataStr) {
  if (!dataStr) return "";
  if (dataStr instanceof Date) {
    const dia = String(dataStr.getDate()).padStart(2, "0");
    const mes = String(dataStr.getMonth() + 1).padStart(2, "0");
    const ano = dataStr.getFullYear();
    return `${dia}-${mes}-${ano}`;
  }
  const str = String(dataStr).trim();
  if (!str) return "";

  // Se já estiver no padrão DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }

  // YYYY-MM-DD ou YYYY/MM/DD -> DD-MM-YYYY
  const matchIso = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (matchIso) {
    return `${matchIso[3]}-${matchIso[2]}-${matchIso[1]}`;
  }

  // DD/MM/YYYY -> DD-MM-YYYY
  const matchBarra = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchBarra) {
    return `${matchBarra[1]}-${matchBarra[2]}-${matchBarra[3]}`;
  }

  return str;
}
if (typeof window !== "undefined") {
  window.formatarDataBR = formatarDataBR;
}

const API = {
  formatarDataBR(dataStr) {
    return formatarDataBR(dataStr);
  },

  obterEmailProfessor(nome) {
    if (!nome) return "";
    if (EMAILS_DOCENTES_IFS[nome]) return EMAILS_DOCENTES_IFS[nome];
    return `${nome.toLowerCase().replace(/[^a-z0-9.]/g, '')}@ifs.edu.br`;
  },

  getBackendUrl() {
    const salvo = localStorage.getItem(STORAGE_KEY_API_URL);
    if (salvo && salvo.trim() !== "") return salvo.trim();
    return DEFAULT_BACKEND_URL;
  },

  setBackendUrl(url) {
    if (url) {
      localStorage.setItem(STORAGE_KEY_API_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_API_URL);
    }
  },

  // Configurações de E-mails da Coordenação
  getEmailsConfig() {
    const config = localStorage.getItem(STORAGE_KEY_EMAILS_CONFIG);
    if (!config) return { ...DEFAULT_EMAILS_CONFIG };
    try {
      const parsed = JSON.parse(config);
      return { ...DEFAULT_EMAILS_CONFIG, ...parsed };
    } catch (e) {
      return { ...DEFAULT_EMAILS_CONFIG };
    }
  },

  saveEmailsConfig(config) {
    localStorage.setItem(STORAGE_KEY_EMAILS_CONFIG, JSON.stringify(config));
  },

  // Roteia automaticamente para o coordenador de Subsequente (COINF), DS, ADM e Geral
  obterDestinatariosPorTurma(turma) {
    const config = this.getEmailsConfig();
    const dests = [];
    const t = (turma || "").toUpperCase();

    if (t.includes("SUBSEQUENTE") || t.includes("INFO")) {
      if (config.emailCoordSubsequente) dests.push(config.emailCoordSubsequente);
    } else if (t.includes("DS")) {
      if (config.emailCoordDS) dests.push(config.emailCoordDS);
    } else if (t.includes("ADM") || t.includes("COMÉRCIO") || t.includes("COMERCIO")) {
      if (config.emailCoordADM) dests.push(config.emailCoordADM);
    }

    if (config.emailCoordGeral && !dests.includes(config.emailCoordGeral)) {
      dests.push(config.emailCoordGeral);
    }
    if (dests.length === 0) {
      dests.push("coordenacao.tobiasbarreto@ifs.edu.br");
    }
    return dests.join(", ");
  },

  // Central de Logs de E-mails Enviados
  getEmailsLog() {
    const log = localStorage.getItem(STORAGE_KEY_EMAILS_LOG);
    if (!log) {
      localStorage.setItem(STORAGE_KEY_EMAILS_LOG, JSON.stringify(EMAILS_LOG_INICIAL));
      return EMAILS_LOG_INICIAL;
    }
    return JSON.parse(log);
  },

  registrarEmailLog(tipo, assunto, destinatarios) {
    const logs = this.getEmailsLog();
    logs.unshift({
      id: "EM-" + Date.now(),
      data: new Date().toLocaleString('pt-BR'),
      tipo,
      destinatario: destinatarios || this.getEmailsConfig().emailCoordGeral || "coordenacao.tobiasbarreto@ifs.edu.br",
      assunto,
      status: "Enviado com Sucesso"
    });
    // Mantém os últimos 30 e-mails
    if (logs.length > 30) logs.pop();
    localStorage.setItem(STORAGE_KEY_EMAILS_LOG, JSON.stringify(logs));
  },

  // Reposições de Aula
  getReposicoes() {
    const rep = localStorage.getItem(STORAGE_KEY_REPOSICOES);
    return rep ? JSON.parse(rep) : [];
  },

  salvarReposicao(novaReposicao) {
    const lista = this.getReposicoes();
    lista.unshift(novaReposicao);
    localStorage.setItem(STORAGE_KEY_REPOSICOES, JSON.stringify(lista));
    return lista;
  },

  cancelarReposicaoLocal(id) {
    let lista = this.getReposicoes();
    lista = lista.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REPOSICOES, JSON.stringify(lista));
    return lista;
  },

  // Trocas e Permutas
  getTrocas() {
    const trocas = localStorage.getItem(STORAGE_KEY_TROCAS);
    return trocas ? JSON.parse(trocas) : [];
  },

  salvarTroca(novaTroca) {
    const lista = this.getTrocas();
    lista.unshift(novaTroca);
    localStorage.setItem(STORAGE_KEY_TROCAS, JSON.stringify(lista));
    return lista;
  },

  atualizarStatusTroca(trocaId, novoStatus) {
    const lista = this.getTrocas();
    const troca = lista.find(t => t.id === trocaId);
    if (troca) {
      troca.status = novoStatus;
      localStorage.setItem(STORAGE_KEY_TROCAS, JSON.stringify(lista));
    }
    return lista;
  },

  // Mesclador inteligente de status do Google Sheets com a base local completa
  mesclarAulasComGoogleSheet(baseLocal, sheetData) {
    const merged = { ...baseLocal };
    for (const prof in sheetData) {
      const sheetAulas = sheetData[prof];
      if (!Array.isArray(sheetAulas) || sheetAulas.length === 0) continue;

      if (!merged[prof]) {
        merged[prof] = sheetAulas;
        continue;
      }

      const aulasLocais = [...merged[prof]];
      sheetAulas.forEach((sAula) => {
        // Encontra correspondência prioritariamente pelo slot físico (dia, hora, turma)
        // e secundariamente por ID apenas se o dia for idêntico.
        const idx = aulasLocais.findIndex(
          (l) => (l.dia === sAula.dia && l.hora === sAula.hora && l.turma === sAula.turma) ||
                 (l.id === sAula.id && l.dia === sAula.dia)
        );
        if (idx !== -1) {
          aulasLocais[idx] = {
            ...aulasLocais[idx],
            status: sAula.status || aulasLocais[idx].status,
            substituto: sAula.substituto || aulasLocais[idx].substituto,
            obs: sAula.obs || aulasLocais[idx].obs,
            dataFalta: this.formatarDataBR(sAula.dataFalta) || this.formatarDataBR(aulasLocais[idx].dataFalta),
            linhaExcel: sAula.linhaExcel || aulasLocais[idx].linhaExcel
          };
        }
      });
      merged[prof] = aulasLocais;
    }
    return merged;
  },

  // Banco de Dados Local dos Horários com auto-migração inteligente
  getLocalDatabase() {
    const versao = localStorage.getItem(STORAGE_KEY_DB_VERSION);
    const salvo = localStorage.getItem(STORAGE_KEY_LOCAL_DB);
    let db = null;
    if (salvo) {
      try {
        db = JSON.parse(salvo);
      } catch (e) {
        console.error("Erro ao ler banco local:", e);
      }
    }

    // Validação estrita: se faltar turmas do subsequente para Eber ou versão mudou
    const precisaMigracao = !db || 
      versao !== CURRENT_DB_VERSION || 
      !db["Eber"] || 
      db["Eber"].length < 11 || 
      !db["Eber"].some(a => (a.turma || "").includes("Subsequente"));

    if (precisaMigracao) {
      localStorage.setItem(STORAGE_KEY_DB_VERSION, CURRENT_DB_VERSION);
      const baseNova = JSON.parse(JSON.stringify(DADOS_INICIAIS_IFS));
      // Preserva status alert/assumed existentes do usuário
      if (db) {
        for (const prof in db) {
          if (baseNova[prof] && Array.isArray(db[prof])) {
            db[prof].forEach((aulaAntiga) => {
              if (aulaAntiga.status === "alert" || aulaAntiga.status === "assumed") {
                const correspondente = baseNova[prof].find(
                  (n) => n.dia === aulaAntiga.dia && n.hora === aulaAntiga.hora && n.turma === aulaAntiga.turma
                );
                if (correspondente) {
                  correspondente.status = aulaAntiga.status;
                  correspondente.substituto = aulaAntiga.substituto;
                  correspondente.obs = aulaAntiga.obs;
                  correspondente.dataFalta = aulaAntiga.dataFalta;
                }
              }
            });
          }
        }
      }
      localStorage.setItem(STORAGE_KEY_LOCAL_DB, JSON.stringify(baseNova));
      return baseNova;
    }

    return db;
  },

  saveLocalDatabase(db) {
    localStorage.setItem(STORAGE_KEY_LOCAL_DB, JSON.stringify(db));
  },

  // Gerenciamento de PIN
  getTeacherPins() {
    const pins = localStorage.getItem(STORAGE_KEY_PINS);
    return pins ? JSON.parse(pins) : {};
  },

  verifyPin(professor, pinDigitado) {
    const pins = this.getTeacherPins();
    const pinCorreto = pins[professor] || DEFAULT_PIN;
    return pinDigitado === pinCorreto;
  },

  saveNewPin(professor, novoPin) {
    const pins = this.getTeacherPins();
    pins[professor] = novoPin;
    localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(pins));
    return true;
  },

  recuperarPin(professor) {
    this.saveNewPin(professor, DEFAULT_PIN);
    const emailProf = this.obterEmailProfessor(professor);
    const config = this.getEmailsConfig();
    
    this.registrarEmailLog(
      "RECUPERACAO_PIN",
      `🔑 [SEGURANÇA] Solicitação de recuperação de PIN - Prof. ${professor}`,
      `${emailProf}, ${config.emailCoordGeral || "coordenacao.tobiasbarreto@ifs.edu.br"}`
    );

    const url = this.getBackendUrl();
    if (url) {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ acao: "recuperar_pin", professor: professor, email: emailProf }),
        redirect: "follow"
      }).catch(err => console.warn("Aviso ao recuperar PIN no Google:", err));
    }

    return { sucesso: true, email: emailProf, pinPadrao: DEFAULT_PIN };
  },

  // Carrega toda a grade com timeout rápido e sem bloqueio desnecessário
  async carregarGradeCompleta() {
    const url = this.getBackendUrl();
    if (!url) {
      return { online: false, data: this.getLocalDatabase() };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(`${url}?action=obterGrade`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const gradeMesclada = this.mesclarAulasComGoogleSheet(this.getLocalDatabase(), data);
        this.saveLocalDatabase(gradeMesclada);
        return { online: true, data: gradeMesclada };
      }
      return { online: false, data: this.getLocalDatabase() };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn("Backend Google demorou para responder. Mantendo base rápida local:", err.message);
      return { online: false, data: this.getLocalDatabase() };
    }
  },

  // Processamento otimista imediato (0ms) + envio assíncrono em segundo plano
  processarAcao(payload) {
    const url = this.getBackendUrl();
    const config = this.getEmailsConfig();
    const localDb = this.getLocalDatabase();
    const { acao, profOriginal, index, substituto, dataFalta, motivo } = payload;

    // 1. Processamento Local Imediato (0ms)
    if ((acao === "libertar_multiplos" || acao === "libertar") && localDb[profOriginal]) {
      const indicesArray = acao === "libertar_multiplos" ? (payload.indices || []) : [index];
      const turmasAfetadas = new Set();
      const discsAfetadas = new Set();
      let contagem = 0;

      indicesArray.forEach((idx) => {
        if (localDb[profOriginal][idx]) {
          const aula = localDb[profOriginal][idx];
          aula.status = "alert";
          aula.obs = motivo ? `⚠️ ${motivo}` : `⚠️ Prof. ${profOriginal} ausente`;
          aula.dataFalta = this.formatarDataBR(dataFalta) || "Próxima aula";
          aula.substituto = "";
          turmasAfetadas.add(aula.turma);
          discsAfetadas.add(aula.disc);
          contagem++;
        }
      });

      this.saveLocalDatabase(localDb);

      if (config.notificarFalta && contagem > 0) {
        const turmasStr = Array.from(turmasAfetadas).join(", ");
        const discsStr = Array.from(discsAfetadas).join(", ");
        const emailDocente = payload.emailDocente || this.obterEmailProfessor(profOriginal);
        const destsCoord = Array.from(turmasAfetadas).map(t => this.obterDestinatariosPorTurma(t)).join(", ");
        const destsCompleto = emailDocente ? `${emailDocente}, ${destsCoord}` : destsCoord;
        const labelTempos = contagem > 1 ? `${contagem} TEMPOS` : "1 TEMPO";
        this.registrarEmailLog("AUSENCIA", `🔴 [AUSÊNCIA - ${labelTempos}] ${discsStr} (${turmasStr}) - Prof. ${profOriginal}`, destsCompleto);
      }
    } else if (acao === "recuperar_multiplos" && localDb[profOriginal]) {
      const indicesArray = payload.indices || [];
      indicesArray.forEach((idx) => {
        if (localDb[profOriginal][idx]) {
          const aula = localDb[profOriginal][idx];
          aula.status = "normal";
          aula.substituto = "";
          aula.obs = "Aula confirmada";
          delete aula.dataFalta;
        }
      });
      this.saveLocalDatabase(localDb);
    } else if (acao === "assumir" && localDb[profOriginal] && localDb[profOriginal][index]) {
      const aula = localDb[profOriginal][index];
      aula.status = "assumed";
      aula.substituto = substituto;
      aula.obs = `Substituição confirmada por Prof. ${substituto}`;
      this.saveLocalDatabase(localDb);

      if (config.notificarSubstituicao) {
        const dests = this.obterDestinatariosPorTurma(aula.turma);
        const emailTitular = this.obterEmailProfessor(profOriginal);
        const emailSubs = payload.emailSubstituto || this.obterEmailProfessor(substituto);
        this.registrarEmailLog("SUBSTITUICAO", `✅ [SUBSTITUIÇÃO HOMOLOGADA] ${aula.disc} (${aula.turma}) assumida por Prof. ${substituto}`, `${dests}, ${emailTitular}, ${emailSubs}`);
      }
    } else if ((acao === "recuperar" || acao === "cancelar") && localDb[profOriginal] && localDb[profOriginal][index]) {
      const aula = localDb[profOriginal][index];
      aula.status = "normal";
      aula.substituto = "";
      aula.obs = "Aula confirmada";
      delete aula.dataFalta;
      this.saveLocalDatabase(localDb);
    } else if (acao === "propor_troca") {
      const { troca } = payload;
      if (troca && troca.dataPrevista) {
        troca.dataPrevista = this.formatarDataBR(troca.dataPrevista);
      }
      this.salvarTroca(troca);
      if (config.notificarTroca) {
        const dests1 = this.obterDestinatariosPorTurma(troca.aulaCedida?.turma || "");
        const qtdCedidas = (troca.aulasCedidas && troca.aulasCedidas.length) || 1;
        const qtdDesejadas = (troca.aulasDesejadas && troca.aulasDesejadas.length) || 1;
        const temposLabel = (qtdCedidas > 1 || qtdDesejadas > 1) ? ` (${qtdCedidas} ↔️ ${qtdDesejadas} tempos)` : "";
        const emailProp = payload.emailProponente || this.obterEmailProfessor(troca.proponente);
        const emailColega = payload.emailColega || this.obterEmailProfessor(troca.colega);
        this.registrarEmailLog("PERMUTA_PROPOSTA", `🔄 [PROPOSTA DE TROCA${temposLabel}] Prof. ${troca.proponente} solicitou permuta com Prof. ${troca.colega}`, `${dests1}, ${emailProp}, ${emailColega}`);
      }
    } else if (acao === "aceitar_troca") {
      const { trocaId, troca } = payload;
      this.atualizarStatusTroca(trocaId, "aceita");
      if (config.notificarTroca && troca) {
        const dests2 = this.obterDestinatariosPorTurma(troca.aulaCedida?.turma || "");
        const qtdCedidas = (troca.aulasCedidas && troca.aulasCedidas.length) || 1;
        const qtdDesejadas = (troca.aulasDesejadas && troca.aulasDesejadas.length) || 1;
        const temposLabel = (qtdCedidas > 1 || qtdDesejadas > 1) ? ` (${qtdCedidas} ↔️ ${qtdDesejadas} tempos)` : "";
        const emailProp = payload.emailProponente || this.obterEmailProfessor(troca.proponente);
        const emailColega = payload.emailColega || this.obterEmailProfessor(troca.colega);
        this.registrarEmailLog("PERMUTA_ACEITA", `✅ [TROCA CONFIRMADA${temposLabel}] Permuta aprovada entre Prof. ${troca.proponente} e Prof. ${troca.colega}`, `${dests2}, ${emailProp}, ${emailColega}`);
      }
    } else if (acao === "recusar_troca") {
      const { trocaId } = payload;
      this.atualizarStatusTroca(trocaId, "recusada");
    } else if (acao === "agendar_reposicao") {
      const { reposicao } = payload;
      if (reposicao && reposicao.data) {
        reposicao.data = this.formatarDataBR(reposicao.data);
      }
      this.salvarReposicao(reposicao);
      if (config.notificarReposicao) {
        const dests = this.obterDestinatariosPorTurma(reposicao.turma);
        const emailProf = payload.emailDocente || this.obterEmailProfessor(reposicao.professor);
        const destsCompletos = emailProf ? `${emailProf}, ${dests}` : dests;
        this.registrarEmailLog("REPOSICAO", `📅 [REPOSIÇÃO AGENDADA] ${reposicao.disciplina} (${reposicao.turma}) - Prof. ${reposicao.professor} para ${this.formatarDataBR(reposicao.data)}`, destsCompletos);
      }
    } else if (acao === "cancelar_reposicao") {
      const { id } = payload;
      this.cancelarReposicaoLocal(id);
    }

    const dbAtualizado = this.getLocalDatabase();

    // 2. Dispara envio assíncrono em segundo plano para o Google Apps Script
    if (url) {
      const payloadEnvio = { ...payload, emailsConfig: config };
      if (payloadEnvio.dataFalta) {
        payloadEnvio.dataFalta = this.formatarDataBR(payloadEnvio.dataFalta);
      }
      if (!payloadEnvio.emailDocente && profOriginal) {
        payloadEnvio.emailDocente = this.obterEmailProfessor(profOriginal);
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payloadEnvio),
        redirect: "follow"
      }).then(res => res.json().catch(() => null))
        .then(resData => {
          if (resData) {
            console.log("Sincronismo Google Apps Script:", resData);
            if (resData.sucesso) {
              if (typeof atualizarIndicadorSincronismo === "function") {
                atualizarIndicadorSincronismo("online", "Conectado ao Google Sheets");
              }
              if (resData.destinatarios) {
                console.info("E-mails institucionais enviados com sucesso para:", resData.destinatarios);
              }
            } else if (resData.concorrencia) {
              if (typeof mostrarToast === "function") {
                mostrarToast("Aviso: " + resData.erro);
              }
            }
          }
        }).catch(err => {
          console.warn("Aviso ao sincronizar remotamente em segundo plano:", err);
        });
    }

    return dbAtualizado;
  },

  async executarAcao(payload) {
    return this.processarAcao(payload);
  },

  // Consolidação de todos os eventos para a Aba de Relatórios
  obterTodosEventosRelatorio() {
    const eventos = [];
    const db = this.getLocalDatabase();

    // 1. Ausências (Faltas) e Aulas Assumidas
    for (const prof in db) {
      db[prof].forEach((aula, idx) => {
        if (aula.status === "alert") {
          eventos.push({
            id: aula.id || `EV-FALTA-${prof}-${idx}`,
            tipo: "AUSENCIA",
            data: this.formatarDataBR(aula.dataFalta) || "Próxima Ocorrência",
            horario: `${aula.dia} às ${aula.hora}`,
            turma: aula.turma,
            disciplina: aula.disc,
            titular: prof,
            substituto: "-",
            detalhes: aula.obs || "Ausência comunicada",
            status: "Aguardando Substituto"
          });
        } else if (aula.status === "assumed") {
          eventos.push({
            id: aula.id || `EV-SUBS-${prof}-${idx}`,
            tipo: "SUBSTITUICAO",
            data: this.formatarDataBR(aula.dataFalta) || "Aula Recorrente",
            horario: `${aula.dia} às ${aula.hora}`,
            turma: aula.turma,
            disciplina: aula.disc,
            titular: prof,
            substituto: aula.substituto || "Docente Designado",
            detalhes: aula.obs || "Substituição confirmada",
            status: "Homologada"
          });
        }
      });
    }

    // 2. Trocas e Permutas
    const trocas = this.getTrocas();
    trocas.forEach((t) => {
      const qtdCedidas = (t.aulasCedidas && t.aulasCedidas.length) || 1;
      const qtdDesejadas = (t.aulasDesejadas && t.aulasDesejadas.length) || 1;
      const horarioDesc = t.aulasCedidas && t.aulasCedidas.length > 1
        ? `${t.aulaCedida?.dia || ""} (${qtdCedidas} tempos ↔ ${qtdDesejadas} tempos)`
        : `${t.aulaCedida?.dia || ""} às ${t.aulaCedida?.hora || ""}`;
      const turmaDesc = t.aulasCedidas && t.aulasCedidas.length > 1
        ? Array.from(new Set(t.aulasCedidas.map(a => a.turma))).join("/") + " ↔ " + Array.from(new Set(t.aulasDesejadas.map(a => a.turma))).join("/")
        : `${t.aulaCedida?.turma || ""} ↔ ${t.aulaDesejada?.turma || ""}`;
      const discDesc = t.aulasCedidas && t.aulasCedidas.length > 1
        ? Array.from(new Set(t.aulasCedidas.map(a => a.disc))).join("/") + " ↔ " + Array.from(new Set(t.aulasDesejadas.map(a => a.disc))).join("/")
        : `${t.aulaCedida?.disc || ""} ↔ ${t.aulaDesejada?.disc || ""}`;

      eventos.push({
        id: t.id,
        tipo: "PERMUTA",
        data: this.formatarDataBR(t.dataPrevista) || "-",
        horario: horarioDesc,
        turma: turmaDesc,
        disciplina: discDesc,
        titular: t.proponente,
        substituto: t.colega,
        detalhes: t.motivo || "Permuta de horários entre docentes",
        status: t.status === "aceita" ? "Confirmada" : (t.status === "recusada" ? "Recusada" : "Pendente de Aceite")
      });
    });

    // 3. Reposições de Aula
    const repos = this.getReposicoes();
    repos.forEach((r) => {
      eventos.push({
        id: r.id,
        tipo: "REPOSICAO",
        data: this.formatarDataBR(r.data),
        horario: r.horario,
        turma: r.turma,
        disciplina: r.disciplina,
        titular: r.professor,
        substituto: "-",
        detalhes: `Local: ${r.sala} • ${r.motivo || "Reposição curricular"}`,
        status: "Agendada"
      });
    });

    return eventos;
  }
};
