import { supabase } from "./supabase.js";

const STORAGE_KEY = "katie-workout-log";

// Try Supabase first, fall back to localStorage
export async function loadLog() {
  try {
    const { data, error } = await supabase
      .from("workout_log")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Convert rows to keyed object: { "push::incline-dumbbell-press": [entries...] }
    const log = {};
    for (const row of data || []) {
      if (!log[row.exercise_key]) log[row.exercise_key] = [];
      log[row.exercise_key].push({
        date: row.date,
        weight: row.weight,
        feedback: row.feedback,
      });
    }
    return log;
  } catch {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}

export async function saveLog(log) {
  // Always save to localStorage as backup
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {}

  // Try to sync to Supabase
  try {
    // Find the newest entry across all exercise keys to upsert
    const rows = [];
    for (const [exerciseKey, entries] of Object.entries(log)) {
      for (const entry of entries) {
        rows.push({
          exercise_key: exerciseKey,
          date: entry.date,
          weight: entry.weight,
          feedback: entry.feedback,
        });
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from("workout_log")
        .upsert(rows, { onConflict: "exercise_key,date" });
      if (error) throw error;
    }
  } catch (e) {
    console.warn("Supabase workout sync failed, using localStorage:", e.message);
  }
}
