import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST" || !allowedOrigin || request.headers.get("origin") !== allowedOrigin) return reply(403, { error: "Origem não autorizada." });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Não autenticado." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData.user) return reply(401, { error: "Sessão inválida." });
  const { data: caller } = await admin.from("perfis").select("empresa_id, perfil, ativo").eq("id", userData.user.id).single();
  if (!caller?.ativo || !["master", "gerente"].includes(caller.perfil)) return reply(403, { error: "Permissão insuficiente." });

  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 64);
  const bucket = new Date().toISOString().slice(0, 16);
  const rateKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userData.user.id}:${ip}:${bucket}`));
  const key = Array.from(new Uint8Array(rateKey)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: allowed } = await admin.rpc("consumir_rate_limit", { p_chave: key, p_limite: 10 });
  if (!allowed) return reply(429, { error: "Muitas operações. Aguarde e tente novamente." });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(400, { error: "JSON inválido." }); }
  const action = String(body.action ?? "");
  const targetId = String(body.id ?? "");
  const empresaId = caller.perfil === "master" ? String(body.empresaId ?? caller.empresa_id) : caller.empresa_id;
  const perfil = String(body.perfil ?? "usuario");
  if (!['create', 'update', 'delete'].includes(action) || !['usuario', 'gerente', ...(caller.perfil === 'master' ? ['master'] : [])].includes(perfil)) return reply(400, { error: "Operação inválida." });

  if (action === "delete") {
    const { data: target } = await admin.from("perfis").select("empresa_id, perfil").eq("id", targetId).single();
    if (!target || (caller.perfil !== "master" && target.empresa_id !== caller.empresa_id) || target.perfil === "master") return reply(403, { error: "Exclusão não permitida." });
    const { error } = await admin.auth.admin.deleteUser(targetId, true);
    if (error) return reply(400, { error: "Não foi possível remover o usuário." });
    return reply(200, { ok: true });
  }

  const nome = String(body.nome ?? "").normalize("NFKC").trim().slice(0, 160);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  if (nome.length < 2) return reply(400, { error: "Nome inválido." });

  if (action === "create") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(400, { error: "E-mail inválido." });
    const password = String(body.password ?? "");
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password)) return reply(400, { error: "Senha fora da política de segurança." });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: false });
    if (error || !data.user) return reply(400, { error: "Não foi possível criar o usuário." });
    const { error: profileError } = await admin.from("perfis").insert({ id: data.user.id, empresa_id: empresaId, nome, perfil });
    if (profileError) { await admin.auth.admin.deleteUser(data.user.id); return reply(400, { error: "Não foi possível vincular o perfil." }); }
    return reply(201, { id: data.user.id });
  }

  const { data: target } = await admin.from("perfis").select("empresa_id, perfil").eq("id", targetId).single();
  if (!target || (caller.perfil !== "master" && target.empresa_id !== caller.empresa_id) || target.perfil === "master") return reply(403, { error: "Alteração não permitida." });
  const { error } = await admin.from("perfis").update({ nome, perfil, empresa_id: empresaId, atualizado_em: new Date().toISOString() }).eq("id", targetId);
  if (error) return reply(400, { error: "Não foi possível atualizar o perfil." });
  return reply(200, { ok: true });
});
