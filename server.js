// Minimal waitlist with referral jumping. Run: node server.js
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-me";
const DB_FILE = process.env.DB_FILE || "./waitlist.json";
const APP_NAME = process.env.APP_NAME || "Our Awesome Product";

let users = [];
try { users = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));

// More referrals ranks higher; ties go to the earlier signup
const waiting = () => users.filter((u) => u.status !== "invited");
const ranked = () =>
  waiting().sort((a, b) => b.referrals - a.referrals || a.createdAt - b.createdAt);
const positionOf = (u) => ranked().findIndex((x) => x.code === u.code) + 1;

const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10;
};

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
const rawBody = (req) =>
  new Promise((ok) => {
    let b = "";
    req.on("data", (c) => (b += c) && b.length > 1e4 && req.destroy());
    req.on("end", () => ok(b));
  });
const readBody = async (req) => { try { return JSON.parse(await rawBody(req)); } catch { return {}; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TAPE = "WARNING  //  DO NOT TRESPASS  //  ".repeat(12);
const page = () => `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(APP_NAME)} - Waitlist</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
<style>
body{font-family:'JetBrains Mono',monospace;background:#fff;color:#000;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;font-size:16px}
.card{background:#fff;border:4px solid #000;padding:32px;max-width:460px;width:100%;box-shadow:10px 10px 0 #000;box-sizing:border-box}
h1{margin:0 0 12px;font-size:28px;font-weight:800;text-transform:uppercase;line-height:1.2}
p{margin:8px 0;line-height:1.5}
input,button{width:100%;padding:14px;border:3px solid #000;border-radius:0;font:inherit;box-sizing:border-box;margin-top:12px;color:#000}
input{background:#fff}input:focus{outline:4px solid #FFD600}
button{background:#FFD600;font-weight:800;cursor:pointer;text-transform:uppercase}
button:hover{background:#000;color:#FFD600}
.pos{font-size:72px;font-weight:800;background:#FFD600;border:3px solid #000;padding:4px 20px;display:inline-block;margin:8px 0}
.link{border:3px dashed #000;background:#FFF9C4;padding:12px;word-break:break-all;font-size:14px;font-weight:700;margin-top:8px}
.err{font-weight:800;border-left:6px solid #000;padding-left:10px}.err:empty{display:none}
.card{position:relative;z-index:1}
html,body{overflow-x:hidden}
.bar{position:fixed;left:0;right:0;height:28px;z-index:0;background:repeating-linear-gradient(-45deg,#FFD600 0 20px,#000 20px 40px);background-size:56.5685px 100%;animation:slide 1.2s linear infinite}
.bar.top{top:0}.bar.bottom{bottom:0;animation-direction:reverse}
@keyframes slide{to{background-position:56.5685px 0}}
.tape{position:fixed;left:-10vw;width:120vw;height:54px;background:#FFD600;border-top:5px solid #000;border-bottom:5px solid #000;overflow:hidden;z-index:0;display:flex;align-items:center}
.t1{top:20%;transform:rotate(-7deg)}.t2{bottom:20%;transform:rotate(5deg)}
.track{display:flex;flex:none;white-space:pre;font-weight:800;font-size:20px;letter-spacing:.15em;animation:run 30s linear infinite}
.track span{flex:none}
.t2 .track{animation-direction:reverse}
@keyframes run{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.bar,.track{animation:none}}
.langs{display:flex;margin-bottom:20px}.langs button{margin:0;padding:8px;font-size:13px;flex:1;width:auto;border-width:3px}.langs button+button{border-left-width:0}.langs button.on{background:#000;color:#FFD600}
</style></head><body>
<div class="bar top"></div><div class="bar bottom"></div>
${["t1", "t2"].map((c) => '<div class="tape ' + c + '"><div class="track"><span>' + TAPE + "</span><span>" + TAPE + "</span></div></div>").join("")}
<div class="card" id="app"></div>
<script>
const NAME = ${JSON.stringify(esc(APP_NAME))};
const T = {
  en: {
    tag: "Join the waitlist and get early access", ph: "your email", join: "Join waitlist",
    in_title: "You're on the waitlist!", pos: "Your position",
    of: "of {n} in the queue · {r} referrals", share: "Invite friends to jump up the queue:",
    copy: "Copy link", copied: "Copied", turn_t: "It's your turn!",
    turn_p: "You've been invited in. Check your email.",
    invalid_email: "Invalid email.", rate_limited: "Too many requests, try again in a minute."
  },
  bn: {
    tag: "Sertai senarai menunggu dan dapat akses dahulu", ph: "e-mel kamu", join: "Sertai senarai menunggu",
    in_title: "Kamu sudah dalam senarai!", pos: "Kedudukan kamu",
    of: "daripada {n} orang dalam giliran · {r} rujukan", share: "Ajak kawan supaya kamu naik giliran:",
    copy: "Salin pautan", copied: "Sudah disalin", turn_t: "Sudah tiba giliran kamu!",
    turn_p: "Kamu sudah dijemput masuk. Sila semak e-mel kamu.",
    invalid_email: "E-mel tidak sah.", rate_limited: "Terlalu banyak permintaan, cuba lagi sebentar."
  },
  id: {
    tag: "Gabung waitlist & dapat akses duluan", ph: "email kamu", join: "Gabung waitlist",
    in_title: "Kamu sudah di waitlist!", pos: "Posisi kamu",
    of: "dari {n} orang yang antre · {r} referral", share: "Ajak teman biar kamu loncat naik antrean:",
    copy: "Salin link", copied: "Tersalin", turn_t: "Giliran kamu!",
    turn_p: "Kamu sudah diundang masuk. Cek email kamu ya.",
    invalid_email: "Email tidak valid.", rate_limited: "Terlalu banyak permintaan, coba lagi sebentar lagi."
  }
};
const LABEL = { en: "English", bn: "Brunei", id: "Indo" };
const HTML_LANG = { en: "en", bn: "ms-BN", id: "id" };

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const ref = params.get("ref") || "";
let stored = null, lang = "en", view = { type: "form" };
try {
  stored = localStorage.getItem("wl_code");
  const l = localStorage.getItem("wl_lang");
  if (T[l]) lang = l;
} catch (e) {}

const t = (k) => T[lang][k] || "";

function frame(inner) {
  const langs = Object.keys(T).map(function (k) {
    return '<button data-l="' + k + '" class="' + (k === lang ? "on" : "") + '">' + LABEL[k] + "</button>";
  }).join("");
  app.innerHTML = '<div class="langs">' + langs + "</div>" + inner;
  app.querySelectorAll("[data-l]").forEach(function (b) {
    b.onclick = function () {
      lang = b.dataset.l;
      try { localStorage.setItem("wl_lang", lang); } catch (e) {}
      draw();
    };
  });
  document.documentElement.lang = HTML_LANG[lang];
}

function drawForm() {
  const old = document.getElementById("email");
  const v = old ? old.value : "";
  frame(
    "<h1>" + NAME + "</h1><p>" + t("tag") + '</p><input id="email" type="email" placeholder="' + t("ph") +
    '"><button id="go">' + t("join") + '</button><p class="err">' + (view.err ? t(view.err) : "") + "</p>"
  );
  const el = document.getElementById("email");
  el.value = v;
  el.onkeydown = function (e) { if (e.key === "Enter") join(); };
  document.getElementById("go").onclick = join;
}

function drawStatus() {
  const d = view.d;
  if (d.invited) return frame("<h1>" + t("turn_t") + "</h1><p>" + t("turn_p") + "</p>");
  const link = location.origin + "/?ref=" + d.code;
  frame(
    "<h1>" + t("in_title") + "</h1><p>" + t("pos") + '</p><div class="pos">#' + d.position + "</div><p>" +
    t("of").replace("{n}", d.total).replace("{r}", d.referrals) + "</p><p>" + t("share") +
    '</p><div class="link">' + link + '</div><button id="copy">' + t("copy") + "</button>"
  );
  document.getElementById("copy").onclick = function () {
    navigator.clipboard.writeText(link);
    this.textContent = t("copied");
  };
}

function draw() { view.type === "status" ? drawStatus() : drawForm(); }

async function join() {
  const email = document.getElementById("email").value.trim();
  const r = await fetch("/api/join", { method: "POST", body: JSON.stringify({ email: email, ref: ref }) });
  const d = await r.json();
  if (!r.ok) { view = { type: "form", err: d.error }; return draw(); }
  try { localStorage.setItem("wl_code", d.code); } catch (e) {}
  load(d.code);
}

async function load(code) {
  const r = await fetch("/api/status?code=" + code);
  if (!r.ok) {
    try { localStorage.removeItem("wl_code"); } catch (e) {}
    view = { type: "form" };
    return draw();
  }
  view = { type: "status", d: await r.json() };
  draw();
}

const start = params.get("me") || stored;
start ? load(start) : draw();
</script></body></html>`;

const adminPage = () => {
  const row = (u, i) => `<tr><td>${i}</td><td>${esc(u.email)}</td><td>${u.referrals}</td><td>${esc(u.code)}</td><td>${new Date(u.createdAt).toLocaleString("en-US")}</td></tr>`;
  const head = "<tr><th>#</th><th>Email</th><th>Referral</th><th>Code</th><th>Joined</th></tr>";
  const queue = ranked().map((u, i) => row(u, i + 1)).join("");
  const done = users.filter((u) => u.status === "invited").map((u, i) => row(u, i + 1)).join("");
  const key = esc(ADMIN_KEY);
  return `<!doctype html><meta charset="utf-8"><title>Admin</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
<style>body{font-family:'JetBrains Mono',monospace;background:#fff;color:#000;padding:24px}h2{text-transform:uppercase;font-weight:800}table{border-collapse:collapse;margin-bottom:24px}td,th{border:3px solid #000;padding:8px 14px;text-align:left}th{background:#FFD600}input,button{font:inherit;border:3px solid #000;border-radius:0;padding:8px 12px;color:#000}button{background:#FFD600;font-weight:800;cursor:pointer}button:hover{background:#000;color:#FFD600}a{color:#000;font-weight:800;background:#FFD600;padding:4px 8px}</style>
<h2>Queue (${ranked().length})</h2>
<form method="post" action="/admin/invite?key=${encodeURIComponent(ADMIN_KEY)}">
  Invite top <input name="n" type="number" min="1" value="5" style="width:60px"> people <button>Invite</button>
</form><br>
<table>${head}${queue}</table>
<h2>Invited (${users.length - ranked().length})</h2><table>${head}${done}</table>
<a href="/admin.csv?key=${encodeURIComponent(ADMIN_KEY)}">Download CSV</a>`;
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(page());
  }

  if (url.pathname === "/api/join" && req.method === "POST") {
    if (limited(ip)) return json(res, 429, { error: "rate_limited" });
    const { email = "", ref = "" } = await readBody(req);
    const clean = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return json(res, 400, { error: "invalid_email" });

    let user = users.find((u) => u.email === clean);
    if (!user) {
      user = { email: clean, code: crypto.randomBytes(4).toString("hex"), referrals: 0, createdAt: Date.now(), status: "waiting" };
      const referrer = users.find((u) => u.code === ref);
      if (referrer) referrer.referrals++;
      users.push(user);
      save();
    }
    return json(res, 200, { code: user.code });
  }

  if (url.pathname === "/api/status") {
    const user = users.find((u) => u.code === url.searchParams.get("code"));
    if (!user) return json(res, 404, { error: "not_found" });
    const invited = user.status === "invited";
    return json(res, 200, { code: user.code, invited, position: invited ? 0 : positionOf(user), total: waiting().length, referrals: user.referrals });
  }

  if (url.pathname.startsWith("/admin")) {
    if (url.searchParams.get("key") !== ADMIN_KEY) { res.writeHead(401); return res.end("Unauthorized"); }
    if (url.pathname === "/admin/invite" && req.method === "POST") {
      const n = Math.max(0, parseInt(new URLSearchParams(await rawBody(req)).get("n")) || 0);
      ranked().slice(0, n).forEach((u) => (u.status = "invited"));
      save();
      res.writeHead(303, { Location: "/admin?key=" + encodeURIComponent(ADMIN_KEY) });
      return res.end();
    }
    if (url.pathname === "/admin.csv") {
      const csv = "status,position,email,referrals,code,joined\n" +
        [...ranked().map((u, i) => ["waiting", i + 1, u]), ...users.filter((u) => u.status === "invited").map((u) => ["invited", "", u])]
          .map(([st, p, u]) => [st, p, u.email, u.referrals, u.code, new Date(u.createdAt).toISOString()].join(",")).join("\n");
      res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=waitlist.csv" });
      return res.end(csv);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(adminPage());
  }

  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log(`Waitlist running at http://localhost:${PORT}`));