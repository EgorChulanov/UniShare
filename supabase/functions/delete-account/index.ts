import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse("Method not allowed", 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return errorResponse("Authentication required", 401);

  let body: { confirmation?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (body.confirmation !== "DELETE") return errorResponse("Deletion confirmation is required", 400);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseURL || !anonKey || !serviceRoleKey) return errorResponse("Account deletion is not configured", 503);

  const userClient = createClient(supabaseURL, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return errorResponse("Invalid session", 401);

  const { data: imageMessages } = await userClient
    .from("messages")
    .select("image_url")
    .eq("sender_id", user.id)
    .not("image_url", "is", null);
  const chatImages = (imageMessages ?? [])
    .map((message) => message.image_url as string | null)
    .filter((path): path is string => Boolean(path));
  if (chatImages.length > 0) await userClient.storage.from("chats").remove(chatImages);
  await userClient.storage.from("avatars").remove([
    `${user.id}/avatar.jpg`,
    `${user.id}.jpg`,
  ]);

  const admin = createClient(supabaseURL, serviceRoleKey, { auth: { persistSession: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deleteError) return errorResponse("Unable to delete account", 500);

  return jsonResponse({ deleted: true });
});
