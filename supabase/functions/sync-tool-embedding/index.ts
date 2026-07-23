import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const session = new Supabase.ai.Session("gte-small");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ToolRow {
  id: string;
  name: string;
  type: string;
  description: string;
  team: string | null;
  departments: string | null;
  tags: string | null;
}

function toolEmbeddingText(tool: ToolRow): string {
  return [
    tool.name,
    tool.type,
    tool.description,
    tool.team ?? "",
    tool.departments ?? "",
    tool.tags ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function embedAndStore(
  supabase: ReturnType<typeof createClient>,
  tool: ToolRow
): Promise<{ id: string; ok: boolean; error?: string }> {
  const text = toolEmbeddingText(tool);
  const embedding = await session.run(text, {
    mean_pool: true,
    normalize: true,
  });

  const { error } = await supabase
    .from("tools")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("id", tool.id);

  if (error) {
    return { id: tool.id, ok: false, error: error.message };
  }
  return { id: tool.id, ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: "Service role not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey
  );

  try {
    const body = await req.json().catch(() => ({}));
    const toolId = typeof body?.id === "string" ? body.id.trim() : "";

    let tools: ToolRow[];

    if (toolId) {
      const { data, error } = await supabase
        .from("tools")
        .select("id, name, type, description, team, departments, tags")
        .eq("id", toolId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        return new Response(JSON.stringify({ error: "Tool not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tools = [data as ToolRow];
    } else {
      const { data, error } = await supabase
        .from("tools")
        .select("id, name, type, description, team, departments, tags")
        .is("embedding", null);

      if (error) throw new Error(error.message);
      tools = (data as ToolRow[]) ?? [];
    }

    const results = [];
    for (const tool of tools) {
      results.push(await embedAndStore(supabase, tool));
    }

    return new Response(
      JSON.stringify({
        synced: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
