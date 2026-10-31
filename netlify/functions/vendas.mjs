// Vendas do dia, lidas dos relatórios "VENDAS dd.mm.aaaa" da pasta "Itens vendidos diáriamente" (Drive do Ricardo).
// A pasta precisa estar compartilhada como "Qualquer pessoa com o link".
// Variáveis de ambiente (Netlify):
//   VENDAS_PASTA_ID   id da pasta no Drive (padrão abaixo)
//   SUPABASE_URL, SUPABASE_ANON_KEY  (para conferir o login)
// Devolve { "aaaa-mm-dd": { vendas: { restaurante: {prato: qtd}, bar_piscina: {...} }, obs, arquivo } }
const PASTA_PADRAO = "1kWn5g2FylC7oRdo_VdjbQ-Vo6BezNgc5";
const CACHE_MS = 10 * 60 * 1000;
let cache = null;

/* pratos do app (nome do cardápio do app -> id) */
const PRATOS = {"Batata frita":"batata_frita","Mandioca frita com bacon":"mandioca_bacon","Ceviche Flamboyant":"ceviche","Sopa paraguaia":"sopa_paraguaia","Empanada paraguaia carne com ovo":"emp_carne","Empanada paraguaia presunto e queijo":"emp_queijo","Empanada mista":"emp_mista","Tilápia crocante":"tilapia_crocante","Filé com fritas":"file_fritas","Picanha com fritas":"picanha_fritas","Isca de ancho com fritas":"ancho_fritas","Isca de ancho com mandioca":"ancho_mandioca","Filé com mandioca":"file_mandioca","Picanha com mandioca":"picanha_mandioca","Isca de ancho + sopa paraguaia":"ancho_sopa","Dadinhos de tapioca":"dadinho","Bolinho de cabotiá com carne seca":"bol_cabotia","Bolinho de vaca atolada":"bol_vaca","Isca do Chef com Fritas":"isca_chef_fritas","Isca do Chef + Sopa paraguaia":"isca_chef_sopa","Cheese burger":"cheese","Salad burger":"salad","Flamboyant burger":"flamb_burger","Adicional hambúrguer 150g":"adic_hamb","Risotto de filé mignon":"ris_mignon","Risotto de filé com cogumelos":"ris_file_cog","Risotto de cogumelos":"ris_cog","Risotto quatro queijos":"ris_4q","Risotto carne seca, cabotiá e queijo coalho":"ris_carneseca","Talharim à bolonhesa":"talharim_bol","Bife a cavalo":"bife_cavalo","Ancho da casa":"ancho_casa","Tilápia grelhada":"tilapia_grelhada","Parmegiana de frango":"parm_frango","Filé de frango grelhado":"frango_grelhado","Filé mignon grelhado executivo":"mignon_exec","Maminha Executiva":"maminha_exec","Assado em Tiras Executivo":"assado_exec","Picanha pantaneira":"picanha_pant","Parmegiana de mignon":"parm_mignon","Ancho Flamboyant":"ancho_flamb","Ancho do chef":"ancho_chef","Filé mignon com gorgonzola":"file_gorgonzola","Filé mignon grelhado":"mignon_grelhado","Salmão Flamboyant":"salmao","Filé alfredo Flamboyant":"file_alfredo","Tilápia à urucum":"tilapia_urucum","Maminha Flamboyant":"maminha_flamb","Assado em Tiras do Chef":"assado_chef","Filé kids":"file_kids","Franguinho kids":"franguinho_kids","Bolonhesinha":"bolonhesinha","Canja de frango":"canja","Caldo verde":"caldo_verde","Caesar salad":"caesar","Pizza calabresa":"pizza_calabresa","Pizza marguerita":"pizza_marguerita","Pizza bacon":"pizza_bacon","Pizza portuguesa":"pizza_port","Pizza quatro queijos":"pizza_4q","Pizza tomate seco com rúcula":"pizza_tomate"};
/* nomes do sistema de caixa que não batem com o cardápio do app */
const APELIDOS = {
  "rissoto de file mignon": "ris_mignon", "risotto de file": "ris_mignon",
  "empanada paraguaya carne com ovo": "emp_carne", "empanada paraguaya presunto e queij": "emp_queijo",
  "empanada paraguaya presunto e queijo": "emp_queijo",
  "file mignon grelh executivo": "mignon_exec", "dadinho de tapioca": "dadinho",
  "rissoto carne seca cabotia queijo qualho": "ris_carneseca", "risotto carne seca cabotia queijo qualho": "ris_carneseca",
  "frango grelhado": "frango_grelhado", "adicional hamburguer 150g": "adic_hamb"
};
/* itens vendidos que não usam porcionados da câmara fria (não geram reposição) */
const IGNORA = /kibon|magnum|cafe|pudim|cheesecake|petit gateau|amendoim|kit kat|suflair|bruschetta|adicional|troca|misto|omelete|tabua|sanduiche|cacio|caprese|carbonara|alfredo|flamboyant salad|sorvete|chocolate|salgadinho|tostex|ovo/;
const PDV = { "restaurante": "restaurante", "bar piscina": "bar_piscina" };

