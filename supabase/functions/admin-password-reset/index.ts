import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const randomPart = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${randomPart}aA1!`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse({ error: "Authentification requise." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Configuration Supabase manquante pour admin-password-reset.");
    return jsonResponse({ error: "Le service de récupération n’est pas configuré." }, 500);
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Session invalide. Reconnecte-toi puis réessaie." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let body: Record<string, unknown>;
    try {
      const payload: unknown = await request.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return jsonResponse({ error: "Requête invalide." }, 400);
      }
      body = payload as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Requête invalide." }, 400);
    }

    if (body.action === "admin-reset") {
      const { data: admin, error: adminError } = await adminClient
        .from("admins")
        .select("id")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (adminError) {
        console.error("Vérification du rôle administrateur impossible.");
        return jsonResponse({ error: "Impossible de vérifier les droits administrateur." }, 500);
      }
      if (!admin) return jsonResponse({ error: "Action réservée à l’administrateur." }, 403);

      const teacherId = body.teacherId;
      if (typeof teacherId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teacherId)) {
        return jsonResponse({ error: "Compte enseignant invalide." }, 400);
      }

      const { data: teacher, error: teacherError } = await adminClient
        .from("enseignants")
        .select("id")
        .eq("id", teacherId)
        .maybeSingle();
      if (teacherError) {
        console.error("Vérification du compte enseignant impossible.");
        return jsonResponse({ error: "Impossible de vérifier le compte demandé." }, 500);
      }
      if (!teacher) return jsonResponse({ error: "Compte enseignant introuvable." }, 404);

      const { data: targetAdmin, error: targetAdminError } = await adminClient
        .from("admins")
        .select("id")
        .eq("id", teacherId)
        .maybeSingle();
      if (targetAdminError) {
        console.error("Vérification du compte cible impossible.");
        return jsonResponse({ error: "Impossible de vérifier le compte demandé." }, 500);
      }
      if (targetAdmin) {
        return jsonResponse({ error: "La réinitialisation d’un compte administrateur doit être faite séparément." }, 403);
      }

      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(teacherId);
      if (targetError || !target.user) {
        console.error("Compte d’authentification enseignant introuvable.");
        return jsonResponse({ error: "Impossible de retrouver ce compte d’authentification." }, 404);
      }

      const password = temporaryPassword();
      const { error: updateError } = await adminClient.auth.admin.updateUserById(teacherId, {
        password,
        app_metadata: { ...target.user.app_metadata, must_change_password: true },
      });
      if (updateError) {
        console.error("Réinitialisation du mot de passe enseignant impossible.");
        return jsonResponse({ error: "Le mot de passe n’a pas pu être réinitialisé." }, 500);
      }
      return jsonResponse({ temporaryPassword: password });
    }

    if (body.action === "change-password") {
      if (authData.user.app_metadata?.must_change_password !== true) {
        return jsonResponse({ error: "Aucun changement de mot de passe provisoire n’est requis." }, 403);
      }
      if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
        return jsonResponse({ error: "Le mot de passe doit contenir entre 10 et 128 caractères." }, 400);
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(authData.user.id, {
        password: body.password,
        app_metadata: { ...authData.user.app_metadata, must_change_password: false },
      });
      if (updateError) {
        console.error("Changement du mot de passe provisoire impossible.");
        return jsonResponse({ error: "Le nouveau mot de passe n’a pas pu être enregistré." }, 400);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Action inconnue." }, 400);
  } catch (error) {
    console.error(
      "Erreur inattendue dans admin-password-reset.",
      error instanceof Error ? error.message : "Erreur inconnue",
    );
    return jsonResponse({ error: "Une erreur inattendue est survenue. Réessaie." }, 500);
  }
});
