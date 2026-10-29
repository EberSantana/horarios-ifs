# 🏫 Painel Docente - IFS Campus Tobias Barreto

Sistema Web Mobile-First e PWA (Progressive Web App) para **Gestão de Horários, Trocas (Permutas), Reposições de Aula e Substituições Docentes** do Instituto Federal de Sergipe (Campus Tobias Barreto), integrado à matriz curricular 2026.2.

Hospedado no **GitHub Pages** e conectado ao **Google Sheets / Apps Script** para persistência em tempo real e envio de e-mails institucionais automáticos.

---

## 🚀 Funcionalidades do Sistema

* 📱 **Mobile-First & PWA Instalável:** Funciona como app nativo no celular (Android e iOS), sem necessidade de instalação via Play Store/App Store.
* 🔐 **Autenticação Segura com PIN:** Acesso protegido por PIN individual de 4 dígitos para cada professor, com suporte à memorização no aparelho e troca de PIN.
* ⚠️ **Informar Ausência / Liberar Aula:** Professores podem sinalizar falta para uma **data específica** com justificativa, notificando a coordenação por e-mail.
* 🔄 **Troca de Horários (Permuta entre Docentes):**
  * O professor seleciona um colega e propõe uma permuta de horários.
  * O sistema faz a **validação cruzada de conflitos** (verifica se nenhum dos dois terá aula sobreposta).
  * O colega recebe o aviso no painel e pode **Aceitar** ou **Recusar** a troca.
* 📅 **Agendamento de Reposições de Aula:** Registro de reposições em sábados letivos ou contraturno, informando disciplina, turma, data, horário e sala, notificando a coordenação pedagógica.
* 🙋‍♂️ **Mural de Substituições Abertas:** Permite que qualquer professor com janela assuma uma aula livre com 1 clique.
* 🛡️ **Validador Inteligente de Conflitos:** Impede que um professor assuma uma aula se já possuir outra aula (regular, assumida ou permutada) no mesmo dia e horário.
* ⚡ **Tratamento Real de Concorrência:** Implementado com `LockService` no backend Google Apps Script, impedindo que dois professores assumam a mesma vaga simultaneamente.
* 📧 **Central de Notificações & E-mails:**
  * Aba exclusiva com o histórico e registro de todos os e-mails disparados pelo sistema.
  * Configuração direta no menu de configurações (⚙️) para definir os e-mails da coordenação e direção.
* 🏫 **Grade por Turma:** Filtro dinâmico para 1º DS, 2º DS e 3º DS 1º ADM, 2º ADM e 3º ADM e SUBSEQUENTE
* 🏦 **Banco de aulas:** Cada aula ministrada sem professor, ou cobrindo um colega ausente, vira crédito depois da confirmação da coordenação (e débito para quem se ausentou).
* 🔔 **Meu sinal escolar:** Gera um calendário (.ics) com os toques das aulas do professor, para receber avisos no celular.
* 📴 **Fila offline:** Em campus com internet instável, as ações ficam guardadas no aparelho e são enviadas quando a conexão volta.
* 🎨 **Cores do aplicativo:** 10 paletas à escolha em ⚙️ Configurações (Verde IFS padrão, Identidade IF, Terracota, Verde Comunidade, Azul Institucional, Sertão, Litoral, Bordô Acadêmico, Grafite e Modo Escuro). A escolha vale só para o aparelho e é guardada nele.

### 🧑‍💼 Painel da coordenação (`admin.html`)

* 👥 **Administradores por curso:** Cada coordenador só decide as solicitações do **seu curso** (a coordenação geral e a direção veem tudo). O curso é reconhecido pelo e-mail da coordenação ou definido em *Administradores*.
* ✉️ **Convites:** A coordenação convida novos administradores por e-mail, com código de uso único (vale 48 h), e a pessoa cria a própria senha no primeiro acesso.
* 🙋 **Em nome do professor:** O coordenador pode informar falta, agendar reposição e propor troca pelos professores do seu curso. Tudo fica registrado no histórico como ação do administrador.

---

## 📂 Estrutura do Projeto

```text
├── index.html                    # Interface principal da aplicação (SPA)
├── styles.css                    # Estilos modernos, responsivos e paletas de cores
├── tema.js                       # Lista de paletas e escolha de cores (guardada no aparelho)
├── sinal.js                      # Calendário .ics com os toques das aulas
├── admin.html / admin.js / admin.css   # Painel da coordenação
├── app.js                        # Lógica da interface, permutas, reposições e abas
├── api.js                        # Comunicação com Google Sheets, logs de e-mails e offline
├── manifest.json                 # Manifesto do aplicativo PWA
├── sw.js                         # Service Worker para suporte offline
├── icons/                        # Ícones para iPhone e Android (192px e 512px)
├── backend/
│   ├── Code.gs                   # Código do Google Apps Script (Backend)
│   └── INSTRUCOES_PLANILHA.md    # Passo a passo de configuração da planilha
├── tools/gerar_escuro.py         # Gera as regras do Modo Escuro a partir do styles.css
├── tests_*.js, qa_suite.js       # Testes automáticos (Playwright)
└── README.md                     # Documentação geral
```