const chave = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/burguer/g, "burger").replace(/[^a-z0-9]+/g, " ").trim();
const MAPA = {};
Object.entries(PRATOS).forEach(([n, id]) => { MAPA[chave(n)] = id; });
Object.entries(APELIDOS).forEach(([n, id]) => { MAPA[chave(n)] = id; });

const resposta = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function csv(texto) {
  const L = []; let r = [], f = "", q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) { if (c === '"' && texto[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texto[i + 1] === "\n") i++; r.push(f); L.push(r); r = []; f = ""; }
    else f += c;
  }
  if (f || r.length) { r.push(f); L.push(r); }
  return L;
}
const num = s => { s = String(s || "").trim(); if (!s) return 0; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = Number(s); return isNaN(n) ? 0 : n; };

/* lê um relatório "Relatório de Itens Vendidos" */
export function lerRelatorio(texto) {
  const L = csv(texto);
  let data = null, emitido = "", pdv = null, fixo = "";
  const vendas = {}, semPar = {};
  for (const r of L) {
    const a = (r[0] || "").trim();
    if (!data) { const m = (r[0] || "").match(/Data:\s*(\d{2})\/(\d{2})\/(\d{4})/); if (m) data = `${m[3]}-${m[2]}-${m[1]}`; }
    const em = r.join(" ").match(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\s*$/); if (em) emitido = em[1];
    if (a === "Ponto de Venda:") { pdv = PDV[chave(r[3])] || null; continue; }
    if (/^Tipo Grupo de Card/.test(a)) { fixo = chave(r[17]); continue; }
    if (!/^\d{3,}$/.test(a) || !pdv || fixo !== "alimento") continue;
    const nome = (r[1] || "").trim(), q = num(r[8]);
    if (!nome || !q) continue;
    const id = MAPA[chave(nome)];
    if (id) { const v = vendas[pdv] = vendas[pdv] || {}; v[id] = (v[id] || 0) + q; }
    else if (!IGNORA.test(chave(nome))) semPar[nome] = (semPar[nome] || 0) + q;
  }
  return { data, emitido, vendas, semPar };
}

/* lista os relatórios da pasta pública */
async function listar(pasta) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${pasta}`);
  if (!r.ok) throw new Error("pasta HTTP " + r.status);
  const html = await r.text();
  const out = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = (m[1].match(/\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
    const titulo = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const d = titulo.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (id && /VENDAS/i.test(titulo) && d) out.push({ id, titulo, data: `${d[3]}-${d[2]}-${d[1]}` });
  }
  return out;
}

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const pasta = process.env.VENDAS_PASTA_ID || PASTA_PADRAO;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: req.headers.get("authorization") || "", apikey: SUPABASE_ANON_KEY } });
    if (!quem.ok) return resposta(401, { code: "not_granted", message: "Faça login." });
  }
  const dias = Math.min(40, Math.max(1, Number(new URL(req.url).searchParams.get("dias")) || 20));
  if (cache && cache.dias >= dias && Date.now() - cache.em < CACHE_MS) return resposta(200, cache.corpo);
  try {
    const desde = new Date(Date.now() - (dias + 1) * 864e5).toISOString().slice(0, 10);
    const arquivos = (await listar(pasta)).filter(a => a.data >= desde);
    const lidos = await Promise.all(arquivos.map(async a => {
      try {
        const r = await fetch(`https://docs.google.com/spreadsheets/d/${a.id}/export?format=csv`, { redirect: "follow" });
        if (!r.ok) return { a, erro: "HTTP " + r.status };
        return { a, rel: lerRelatorio(await r.text()) };
      } catch (e) { return { a, erro: String(e && e.message) }; }
    }));
    const porDia = {};
    for (const { a, rel, erro } of lidos) {
      if (erro || !rel) { console.error("vendas", a.titulo, erro); continue; }
      const dia = rel.data || a.data;
      const atual = porDia[dia];
      /* arquivo repetido no mesmo dia: fica o emitido por último */
      if (atual && (atual._emitido || "") >= (rel.emitido || "")) continue;
      const sem = Object.entries(rel.semPar);
      porDia[dia] = {
        vendas: rel.vendas, arquivo: a.titulo, _emitido: rel.emitido,
        obs: sem.length ? "Pratos do relatório sem ficha no app (não entram na reposição): " + sem.map(([n, q]) => `${n} (${q})`).join(", ") : ""
      };
    }
    Object.values(porDia).forEach(v => delete v._emitido);
    cache = { em: Date.now(), dias, corpo: porDia };
    return resposta(200, porDia);
  } catch (e) {
    console.error("vendas", e && e.message);
    if (cache) return resposta(200, cache.corpo);
    return resposta(502, { code: "failed", message: "Não consegui ler a pasta de vendas agora." });
  }
};
