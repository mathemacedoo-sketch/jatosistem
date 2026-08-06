import { supabase } from "./supabase";
import { sanitizeEmail } from "./security";

export async function signIn(email, password) {
  const safeEmail = sanitizeEmail(email);
  if (typeof password !== "string" || !password) throw new Error("Informe a senha.");
  const { data, error } = await supabase.auth.signInWithPassword({ email: safeEmail, password });
  if (error) throw new Error("Credenciais inválidas ou acesso temporariamente bloqueado.");
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("Não foi possível encerrar a sessão com segurança.");
}

export async function getAuthenticatedProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("perfis")
    .select("id, empresa_id, nome, perfil, ativo")
    .eq("id", userData.user.id)
    .eq("ativo", true)
    .single();
  if (profileError || !profile) throw new Error("Usuário sem perfil ativo.");
  return {
    id: profile.id,
    empresaId: profile.empresa_id,
    nome: profile.nome,
    perfil: profile.perfil,
    usuario: userData.user.email,
  };
}

export async function manageUser(payload) {
  const { data, error } = await supabase.functions.invoke("manage-users", { body: payload });
  if (error) throw new Error(error.context?.body?.error || "Operação de usuário recusada pelo servidor.");
  return data;
}
