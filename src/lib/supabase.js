import { supabase } from "./lib/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("As variáveis do Supabase não foram configuradas.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);