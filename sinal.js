/* Sinal escolar discreto — gera o calendário (.ics) com os toques das aulas de UM professor.
 * Usado pelo app dos professores e pelo painel da coordenação. Sem dependências e sem acesso à rede:
 * tudo é calculado no aparelho a partir da grade que já está carregada.
 *
 * Aula = { dia: "Sexta-feira", hora: "14:20 - 15:10", turma: "1º DS", disc: "CS1 - B" }
 */
(function (raiz) {
  "use strict";

  var FIM_PADRAO = "2026-12-19"; // último dia do semestre (AAAA-MM-DD): altere aqui quando mudar o calendário
  var DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];
  var DIA_ICS = { "Segunda-feira": "MO", "Terça-feira": "TU", "Quarta-feira": "WE", "Quinta-feira": "TH", "Sexta-feira": "FR" };
  var DIA_NUM = { "Segunda-feira": 1, "Terça-feira": 2, "Quarta-feira": 3, "Quinta-feira": 4, "Sexta-feira": 5 };
  var PAUSA_MAX = 30; // intervalo entre aulas (min): menos que isso é "intervalo"; a partir disso é saída

  var CHAVE_PERIODO = "IFS_SINAL_PERIODO";
  // Período definido pela coordenação (painel → Sinais dos professores). Sem definição, usa FIM_PADRAO.
  function periodo() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(CHAVE_PERIODO) || "{}") || {}; } catch (e) {}
    var fim = /^\d{4}-\d{2}-\d{2}$/.test(p.fim || "") ? p.fim : FIM_PADRAO;
    var ini = /^\d{4}-\d{2}-\d{2}$/.test(p.inicio || "") ? p.inicio : "";
    var h = new Date(), hoje = h.getFullYear() + "-" + ("0" + (h.getMonth() + 1)).slice(-2) + "-" + ("0" + h.getDate()).slice(-2);
    return { inicio: ini, fim: fim, nome: p.nome || "", definido: !!p.fim, vencido: fim < hoje };
  }
  function definirPeriodo(p) {
    try { if (p && p.fim) localStorage.setItem(CHAVE_PERIODO, JSON.stringify({ inicio: p.inicio || "", fim: p.fim, nome: p.nome || "" })); } catch (e) {}
  }
  function br(iso) { return String(iso || "").split("-").reverse().join("/"); }

  function faixa(h) {
    var m = String(h || "").match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    return m ? [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])] : null;
  }
  function hhmm(min) { return ("0" + Math.floor(min / 60)).slice(-2) + ":" + ("0" + (min % 60)).slice(-2); }
  function abreviaTurma(t) {
    return String(t || "").replace(" (Subsequente)", "").replace("Graduação ADM", "Grad. ADM");
  }

  // Aulas do professor, por dia: tempos seguidos da mesma turma e disciplina viram uma aula só.
  function aulasPorDia(aulas) {
    var out = {};
    DIAS.forEach(function (dia) {
      var lista = (aulas || []).filter(function (a) { return a.dia === dia && faixa(a.hora); })
        .map(function (a) { return { f: faixa(a.hora), turma: abreviaTurma(a.turma), disc: a.disc || "" }; })
        .sort(function (x, y) { return x.f[0] - y.f[0]; });
      var fund = [];
      lista.forEach(function (x) {
        var u = fund[fund.length - 1];
        if (u && u.turma === x.turma && u.disc === x.disc && x.f[0] <= u.fim && x.f[1] > u.fim) u.fim = x.f[1];
        else if (u && u.turma === x.turma && u.disc === x.disc && x.f[0] <= u.fim) { /* tempo repetido */ }
        else fund.push({ ini: x.f[0], fim: x.f[1], turma: x.turma, disc: x.disc });
      });
      if (fund.length) out[dia] = fund;
    });
    return out;
  }

  // Toques de cada dia: [{ min, tipo: "inicio"|"troca"|"volta"|"intervalo"|"fim", turma, disc }]
  function eventosDoDia(blocos) {
    var ev = [];
    blocos.forEach(function (b, i) {
      var ant = blocos[i - 1], prox = blocos[i + 1];
      var lacuna = ant ? b.ini - ant.fim : null;
      var tipo = !ant ? "inicio" : lacuna <= 0 ? "troca" : lacuna < PAUSA_MAX ? "volta" : "inicio";
      ev.push({ min: b.ini, tipo: tipo, turma: b.turma, disc: b.disc });
      var gapProx = prox ? prox.ini - b.fim : null;
      if (!prox || gapProx >= PAUSA_MAX) ev.push({ min: b.fim, tipo: "fim", turma: b.turma, disc: b.disc });
      else if (gapProx > 0) ev.push({ min: b.fim, tipo: "intervalo", turma: b.turma, disc: b.disc, minutos: gapProx });
    });
    return ev.sort(function (a, b) { return a.min - b.min; });
  }

  function eventosSemana(aulas) {
    var por = aulasPorDia(aulas), out = {};
    Object.keys(por).forEach(function (d) { out[d] = eventosDoDia(por[d]); });
    return out;
  }
  function totalEventos(aulas) {
    var s = eventosSemana(aulas);
    return Object.keys(s).reduce(function (n, d) { return n + s[d].length; }, 0);
  }

  var ROTULO = { inicio: "Início da aula", troca: "Troca de aula", volta: "Volta do intervalo", intervalo: "Intervalo", fim: "Fim da aula · saída" };
  function titulo(e, comNome) {
    var base = ROTULO[e.tipo];
    if (e.tipo === "intervalo") return base + " · " + e.minutos + " min";
    if (e.tipo === "fim") return base + (comNome ? " · " + e.turma + " · " + e.disc : "");
    return base + (comNome ? " · " + e.turma + " · " + e.disc : "");
  }

  // ---------- .ics ----------
  function esc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function dobra(linha) {
    // linhas do iCalendar têm no máximo 75 bytes; continuação começa com um espaço
    var partes = [], atual = "", bytes = 0, limite = 75;
    Array.from(linha).forEach(function (ch) {
      var n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > limite) { partes.push(atual); atual = " " + ch; bytes = 1 + n; limite = 75; }
      else { atual += ch; bytes += n; }
    });
    partes.push(atual);
    return partes.join("\r\n");
  }
  function pad(n, t) { return ("0000" + n).slice(-(t || 2)); }
  function dataStr(d) { return pad(d.getFullYear(), 4) + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function hash32(s, semente) {
    var h = semente >>> 0;
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function uid(chave) {
    var a = hash32(chave, 2166136261), b = hash32(chave, 33), c = hash32(chave, 777), d = hash32(chave, 99991);
    return a + "-" + b.slice(0, 4) + "-" + b.slice(4) + "-" + c.slice(0, 4) + "-" + c.slice(4) + d + "@sinalescolar";
  }
  // primeira data (a partir de "desde") que cai no dia da semana pedido
  function primeiraData(desde, diaNum) {
    var d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    while (d.getDay() !== diaNum) d.setDate(d.getDate() + 1);
    return d;
  }

  function gerarICS(professor, aulas, opcoes) {
    opcoes = opcoes || {};
    var comNome = opcoes.comNome !== false;
    var per = periodo();
    var desde = opcoes.desde || new Date();
    if (!opcoes.desde && per.inicio) { var i = per.inicio.split("-"), di = new Date(+i[0], +i[1] - 1, +i[2]); if (di > desde) desde = di; }
    var fim = String(opcoes.fim || per.fim).split("-");
    var depois = new Date(+fim[0], +fim[1] - 1, +fim[2] + 1); // até o fim do último dia (23:59 em Bahia = 02:59Z do dia seguinte)
    var ate = dataStr(depois) + "T025900Z";
    var agora = new Date();
    var carimbo = agora.getUTCFullYear() + pad(agora.getUTCMonth() + 1) + pad(agora.getUTCDate()) + "T" + pad(agora.getUTCHours()) + pad(agora.getUTCMinutes()) + pad(agora.getUTCSeconds()) + "Z";
    var sem = eventosSemana(aulas);
    var L = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sinal Escolar Discreto//" + esc(professor) + "//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALDESC:Toques apenas das aulas do professor. Só o professor recebe — os alunos não ouvem nada.",
      "X-WR-CALNAME:Sinal Escolar — " + esc(professor), "X-APPLE-CALENDAR-COLOR:#0E7490", "X-WR-TIMEZONE:America/Bahia",
      "BEGIN:VTIMEZONE", "TZID:America/Bahia", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZNAME:-03", "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "END:STANDARD", "END:VTIMEZONE"
    ];
    DIAS.forEach(function (dia) {
      (sem[dia] || []).forEach(function (e) {
        var d0 = primeiraData(desde, DIA_NUM[dia]);
        var ini = dataStr(d0) + "T" + pad(Math.floor(e.min / 60)) + pad(e.min % 60) + "00";
        var f = e.min + 5, fimEv = dataStr(d0) + "T" + pad(Math.floor(f / 60)) + pad(f % 60) + "00";
        var t = titulo(e, comNome);
        L.push("BEGIN:VEVENT", "SUMMARY:" + esc(t),
          "DTSTART;TZID=America/Bahia:" + ini, "DTEND;TZID=America/Bahia:" + fimEv, "DTSTAMP:" + carimbo,
          "UID:" + uid(professor + "|" + dia + "|" + hhmm(e.min) + "|" + e.tipo),
          "RRULE:FREQ=WEEKLY;UNTIL=" + ate + ";BYDAY=" + DIA_ICS[dia],
          "CATEGORIES:Sinal Escolar",
          "DESCRIPTION:" + esc(t + "\n\nSinal Escolar — aviso discreto no celular do professor.\nPara não interromper a aula, deixe o celular no modo vibrar.\n\nProfessor: " + professor),
          "STATUS:CONFIRMED", "TRANSP:TRANSPARENT",
          "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(t), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
      });
    });
    L.push("END:VCALENDAR");
    return L.map(dobra).join("\r\n") + "\r\n";
  }

  function nomeArquivo(professor) {
    var base = String(professor || "professor").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return "sinal_" + (base || "professor") + ".ics";
  }

  // ---------- .zip (sem compressão) para baixar o sinal de todos os professores de uma vez ----------
  var TABELA_CRC = null;
  function crc32(bytes) {
    if (!TABELA_CRC) {
      TABELA_CRC = [];
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABELA_CRC[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function montarZip(arquivos) { // [{ nome, texto }] -> Uint8Array
    var partes = [], central = [], deslocamento = 0;
    var agora = new Date();
    var hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    var data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
    arquivos.forEach(function (a) {
      var nome = utf8(a.nome), dados = utf8(a.texto), crc = crc32(dados);
      var cab = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(hora), u16(data), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
      partes.push(Uint8Array.from(cab), nome, dados);
      central.push({ crc: crc, tam: dados.length, nome: nome, desl: deslocamento });
      deslocamento += cab.length + nome.length + dados.length;
    });
    var iniCentral = deslocamento, tamCentral = 0;
    central.forEach(function (c) {
      var e = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(hora), u16(data), u32(c.crc), u32(c.tam), u32(c.tam), u16(c.nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.desl));
      partes.push(Uint8Array.from(e), c.nome);
      tamCentral += e.length + c.nome.length;
    });
    partes.push(Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(tamCentral), u32(iniCentral), u16(0))));
    var total = partes.reduce(function (n, p) { return n + p.length; }, 0), out = new Uint8Array(total), pos = 0;
    partes.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  var API = {
    FIM_PADRAO: FIM_PADRAO, periodo: periodo, definirPeriodo: definirPeriodo, br: br, DIAS: DIAS, faixa: faixa, hhmm: hhmm, aulasPorDia: aulasPorDia, eventosSemana: eventosSemana,
    totalEventos: totalEventos, titulo: titulo, gerarICS: gerarICS, nomeArquivo: nomeArquivo, montarZip: montarZip, crc32: crc32
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.SinalEscolar = API;
})(typeof window !== "undefined" ? window : this);