> **Dados pessoais:** os e-mails dos professores **não ficam no código**; vivem só na aba *Professores* da planilha. No código existem apenas os e-mails institucionais das coordenações e da direção. Os testes usam endereços de mentira (`prof.nome@ifs.edu.br`).

> **Versão do app:** o número fica em `sw.js` (`VERSAO`) e nos `?v=` do `index.html`; os dois precisam ser iguais ao publicar, para os celulares receberem a atualização.

### 🎨 Como criar uma nova paleta

1. Em `styles.css`, copie um bloco `html[data-tema="..."]` (seção *TEMAS DE COR*) e troque as cores.
2. Em `tema.js`, acrescente a paleta na lista (`id`, `nome`, `meta` e 4 cores de amostra).
3. Rode `python3 tools/gerar_escuro.py` (só é preciso se mudar cores fixas do `styles.css`) e `tests_temas_cor.js`.
4. Suba o número da versão em `sw.js` e `index.html`.

---

## 🌐 Como Publicar no GitHub Pages

1. Crie um repositório no seu GitHub chamado `painel-docente-ifs` (ou similar) como **Público**.
2. Faça upload de todos os arquivos deste projeto para a branch `main`.
3. Acesse **Settings** > **Pages** no repositório.
4. Em **Build and deployment**, selecione o Branch `main` e a pasta `/ (root)`.
5. Clique em **Save**. Em 1 a 2 minutos o site estará no ar em:  
   `https://<seu-usuario>.github.io/<nome-repositorio>/`

---

## 📲 Como Instalar no Celular

* **No Android (Chrome):** Abra o link, toque no menu de 3 pontinhos e selecione **"Adicionar à tela inicial"** ou **"Instalar aplicativo"**.
* **No iPhone (Safari):** Abra o link, toque no botão de compartilhar (quadrado com seta para cima) e selecione **"Adicionar à Tela de Início"**.

---

## ♿ Acessibilidade e Legislação

**Base legal e normas de referência**

* Lei nº 10.098/2000 (normas gerais de acessibilidade);
* Lei Brasileira de Inclusão, Lei nº 13.146/2015, art. 63 (acessibilidade nos sítios da internet);
* [eMAG](https://emag.governoeletronico.gov.br/) (Modelo de Acessibilidade em Governo Eletrônico);
* [WCAG 2.1](https://www.w3.org/WAI/standards-guidelines/wcag/) nível AA, como meta.

**O que já existe no aplicativo**

* Idioma da página declarado (`pt-BR`) e layout responsivo para telas pequenas (320 px).
* Avisos dinâmicos (fila offline, aula em andamento) anunciados por leitores de tela (`aria-live`).
* Ícones decorativos escondidos dos leitores de tela e botões só com ícone com nome acessível.
* Escolha de paleta como grupo de opções (`radiogroup`) com nome e estado lidos por leitores de tela.
* Dez paletas de cores, incluindo **Modo Escuro**, para quem prefere menos brilho; as cores de status (falta, troca, reposição) são sempre acompanhadas de texto, não só de cor.
* Alvos de toque grandes nos menus e botões principais.

**Como foi verificado**

Rodei o [axe-core](https://github.com/dequelabs/axe-core) 4.10 (regras WCAG 2.1 A e AA) na tela de login, no painel (Minha Grade, Banco, Trocas, Relatórios) e nas Configurações, em três paletas. Foram encontrados pontos a corrigir, listados abaixo.

**Pontos conhecidos a melhorar**

* O zoom por gesto de pinça está bloqueado no `index.html` (`user-scalable=no`); o ideal é liberar.
* Alguns textos pequenos ou secundários têm contraste abaixo de 4,5:1 (principalmente em tabelas e listas do Banco e das Trocas).
* Áreas com rolagem (tabela de Relatórios, Configurações) ainda não podem ser roladas pelo teclado.
* Ainda **não foram usados** WAVE, AccessMonitor, ASES nem teste com leitor de tela (NVDA); o [VLibras](https://www.gov.br/governodigital/pt-br/vlibras) não está integrado.

**Ferramentas para verificar de novo**

[WAVE](https://wave.webaim.org/) · [AccessMonitor](https://accessmonitor.acessibilidade.gov.pt/) · [ASES](http://asesweb.governoeletronico.gov.br/) · [Contrast Checker](https://webaim.org/resources/contrastchecker/) · [NVDA](https://www.nvaccess.org/)

**Relatar um problema:** fale com o autor (contatos abaixo) ou abra uma *issue* no repositório.

---

## 👨‍🏫 Autor

**Prof. MSc. Eber da Silva de Santana**
Professor EBTT do Instituto Federal de Sergipe, Campus Tobias Barreto. Pesquisador em tecnologia educacional, gamificação e segurança da informação.

[Lattes](http://lattes.cnpq.br/8888622742399905) · [ORCID](https://orcid.org/0000-0002-1236-6312) · Instagram [@prof.ebersantana](https://www.instagram.com/prof.ebersantana/)

## 📄 Uso dos materiais

Os materiais são de uso educacional. Para reutilizar ou adaptar em outra instituição, entre em contato com o autor.
