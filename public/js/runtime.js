/* Runtime do app Flamboyant fora do Claude.
   O app nasceu como artefato do Claude e usa três recursos: claude.use("db"), claude.use("downloads")
   e claude.use("sample"). Este arquivo recria os três sobre Supabase (banco + login) e uma função
   do Netlify (leitura da foto com a API do Claude), para o código do app funcionar sem mudanças. */
(function () {
  const cfg = window.APP_CONFIG || {};
  const configurado = cfg.SUPABASE_URL && !/COLE_AQUI/.test(cfg.SUPABASE_URL);
  const sb = configurado ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  window.SB = sb;

  /* ---------------- Login ---------------- */
  let liberar;
  const autenticado = new Promise(r => (liberar = r));
  let sessao = null;

  function telaLogin(msg) {
    let el = document.getElementById("login");
    if (!el) {
      el = document.createElement("section");
      el.id = "login";
      el.className = "login";
      el.innerHTML =
        '<div class="eyebrow">Cozinha · Flamboyant</div><h1>Entrar</h1>' +
        '<label>E-mail<input type="email" id="lg-email" autocomplete="username" required></label>' +
        '<label>Senha<input type="password" id="lg-senha" autocomplete="current-password" required></label>' +
        '<button class="btn primary" id="lg-ok" type="button">Entrar</button>' +
        '<button class="btn sm" id="lg-esqueci" type="button">Esqueci a senha</button>' +
        '<p class="erro" id="lg-erro"></p>';
      document.body.prepend(el);
      const ok = async () => {
        const email = el.querySelector("#lg-email").value.trim();
        const password = el.querySelector("#lg-senha").value;
        const er = el.querySelector("#lg-erro");
        er.textContent = "";
        if (!email || !password) { er.textContent = "Preencha e-mail e senha."; return; }
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) er.textContent = "E-mail ou senha incorretos.";
      };
      el.querySelector("#lg-ok").onclick = ok;
      el.querySelector("#lg-senha").onkeydown = e => { if (e.key === "Enter") ok(); };
      el.querySelector("#lg-esqueci").onclick = async () => {
        const email = el.querySelector("#lg-email").value.trim();
        const er = el.querySelector("#lg-erro");
        if (!email) { er.textContent = "Escreva seu e-mail acima primeiro."; return; }
        await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        er.textContent = "Se o e-mail estiver cadastrado, chega um link para criar nova senha.";
      };
    }
    el.hidden = false;
    if (msg) el.querySelector("#lg-erro").textContent = msg;
    const wrap = document.querySelector(".wrap");
    if (wrap) wrap.hidden = true;
  }

  async function entrou(s) {
    sessao = s;
    const el = document.getElementById("login");
    if (el) el.hidden = true;
    const wrap = document.querySelector(".wrap");
    if (wrap) wrap.hidden = false;
    let nome = s.user.email;
    try {
      const { data } = await sb.from("perfis").select("nome,papel,telas").eq("id", s.user.id).maybeSingle();
      if (data && data.nome) nome = data.nome;
      window.APP_USER = { id: s.user.id, email: s.user.email, nome, papel: data && data.papel, telas: data && Array.isArray(data.telas) && data.telas.length ? data.telas : null };
    } catch (e) { window.APP_USER = { id: s.user.id, email: s.user.email, nome }; }
    const ub = document.getElementById("userbar");
    if (ub) { ub.hidden = false; document.getElementById("userbar-nome").textContent = "👤 " + nome; }
    /* telas liberadas para a pessoa (perfis.telas); vazio = todas */
    const telas = window.APP_USER && window.APP_USER.telas;
    if (telas) {
      ["ab", "est", "prod", "leo", "req", "cmp"].forEach(t => {
        const b = document.getElementById("go-" + t);
        if (b) b.hidden = !telas.includes(t);
      });
      const banner = document.getElementById("home-compra");
      if (banner && !telas.includes("prod")) banner.style.display = "none";
      if (telas.length === 1 && typeof abrir === "function") abrir(telas[0]);
    }
    liberar(s);
  }

  function iniciaLogin() {
    if (!sb) {
      document.body.insertAdjacentHTML("afterbegin",
        '<div class="alerta" style="margin:16px">App sem configuração: preencha js/config.js com a URL e a chave anon do Supabase.</div>');
      return;
    }
    const sair = document.getElementById("sair");
    if (sair) sair.onclick = async () => { await sb.auth.signOut(); location.reload(); };
    sb.auth.getSession().then(({ data }) => { if (data.session) entrou(data.session); else telaLogin(); });
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_IN" && s && !sessao) entrou(s);
      if (ev === "SIGNED_OUT") { sessao = null; telaLogin(); }
      if (ev === "TOKEN_REFRESHED" && s) sessao = s;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciaLogin);
  else setTimeout(iniciaLogin, 0);

  /* ---------------- db: coleções de documentos (mesma API do artefato) ---------------- */
  function erro(code, message) { const e = new Error(message || code); e.code = code; return e; }
  function traduz(e) { return erro(e && /permission|policy|JWT/i.test(e.message || "") ? "not_granted" : "db_error", e && e.message); }

  function colecao(nome) {
    const tabela = () => sb.from("docs");
    const doc = id => ({
      id,
      async set(v) {
        const { error } = await tabela().upsert({ colecao: nome, id, dados: v }, { onConflict: "colecao,id" });
        if (error) throw traduz(error);
      },
      async update(p) {
        const { data, error } = await tabela().select("dados").eq("colecao", nome).eq("id", id).maybeSingle();
        if (error) throw traduz(error);
        const v = Object.assign({}, (data && data.dados) || {}, p);
        const r = await tabela().upsert({ colecao: nome, id, dados: v }, { onConflict: "colecao,id" });
        if (r.error) throw traduz(r.error);
      },
      async delete() {
        const { error } = await tabela().delete().eq("colecao", nome).eq("id", id);
        if (error) throw traduz(error);
      },
      async get() {
        const { data, error } = await tabela().select("id,dados").eq("colecao", nome).eq("id", id).maybeSingle();
        if (error) throw traduz(error);
        return { id, exists: !!data, data: () => (data ? data.dados : undefined) };
      }
    });
    return {
      doc,
      async add(v) {
        const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        await doc(id).set(v);
        return { id };
      },
      onSnapshot(cb, onErr) {
        const mapa = new Map();
        const emite = () => cb({ docs: [...mapa.entries()].map(([id, d]) => ({ id, data: () => d })) });
        let ativo = true;
        tabela().select("id,dados").eq("colecao", nome).then(({ data, error }) => {
          if (!ativo) return;
          if (error) { if (onErr) onErr(traduz(error)); return; }
          (data || []).forEach(r => mapa.set(r.id, r.dados));
          emite();
        });
        const canal = sb.channel("docs-" + nome + "-" + Math.random().toString(36).slice(2))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "docs", filter: "colecao=eq." + nome }, p => {
            if (p.new) { mapa.set(p.new.id, p.new.dados); emite(); }
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "docs", filter: "colecao=eq." + nome }, p => {
            if (p.new) { mapa.set(p.new.id, p.new.dados); emite(); }
          })
          /* o Supabase não filtra eventos DELETE: recebe todos e confere a coleção */
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "docs" }, p => {
            if (p.old && p.old.colecao === nome && mapa.delete(p.old.id)) emite();
          })
          .subscribe();
        return () => { ativo = false; sb.removeChannel(canal); };
      }
    };
  }

  /* ---------------- downloads: salva o arquivo no aparelho ---------------- */
  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement("a");
      a.href = url; a.download = filename || "arquivo";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  /* ---------------- sample: leitura da foto pela função do Netlify ---------------- */
  async function reduzImagem(arquivo, max = 1600) {
    const bmp = await createImageBitmap(arquivo);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    const b64 = await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1]); f.readAsDataURL(blob); });
    return { media_type: "image/jpeg", data: b64 };
  }
  const sample = {
    async limits() { return { images: true }; },
    async json(prompt, opts = {}) {
      const s = sessao || (await autenticado);
      let imgs = opts.images ? (Array.isArray(opts.images) ? opts.images : [opts.images]) : [];
      let enviadas;
      try { enviadas = await Promise.all(imgs.map(i => reduzImagem(i))); }
      catch (e) { throw erro("image_rejected", "Imagem inválida"); }
      let r;
      try {
        r = await fetch("/.netlify/functions/ler-requisicao", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token },
          body: JSON.stringify({ prompt, images: enviadas }),
          signal: opts.signal
        });
      } catch (e) {
        if (e && e.name === "AbortError") throw erro("cancelled");
        throw erro("network", "Sem conexão");
      }
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw erro(corpo.code || (r.status === 401 ? "not_granted" : r.status === 429 ? "rate_limited" : "failed"), corpo.message);
      if (!corpo || typeof corpo.resultado !== "object") throw erro("invalid_json");
      return corpo.resultado;
    }
  };

  /* ---------------- claude.use ---------------- */
  window.claude = {
    async use(nome) {
      if (nome === "downloads") return downloads;
      if (!sb) return null;
      await autenticado;
      if (nome === "db") return { collection: colecao };
      if (nome === "sample") return sample;
      return null;
    }
  };
})();
