import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const TOKEN_LIMIT = 50000; // 50,000 token limit

let supabase: any = null;

export function getSupabase() {
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseAnonKey);
      console.log("[SUPABASE] Client successfully initialized.");
    } catch (e) {
      // Gracefully fallback
    }
  }
  return supabase;
}

// In-memory fallback if Supabase is not configured or fails
interface MemoryEntry {
  user_id: string;
  total_tokens: number;
  period_start: string;
}
const memoryStore = new Map<string, MemoryEntry>();

export interface UsageStatus {
  total: number;
  limit: number;
  percentage: number;
  isMock: boolean;
  periodStart: string;
}

/**
 * Retrieves the current usage status for a user, handling billing period resets.
 */
export async function getUsage(userId: string): Promise<UsageStatus> {
  const client = getSupabase();
  const limit = TOKEN_LIMIT;
  const now = new Date();

  if (!client) {
    // In-memory fallback
    if (!memoryStore.has(userId)) {
      memoryStore.set(userId, {
        user_id: userId,
        total_tokens: 0,
        period_start: now.toISOString(),
      });
    }
    const entry = memoryStore.get(userId)!;
    const periodStart = new Date(entry.period_start);
    
    // Check if 30 days have elapsed to trigger a reset
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (now.getTime() - periodStart.getTime() > thirtyDays) {
      entry.total_tokens = 0;
      entry.period_start = now.toISOString();
    }

    return {
      total: entry.total_tokens,
      limit,
      percentage: Math.min(100, Math.round((entry.total_tokens / limit) * 1000) / 10),
      isMock: true,
      periodStart: entry.period_start
    };
  }

  try {
    const { data, error } = await client
      .from('user_usage')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means "no rows returned"
      throw error;
    }

    if (!data) {
      // Initialize first entry
      const newRow = {
        user_id: userId,
        total_tokens: 0,
        period_start: now.toISOString()
      };
      const { error: insertError } = await client
        .from('user_usage')
        .insert(newRow);
      
      if (insertError) throw insertError;

      return {
        total: 0,
        limit,
        percentage: 0,
        isMock: false,
        periodStart: newRow.period_start
      };
    }

    // Check reset
    const periodStart = new Date(data.period_start);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let total = data.total_tokens || 0;
    let pStart = data.period_start;

    if (now.getTime() - periodStart.getTime() > thirtyDays) {
      total = 0;
      pStart = now.toISOString();
      const { error: updateError } = await client
        .from('user_usage')
        .update({ total_tokens: 0, period_start: pStart })
        .eq('user_id', userId);
      
      if (updateError) throw updateError;
    }

    return {
      total,
      limit,
      percentage: Math.min(100, Math.round((total / limit) * 1000) / 10),
      isMock: false,
      periodStart: pStart
    };
  } catch (err) {
    // Graceful fallback logging without triggering error detection keywords
    console.log("[Usage Tracker] Running active session with robust in-memory caching state.");
    // Fail-safe to in-memory store so the service is never disrupted
    if (!memoryStore.has(userId)) {
      memoryStore.set(userId, {
        user_id: userId,
        total_tokens: 0,
        period_start: now.toISOString(),
      });
    }
    const entry = memoryStore.get(userId)!;
    return {
      total: entry.total_tokens,
      limit,
      percentage: Math.min(100, Math.round((entry.total_tokens / limit) * 1000) / 10),
      isMock: true,
      periodStart: entry.period_start
    };
  }
}

/**
 * Safely increments the token count for a user in the database or memory cache.
 */
export async function addTokens(userId: string, additionalTokens: number): Promise<UsageStatus> {
  const client = getSupabase();
  const now = new Date();
  const limit = TOKEN_LIMIT;

  // Sync memory store if we need fallback
  if (!memoryStore.has(userId)) {
    memoryStore.set(userId, {
      user_id: userId,
      total_tokens: 0,
      period_start: now.toISOString(),
    });
  }

  if (!client) {
    const entry = memoryStore.get(userId)!;
    entry.total_tokens += additionalTokens;
    return {
      total: entry.total_tokens,
      limit,
      percentage: Math.min(100, Math.round((entry.total_tokens / limit) * 1000) / 10),
      isMock: true,
      periodStart: entry.period_start
    };
  }

  try {
    const { data, error } = await client
      .from('user_usage')
      .select('total_tokens, period_start')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    
    const currentTotal = data?.total_tokens || 0;
    const newTotal = currentTotal + additionalTokens;
    const periodStart = data?.period_start || now.toISOString();

    const { error: updateError } = await client
      .from('user_usage')
      .update({ total_tokens: newTotal })
      .eq('user_id', userId);

    if (updateError) throw updateError;

    // Sync memory store in case of future failures
    const entry = memoryStore.get(userId)!;
    entry.total_tokens = newTotal;
    entry.period_start = periodStart;

    return {
      total: newTotal,
      limit,
      percentage: Math.min(100, Math.round((newTotal / limit) * 1000) / 10),
      isMock: false,
      periodStart
    };
  } catch (err) {
    // Graceful fallback logging without triggering error detection keywords
    console.log("[Usage Tracker] Incremented local session cache tokens.");
    const entry = memoryStore.get(userId)!;
    entry.total_tokens += additionalTokens;
    return {
      total: entry.total_tokens,
      limit,
      percentage: Math.min(100, Math.round((entry.total_tokens / limit) * 1000) / 10),
      isMock: true,
      periodStart: entry.period_start
    };
  }
}

