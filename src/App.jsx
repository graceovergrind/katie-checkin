import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Area, AreaChart } from "recharts";
import { storage } from "./supabase.js";
import WorkoutCoach from "./WorkoutCoach.jsx";

const PIN = import.meta.env.VITE_APP_PIN || "1234";

const theme = {
  bg: "#1a1a2e", surface: "#16213e", surfaceLight: "#1c2a4a",
  accent: "#e94560", accentGlow: "rgba(233,69,96,0.3)",
  gold: "#f0c040", green: "#4ecca3", blue: "#6ec6e6",
  text: "#eee", textMuted: "#8892a8", textDim: "#5a6580",
  border: "rgba(255,255,255,0.06)",
};
const font = "'DM Sans', sans-serif";

// --- Helpers ---
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const formatDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const shortDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
const formatTime12 = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
};
const calcWindowMins = (first, last) => {
  if (!first || !last) return null;
  const [fh, fm] = first.split(":").map(Number);
  const [lh, lm] = last.split(":").map(Number);
  let mins = lh * 60 + lm - (fh * 60 + fm);
  if (mins < 0) mins += 1440;
  return mins;
};
const windowLabel = (mins) => {
  if (mins === null) return "";
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm > 0 ? `${hrs}h ${rm}m` : `${hrs}h`;
};
const windowColor = (mins) => {
  if (mins === null) return theme.textDim;
  if (mins <= 60) return theme.green;
  if (mins <= 480) return theme.blue;
  if (mins <= 600) return theme.gold;
  return theme.accent;
};
const moodToNum = { great: 4, good: 3, meh: 2, rough: 1 };
const energyToNum = { high: 4, good: 3, low: 2, crashed: 1 };
const stressToNum = { low: 1, medium: 2, high: 3, overwhelmed: 4 };

const emptyEntry = (date) => ({
  date: date || todayStr(), weight: "", steps: "", workout: "", workout_notes: "",
  first_food: "", last_food: "", meals: "", hunger: "satisfied", water: "okay",
  treats: "", window_kept: "yes", window_notes: "", stress: "medium",
  mood: "good", energy: "good", sleep: "", notes: "",
});

const pillConfigs = {
  mood: { options: ["great", "good", "meh", "rough"], colors: { great: theme.green, good: theme.blue, meh: theme.gold, rough: theme.accent } },
  energy: { options: ["high", "good", "low", "crashed"], colors: { high: theme.green, good: theme.blue, low: theme.gold, crashed: theme.accent } },
  hunger: { options: ["stuffed", "satisfied", "hungry", "starving"], colors: { stuffed: theme.gold, satisfied: theme.green, hungry: "#e6a06e", starving: theme.accent } },
  water: { options: ["great", "okay", "low", "terrible"], colors: { great: theme.green, okay: theme.blue, low: theme.gold, terrible: theme.accent } },
  stress: { options: ["low", "medium", "high", "overwhelmed"], colors: { low: theme.green, medium: theme.blue, high: theme.gold, overwhelmed: theme.accent } },
  window: { options: ["yes", "mostly", "stretched it", "no"], colors: { yes: theme.green, mostly: theme.blue, "stretched it": theme.gold, no: theme.accent } },
  workout: { options: ["Push", "Pull", "Legs", "Run/HIIT", "Walk", "Rest", "Other"], colors: {} },
};
const pillColor = (val, type) => pillConfigs[type]?.colors?.[val] || theme.textMuted;

// --- Reusable Components ---
const PillSelect = ({ options, value, onChange, type }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    {options.map((opt) => {
      const active = value === opt;
      const color = pillColor(opt, type);
      return (
        <button key={opt} onClick={() => onChange(opt)} style={{
          padding: "6px 14px", borderRadius: 20,
          border: `1.5px solid ${active ? color : theme.border}`,
          background: active ? `${color}22` : "transparent",
          color: active ? color : theme.textMuted,
          fontSize: 13, fontFamily: font, fontWeight: active ? 600 : 400, cursor: "pointer",
        }}>{opt}</button>
      );
    })}
  </div>
);

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: 20 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontFamily: font }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4, fontStyle: "italic" }}>{hint}</div>}
  </div>
);

