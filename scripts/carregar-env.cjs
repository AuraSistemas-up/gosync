// Carrega .fb.env (CHAVE=valor por linha) para process.env, sem sobrescrever variáveis já definidas.
// O arquivo fica na raiz do projeto e NÃO vai para o Git (senhas e dados da loja).
const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", ".fb.env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