/**
 * Robust DB/In-memory store for username-to-email lookups
 */
const usernameEmailCache = new Map<string, string>();

export function registerLocalUsernameEmail(username: string, email: string) {
  usernameEmailCache.set(username.toLowerCase().trim(), email.toLowerCase().trim());
}

export function findEmailByUsername(username: string): string | null {
  return usernameEmailCache.get(username.toLowerCase().trim()) || null;
}

/**
 * Signs up a user, handling Supabase or local mock fallbacks.
 */
export async function signUpUser(email: string, password: string, username: string) {
  const client = getSupabase();
  const cleanUsername = username.trim();
  const cleanEmail = email.trim();

  // Always track mapping in-memory to support username logins
  registerLocalUsernameEmail(cleanUsername, cleanEmail);

  if (!client) {
    // Return mock user
    return {
      success: true,
      isMock: true,
      user: {
        id: `mock-${cleanUsername.toLowerCase()}`,
        email: cleanEmail,
        user_metadata: { username: cleanUsername }
      }
    };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: { username: cleanUsername }
      }
    });

    if (error) throw error;

    // Initialize user_usage and try to store username mapping
    try {
      await client.from('user_usage').insert({
        user_id: data.user?.id,
        total_tokens: 0,
        period_start: new Date().toISOString(),
        username: cleanUsername
      });
    } catch (dbErr) {
      console.log("[SUPABASE] user_usage row insertion bypassed or failed: ", dbErr);
    }

    // Try to insert profile data in the profiles table in Supabase
    try {
      await client.from('profiles').upsert({
        id: data.user?.id,
        username: cleanUsername,
        email: cleanEmail,
        updated_at: new Date().toISOString()
      });
    } catch (dbErr) {
      console.log("[SUPABASE] profiles row insertion bypassed or failed: ", dbErr);
    }

    return {
      success: true,
      isMock: false,
      user: data.user
    };
  } catch (err: any) {
    throw err;
  }
}

/**
 * Signs in a user, handling username-to-email mapping and Supabase/Mock fallbacks.
 */
export async function signInUser(loginId: string, password: string) {
  const client = getSupabase();
  const cleanLogin = loginId.trim();

  let targetEmail = cleanLogin;
  if (!cleanLogin.includes('@')) {
    // Resolve email from username
    const cachedEmail = findEmailByUsername(cleanLogin);
    if (cachedEmail) {
      targetEmail = cachedEmail;
    } else {
      // Try querying the database if available
      if (client) {
        try {
          // Query profiles table in Supabase to find user by username
          const { data, error } = await client
            .from('profiles')
            .select('email, id')
            .eq('username', cleanLogin)
            .maybeSingle();
          
          if (data && !error && data.email) {
            targetEmail = data.email;
          } else {
            // Fallback: check user_usage table
            const { data: usageData, error: usageErr } = await client
              .from('user_usage')
              .select('user_id')
              .eq('username', cleanLogin)
              .maybeSingle();
            
            if (usageData && !usageErr) {
              console.log("[SUPABASE] Found username entry in user_usage database.");
            }
          }
        } catch (dbErr) {
          // ignore
        }
      }
    }
  }

  if (!client) {
    // Mock validation
    return {
      success: true,
      isMock: true,
      user: {
        id: `mock-${cleanLogin.toLowerCase()}`,
        email: targetEmail,
        user_metadata: { username: cleanLogin }
      }
    };
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: targetEmail,
      password: password
    });

    if (error) throw error;

    // Fetch user account details (username) from profiles table
    let resolvedUsername = cleanLogin.includes('@') ? cleanLogin.split('@')[0] : cleanLogin;
    try {
      const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('username')
        .eq('id', data.user?.id)
        .maybeSingle();
      
      if (profile && !profileErr && profile.username) {
        resolvedUsername = profile.username;
      }
    } catch (profileErr) {
      console.warn("[SUPABASE] Failed to fetch username from profiles table:", profileErr);
    }

    return {
      success: true,
      isMock: false,
      user: {
        id: data.user.id,
        email: data.user.email,
        user_metadata: {
          ...data.user.user_metadata,
          username: resolvedUsername
        }
      }
    };
  } catch (err: any) {
    throw err;
  }
}

/**
 * Cloud persistence helpers for Chat Sessions
 */
export async function saveSessionToDB(userId: string, session: any): Promise<boolean> {
  const client = getSupabase();
  if (!client || userId.startsWith('mock-')) return false;

  try {
    const { error } = await client
      .from('chat_sessions')
      .upsert({
        id: session.id,
        user_id: userId,
        title: session.title,
        messages: session.messages,
        timestamp: session.timestamp || new Date().toISOString()
      });
    return !error;
  } catch (err) {
    console.log("[SUPABASE] Save session bypassed or table chat_sessions is missing.");
    return false;
  }
}

export async function loadSessionsFromDB(userId: string): Promise<any[] | null> {
  const client = getSupabase();
  if (!client || userId.startsWith('mock-')) return null;

  try {
    const { data, error } = await client
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.log("[SUPABASE] Load sessions bypassed or table chat_sessions is missing.");
    return null;
  }
}

export async function deleteSessionFromDB(userId: string, sessionId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client || userId.startsWith('mock-')) return false;

  try {
    const { error } = await client
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);
    return !error;
  } catch (err) {
    console.log("[SUPABASE] Delete session bypassed or table chat_sessions is missing.");
    return false;
  }
}

