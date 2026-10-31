// Lê a foto da requisição de estoque com a API do Claude.
// Variáveis de ambiente (Netlify > Site configuration > Environment variables):
//   ANTHROPIC_API_KEY  chave da API do Claude (console.anthropic.com) — secreta
//   SUPABASE_URL       URL do projeto Supabase
//   SUPABASE_ANON_KEY  chave anon pública do Supabase
//   CLAUDE_MODEL       opcional; padrão abaixo
const MODELO_PADRAO = "claude-sonnet-5-5";
const MAX_BYTES = 5 * 1024 * 1024;

const resposta = (status, corpo) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return resposta(405, { code: "method", message: "Use POST" });

  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY)
    return resposta(500, { code: "not_configured", message: "Leitura de foto ainda não configurada no servidor." });

  // só quem está logado no app pode usar (evita gasto por terceiros)
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return resposta(401, { code: "not_granted", message: "Faça login." });
  const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
  if (!quem.ok) return resposta(401, { code: "not_granted", message: "Sessão expirada. Entre de novo." });

  let corpo;
  try { corpo = await req.json(); } catch { return resposta(400, { code: "bad_request", message: "Pedido inválido." }); }
  const prompt = String(corpo.prompt || "").slice(0, 20000);
  const imagens = Array.isArray(corpo.images) ? corpo.images.slice(0, 4) : [];
  if (!prompt || !imagens.length) return resposta(400, { code: "bad_request", message: "Falta a foto." });
  for (const im of imagens) {
    if (!im || !/^image\/(jpeg|png|webp)$/.test(im.media_type || "") || typeof im.data !== "string")
      return resposta(400, { code: "image_rejected", message: "Formato de imagem não aceito." });
    if (im.data.length * 0.75 > MAX_BYTES) return resposta(413, { code: "image_rejected", message: "Foto grande demais." });
  }

  const conteudo = [
    ...imagens.map(im => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
    { type: "text", text: prompt + "\n\nResponda somente com o JSON, sem texto antes ou depois." }
  ];

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || MODELO_PADRAO,
        max_tokens: 4000,
        messages: [{ role: "user", content: conteudo }]
      })
    });
  } catch {
    return resposta(502, { code: "failed", message: "Não foi possível falar com o Claude agora." });
  }
  if (r.status === 429) return resposta(429, { code: "rate_limited", message: "Muitas leituras seguidas." });
  if (!r.ok) {
    const det = await r.text().catch(() => "");
    console.error("Anthropic", r.status, det.slice(0, 500));
    return resposta(502, { code: "failed", message: "A leitura falhou. Tente de novo." });
  }
  const dados = await r.json();
  const texto = (dados.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) return resposta(422, { code: "invalid_json", message: "Não consegui entender a foto." });
  try {
    return resposta(200, { resultado: JSON.parse(texto.slice(a, b + 1)) });
  } catch {
    return resposta(422, { code: "invalid_json", message: "Não consegui entender a foto." });
  }
};
