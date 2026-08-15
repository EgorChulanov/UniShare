import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";

type GameSearchRequest = { query?: string; gameId?: number };

function validQuery(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 80;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse("Method not allowed", 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return errorResponse("Authentication required", 401);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rawgKey = Deno.env.get("RAWG_API_KEY");
  if (!supabaseURL || !anonKey || !serviceRoleKey) {
    return errorResponse("Game catalog is not configured", 503);
  }

  const client = createClient(supabaseURL, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return errorResponse("Invalid session", 401);

  const { data: config } = await client
    .from("app_config")
    .select("value")
    .eq("key", "game_catalog_enabled")
    .maybeSingle();
  if (config?.value === false) return errorResponse("Game catalog is temporarily unavailable", 503);

  let body: GameSearchRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const isGameRequest = Number.isInteger(body.gameId) && Number(body.gameId) > 0;
  if (!isGameRequest && !validQuery(body.query)) {
    return errorResponse("Query must contain 2 to 80 characters", 400);
  }

  const endpoint = isGameRequest
    ? `https://api.rawg.io/api/games/${body.gameId}`
    : "https://api.rawg.io/api/games";
  const url = new URL(endpoint);
  const cacheKey = isGameRequest
    ? `game:${body.gameId}`
    : `search:${body.query!.trim().toLocaleLowerCase("en-US")}`;
  const admin = createClient(supabaseURL, serviceRoleKey, { auth: { persistSession: false } });
  const { data: cached } = await admin
    .from("game_catalog_cache")
    .select("payload")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cached?.payload) return jsonResponse(cached.payload);

  const normalize = (game: Record<string, unknown>) => ({
    id: game.id ?? game.game_id,
    name: game.name,
    background_image: game.background_image ?? null,
    rating: game.rating ?? null,
    released: game.released ?? null,
  });
  const { data: overrideRows } = await admin
    .from("game_catalog_overrides")
    .select("game_id,name,background_image,rating,released,search_terms")
    .eq("enabled", true)
    .limit(500);
  const needle = body.query?.trim().toLocaleLowerCase("en-US") ?? "";
  const curated = (overrideRows ?? [])
    .filter((game) => isGameRequest
      ? game.game_id === body.gameId
      : game.name.toLocaleLowerCase("en-US").includes(needle) ||
        (game.search_terms ?? []).some((term: string) => term.toLocaleLowerCase("en-US").includes(needle)))
    .map((game) => normalize(game as Record<string, unknown>))
    .slice(0, 12);

  if (!rawgKey) {
    if (curated.length > 0) {
      return jsonResponse(isGameRequest ? curated[0] : { results: curated });
    }
    const { data: stale } = await admin
      .from("game_catalog_cache")
      .select("payload")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (stale?.payload) return jsonResponse(stale.payload);
    return errorResponse("The managed game catalog has no matching entry", 503);
  }

  url.searchParams.set("key", rawgKey);
  if (!isGameRequest) {
    url.searchParams.set("search", body.query!.trim());
    url.searchParams.set("page_size", "12");
    url.searchParams.set("search_precise", "true");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch {
    if (curated.length > 0) return jsonResponse(isGameRequest ? curated[0] : { results: curated });
    const { data: stale } = await admin
      .from("game_catalog_cache")
      .select("payload")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (stale?.payload) return jsonResponse(stale.payload);
    return errorResponse("Game catalog request timed out", 504);
  }
  if (!upstream.ok) {
    if (curated.length > 0) return jsonResponse(isGameRequest ? curated[0] : { results: curated });
    return errorResponse("Game catalog provider rejected the request", 502);
  }

  const payload = await upstream.json();
  const result = body.gameId
    ? normalize(payload as Record<string, unknown>)
    : { results: [
        ...curated,
        ...((payload as { results?: Record<string, unknown>[] }).results ?? [])
          .map(normalize)
          .filter((game) => !curated.some((item) => item.name === game.name)),
      ].slice(0, 12) };

  const ttlHours = isGameRequest ? 24 * 7 : 24;
  await admin.from("game_catalog_cache").upsert({
    cache_key: cacheKey,
    payload: result,
    expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  return jsonResponse(result);
});
