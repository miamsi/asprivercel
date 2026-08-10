import { getSupabaseClient } from './db';

const TABLE = 'model_config';
const DEFAULT_COOLDOWN_SECONDS = 60;

interface ModelConfigRow {
  model_name: string;
  priority: number;
  rate_limited_until?: string | null;
}

export async function getOrderedModels(fallbackDefault: string): Promise<string[]> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('priority', { ascending: true });

    if (error || !data || data.length === 0) {
      return [fallbackDefault];
    }

    const now = new Date();
    const available: string[] = [];
    const limited: string[] = [];

    for (const r of data as ModelConfigRow[]) {
      let isLimited = false;
      if (r.rate_limited_until) {
        const untilDt = new Date(r.rate_limited_until);
        isLimited = untilDt > now;
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

export async function markRateLimited(modelName: string, cooldownSeconds: number = DEFAULT_COOLDOWN_SECONDS): Promise<void> {
  try {
    const sb = getSupabaseClient();
    const until = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
    await sb.from(TABLE).upsert({
      model_name: modelName,
      rate_limited_until: until,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort bookkeeping only
  }
}
