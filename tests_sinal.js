const S=require('./sinal.js');
const A=(dia,hora,turma,disc)=>({dia,hora,turma,disc});
const aulas=[A("Sexta-feira","11:10 - 12:00","2º DS","BD e ES"),A("Sexta-feira","12:00 - 12:50","2º DS","BD e ES"),
A("Sexta-feira","13:30 - 14:20","2º DS","BD e ES"),A("Sexta-feira","14:20 - 15:10","1º DS","CS1 - B"),A("Sexta-feira","15:10 - 16:00","1º DS","CS1 - B"),
A("Quinta-feira","14:20 - 16:00","1º DS","CS1 - A")];
const s=S.eventosSemana(aulas);
let ok=true;const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ok=false;console.log("FALHA",m,JSON.stringify(a),JSON.stringify(b));}};
eq(s["Sexta-feira"].map(e=>S.hhmm(e.min)+e.tipo),["11:10inicio","12:50fim","13:30inicio","14:20troca","16:00fim"],"sex");
eq(s["Quinta-feira"].map(e=>S.hhmm(e.min)+e.tipo),["14:20inicio","16:00fim"],"qui");
const ics=S.gerarICS("Eber Santana",aulas,{desde:new Date(2026,9,24)});
console.log(ics.split("\r\n").slice(0,30).join("\n"));
if(!/UNTIL=20261220T025900Z/.test(ics)){ok=false;console.log("until");}
if(ics.split("\r\n").some(l=>Buffer.byteLength(l)>75)){ok=false;console.log("linha longa");}
eq((ics.match(/BEGIN:VEVENT/g)||[]).length,7,"n");
const z=S.montarZip([{nome:"a.ics",texto:ics},{nome:"b.ics",texto:"x"}]);require('fs').writeFileSync('/tmp/t.zip',z);
console.log(ok?"OK":"ERRO");
const n=S.eventosSemana([A("Segunda-feira","18:40 - 19:30","1º Info","Info"),A("Segunda-feira","19:30 - 20:20","1º Info","Info"),A("Segunda-feira","20:30 - 21:20","1º Info","Info")]);
eq(n["Segunda-feira"].map(e=>S.hhmm(e.min)+e.tipo),["18:40inicio","20:20intervalo","20:30volta","21:20fim"],"noturno");
console.log(ok?"OK2":"ERRO2");
