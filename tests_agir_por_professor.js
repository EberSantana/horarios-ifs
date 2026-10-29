const { criar } = require('./gas.js');
const A = criar('/home/claude/horarios-ifs/backend/Code.gs');
let ok = 0, f = [];
const t = (n, c, x) => c ? ok++ : f.push(n + (x ? ' -> ' + JSON.stringify(x) : ''));
A.ctx.configurarPlanilhaInicial();
A.ctx.salvarAdmin_('geral@ifs.edu.br', 'senhageral1');
A.ctx.salvarAdmin_('coord@ifs.edu.br', 'senhacoord1');
const login = (e, s) => A.post({ acao: 'admin_login', email: e, senha: s }).token;
const TG = login('geral@ifs.edu.br', 'senhageral1'), TC = login('coord@ifs.edu.br', 'senhacoord1');
const adm = (tk, acao, d) => A.post(Object.assign({ acao, token: tk }, d || {}));
const g = A.get({ action: 'obterGrade' });
const cad = adm(TG, 'admin_cadastros_ler');
const cursoDe = (tu) => { const x = cad.turmas.find(z => z.nome === tu); return x && x.curso; };
const todas = []; Object.keys(g).forEach(p => { if (p !== 'A definir') g[p].forEach(a => todas.push(Object.assign({ prof: p }, a))); });
const ds = todas.filter(a => cursoDe(a.turma) === 'DS'), adm_ = todas.filter(a => cursoDe(a.turma) === 'ADM');
t('há aulas DS e ADM', ds.length && adm_.length);
let r = adm(TG, 'admin_admin_cursos', { email: 'coord@ifs.edu.br', cursos: ['DS'] }); t('restringe', r.sucesso, r);
let c = adm(TC, 'admin_agir_contexto'); t('contexto restrito', c.restrito && c.turmas.length > 0 && c.turmas.every(x => cursoDe(x) === 'DS'), c);
const aD = ds[0], aA = adm_[0];
const lim = a => ({ id: a.id, dia: a.dia, hora: a.hora, turma: a.turma, disc: a.disc });
const hoje = new Date().toISOString().slice(0, 10);
// falta
r = adm(TC, 'admin_agir_prof', { acaoProf: 'libertar_multiplos', professor: aD.prof, dados: { aulas: [lim(aD)], dataFalta: hoje, motivo: 'consulta' } });
t('falta no seu curso', r.sucesso && r.contagem === 1, r);
const g2 = A.get({ action: 'obterGrade' }); t('aula ficou em alerta', (g2[aD.prof].find(a => a.id === aD.id) || {}).status === 'alert');
t('e-mail enviado', A.sent.some(m => /dispon|falta|ausent/i.test(m.subject || '')), A.sent.map(m => m.subject));
r = adm(TC, 'admin_agir_prof', { acaoProf: 'libertar_multiplos', professor: aA.prof, dados: { aulas: [lim(aA)], dataFalta: hoje, motivo: 'x' } });
t('falta de outro curso bloqueada', !r.sucesso && /outro curso/.test(r.erro), r);
t('aula do outro curso intacta', (A.get({ action: 'obterGrade' })[aA.prof].find(a => a.id === aA.id) || {}).status !== 'alert');
// reposição
r = adm(TC, 'admin_agir_prof', { acaoProf: 'agendar_reposicao', professor: aD.prof, dados: { reposicao: { id: 'REP-1', disciplina: aD.disc, turma: aD.turma, data: hoje, horario: '14h00 - 15h00', sala: 'Sala 1', motivo: 'm' } } });
t('reposição no seu curso', r.sucesso, r);
r = adm(TC, 'admin_agir_prof', { acaoProf: 'agendar_reposicao', professor: aA.prof, dados: { reposicao: { id: 'REP-2', disciplina: aA.disc, turma: aA.turma, data: hoje, horario: '14h00 - 15h00', sala: 'S' } } });
t('reposição de outro curso bloqueada', !r.sucesso, r);
// permuta: dois profs com turma DS em comum
const porProf = {}; ds.forEach(a => { (porProf[a.prof] = porProf[a.prof] || []).push(a); });
const pares = Object.keys(porProf); let p1, p2, x1, x2;
outer: for (const a of pares) for (const b of pares) if (a !== b) { const ta = porProf[a].find(z => z.status !== 'alert'), tb = porProf[b].find(z => z.status !== 'alert' && z.turma === (ta && ta.turma)); if (ta && tb) { p1 = a; p2 = b; x1 = ta; x2 = tb; break outer; } }
if (p1) {
  r = adm(TC, 'admin_agir_prof', { acaoProf: 'propor_troca', professor: p1, dados: { troca: { id: 'TR-1', colega: p2, aulasCedidas: [lim(x1)], aulasDesejadas: [lim(x2)], aulaCedida: lim(x1), aulaDesejada: lim(x2), dataPrevista: 'A combinar', motivo: 'm' } } });
  t('permuta no seu curso', r.sucesso, r);
  r = adm(TC, 'admin_agir_prof', { acaoProf: 'propor_troca', professor: p1, dados: { troca: { id: 'TR-2', colega: p2, aulasCedidas: [lim(aA)], aulasDesejadas: [lim(x2)], aulaCedida: lim(aA), aulaDesejada: lim(x2) } } });
  t('permuta com aula de outro curso bloqueada', !r.sucesso, r);
} else t('achou par para permuta', false);
// ação não permitida e sem sessão
r = adm(TC, 'admin_agir_prof', { acaoProf: 'cancelar_reposicao', professor: aD.prof, dados: { id: 'REP-1' } }); t('ação fora da lista recusada', !r.sucesso, r);
r = A.post({ acao: 'admin_agir_prof', acaoProf: 'libertar_multiplos', professor: aA.prof, dados: {} }); t('sem sessão recusado', !r.sucesso && r.sessaoExpirada, r);
r = A.post({ acao: 'libertar_multiplos', profOriginal: aA.prof, aulas: [lim(aA)], dataFalta: hoje, motivo: 'x' }); t('app público sem token continua recusado', !r.sucesso, r);
// geral age em qualquer curso
r = adm(TG, 'admin_agir_prof', { acaoProf: 'libertar_multiplos', professor: aA.prof, dados: { aulas: [lim(aA)], dataFalta: hoje, motivo: 'x' } }); t('geral age em qualquer curso', r.sucesso, r);
const h = A.ctx.lerBanco_ ? 1 : 1; 
console.log(ok + ' ok', f.length ? '\nFALHAS:\n' + f.join('\n') : 'SEM ACHADOS');
