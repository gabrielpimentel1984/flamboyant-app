/* Configuração pública do app.
   A URL e a chave "anon" do Supabase são feitas para ficar no navegador: quem protege os dados
   são as regras de acesso (RLS) do banco, definidas em supabase/schema.sql.
   NUNCA coloque aqui a chave "service_role" do Supabase nem a chave da API do Claude. */
window.APP_CONFIG = {
  SUPABASE_URL: "https://ddwtuxysxtakxujivksr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_WG4JbblFOgNRHgmQDi1iHQ_x2EtzP9e",
  /* a equipe entra só com usuário; o app completa com este domínio interno (nenhum e-mail é enviado) */
  DOMINIO_USUARIOS: "equipe.flamboyant.local"
};
