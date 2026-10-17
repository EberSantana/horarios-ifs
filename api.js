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
const STORAGE_KEY_PROFESSORES = 'IFS_PROFESSORES';
const STORAGE_KEY_TROCAS = 'IFS_TROCAS_PERMUTAS';
const STORAGE_KEY_REPOSICOES = 'IFS_REPOSICOES_AULAS';

// Versão do banco para auto-atualizar clientes com as turmas do Subsequente e novos docentes
const CURRENT_DB_VERSION = 'v8_graduacao_adm';

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
    { id: "AD-3", dia: "Sexta-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AD-4", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AD-1", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "1º ADM", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AD-2", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "1º ADM", disc: "Artes", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Alex": [
    { id: "AL-3", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "3º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-4", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "3º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-1", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-5", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-6", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "1º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-7", dia: "Quinta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-8", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-9", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-10", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-11", dia: "Sexta-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-2", dia: "Sexta-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AL-12", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "2º ADM", disc: "História", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Alyrio": [
    { id: "AY-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-3", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "3º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-4", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "3º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-5", dia: "Segunda-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-6", dia: "Segunda-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-7", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-8", dia: "Segunda-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-2", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-9", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-10", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-11", dia: "Terça-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-12", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-13", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-14", dia: "Terça-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-15", dia: "Terça-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-16", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-17", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AY-18", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Matemática", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Christiano": [
    { id: "CH-1", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-2", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-3", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Tópicos Especiais", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-4", dia: "Quarta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-5", dia: "Quarta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-6", dia: "Quarta-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-7", dia: "Quarta-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "CS2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-8", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CH-9", dia: "Sexta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Eber": [
    { id: "EB-4", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "CS1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-5", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "CS1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-1", dia: "Sexta-feira", hora: "12:00 - 12:50", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-13", dia: "Sexta-feira", hora: "12:50 - 13:30", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-3", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "BD e ES", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-6", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "CS1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-7", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "CS1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-8", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-9", dia: "Sexta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-10", dia: "Sexta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EB-11", dia: "Sexta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Elliot": [
    { id: "EL-14", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-15", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-16", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-17", dia: "Segunda-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "Projeto Integrador 2", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-8", dia: "Segunda-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-9", dia: "Segunda-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-10", dia: "Segunda-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-11", dia: "Segunda-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-18", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Introd. à Inform. - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-19", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Introd. à Inform. - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-20", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Introd. à Inform. - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-12", dia: "Terça-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EL-13", dia: "Terça-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Programação 3", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Emerson": [
    { id: "EM-16", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-17", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Informática Básica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-18", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Projeto Integrador 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-19", dia: "Segunda-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Projeto Integrador 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-20", dia: "Segunda-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-21", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-22", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "3º DS", disc: "Redes de Computadores e SI", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-10", dia: "Segunda-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-11", dia: "Segunda-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-12", dia: "Terça-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-13", dia: "Terça-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-14", dia: "Terça-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-15", dia: "Terça-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Org. Comp. e SO", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-23", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "CS2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "EM-24", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "CS2 - A", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Eric": [
    { id: "ER-1", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "Programação 2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-2", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "Programação 2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-3", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Programação 2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-4", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Programação 2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-9", dia: "Quarta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-10", dia: "Quarta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-11", dia: "Quarta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-12", dia: "Quarta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-5", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Programação 2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-6", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Programação 2 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-13", dia: "Quinta-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-14", dia: "Quinta-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-15", dia: "Quinta-feira", hora: "20:30 - 21:20", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-16", dia: "Quinta-feira", hora: "21:20 - 22:10", turma: "1º Info (Subsequente)", disc: "Programação 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-7", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Programação 2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ER-8", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "2º DS", disc: "Programação 2 - B", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Felippe": [
    { id: "FL-1", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Matemática Financeira", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FL-3", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Matemática Financeira", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FL-2", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Noções de Economia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FL-4", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "1º ADM", disc: "Noções de Economia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Fernanda": [
    { id: "FE-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-6", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "1º DS", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-7", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-8", dia: "Segunda-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-9", dia: "Segunda-feira", hora: "12:40 - 13:30", turma: "1º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-10", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "2º ADM", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-11", dia: "Segunda-feira", hora: "15:10 - 16:00", turma: "2º ADM", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-4", dia: "Segunda-feira", hora: "18:40 - 19:30", turma: "1º Info (Subsequente)", disc: "Inglês Instrumental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-5", dia: "Segunda-feira", hora: "19:30 - 20:20", turma: "1º Info (Subsequente)", disc: "Inglês Instrumental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-12", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-13", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-14", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "1º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-15", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-16", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "1º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-17", dia: "Terça-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Espanhol", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-18", dia: "Terça-feira", hora: "12:00 - 12:50", turma: "2º DS", disc: "Espanhol", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-19", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "1º ADM", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-20", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "1º ADM", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-21", dia: "Terça-feira", hora: "14:20 - 15:10", turma: "3º DS", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-22", dia: "Terça-feira", hora: "15:10 - 16:00", turma: "3º DS", disc: "Inglês", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-23", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-24", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "3º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-25", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "3º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-26", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "3º ADM", disc: "Espanhol", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-27", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-28", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-29", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-30", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-31", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-32", dia: "Quinta-feira", hora: "11:10 - 12:00", turma: "3º ADM", disc: "Espanhol", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-33", dia: "Quinta-feira", hora: "12:40 - 13:30", turma: "3º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-34", dia: "Quinta-feira", hora: "13:30 - 14:20", turma: "3º DS", disc: "Português", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-35", dia: "Segunda-feira", hora: "20:30 - 21:20", turma: "Graduação ADM", disc: "Português Instrumental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "FE-36", dia: "Segunda-feira", hora: "21:20 - 22:00", turma: "Graduação ADM", disc: "Português Instrumental", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Grayce": [
    { id: "GR-1", dia: "Segunda-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Gestão de Projetos", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-3", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "2º ADM", disc: "Gestão de Projetos", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "3º ADM", disc: "Gestão Ambiental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-4", dia: "Terça-feira", hora: "11:10 - 12:00", turma: "3º ADM", disc: "Gestão Ambiental", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-5", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "3º ADM", disc: "Empreendedorismo", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-6", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "3º ADM", disc: "Empreendedorismo", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-7", dia: "Segunda-feira", hora: "18:40 - 19:30", turma: "Graduação ADM", disc: "Metodologia da Pesquisa I", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "GR-8", dia: "Segunda-feira", hora: "19:30 - 20:20", turma: "Graduação ADM", disc: "Metodologia da Pesquisa I", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Pedro Ernesto": [
    { id: "PE-3", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-4", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-5", dia: "Quarta-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-6", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "2º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-7", dia: "Quinta-feira", hora: "12:00 - 12:50", turma: "2º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-8", dia: "Quinta-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-9", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "1º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-10", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "1º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-1", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-11", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "1º DS", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-12", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "3º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PE-13", dia: "Sexta-feira", hora: "11:10 - 12:00", turma: "3º ADM", disc: "Química", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Pedro Goes": [
    { id: "PG-2", dia: "Segunda-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Gestão de Pessoas", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-3", dia: "Segunda-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Gestão de Pessoas", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-1", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "Administração Geral", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-4", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Administração Geral", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-5", dia: "Terça-feira", hora: "18:40 - 19:30", turma: "Graduação ADM", disc: "Teoria Geral da Administração e das Organizações I", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-6", dia: "Terça-feira", hora: "19:30 - 20:20", turma: "Graduação ADM", disc: "Teoria Geral da Administração e das Organizações I", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-7", dia: "Terça-feira", hora: "20:30 - 21:20", turma: "Graduação ADM", disc: "Teoria Geral da Administração e das Organizações I", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "PG-8", dia: "Terça-feira", hora: "21:20 - 22:00", turma: "Graduação ADM", disc: "Teoria Geral da Administração e das Organizações I", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Luiz Rafael Freitas": [
    { id: "RF-10", dia: "Quarta-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "CS2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-11", dia: "Quarta-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "CS2 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-12", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Introd. à Inform. - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-13", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Introd. à Inform. - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-14", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Introd. à Inform. - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-6", dia: "Quinta-feira", hora: "18:40 - 19:30", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-7", dia: "Quinta-feira", hora: "19:30 - 20:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-8", dia: "Quinta-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RF-9", dia: "Quinta-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Eng. Software", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Raisa": [
    { id: "RA-3", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-4", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-5", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "2º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-6", dia: "Quinta-feira", hora: "11:10 - 12:00", turma: "2º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-7", dia: "Quinta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-8", dia: "Quinta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-9", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-10", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-1", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-11", dia: "Sexta-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-12", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "3º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "RA-13", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "3º ADM", disc: "Biologia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Sanderson": [
    { id: "SA-1", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-3", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-4", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-5", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "2º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-6", dia: "Segunda-feira", hora: "15:10 - 16:00", turma: "3º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-7", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-8", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "3º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-9", dia: "Terça-feira", hora: "14:20 - 15:10", turma: "2º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-10", dia: "Terça-feira", hora: "15:10 - 16:00", turma: "2º ADM", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-11", dia: "Quarta-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SA-12", dia: "Quarta-feira", hora: "09:30 - 10:20", turma: "1º DS", disc: "Educação Física", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Sérgio": [
    { id: "SE-1", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "1º ADM", disc: "Administração Mercadológica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SE-3", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "1º ADM", disc: "Administração Mercadológica", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SE-2", dia: "Terça-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Téc. Vendas e Atend", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "SE-4", dia: "Terça-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Téc. Vendas e Atend", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Vinicius": [
    { id: "VI-3", dia: "Quinta-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Filosofia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-4", dia: "Quinta-feira", hora: "12:00 - 12:50", turma: "2º ADM", disc: "Filosofia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-5", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "1º DS", disc: "Filosofia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-6", dia: "Sexta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Filosofia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-7", dia: "Sexta-feira", hora: "12:40 - 13:30", turma: "1º ADM", disc: "Ética e Relações Humanas", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VI-8", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "1º ADM", disc: "Ética e Relações Humanas", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Vitor": [
    { id: "VT-3", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-4", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-1", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-5", dia: "Quinta-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-6", dia: "Quinta-feira", hora: "12:40 - 13:30", turma: "3º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-7", dia: "Quinta-feira", hora: "13:30 - 14:20", turma: "3º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-8", dia: "Quinta-feira", hora: "14:20 - 15:10", turma: "2º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-9", dia: "Quinta-feira", hora: "15:10 - 16:00", turma: "2º ADM", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-10", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "3º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-11", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "3º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-12", dia: "Sexta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VT-13", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Geografia", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Weder": [
    { id: "WE-3", dia: "Segunda-feira", hora: "08:40 - 09:30", turma: "2º DS", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-4", dia: "Segunda-feira", hora: "09:30 - 10:20", turma: "2º DS", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-5", dia: "Segunda-feira", hora: "12:40 - 13:30", turma: "3º ADM", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-6", dia: "Segunda-feira", hora: "13:30 - 14:20", turma: "3º ADM", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-1", dia: "Terça-feira", hora: "08:40 - 09:30", turma: "2º ADM", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-7", dia: "Terça-feira", hora: "09:30 - 10:20", turma: "2º ADM", disc: "Sociologia", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-2", dia: "Terça-feira", hora: "10:20 - 11:10", turma: "1º ADM", disc: "Noções de Metodologia da Pesquisa", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-8", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "1º ADM", disc: "Noções de Metodologia da Pesquisa", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-9", dia: "Quarta-feira", hora: "18:40 - 19:30", turma: "Graduação ADM", disc: "Sociologia das Organizações", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-10", dia: "Quarta-feira", hora: "19:30 - 20:20", turma: "Graduação ADM", disc: "Sociologia das Organizações", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-11", dia: "Quarta-feira", hora: "20:30 - 21:20", turma: "Graduação ADM", disc: "Sociologia das Organizações", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WE-12", dia: "Quarta-feira", hora: "21:20 - 22:00", turma: "Graduação ADM", disc: "Sociologia das Organizações", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Welkson": [
    { id: "WK-1", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Gestão da Operação", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-3", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "3º ADM", disc: "Gestão da Operação", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-2", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "3º ADM", disc: "Gestão Financeira", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-4", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "3º ADM", disc: "Gestão Financeira", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-5", dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "2º ADM", disc: "Logística Empresarial", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "WK-6", dia: "Sexta-feira", hora: "15:10 - 16:00", turma: "2º ADM", disc: "Logística Empresarial", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Ângelo": [
    { id: "AG-9", dia: "Segunda-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "Programação 1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-10", dia: "Segunda-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "Programação 1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-1", dia: "Terça-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Programação 1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-2", dia: "Terça-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Programação 1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-3", dia: "Terça-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Programação 1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-4", dia: "Terça-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "Programação 1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-5", dia: "Terça-feira", hora: "15:10 - 16:00", turma: "1º DS", disc: "Programação 1 - B", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-11", dia: "Terça-feira", hora: "20:30 - 21:20", turma: "3º Info (Subsequente)", disc: "Tópicos Especiais 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-12", dia: "Terça-feira", hora: "21:20 - 22:10", turma: "3º Info (Subsequente)", disc: "Tópicos Especiais 1", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-6", dia: "Quarta-feira", hora: "11:50 - 12:40", turma: "1º DS", disc: "Programação 1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-7", dia: "Quarta-feira", hora: "12:40 - 13:30", turma: "1º DS", disc: "Programação 1 - A", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "AG-8", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "1º DS", disc: "Programação 1 - A", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Claifton": [
    { id: "CB-1", dia: "Quinta-feira", hora: "18:40 - 19:30", turma: "Graduação ADM", disc: "Fundamentos de Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CB-2", dia: "Quinta-feira", hora: "19:30 - 20:20", turma: "Graduação ADM", disc: "Fundamentos de Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CB-3", dia: "Quinta-feira", hora: "20:30 - 21:20", turma: "Graduação ADM", disc: "Fundamentos de Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CB-4", dia: "Quinta-feira", hora: "21:20 - 22:00", turma: "Graduação ADM", disc: "Fundamentos de Matemática", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CB-5", dia: "Sexta-feira", hora: "18:40 - 19:30", turma: "Graduação ADM", disc: "Comunicação Empresarial", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "CB-6", dia: "Sexta-feira", hora: "19:30 - 20:20", turma: "Graduação ADM", disc: "Comunicação Empresarial", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "Érica Delfino": [
    { id: "ED-1", dia: "Sexta-feira", hora: "20:30 - 21:20", turma: "Graduação ADM", disc: "Introdução ao Direito", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "ED-2", dia: "Sexta-feira", hora: "21:20 - 22:00", turma: "Graduação ADM", disc: "Introdução ao Direito", status: "normal", obs: "Aula confirmada", substituto: "" }
  ],
  "A definir": [
    { id: "VA-3", dia: "Quarta-feira", hora: "12:00 - 12:50", turma: "2º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-4", dia: "Quarta-feira", hora: "13:30 - 14:20", turma: "2º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-5", dia: "Quinta-feira", hora: "08:40 - 09:30", turma: "1º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-6", dia: "Quinta-feira", hora: "09:30 - 10:20", turma: "1º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-7", dia: "Quinta-feira", hora: "10:20 - 11:10", turma: "3º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-8", dia: "Quinta-feira", hora: "11:10 - 12:00", turma: "3º DS", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-1", dia: "Sexta-feira", hora: "08:40 - 09:30", turma: "1º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-9", dia: "Sexta-feira", hora: "09:30 - 10:20", turma: "1º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-2", dia: "Sexta-feira", hora: "10:20 - 11:10", turma: "2º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-10", dia: "Sexta-feira", hora: "11:10 - 12:00", turma: "2º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-11", dia: "Sexta-feira", hora: "12:40 - 13:30", turma: "3º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" },
    { id: "VA-12", dia: "Sexta-feira", hora: "13:30 - 14:20", turma: "3º ADM", disc: "Física", status: "normal", obs: "Aula confirmada", substituto: "" }
  ]
};

// A Central de Notificações começa vazia (antes trazia 2 exemplos inventados)
const EMAILS_LOG_INICIAL = [];

const DEFAULT_PIN = "1234";

// E-mails institucionais oficiais dos 24 docentes do IFS Campus Tobias Barreto
const EMAILS_DOCENTES_IFS = {
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
    if (!nome || nome === "A definir") return ""; // aula sem professor: não envia e-mail ao titular
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

    if (t.includes("GRADUA")) {
      dests.push(config.emailCoordGraduacao || "cobad.ctb@ifs.edu.br");
    } else if (t.includes("SUBSEQUENTE") || t.includes("INFO")) {
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
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem(STORAGE_KEY_EMAILS_LOG) || "[]") || []; } catch (e) {}
    // Remove os 2 exemplos inventados que versões antigas gravavam (EM-1 e EM-2)
    const limpos = logs.filter((l) => l && l.id !== "EM-1" && l.id !== "EM-2");
    if (limpos.length !== logs.length) localStorage.setItem(STORAGE_KEY_EMAILS_LOG, JSON.stringify(limpos));
    return limpos;
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
  gradeDoServidor(sheetData) {
    const banco = {};
    for (const prof in sheetData) {
      if (!Array.isArray(sheetData[prof]) || sheetData[prof].length === 0) continue;
      banco[prof] = sheetData[prof].map((a) => ({
        id: a.id, dia: a.dia, hora: a.hora, turma: a.turma, disc: a.disc,
        status: a.status || "normal", substituto: a.substituto || "", obs: a.obs || "",
        dataFalta: this.formatarDataBR(a.dataFalta) || "", linhaExcel: a.linhaExcel
      }));
    }
    return banco;
  },

  // Lista de professores vinda da aba "Professores" (cadastrada pelo painel administrativo)
  salvarProfessores(lista) {
    try { localStorage.setItem(STORAGE_KEY_PROFESSORES, JSON.stringify(lista)); } catch (e) {}
  },
  getProfessores() {
    try {
      const lista = JSON.parse(localStorage.getItem(STORAGE_KEY_PROFESSORES) || "null");
      if (Array.isArray(lista) && lista.length) return lista;
    } catch (e) {}
    return null;
  },

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
          // O servidor é a fonte da verdade: campo vazio no servidor LIMPA o local
          aulasLocais[idx] = {
            ...aulasLocais[idx],
            status: sAula.status || "normal",
            substituto: sAula.substituto || "",
            obs: sAula.obs || "",
            dataFalta: this.formatarDataBR(sAula.dataFalta) || "",
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
    // (antes também exigia "Eber com 11 aulas": com o painel admin a grade pode mudar, então só a versão conta)
    const precisaMigracao = !db || versao !== CURRENT_DB_VERSION || Object.keys(db).length === 0;

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

  // Controle de escritas em andamento: enquanto um POST não terminou, o GET
  // devolveria o estado antigo e "desfaria" na tela a ação que o professor acabou de fazer.
  _escritasPendentes: 0,
  _ultimaEscrita: 0,

  _haEscritaRecente() {
    return this._escritasPendentes > 0 || (Date.now() - this._ultimaEscrita) < 3000;
  },

  // Une a lista do servidor com itens locais recém-criados que ainda não chegaram lá
  _mesclarListas(listaServidor, listaLocal) {
    const idsServidor = new Set(listaServidor.map(i => i.id));
    const doisMinutos = 2 * 60 * 1000;
    const pendentesLocais = listaLocal.filter(i => {
      if (!i || idsServidor.has(i.id)) return false;
      const ts = parseInt(String(i.id || "").replace(/\D/g, ""), 10);
      return ts && (Date.now() - ts) < doisMinutos;
    });
    return [...pendentesLocais, ...listaServidor];
  },

  // Carrega grade + trocas + reposições do Google Sheets
  async carregarGradeCompleta() {
    const url = this.getBackendUrl();
    if (!url) {
      return { online: false, data: this.getLocalDatabase() };
    }

    const controller = new AbortController();
    // Apps Script "frio" pode levar 8-12 s; a tela já está desenhada com a base local, então esperamos mais
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${url}?action=obterTudo`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Se o professor acabou de agir, não sobrescreve a tela com dados anteriores à ação
      if (this._haEscritaRecente()) {
        return { online: true, data: this.getLocalDatabase(), adiado: true };
      }

      // Compatível com o backend antigo (só grade) e com o novo ({ grade, trocas, reposicoes })
      const grade = data && data.grade ? data.grade : data;
      if (grade && typeof grade === 'object' && !grade.erro && Object.keys(grade).length > 0) {
        // Backend novo (obterTudo) manda a grade completa: ela é a verdade (aulas criadas, apagadas
        // ou trocadas pelo painel administrativo aparecem/somem). Backend antigo: só mescla status.
        const gradeMesclada = data.grade
          ? this.gradeDoServidor(grade)
          : this.mesclarAulasComGoogleSheet(this.getLocalDatabase(), grade);
        if (Array.isArray(data.professores)) this.salvarProfessores(data.professores);
        this.saveLocalDatabase(gradeMesclada);

        if (data.grade && Array.isArray(data.trocas)) {
          const trocas = this._mesclarListas(data.trocas, this.getTrocas());
          localStorage.setItem(STORAGE_KEY_TROCAS, JSON.stringify(trocas));
        }
        if (data.grade && Array.isArray(data.reposicoes)) {
          const reps = this._mesclarListas(data.reposicoes, this.getReposicoes());
          localStorage.setItem(STORAGE_KEY_REPOSICOES, JSON.stringify(reps));
        }
        return { online: true, data: gradeMesclada };
      }
      return { online: false, data: this.getLocalDatabase(), motivo: (grade && grade.erro) ? "erro no servidor" : "resposta vazia" };
    } catch (err) {
      clearTimeout(timeoutId);
      let motivo = "falha de rede";
      if (err.name === "AbortError") motivo = "servidor demorou";
      else if (typeof navigator !== "undefined" && navigator.onLine === false) motivo = "sem internet";
      else if (String(err.message).startsWith("HTTP")) motivo = "erro " + err.message;
      console.warn("Sem resposta do Google Sheets (" + motivo + "). URL:", url, err);
      return { online: false, data: this.getLocalDatabase(), motivo };
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
      this._escritasPendentes++;
      this._ultimaEscrita = Date.now();
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payloadEnvio),
        redirect: "follow"
      }).finally(() => {
        this._escritasPendentes = Math.max(0, this._escritasPendentes - 1);
        this._ultimaEscrita = Date.now();
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
