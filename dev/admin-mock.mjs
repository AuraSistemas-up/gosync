// Simula /admin/api.php no servidor de desenvolvimento (npm run dev), onde não há PHP.
// Mesmo contrato da API real (public/admin/api.php). Grava em public/data/config.json, public/banners e public/logo.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const DEFAULT_USER = "admin";
const DEFAULT_HASH = "$2b$10$lf0cds1rHd5ZJp5/yL3axer1OvsLoqmJwBe1P4qd5em7yLmDMJiE2"; // mesmo hash do api.php
const MAX_BANNERS = 6;

export function adminMock() {
  const sessions = new Map(); // sid → csrf
  const pub = path.resolve("public");
  const CONFIG = path.join(pub, "data", "config.json");
  const load = () => {
    const base = { name: "", primaryColor: "", logo: "", banners: [], whatsapp: "", message: "", hero: { enabled: true, title: "", subtitle: "" }, photoStyle: "spotlight", featured: [], hidden: [], sections: { featured: true, bestsellers: true, news: true }, footer: { about: "", address: "", hours: "", phone: "", instagram: "" } };
    try {
      const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
      return { ...base, ...c, banners: Array.isArray(c.banners) ? c.banners : [], hero: { ...base.hero, ...(c.hero || {}) }, footer: { ...base.footer, ...(c.footer || {}) }, sections: { ...base.sections, ...(c.sections || {}) } };
    } catch { return base; }
  };
  const STATS = path.resolve("dev", ".stats.json");
  const readStats = () => { try { const s = JSON.parse(fs.readFileSync(STATS, "utf8")); return { produtos: s.produtos || {}, dias: s.dias || {} }; } catch { return { produtos: {}, dias: {} }; } };
  const writeStats = (s) => fs.writeFileSync(STATS, JSON.stringify(s));
  const readBody = (req) => new Promise((res) => { const ch = []; req.on("data", (c) => ch.push(c)); req.on("end", () => res(Buffer.concat(ch))); });

  return {
    name: "admin-mock",
    apply: "serve",
    configureServer(server) {
      // Na hospedagem o Apache serve /admin/ → index.html; no dev fazemos o mesmo.
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/admin" || req.url === "/admin/") req.url = "/admin/index.html";
        // Páginas de produto /p/<id>/ → o aplicativo de produto (na hospedagem o .htaccess faz o mesmo).
        if (/^\/p\/[A-Za-z0-9-]+\/?(\?|$)/.test(req.url)) req.url = req.url.replace(/^\/p\/[A-Za-z0-9-]+\/?/, "/produto/");
        next();
      });
      server.middlewares.use("/admin/api.php", async (req, res) => {
        const url = new URL(req.url, "http://x");
        const a = url.searchParams.get("a");
        const send = (obj, code = 200) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); };
        const cookie = /adm_sid=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1];
        const csrf = cookie ? sessions.get(cookie) : undefined;
        const authed = !!csrf;
        const needAuth = () => (authed ? false : (send({ ok: false, error: "Faça login para continuar." }, 401), true));
        const needCsrf = () => (req.method === "POST" && req.headers["x-csrf-token"] === csrf ? false : (send({ ok: false, error: "Sessão expirada. Recarregue a página." }, 403), true));
        const body = await readBody(req);
        const json = () => { try { return JSON.parse(body.toString("utf8")) || {}; } catch { return {}; } };

        switch (a) {
          case "ping": return send({ ok: true, php: "mock (Node)", gd: true, writable: { data: true, banners: true, logo: true } });
          case "me": return send({ ok: true, auth: authed, csrf: authed ? csrf : null, defaultPassword: true });
          case "track": {
            const id = url.searchParams.get("id") || "";
            if (!/^[a-z0-9-]{1,120}$/.test(id)) return send({ ok: false }, 400);
            const st = readStats(); st.produtos[id] = { n: (st.produtos[id]?.n || 0) + 1, ultimo: new Date().toISOString() };
            const dia = new Date().toISOString().slice(0, 10); st.dias[dia] = (st.dias[dia] || 0) + 1; writeStats(st);
            return send({ ok: true });
          }
          case "stats": {
            if (needAuth()) return;
            const st = readStats();
            const top = Object.entries(st.produtos).sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([id, v]) => ({ id, n: v.n, ultimo: v.ultimo }));
            return send({ ok: true, top, total: Object.values(st.produtos).reduce((t, v) => t + v.n, 0), dias: st.dias });
          }
          case "login": {
            const d = json();
            if (!(String(d.user || "").trim().toLowerCase() === DEFAULT_USER && bcrypt.compareSync(String(d.pass || ""), DEFAULT_HASH))) return send({ ok: false, error: "Usuário ou senha incorretos." }, 401);
            const sid = crypto.randomBytes(16).toString("hex"), t = crypto.randomBytes(16).toString("hex");
            sessions.set(sid, t);
            res.setHeader("Set-Cookie", `adm_sid=${sid}; Path=/admin; HttpOnly; SameSite=Strict`);
            return send({ ok: true, csrf: t });
          }
          case "logout": if (cookie) sessions.delete(cookie); return send({ ok: true });
          case "get": if (needAuth()) return; return send({ ok: true, config: load(), maxBanners: MAX_BANNERS, defaultPassword: true });
          case "save": {
            if (needAuth() || needCsrf()) return;
            const d = json();
            if (d.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(d.primaryColor)) return send({ ok: false, error: "Cor inválida." }, 400);
            if (d.logo && !/^\/logo\/[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(d.logo)) return send({ ok: false, error: "Logo inválido." }, 400);
            const banners = [];
            for (const b of (d.banners || []).slice(0, MAX_BANNERS)) {
              if (!/^\/banners\/[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(b.image || "")) return send({ ok: false, error: "Banner inválido." }, 400);
              if (b.link && !/^(https?:\/\/|\/)/i.test(b.link)) return send({ ok: false, error: "O link do banner deve começar com http://, https:// ou /." }, 400);
              banners.push({ image: b.image, link: (b.link || "").trim() });
            }
            fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
            const wa = String(d.whatsapp || "").replace(/\D/g, "");
            if (wa && (wa.length < 10 || wa.length > 15)) return send({ ok: false, error: "WhatsApp inválido. Use DDI + DDD + número (ex.: 5511999998888)." }, 400);
            if (!["classic", "spotlight", "frame"].includes(d.photoStyle || "spotlight")) return send({ ok: false, error: "Estilo de foto inválido." }, 400);
            const h = d.hero || {};
            fs.writeFileSync(CONFIG, JSON.stringify({
              name: String(d.name || "").slice(0, 60), primaryColor: d.primaryColor || "", logo: d.logo || "", banners,
              whatsapp: wa, message: String(d.message || "").replace(/\r/g, "").slice(0, 1000),
              hero: { enabled: !!h.enabled, title: String(h.title || "").slice(0, 60), subtitle: String(h.subtitle || "").slice(0, 140) },
              photoStyle: d.photoStyle || "spotlight", updatedAt: new Date().toISOString(),
              featured: [...new Set((d.featured || []).map(String).filter((x) => /^[a-z0-9-]{1,120}$/.test(x)))].slice(0, 24),
              hidden: [...new Set((d.hidden || []).map(String).filter((x) => /^[a-z0-9-]{1,120}$/.test(x)))].slice(0, 1000),
              sections: { featured: d.sections?.featured !== false, bestsellers: d.sections?.bestsellers !== false, news: d.sections?.news !== false },
              footer: (() => {
                const f = d.footer || {};
                const ig = String(f.instagram || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?].*$/, "").replace(/^@/, "");
                const cl = (v, n) => String(v || "").replace(/\r/g, "").trim().slice(0, n);
                return { about: cl(f.about, 300), address: cl(f.address, 200), hours: cl(f.hours, 200), phone: cl(f.phone, 30), instagram: /^[A-Za-z0-9._]{0,30}$/.test(ig) ? ig : "" };
              })(),
            }));
            return send({ ok: true, config: load() });
          }
          case "upload": {
            if (needAuth() || needCsrf()) return;
            const kind = url.searchParams.get("kind");
            if (kind !== "banner" && kind !== "logo") return send({ ok: false, error: "Tipo de imagem inválido." }, 400);
            if (!body.length) return send({ ok: false, error: "Nenhum arquivo recebido." }, 400);
            if (body.length > 6 * 1024 * 1024) return send({ ok: false, error: "Imagem maior que 6 MB." }, 413);
            const ext = body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "jpg" : body.subarray(1, 4).toString() === "PNG" ? "png" : body.subarray(0, 3).toString() === "GIF" ? "gif" : body.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
            if (!ext) return send({ ok: false, error: "Envie uma imagem JPG, PNG, WEBP ou GIF." }, 400);
            const dir = path.join(pub, kind === "logo" ? "logo" : "banners");
            fs.mkdirSync(dir, { recursive: true });
            const name = crypto.randomBytes(8).toString("hex") + "." + ext;
            fs.writeFileSync(path.join(dir, name), body);
            return send({ ok: true, url: `/${kind === "logo" ? "logo" : "banners"}/${name}` });
          }
          case "password": return send({ ok: false, error: "Troca de senha só funciona na hospedagem (PHP)." }, 400);
          default: return send({ ok: false, error: "Ação desconhecida." }, 404);
        }
      });
    },
  };
}