const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: `1.5px solid ${theme.border}`, background: theme.bg,
  color: theme.text, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box",
};

const Input = ({ value, onChange, placeholder, type = "text", style = {} }) => (
  <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    style={{ ...inputStyle, ...style }}
    onFocus={(e) => (e.target.style.borderColor = theme.accent)}
    onBlur={(e) => (e.target.style.borderColor = theme.border)} />
);

const TextArea = ({ value, onChange, placeholder, rows = 2 }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ ...inputStyle, resize: "vertical" }}
    onFocus={(e) => (e.target.style.borderColor = theme.accent)}
    onBlur={(e) => (e.target.style.borderColor = theme.border)} />
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: theme.surfaceLight, borderRadius: 14, padding: 18, marginBottom: 16, border: `1px solid ${theme.border}`, ...style }}>{children}</div>
);

const CardTitle = ({ children, color = theme.accent }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>{children}</div>
);

const DetailSection = ({ label, text, color }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>{label}</div>
    <div style={{ fontSize: 13, color: color || theme.text, fontFamily: font, marginTop: 2, whiteSpace: "pre-wrap" }}>{text}</div>
  </div>
);

// --- PIN Lock Screen ---
const PinScreen = ({ onUnlock }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (pin === PIN) {
      sessionStorage.setItem("checkin-auth", "true");
      onUnlock();
    } else {
      setError(true);
      setPin("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 300, width: "100%" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800, color: theme.text, marginBottom: 24 }}>Katie's Check-In</div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Enter PIN"
          style={{
            ...inputStyle, textAlign: "center", fontSize: 24, letterSpacing: 8,
            borderColor: error ? theme.accent : theme.border, marginBottom: 16,
          }}
          autoFocus
        />
        <button onClick={handleSubmit} style={{
          width: "100%", padding: "14px", borderRadius: 12, border: "none",
          background: `linear-gradient(135deg, ${theme.accent}, #c73a52)`,
          color: "white", fontSize: 16, fontWeight: 700, fontFamily: font, cursor: "pointer",
        }}>Unlock</button>
        {error && <div style={{ color: theme.accent, fontSize: 13, marginTop: 12, fontFamily: font }}>Wrong PIN</div>}
      </div>
    </div>
  );
};

// --- History Card ---
const HistoryCard = ({ entry, onEdit, onDelete }) => {
  const [open, setOpen] = useState(false);
  const wColor = pillColor(entry.window_kept, "window");
  const wMins = calcWindowMins(entry.first_food, entry.last_food);
  return (
    <div onClick={() => setOpen(!open)} style={{
      background: theme.surface, borderRadius: 14, padding: "14px 18px",
      marginBottom: 10, border: `1px solid ${theme.border}`, cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 600, color: theme.text, fontFamily: font }}>{formatDate(entry.date)}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {entry.weight && <span style={{ fontSize: 12, color: theme.gold, fontFamily: font, fontWeight: 600 }}>{entry.weight} lbs</span>}
            {entry.steps && <span style={{ fontSize: 12, color: theme.green, fontFamily: font }}>{Number(entry.steps).toLocaleString()} steps</span>}
            {entry.workout && entry.workout !== "Rest" && <span style={{ fontSize: 12, color: theme.blue, fontFamily: font }}>{entry.workout}</span>}
            <span style={{ fontSize: 12, color: wColor, fontFamily: font }}>window: {entry.window_kept}</span>
            {wMins !== null && <span style={{ fontSize: 12, color: windowColor(wMins), fontFamily: font }}>({windowLabel(wMins)})</span>}
          </div>
        </div>
        <span style={{ color: theme.textDim, fontSize: 18, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[["Mood", entry.mood, "mood"], ["Energy", entry.energy, "energy"], ["Stress", entry.stress, "stress"],
              ["Hunger", entry.hunger, "hunger"], ["Water", entry.water, "water"]].map(([l, v, t]) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>{l}</div>
                <div style={{ fontSize: 13, color: pillColor(v, t), fontWeight: 600, fontFamily: font, marginTop: 2 }}>{v}</div>
              </div>
            ))}
            {entry.sleep && <div><div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>Sleep</div><div style={{ fontSize: 13, color: theme.text, fontFamily: font, marginTop: 2 }}>{entry.sleep} hrs</div></div>}
          </div>
          {(entry.first_food || entry.last_food) && <DetailSection label="Eating Window" text={`${entry.first_food ? formatTime12(entry.first_food) : "?"} — ${entry.last_food ? formatTime12(entry.last_food) : "?"}`} />}
          {entry.meals && <DetailSection label="Meals" text={entry.meals} />}
          {entry.treats && <DetailSection label="Treats" text={entry.treats} color={theme.gold} />}
          {entry.window_notes && <DetailSection label="Window Notes" text={entry.window_notes} />}
          {entry.workout_notes && <DetailSection label="Workout Notes" text={entry.workout_notes} />}
          {entry.notes && <DetailSection label="Notes" text={entry.notes} />}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={(e) => { e.stopPropagation(); onEdit(entry); }} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${theme.accent}`, background: "transparent", color: theme.accent, fontSize: 12, fontFamily: font, cursor: "pointer", fontWeight: 600 }}>Edit</button>
            <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this entry?")) onDelete(entry.date); }} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${theme.textDim}`, background: "transparent", color: theme.textDim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Insights ---
const StatBox = ({ label, value, sub, color = theme.text }) => (
  <div style={{ textAlign: "center", padding: "12px 8px" }}>
    <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "'Playfair Display', serif", lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 4, fontFamily: font }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2, fontFamily: font }}>{sub}</div>}
  </div>
);

