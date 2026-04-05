import { supabase } from "./supabase.js";

export async function loadLog() {
  const { data, error } = await supabase
    .from("workout_log")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
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
}

export async function saveLog(log) {
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
}

export async function loadRunLog() {
  const { data, error } = await supabase
    .from("running_log")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveRun(run) {
  const { error } = await supabase
    .from("running_log")
    .upsert(run, { onConflict: "date" });
  if (error) throw error;
}
