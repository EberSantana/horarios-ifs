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
* 🏫 **Grade por Turma:** Filtro dinâmico para 1º DS, 2º DS, 1º ADM, 2º ADM e 3º ADM.

---

## 📂 Estrutura do Projeto

```text
├── index.html                    # Interface principal da aplicação (SPA)
├── styles.css                    # Estilos modernos, responsivos e tema IFS
├── app.js                        # Lógica da interface, permutas, reposições e abas
├── api.js                        # Comunicação com Google Sheets, logs de e-mails e offline
├── manifest.json                 # Manifesto do aplicativo PWA
├── sw.js                         # Service Worker para suporte offline
├── icons/                        # Ícones para iPhone e Android (192px e 512px)
├── backend/
│   ├── Code.gs                   # Código do Google Apps Script (Backend)
│   └── INSTRUCOES_PLANILHA.md    # Passo a passo de configuração da planilha
└── README.md                     # Documentação geral
```

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
