import { createClient } from '@supabase/supabase-js';

const TABLE = 'model_config';
const DEFAULT_COOLDOWN_SECONDS = 60;

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

interface ModelConfigRow {
  model_name: string;
  priority: number;
  rate_limited_until?: string | null;
  updated_at?: string | null;
}

/**
 * Returns Groq model names to try, in order:
 *  1. currently-available models, by priority (lowest first),
 *  2. currently-rate-limited models, as a last resort,
 *  3. `fallbackDefault` appended if it isn't already somewhere in the list.
 */
export async function getOrderedModels(fallbackDefault: string): Promise<string[]> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return [fallbackDefault];

    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('priority', { ascending: true });

    if (error || !data || data.length === 0) {
      return [fallbackDefault];
    }

    const rows = data as ModelConfigRow[];
    const now = new Date();
    const available: string[] = [];
    const limited: string[] = [];

    for (const r of rows) {
      let isLimited = false;
      if (r.rate_limited_until) {
        const untilDt = new Date(r.rate_limited_until);
        if (!isNaN(untilDt.getTime())) {
          isLimited = untilDt > now;
        }
      }

      if (isLimited) {
        limited.push(r.model_name);
      } else {
        available.push(r.model_name);
      }
    }

    const ordered = [...available, ...limited];
    if (!ordered.includes(fallbackDefault)) {
      ordered.push(fallbackDefault);
    }

    return ordered;
  } catch {
    return [fallbackDefault];
  }
}

/**
 * Record that `modelName` hit a rate limit or invalid model error,
 * so all server instances skip it temporarily.
 */
export async function markRateLimited(
  modelName: string,
  cooldownSeconds: number = DEFAULT_COOLDOWN_SECONDS
): Promise<void> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return;

    const now = new Date();
    const until = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();

    await sb.from(TABLE).upsert({
      model_name: modelName,
      rate_limited_until: until,
      updated_at: now.toISOString(),
    });
  } catch {
    // Best-effort bookkeeping — never crash request on bookkeeping failure
  }
}
