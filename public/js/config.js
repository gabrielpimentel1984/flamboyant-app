/* Configuração pública do app.
   A URL e a chave "anon" do Supabase são feitas para ficar no navegador: quem protege os dados
   são as regras de acesso (RLS) do banco, definidas em supabase/schema.sql.
   NUNCA coloque aqui a chave "service_role" do Supabase nem a chave da API do Claude. */
window.APP_CONFIG = {
  SUPABASE_URL: "COLE_AQUI_A_URL_DO_PROJETO_SUPABASE",
  SUPABASE_ANON_KEY: "COLE_AQUI_A_CHAVE_ANON_PUBLICA",
  /* a equipe entra só com usuário; o app completa com este domínio interno (nenhum e-mail é enviado) */
  DOMINIO_USUARIOS: "equipe.flamboyant.local"
};
