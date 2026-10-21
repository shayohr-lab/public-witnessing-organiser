import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function tempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Please sign in again" }, 401);

    const { user_id } = await req.json();
    if (!user_id) return json({ error: "Missing user_id" }, 400);

    const { data: me } = await admin.from("profiles")
      .select("role, status, congregation_id").eq("id", user.id).single();
    const { data: target } = await admin.from("profiles")
      .select("congregation_id").eq("id", user_id).single();
    if (!me || me.role !== "overseer" || me.status !== "approved" ||
        !target || target.congregation_id !== me.congregation_id) {
      return json({ error: "Only the Service Overseer can reset passwords" }, 403);
    }

    const temp = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: temp });
    if (error) return json({ error: error.message }, 400);
    return json({ temp_password: temp });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
