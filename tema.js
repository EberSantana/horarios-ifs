/* Temas de cor do Painel Docente. Carregado no <head> para aplicar antes de desenhar a tela. */
(function () {
  var TEMAS = [
    { id: "ifs", nome: "Verde IFS", sub: "Padrão", meta: "#17402a", cores: ["#17402a", "#2e7d32", "#e3efe5", "#f1f5f0"] },
    { id: "terracota", nome: "Terracota", sub: "Calorosa", meta: "#9a3412", cores: ["#C2410C", "#FB923C", "#FBE9DC", "#FAF7F2"] },
    { id: "verde", nome: "Verde Comunidade", sub: "Fresca", meta: "#115e59", cores: ["#0F766E", "#FBBF24", "#DCEFEC", "#F3F7F6"] },
    { id: "azul", nome: "Azul Institucional", sub: "Séria", meta: "#1e3a8a", cores: ["#1D4ED8", "#FBBF24", "#E2EAFD", "#F5F7FB"] },
    { id: "ifsid", nome: "Identidade IF", sub: "Verde e vermelho", meta: "#1f6f32", cores: ["#2F9E41", "#CD191E", "#E4F2E7", "#F3F8F3"] },
    { id: "sertao", nome: "Sertão", sub: "Sol, terra e céu", meta: "#5c3a21", cores: ["#B45309", "#38BDF8", "#F5E6CC", "#FBF5E9"] },
    { id: "litoral", nome: "Litoral", sub: "Mar, areia e sol", meta: "#155e75", cores: ["#0891B2", "#FF7A59", "#D8F0F5", "#F3FAFB"] },
    { id: "bordo", nome: "Bordô Acadêmico", sub: "Sóbria", meta: "#881337", cores: ["#9F1239", "#FBBF24", "#FCE7EC", "#FBF6F7"] },
    { id: "grafite", nome: "Grafite", sub: "Neutra", meta: "#1e293b", cores: ["#334155", "#F97316", "#E5E9F0", "#F4F6F9"] },
    { id: "escuro", nome: "Modo Escuro", sub: "Noturna", meta: "#0f1a14", cores: ["#4CAF73", "#FBBF24", "#17201B", "#0E1512"] }
  ];
  var CHAVE = "IFS_TEMA";
  function lido() { try { return localStorage.getItem(CHAVE) || "ifs"; } catch (e) { return "ifs"; } }
  function achar(id) { for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].id === id) return TEMAS[i]; return TEMAS[0]; }
  function aplicar(id, salvar) {
    var t = achar(id), h = document.documentElement;
    if (t.id === "ifs") h.removeAttribute("data-tema"); else h.setAttribute("data-tema", t.id);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t.meta);
    if (salvar) { try { localStorage.setItem(CHAVE, t.id); } catch (e) {} }
    return t.id;
  }
  window.TemasCor = { lista: TEMAS, atual: function () { return achar(lido()).id; }, aplicar: aplicar };
  aplicar(lido(), false);
})();
