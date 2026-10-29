# 📖 Instruções de Configuração da Planilha e Google Apps Script

Este guia ensina como conectar o seu **Painel Docente no GitHub Pages** ao **Google Sheets** do IFS em menos de 2 minutos.

Criamos uma **função mágica automatizada** (`configurarPlanilhaInicial()`) no código que cria e preenche todas as abas, colunas, dados dos 21 professores e horários das turmas **(1º, 2º e 3º DS e 1º, 2º e 3º ADM)** com apenas 1 clique!

---

## 1. Criar a Planilha no Google Drive Institucional (@ifs.edu.br)

1. Acesse o [Google Sheets](https://sheets.google.com) conectado à sua conta institucional do IFS.
2. Crie uma nova planilha em branco.
3. Dê o nome de: `Sistema_Substituicoes_IFS`.
4. Não precisa se preocupar em digitar as colunas! A função automática fará isso por você no passo seguinte.

---

## 2. Inserir o Código no Apps Script (Backend)

1. Na planilha, clique no menu superior: **Extensões** > **Apps Script**.
2. Apague o código que estiver lá (o `function myFunction() { }`).
3. Copie todo o conteúdo do arquivo [`backend/Code.gs`](./Code.gs) e cole dentro do editor.
4. Clique no ícone da **Disquete 💾** no topo para salvar.

---

## 3. Executar a Configuração Automática (Criação de Todas as Abas)

1. No topo do editor do Apps Script, repare que há um menu suspenso de funções ao lado do botão **Executar** (Run).
2. Selecione a função: **`configurarPlanilhaInicial`**.
3. Clique em **Executar**.
4. O Google pedirá autorização na primeira vez:
   * Clique em **Revisar permissões**.
   * Escolha sua conta `@ifs.edu.br`.
   * Clique em **Avançadas** > **Acessar projeto (não seguro)** > **Permitir**.
5. Em 3 segundos, volte à aba da sua planilha no navegador: você verá que as 5 abas foram criadas e formatadas com as cores do IFS e os dados completos de todos os 21 professores e suas turmas!

---

## 4. Publicar como Web App

1. No topo direito do Apps Script, clique no botão azul **Implantar** (Deploy) > **Nova implantação** (New deployment).
2. Na engrenagem ⚙️ (Selecionar tipo), escolha **App da Web** (Web app).
3. Preencha as configurações:
   * **Descrição:** `Versao 2.0 Producao`
   * **Executar como:** `Eu (seu e-mail institucional)`
   * **Quem tem acesso:** `Qualquer pessoa` *(Anyone)* -> **Obrigatório para o site conseguir comunicar!**
4. Clique em **Implantar**.
5. **Copie o URL do App da Web gerado** (`https://script.google.com/macros/s/...`).

---

## 5. Conectar ao Painel no GitHub Pages

1. Abra o site no navegador ou celular.
2. Faça login com seu perfil (PIN padrão: `1234`).
3. Toque no ícone de **Engrenagem** (⚙️) no cabeçalho.
4. Cole o link no campo **URL do Web App do Google Apps Script**.
5. Preencha os e-mails dos coordenadores de DS e ADM.
6. Clique em **Salvar Configurações**.

---

## 🔑 E se o professor esquecer o PIN?

* **Pelo Site:** Na tela de login, o professor clica em **"Esqueci meu PIN"**. O sistema reatribui o PIN padrão de segurança (`1234`), preenche no campo e envia um e-mail com aviso para o endereço institucional dele.
* **Pela Planilha (Controle da Gestão):** O coordenador ou administrador pode abrir a aba **`Professores`** na planilha e visualizar ou alterar o PIN de qualquer professor diretamente na **Coluna D (PIN)**!
