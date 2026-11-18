# Catálogo da sapataria + GoSync

- **Site** (Astro, estático): vai para a hospedagem Locaweb. Lê `/data/catalog.json` e `/fotos/*`.
- **GoSync** (`tray/`, Electron): app da bandeja do Windows. A cada 15 min busca o ERP e envia por FTP
  produtos, grupos, estoque e fotos. Atualiza a si mesmo via GitHub Releases.

## Fonte dos dados do GoSync
Em *Configurações → Dados do ERP* escolha **Banco de dados Firebird** (padrão) ou **API REST**.
- **Firebird:** informe o arquivo `.FDB`, usuário, senha, servidor e porta (ex.: 3060 se o ERP usa a instância FB5) e clique em *Testar banco*.
  O GoSync só lê (SELECT) e usa o `fbclient.dll` já instalado com o Firebird. Publica produtos ativos, marcados para exportar e com estoque.
  As fotos (produtos e variações) são lidas do banco, redimensionadas (1200 px; as pequenas são ampliadas) e enviadas com miniatura de 520 px.
- A cada ciclo (15 min) só são lidas do banco as fotos novas; "Sincronizar agora" reenvia o catálogo; "Reenviar todas as fotos" refaz as fotos.

## Primeiro uso do GoSync
1. Instale o `GoSync-Setup-x.y.z.exe` da última [release](https://github.com/AuraSistemas-up/gosync/releases).
2. Aba **Configurações → Assistente Locaweb**: domínio → *Detectar* → usuário/senha do FTP → *Diagnosticar e configurar*.
3. Preencha a URL da API do ERP e o WhatsApp da loja → *Salvar*.
4. *Publicar / atualizar o site* (uma vez; o site já vem dentro do instalador).

## Painel admin (`/admin`)
Em `https://seusite.com.br/admin/`: logo, cor, nome da loja e banners do carrossel (até 6, 1600 × 500 px).
- Usuário inicial: `kuelhos`. **Troque a senha** na seção *Segurança* do painel no primeiro acesso.
- Roda em PHP 7+ na própria hospedagem (`public/admin/api.php`); grava em `data/config.json`, `banners/` e `logo/`.
- O painel tem prioridade sobre o nome/cor/banners configurados no GoSync.
- Se algo falhar no servidor, abra `/admin/api.php?a=ping` (mostra a versão do PHP e se as pastas são graváveis).
- No `npm run dev` não há PHP: o `dev/admin-mock.mjs` simula a API.

## Links com prévia, Google e segurança
- Em *Configurações* do GoSync, preencha **Endereço público do site** (ex.: `https://kuelhos.goupsistemas.com`). Com isso o GoSync cria uma página por produto
  (`/p/<id>/`) com foto e preço na prévia do WhatsApp, dados para o Google, `sitemap.xml` e `robots.txt`.
- O `.htaccess` força **HTTPS**. O painel `/admin` avisa enquanto a senha inicial não for trocada.
- No painel: **Destaques e produtos ocultos**, **seções da página inicial** (Destaques, Mais vendidos, Chegou agora) e **Mais pedidos pelo WhatsApp** (contagem de cliques).
- Dados de vendas e data de cadastro vêm do ERP (pedidos finalizados dos últimos 90 dias e `PRD_DT_CADASTRO`).
- `verificar-locaweb.bat` confere HTTPS, a prévia de um produto, o sitemap, o PHP e as proteções.

## Gerar uma nova versão
```powershell
cd tray
npm run release -- --notes "o que mudou"
```
Sobe a versão, gera o instalador, faz commit/tag/push e cria a release no GitHub.
Os GoSync instalados detectam a versão maior e se atualizam sozinhos (verificação a cada 4 h).

## Desenvolvimento
- Site: `npm install && npm run dev` (raiz).
- GoSync: `cd tray && npm install && npm start`.
