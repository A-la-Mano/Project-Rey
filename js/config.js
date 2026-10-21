// config.js
const SUPABASE_URL = "https://hmnyqtuvtlwxnsruhyyl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_vQvNYM81Pra-ALHu5kd5FA_PhcSyaMi";

// Inicializa el cliente y lo expone como window.db (las otras partes del código esperan db global)
window.db = window.supabase.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : (function () {
      console.error("Supabase no disponible. Asegúrate de cargar el script de @supabase/supabase-js antes de config.js");
      return null;
    })();