const { criar } = require('./gas.js');
const A = criar('/home/claude/horarios-ifs/backend/Code.gs');
let ok = 0, f = [];
const t = (n, c, x) => c ? ok++ : f.push(n + (x ? ' -> ' + JSON.stringify(x) : ''));
A.ctx.configurarPlanilhaInicial();
A.ctx.salvarAdmin_('geral@ifs.edu.br', 'senhageral1');
A.ctx.salvarAdmin_('coord@ifs.edu.br', 'senhacoord1');
const login = (e, s) => A.post({ acao: 'admin_login', email: e, senha: s }).token;
let TG = login('geral@ifs.edu.br', 'senhageral1'), TC = login('coord@ifs.edu.br', 'senhacoord1');
t('logins', !!TG && !!TC);
const adm = (tk, acao, d) => A.post(Object.assign({ acao, token: tk }, d || {}));
let c = adm(TG, 'admin_config_ler');
t('config traz cursos', c.sucesso && c.cursos.length >= 2, c.cursos);
t('adminsCursos vazio=todos', c.adminsCursos['coord@ifs.edu.br'].length === 0);
const cursoA = c.cursos[0], cursoB = c.cursos[1];
// pedidos em turmas de cursos diferentes
const g = A.get({ action: 'obterGrade' });
const vagas = g['A definir'] || [];
const tur = (id) => vagas.find(v => v.id === id).turma;
const profs = A.get({ action: 'obterTudo' }).professores.map(p => p.nome).filter(n => n !== 'A definir');
const prox = (dia) => { const d = new Date(); d.setHours(12); while (d.getDay() !== dia) d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
// descobre duas vagas de cursos distintos
const cad = adm(TG, 'admin_cadastros_ler');
const cursoDe = (turma) => { const x = (cad.turmas || []).find(z => z.nome === turma); return x && x.curso; };
const porCurso = {}; vagas.forEach(v => { const k = cursoDe(v.turma); if (k && !porCurso[k]) porCurso[k] = v; });
const ks = Object.keys(porCurso);
t('há vagas em 2 cursos', ks.length >= 2, ks);
const diaIdx = (d) => ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'].indexOf(d);
const ped = [];
ks.slice(0, 2).forEach((k, i) => {
  const v = porCurso[k], p = profs.filter(n => !(g[n] || []).some(a => a.dia === v.dia && a.hora === v.hora))[i];
  const tk = A.post({ acao: 'login_professor', professor: p, pin: '1234' }).token;
  const r = A.post({ acao: 'banco_assumir', professor: p, token: tk, ids: [v.id], data: prox(diaIdx(v.dia)) });
  t('pedido ' + v.id, r.sucesso, r); ped.push({ curso: k, id: v.id });
});
// restringe coord ao curso do 1º pedido
let r;
r = adm(TG, 'admin_admin_cursos', { email: 'coord@ifs.edu.br', cursos: ['xx'] }); t('curso inválido recusado', !r.sucesso, r);
r = adm(TG, 'admin_admin_cursos', { email: 'coord@ifs.edu.br', cursos: [ped[0].curso] }); t('geral restringe coord', r.sucesso, r);
r = adm(TG, 'admin_admin_cursos', { email: 'geral@ifs.edu.br', cursos: [ped[0].curso] }); t('não pode restringir o único livre', !r.sucesso, r);
r = adm(TC, 'admin_admin_cursos', { email: 'coord@ifs.edu.br', cursos: [] }); t('restrito não altera escopo', !r.sucesso, r);
let l = adm(TC, 'admin_banco_listar');
const e0 = l.entradas.find(e => e.turma === tur(ped[0].id) || true);
const mapa = {}; l.entradas.forEach(e => { mapa[e.id] = e; });
const ent = l.entradas.filter(e => e.status === 'pendente');
t('2 pendentes', ent.length === 2, ent.length);
const dele = ent.find(e => e.podeDecidir), outro = ent.find(e => !e.podeDecidir);
t('um pode e outro não', !!dele && !!outro && l.restrito === true, ent.map(e => [e.turma, e.podeDecidir]));
r = adm(TC, 'admin_banco_decidir', { id: outro.id, decisao: 'confirmar' }); t('coord bloqueado em outro curso', !r.sucesso && /outro curso/.test(r.erro), r);
r = adm(TC, 'admin_banco_decidir', { id: dele.id, decisao: 'confirmar' }); t('coord decide o seu', r.sucesso, r);
r = adm(TG, 'admin_banco_decidir', { id: outro.id, decisao: 'confirmar' }); t('geral decide qualquer', r.sucesso, r);
r = adm(TC, 'admin_banco_lancar', { tipo: 'VAGA', professor: profs[0], data: prox(1), turma: outro.turma, disc: 'X', hora: '08:00', tempos: 1 });
t('lançar em outro curso bloqueado', !r.sucesso && /seu curso/.test(r.erro), r);
// convite
r = adm(TC, 'admin_convidar', { email: 'novo@ifs.edu.br' }); t('restrito convida só com seus cursos', !r.sucesso, r);
r = adm(TC, 'admin_convidar', { email: 'novo@ifs.edu.br', cursos: [cursoB.id === ped[0].curso ? cursoA.id : cursoB.id] }); t('restrito não convida p/ outro curso', !r.sucesso, r);
r = adm(TG, 'admin_convidar', { email: 'novo@ifs.edu.br', cursos: [ped[1].curso] }); t('convite com curso', r.sucesso, r);
let r2 = A.post({ acao: 'admin_primeiro_acesso', email: 'novo@ifs.edu.br', codigo: r.codigo, senha: 'senhanova12' });
t('primeiro acesso ok', r2.sucesso, r2);
c = adm(TG, 'admin_config_ler');
t('curso copiado do convite', (c.adminsCursos['novo@ifs.edu.br'] || [])[0] === ped[1].curso, c.adminsCursos);
// redefinir senha preserva escopo
A.ctx.salvarAdmin_('novo@ifs.edu.br', 'outrasenha12');
c = adm(TG, 'admin_config_ler'); t('reset de senha preserva escopo', (c.adminsCursos['novo@ifs.edu.br'] || []).length === 1);
// voltar a todos
r = adm(TG, 'admin_admin_cursos', { email: 'coord@ifs.edu.br', cursos: [] }); t('volta a todos', r.sucesso);
// automático: e-mail da coordenação do curso
const cadA = A.ctx.lerCadastros_(); const cur0 = cadA.cursos.find(x => x.email);
A.ctx.salvarAdmin_(cur0.email, 'senhacoord9');
c = adm(TG, 'admin_config_ler');
t('e-mail da coordenação vira escopo automático', (c.adminsCursos[cur0.email] || []).indexOf(cur0.id) >= 0, c.adminsCursos);
console.log(ok + ' ok', f.length ? '\nFALHAS:\n' + f.join('\n') : 'SEM ACHADOS');
