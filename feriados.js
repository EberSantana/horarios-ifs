/* Feriados nacionais do Brasil (calculados no aparelho, sem internet).
   Fixos + Sexta-feira Santa. Carnaval e Corpus Christi entram como "ponto facultativo".
   Locais (Sergipe e Tobias Barreto) ficam marcados com local:true e têm chave própria para ligar/desligar.
   ATENÇÃO: datas locais vieram de fontes públicas (site da Prefeitura e calendários) — conferir com a coordenação. */
(function () {
  var CHAVE = "IFS_FERIADOS", CHAVE_LOCAL = "IFS_FERIADOS_LOCAL";
  var DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  var cache = {};
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function chave(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function pascoa(ano) { // algoritmo de Meeus/Jones/Butcher
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia, 12);
  }
  function somar(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function mapa(ano) {
    if (cache[ano]) return cache[ano];
    var m = {}, f = function (mes, dia, nome) { m[ano + "-" + p2(mes) + "-" + p2(dia)] = { nome: nome, tipo: "feriado" }; };
    f(1, 1, "Confraternização Universal"); f(4, 21, "Tiradentes"); f(5, 1, "Dia do Trabalhador");
    f(9, 7, "Independência do Brasil"); f(10, 12, "Nossa Senhora Aparecida"); f(11, 2, "Finados");
    f(11, 15, "Proclamação da República"); f(11, 20, "Consciência Negra"); f(12, 25, "Natal");
    var loc = function (mes, dia, nome, nivel) { var k = ano + "-" + p2(mes) + "-" + p2(dia); if (!m[k]) m[k] = { nome: nome, tipo: "feriado", local: nivel }; };
    loc(7, 8, "Emancipação Política de Sergipe", "estadual");
    loc(6, 7, "Nascimento de Tobias Barreto (Patrono do Município)", "municipal");
    loc(6, 24, "São João", "municipal");
    loc(8, 15, "Nossa Senhora Imperatriz dos Campos (Padroeira)", "municipal");
    loc(10, 23, "Emancipação Política de Tobias Barreto", "municipal");
    var p = pascoa(ano);
    m[chave(somar(p, -2))] = { nome: "Sexta-feira Santa", tipo: "feriado" };
    m[chave(somar(p, -48))] = { nome: "Carnaval", tipo: "facultativo" };
    m[chave(somar(p, -47))] = { nome: "Carnaval", tipo: "facultativo" };
    m[chave(somar(p, 60))] = { nome: "Corpus Christi", tipo: "facultativo" };
    return (cache[ano] = m);
  }
  function da(d) { var x = mapa(d.getFullYear())[chave(d)]; if (x && x.local && !ativoLocal()) x = null; return x ? { nome: x.nome, tipo: x.tipo, local: x.local || "", data: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) } : null; }
  function ativo() { try { return localStorage.getItem(CHAVE) === "1"; } catch (e) { return false; } }
  function ativoLocal() { try { return localStorage.getItem(CHAVE_LOCAL) === "1"; } catch (e) { return false; } }
  function definirLocal(v) { try { localStorage.setItem(CHAVE_LOCAL, v ? "1" : "0"); } catch (e) {} }
  function definir(v) { try { localStorage.setItem(CHAVE, v ? "1" : "0"); } catch (e) {} }
  function curto(d) { return p2(d.getDate()) + "/" + p2(d.getMonth() + 1); }
  // próximos feriados a partir de hoje (inclui hoje), dentro de "dias" dias
  function proximos(dias, base) {
    var h = base ? new Date(base.getTime()) : new Date(), out = [];
    for (var i = 0; i <= dias; i++) { var d = somar(h, i), x = da(d); if (x) out.push(x); }
    return out;
  }
  // data da próxima ocorrência do dia da semana (0=domingo), contando a partir de hoje
  function dataDoDiaDaSemana(idx, base) {
    var h = base ? new Date(base.getTime()) : new Date();
    return somar(h, (idx - h.getDay() + 7) % 7);
  }
  window.Feriados = { da: da, ativo: ativo, definir: definir, ativoLocal: ativoLocal, definirLocal: definirLocal, proximos: proximos, curto: curto, dataDoDiaDaSemana: dataDoDiaDaSemana, nomeDia: function (d) { return DIAS[d.getDay()]; } };
})();