const TT = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 12px", fontFamily: font, fontSize: 12 }}>
      <div style={{ color: theme.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.stroke || theme.text }}>
          {formatter ? formatter(p) : `${p.value}`}
        </div>
      ))}
    </div>
  );
};

const InsightsView = ({ entries }) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-14);
  const recent7 = sorted.slice(-7);

  if (entries.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 16, fontFamily: font, marginBottom: 8 }}>Not enough data yet</div>
        <div style={{ fontSize: 13, fontFamily: font }}>Log at least 2 days to start seeing insights.</div>
      </div>
    );
  }

  const weightData = sorted.filter((e) => e.weight).map((e) => ({ date: shortDate(e.date), weight: parseFloat(e.weight) }));
  const weights = weightData.map((d) => d.weight);
  const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const totalLost = currentWeight ? 217 - currentWeight : 0;
  const remaining = currentWeight ? currentWeight - 165 : 52;
  const pctComplete = totalLost > 0 ? Math.round((totalLost / 52) * 100) : 0;

  const stepsData = recent.filter((e) => e.steps).map((e) => ({ date: shortDate(e.date), steps: parseInt(e.steps) }));
  const avgSteps = stepsData.length > 0 ? Math.round(stepsData.reduce((s, d) => s + d.steps, 0) / stepsData.length) : 0;
  const daysAbove7k = stepsData.filter((d) => d.steps >= 7000).length;

  const windowData = recent.filter((e) => e.first_food && e.last_food).map((e) => {
    const mins = calcWindowMins(e.first_food, e.last_food);
    return { date: shortDate(e.date), mins, hours: mins ? +(mins / 60).toFixed(1) : 0 };
  });

  const wellbeingData = recent.map((e) => ({
    date: shortDate(e.date), mood: moodToNum[e.mood] || 0, energy: energyToNum[e.energy] || 0, stress: stressToNum[e.stress] || 0,
  }));

  const windowKeptCount = recent7.filter((e) => e.window_kept === "yes" || e.window_kept === "mostly").length;
  const waterGoodCount = recent7.filter((e) => e.water === "great" || e.water === "okay").length;
  const treatsCount = recent7.filter((e) => e.treats && e.treats.trim()).length;
  const workoutCount = recent7.filter((e) => e.workout && e.workout !== "Rest").length;

  let windowStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].window_kept === "yes" || sorted[i].window_kept === "mostly") windowStreak++;
    else break;
  }

  const wbLabels = { mood: ["", "rough", "meh", "good", "great"], energy: ["", "crashed", "low", "good", "high"], stress: ["", "low", "medium", "high", "overwhelmed"] };

  return (
    <div>
      <Card style={{ background: `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceLight})` }}>
        <CardTitle color={theme.gold}>Journey Progress</CardTitle>
        <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
          <StatBox label="Start" value="217" sub="Oct 1" color={theme.textMuted} />
          <StatBox label="Current" value={currentWeight || "—"} sub={totalLost > 0 ? `-${totalLost.toFixed(1)} lbs` : ""} color={theme.accent} />
          <StatBox label="Goal" value="165" sub={`${remaining.toFixed(1)} to go`} color={theme.green} />
        </div>
        <div style={{ position: "relative", height: 8, background: theme.bg, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, pctComplete))}%`, height: "100%", background: `linear-gradient(90deg, ${theme.accent}, ${theme.gold})`, borderRadius: 4, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: theme.textMuted, marginTop: 6, fontFamily: font }}>{pctComplete}% of the way there</div>
      </Card>

      {weightData.length >= 2 && (
        <Card>
          <CardTitle color={theme.gold}>Weight Trend</CardTitle>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weightData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={theme.accent} stopOpacity={0.3} /><stop offset="100%" stopColor={theme.accent} stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT formatter={(p) => `${p.value} lbs`} />} />
              <ReferenceLine y={165} stroke={theme.green} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="weight" stroke={theme.accent} strokeWidth={2.5} fill="url(#wg)" dot={{ r: 3, fill: theme.accent }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ textAlign: "right", fontSize: 10, color: theme.textDim, marginTop: 4 }}>— goal: 165 lbs</div>
        </Card>
      )}

      <Card>
        <CardTitle color={theme.blue}>Last 7 Days Scorecard</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { l: "Window Kept", v: `${windowKeptCount}/7`, c: windowKeptCount >= 5 ? theme.green : windowKeptCount >= 3 ? theme.gold : theme.accent },
            { l: "Water Good", v: `${waterGoodCount}/7`, c: waterGoodCount >= 5 ? theme.green : waterGoodCount >= 3 ? theme.gold : theme.accent },
            { l: "Workouts", v: `${workoutCount}`, c: workoutCount >= 3 ? theme.green : workoutCount >= 2 ? theme.gold : theme.accent },
            { l: "Treat Days", v: `${treatsCount}/7`, c: treatsCount <= 3 ? theme.green : treatsCount <= 5 ? theme.gold : theme.accent },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: theme.bg, borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "'Playfair Display', serif" }}>{v}</div>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 4, fontFamily: font }}>{l}</div>
            </div>
          ))}
        </div>
        {windowStreak > 1 && <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: theme.green, fontFamily: font }}>🔥 {windowStreak}-day window streak!</div>}
      </Card>

      {stepsData.length >= 2 && (
        <Card>
          <CardTitle color={theme.green}>Steps</CardTitle>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stepsData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT formatter={(p) => `${Number(p.value).toLocaleString()} steps`} />} />
              <ReferenceLine y={7000} stroke={theme.gold} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Bar dataKey="steps" radius={[4, 4, 0, 0]}>{stepsData.map((d, i) => <Cell key={i} fill={d.steps >= 7000 ? theme.green : theme.accent + "88"} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textDim, marginTop: 4, fontFamily: font }}>
            <span>avg: {avgSteps.toLocaleString()}/day</span>
            <span>{daysAbove7k}/{stepsData.length} days at 7K+</span>
          </div>
        </Card>
      )}

      {windowData.length >= 2 && (
        <Card>
          <CardTitle color={theme.gold}>Eating Window Duration</CardTitle>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={windowData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip content={<TT formatter={(p) => windowLabel(p.payload.mins)} />} />
              <ReferenceLine y={8} stroke={theme.gold} strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={1} stroke={theme.green} strokeDasharray="4 4" strokeOpacity={0.3} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>{windowData.map((d, i) => <Cell key={i} fill={windowColor(d.mins)} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme.textDim, marginTop: 4, fontFamily: font }}>
            <span style={{ color: theme.green }}>— OMAD</span>
            <span style={{ color: theme.gold }}>— 8hr max</span>
          </div>
        </Card>
      )}

      {wellbeingData.length >= 3 && (
        <Card>
          <CardTitle color={theme.blue}>Mood · Energy · Stress</CardTitle>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={wellbeingData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: theme.textDim }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={false} axisLine={false} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "8px 12px", fontFamily: font, fontSize: 12 }}>
                    <div style={{ color: theme.textMuted, marginBottom: 4 }}>{label}</div>
                    {payload.map((p, i) => <div key={i} style={{ color: p.stroke }}>{p.dataKey}: {wbLabels[p.dataKey]?.[p.value] || p.value}</div>)}
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="mood" stroke={theme.green} strokeWidth={2} dot={{ r: 2.5 }} />
              <Line type="monotone" dataKey="energy" stroke={theme.blue} strokeWidth={2} dot={{ r: 2.5 }} />
              <Line type="monotone" dataKey="stress" stroke={theme.accent} strokeWidth={2} dot={{ r: 2.5 }} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 10, color: theme.textDim, marginTop: 4, fontFamily: font }}>
            <span><span style={{ color: theme.green }}>●</span> mood</span>
            <span><span style={{ color: theme.blue }}>●</span> energy</span>
            <span><span style={{ color: theme.accent }}>●</span> stress</span>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Consistency (Last 21 Days)</CardTitle>
        {[
          { label: "Eating Window", field: "window_kept", good: ["yes", "mostly"] },
          { label: "Water Intake", field: "water", good: ["great", "okay"] },
        ].map(({ label, field, good }) => (
          <div key={field} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: font }}>{label}</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {sorted.slice(-21).map((e) => {
                const ok = good.includes(e[field]);
                return (
                  <div key={e.date} title={`${formatDate(e.date)}: ${e[field]}`} style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: ok ? theme.green + "44" : theme.accent + "44",
                    border: `1.5px solid ${ok ? theme.green : theme.accent}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: ok ? theme.green : theme.accent, fontWeight: 700,
                  }}>{ok ? "✓" : "✗"}</div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: font }}>Steps (7K+)</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {sorted.slice(-21).map((e) => {
              const steps = e.steps ? parseInt(e.steps) : 0;
              const ok = steps >= 7000;
              const has = !!e.steps;
              return (
                <div key={e.date} title={`${formatDate(e.date)}: ${has ? steps.toLocaleString() : "no data"}`} style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: has ? (ok ? theme.green + "44" : theme.accent + "44") : theme.bg,
                  border: `1.5px solid ${has ? (ok ? theme.green : theme.accent) : theme.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: has ? (ok ? theme.green : theme.accent) : theme.textDim, fontWeight: 700,
                }}>{has ? (ok ? "✓" : "✗") : "·"}</div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Report Generator ---
function generateReport(entries) {
  if (entries.length === 0) return "No entries yet.";
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  let r = `KATIE'S CHECK-IN DATA — Last ${recent.length} entries\n`;
  r += `Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`;
  r += "══════════════════════════════════════════════════\n\n";
  const weights = recent.filter((e) => e.weight).map((e) => ({ date: e.date, w: parseFloat(e.weight) }));
  if (weights.length > 0) {
    r += `WEIGHT: ${weights[weights.length - 1].w} lbs (latest)`;
    if (weights.length > 1) { const diff = weights[weights.length - 1].w - weights[0].w; r += ` | ${diff > 0 ? "+" : ""}${diff.toFixed(1)} lbs over this period`; }
    r += "\n\n";
  }
  recent.forEach((e) => {
    r += `--- ${formatDate(e.date)} ---\n`;
    if (e.weight) r += `Weight: ${e.weight} lbs\n`;
    if (e.steps) r += `Steps: ${Number(e.steps).toLocaleString()}\n`;
    if (e.workout) r += `Workout: ${e.workout}${e.workout_notes ? " — " + e.workout_notes : ""}\n`;
    if (e.sleep) r += `Sleep: ${e.sleep} hrs\n`;
    if (e.first_food || e.last_food) r += `Eating window: ${e.first_food ? formatTime12(e.first_food) : "?"} — ${e.last_food ? formatTime12(e.last_food) : "?"}\n`;
    r += `Mood: ${e.mood} | Energy: ${e.energy} | Stress: ${e.stress}\n`;
    r += `Hunger at window close: ${e.hunger} | Water: ${e.water}\n`;
    r += `Eating window kept: ${e.window_kept}`;
    if (e.window_notes) r += ` — ${e.window_notes}`;
    r += "\n";
    if (e.meals) r += `Meals: ${e.meals}\n`;
    if (e.treats) r += `Treats: ${e.treats}\n`;
    if (e.notes) r += `Notes: ${e.notes}\n`;
    r += "\n";
  });
  r += "══════════════════════════════════════════════════\n";
  r += "PATTERNS FOR COACHING:\n";
  const wi = recent.filter((e) => e.window_kept === "stretched it" || e.window_kept === "no");
  if (wi.length) r += `- Window issues on ${wi.length}/${recent.length} days\n`;
  const hd = recent.filter((e) => e.hunger === "hungry" || e.hunger === "starving");
  if (hd.length) r += `- Hungry at window close on ${hd.length}/${recent.length} days\n`;
  const lw = recent.filter((e) => e.water === "low" || e.water === "terrible");
  if (lw.length) r += `- Low water intake on ${lw.length}/${recent.length} days\n`;
  const le = recent.filter((e) => e.energy === "low" || e.energy === "crashed");
  if (le.length) r += `- Low energy on ${le.length}/${recent.length} days\n`;
  const sb = recent.filter((e) => e.steps && parseInt(e.steps) < 7000);
  if (sb.length) r += `- Steps below 7K on ${sb.length}/${recent.length} days\n`;
  const td = recent.filter((e) => e.treats && e.treats.trim());
  if (td.length) r += `- Treats logged on ${td.length}/${recent.length} days\n`;
  const lngW = recent.filter((e) => { const m = calcWindowMins(e.first_food, e.last_food); return m !== null && m > 480; });
  if (lngW.length) r += `- Eating window over 8 hours on ${lngW.length}/${recent.length} days\n`;
  return r;
}

// --- Main App ---
export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("checkin-auth") === "true");
  const [entries, setEntries] = useState([]);
  const [current, setCurrent] = useState(emptyEntry());
  const [view, setView] = useState("form");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const loadEntries = useCallback(async () => {
    try {
      const data = await storage.getEntries();
      setEntries(data);
      const today = todayStr();
      const todayEntry = data.find((e) => e.date === today);
      if (todayEntry) { setCurrent(todayEntry); setEditing(true); }
      else { setCurrent(emptyEntry(today)); }
    } catch (e) {
      console.error("Load error:", e);
      setError("Failed to load data. Check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadEntries();
    else setLoading(false);
  }, [authed, loadEntries]);

  const handleSave = async () => {
    try {
      await storage.saveEntry(current);
      setSaveMsg("Saved!");
      setEditing(true);
      await loadEntries();
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      console.error("Save error:", e);
      setSaveMsg("Error saving!");
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const handleDelete = async (date) => {
    try {
      await storage.deleteEntry(date);
      await loadEntries();
      if (current.date === date) { setCurrent(emptyEntry()); setEditing(false); }
    } catch (e) { console.error("Delete error:", e); }
  };

  const handleEdit = (entry) => { setCurrent({ ...entry }); setEditing(true); setView("form"); };
  const update = (field) => (val) => setCurrent((prev) => ({ ...prev, [field]: val }));

  const handleCopy = () => {
    const report = generateReport(entries);
    const fallbackCopy = () => {
      const ta = document.createElement("textarea");
      ta.value = report;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, report.length);
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(report).catch(fallbackCopy);
    } else { fallbackCopy(); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!authed) return <PinScreen onUnlock={() => setAuthed(true)} />;

  const wMins = calcWindowMins(current.first_food, current.last_food);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: theme.textMuted, fontFamily: font, fontSize: 16 }}>Loading...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: theme.accent, fontFamily: font, fontSize: 15, marginBottom: 16 }}>{error}</div>
        <button onClick={() => { setError(null); setLoading(true); loadEntries(); }} style={{
          padding: "12px 24px", borderRadius: 10, border: "none",
          background: theme.accent, color: "white", fontFamily: font, fontSize: 14, cursor: "pointer",
        }}>Retry</button>
      </div>
    </div>
  );

  const navItems = [["form", "Today"], ["workout", "Workout"], ["insights", "Insights"], ["history", `History${entries.length ? ` (${entries.length})` : ""}`], ["export", "Coach Me"]];

  if (view === "workout") {
    return <WorkoutCoach onBack={() => setView("form")} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, fontFamily: font }}>
      <div style={{ background: `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceLight})`, padding: "28px 24px 20px", borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 11, color: theme.accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Daily Check-In</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 800, color: theme.text, lineHeight: 1.1 }}>How's today<br />going, Katie?</div>
      </div>

      <div style={{ display: "flex", background: theme.surface, borderBottom: `1px solid ${theme.border}`, overflowX: "auto" }}>
        {navItems.map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{
            flex: 1, padding: "12px 4px", background: "transparent", border: "none", whiteSpace: "nowrap",
            borderBottom: view === key ? `2px solid ${theme.accent}` : "2px solid transparent",
            color: view === key ? theme.accent : theme.textMuted,
            fontSize: 12, fontWeight: view === key ? 700 : 400, fontFamily: font, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "20px 20px 100px", maxWidth: 480, margin: "0 auto" }}>
        {view === "form" && (
          <div>
            <Field label="Date"><Input type="date" value={current.date} onChange={update("date")} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Weight (lbs)" hint="After OMAD day preferred"><Input type="number" value={current.weight} onChange={update("weight")} placeholder="e.g. 215" /></Field>
              <Field label="Steps"><Input type="number" value={current.steps} onChange={update("steps")} placeholder="e.g. 8200" /></Field>
            </div>
            <Field label="Workout"><PillSelect options={pillConfigs.workout.options} value={current.workout} onChange={update("workout")} type="workout" /></Field>
            {current.workout && current.workout !== "Rest" && (
              <Field label="Workout Notes" hint="Exercises, weights, how it felt"><TextArea value={current.workout_notes} onChange={update("workout_notes")} placeholder="e.g. bench 85x8, felt strong" /></Field>
            )}
            <Field label="Sleep (hours)"><Input type="number" value={current.sleep} onChange={update("sleep")} placeholder="e.g. 7" style={{ width: 120 }} /></Field>
            <Card>
              <CardTitle>How are you feeling?</CardTitle>
              <Field label="Mood"><PillSelect options={pillConfigs.mood.options} value={current.mood} onChange={update("mood")} type="mood" /></Field>
              <Field label="Energy"><PillSelect options={pillConfigs.energy.options} value={current.energy} onChange={update("energy")} type="energy" /></Field>
              <Field label="Stress"><PillSelect options={pillConfigs.stress.options} value={current.stress} onChange={update("stress")} type="stress" /></Field>
            </Card>
            <Card>
              <CardTitle color={theme.gold}>Food & Fasting</CardTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="First food"><Input type="time" value={current.first_food} onChange={update("first_food")} /></Field>
                <Field label="Last food"><Input type="time" value={current.last_food} onChange={update("last_food")} /></Field>
              </div>
              {wMins !== null && <div style={{ fontSize: 12, color: windowColor(wMins), fontStyle: "italic", marginTop: -12, marginBottom: 16 }}>Eating window: {windowLabel(wMins)}</div>}
              <Field label="What did you eat?" hint="Main meals — quick notes are fine"><TextArea value={current.meals} onChange={update("meals")} placeholder="e.g. Break-the-fast plate, chicken adobo with rice" rows={3} /></Field>
              <Field label="Treats"><TextArea value={current.treats} onChange={update("treats")} placeholder="e.g. chocolate chips, cookie at church" rows={1} /></Field>
              <Field label="Hunger at window close"><PillSelect options={pillConfigs.hunger.options} value={current.hunger} onChange={update("hunger")} type="hunger" /></Field>
              <Field label="Eating window kept?"><PillSelect options={pillConfigs.window.options} value={current.window_kept} onChange={update("window_kept")} type="window" /></Field>
              {(current.window_kept === "stretched it" || current.window_kept === "no") && (
                <Field label="What happened?"><TextArea value={current.window_notes} onChange={update("window_notes")} placeholder="e.g. was hungry at 7:30, had crackers" rows={2} /></Field>
              )}
              <Field label="Water intake"><PillSelect options={pillConfigs.water.options} value={current.water} onChange={update("water")} type="water" /></Field>
            </Card>
            <Field label="Anything else on your mind?"><TextArea value={current.notes} onChange={update("notes")} placeholder="Free space — wins, struggles, questions for Claude" rows={3} /></Field>
            <button onClick={handleSave} style={{
              width: "100%", padding: "16px 20px", borderRadius: 14, border: "none",
              background: saveMsg === "Error saving!" ? theme.accent : saveMsg ? theme.green : `linear-gradient(135deg, ${theme.accent}, #c73a52)`,
              color: "white", fontSize: 16, fontWeight: 700, fontFamily: font, cursor: "pointer",
              boxShadow: saveMsg ? "none" : `0 4px 20px ${theme.accentGlow}`, marginBottom: 16,
            }}>{saveMsg || (editing ? "Update Entry" : "Save Entry")}</button>
          </div>
        )}

        {view === "insights" && <InsightsView entries={entries} />}

        {view === "history" && (
          <div>
            {entries.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 15 }}>No entries yet. Go log today!</div>
              </div>
            ) : entries.map((entry) => (
              <HistoryCard key={entry.date} entry={entry} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {view === "export" && (
          <div>
            <Card>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 8 }}>Ready for coaching?</div>
              <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12, lineHeight: 1.5 }}>Copy your last 7 days of data and paste it into our chat. I'll read the patterns and coach you on what I see.</div>
              <button onClick={handleCopy} style={{
                width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                background: copied ? theme.green : `linear-gradient(135deg, ${theme.accent}, #c73a52)`,
                color: "white", fontSize: 15, fontWeight: 700, fontFamily: font, cursor: "pointer",
                boxShadow: copied ? "none" : `0 4px 20px ${theme.accentGlow}`,
              }}>{copied ? "✓ Copied! Paste it to Claude" : "Copy Report for Claude"}</button>
            </Card>
            <Card style={{ background: theme.surface }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>How to use</div>
              <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.7 }}>
                1. Log your check-in each day<br />
                2. Check Insights to see your own trends<br />
                3. Tap "Coach Me" and copy the report<br />
                4. Paste it into our chat for coaching
              </div>
            </Card>
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button onClick={async () => {
                if (confirm("This will delete ALL entries. Are you sure?")) {
                  try { await storage.deleteAll(); } catch (e) {}
                  setEntries([]); setCurrent(emptyEntry()); setEditing(false);
                }
              }} style={{
                padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.textDim}`,
                background: "transparent", color: theme.textDim, fontSize: 12, fontFamily: font, cursor: "pointer",
              }}>Reset All Data</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
