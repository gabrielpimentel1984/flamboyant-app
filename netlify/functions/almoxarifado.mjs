// Saldo do almoxarifado, lido da planilha "Estoque Almoxarifado" (aba Almoxarifado).
// Variáveis de ambiente (Netlify):
//   ALMOX_CSV_URL      link CSV da aba Almoxarifado (Arquivo > Compartilhar > Publicar na Web > aba Almoxarifado > CSV)
//   SUPABASE_URL, SUPABASE_ANON_KEY  (para conferir o login)
// Colunas usadas (pelo título, não pela posição): ITENS · Und Embalagem · Fornecedores · Estoque Mínimo Mensal · ESTOQUE ATUAL
const CACHE_MS = 5 * 60 * 1000;
let cache = null;

const resposta = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function csv(texto) {
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const limpa = s => String(s || "").replace(/\s+/g, " ").trim();
const chave = s => limpa(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function numero(s) {
  s = limpa(s);
  if (!s || /^#|definir/i.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function lerPlanilha(texto) {
  const L = csv(texto);
  const cab = (L[0] || []).map(chave);
  const col = nome => cab.indexOf(chave(nome));
  const iN = col("ITENS"), iU = col("Und Embalagem"), iF = col("Fornecedores"), iM = col("Estoque Mínimo Mensal"), iA = col("ESTOQUE ATUAL");
  if (iN < 0 || iA < 0) throw new Error("Colunas ITENS / ESTOQUE ATUAL não encontradas");
  const itens = {};
  for (const r of L.slice(1)) {
    const nome = limpa(r[iN]);
    if (!nome) continue;
    itens[nome] = { un: limpa(r[iU]), atual: numero(r[iA]), min: iM >= 0 ? numero(r[iM]) : null, forn: iF >= 0 ? limpa(r[iF]) : "" };
  }
  return itens;
}

export default async (req) => {
  const { ALMOX_CSV_URL, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!ALMOX_CSV_URL) return resposta(503, { code: "not_configured", message: "Planilha do almoxarifado não configurada." });
  const auth = req.headers.get("authorization") || "";
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!quem.ok) return resposta(401, { code: "not_granted", message: "Faça login." });
  }
  if (cache && Date.now() - cache.em < CACHE_MS) return resposta(200, cache.corpo);
  try {
    const r = await fetch(ALMOX_CSV_URL, { redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const itens = lerPlanilha(await r.text());
    const agora = new Date();
    const local = new Date(agora.getTime() - 4 * 3600 * 1000); // horário de MS (UTC-4)
    const corpo = { data: local.toISOString().slice(0, 10), hora: local.toISOString().slice(11, 16), fonte: "Planilha Estoque Almoxarifado (ESTOQUE ATUAL)", itens };
    cache = { em: Date.now(), corpo };
    return resposta(200, corpo);
  } catch (e) {
    console.error("almoxarifado", e && e.message);
    if (cache) return resposta(200, Object.assign({ antigo: true }, cache.corpo));
    return resposta(502, { code: "failed", message: "Não consegui ler a planilha agora." });
  }
};
