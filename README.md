# Catálogo da sapataria + GoSync

- **Site** (Astro, estático): vai para a hospedagem Locaweb. Lê `/data/catalog.json` e `/fotos/*`.
- **GoSync** (`tray/`, Electron): app da bandeja do Windows. A cada 15 min busca o ERP e envia por FTP
  produtos, grupos, estoque e fotos. Atualiza a si mesmo via GitHub Releases.

## Primeiro uso do GoSync
1. Instale o `GoSync-Setup-x.y.z.exe` da última [release](https://github.com/AuraSistemas-up/gosync/releases).
2. Aba **Configurações → Assistente Locaweb**: domínio → *Detectar* → usuário/senha do FTP → *Diagnosticar e configurar*.
3. Preencha a URL da API do ERP e o WhatsApp da loja → *Salvar*.
4. *Publicar / atualizar o site* (uma vez; o site já vem dentro do instalador).

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
