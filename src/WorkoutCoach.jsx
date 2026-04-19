import { useState, useEffect, useCallback } from "react";
import { loadLog, saveLog, loadRunLog, saveRun } from "./workoutStorage.js";

function getExerciseKey(dayKey, exerciseName) {
  return `${dayKey}::${exerciseName.toLowerCase().replace(/\s+/g, "-")}`;
}

// Parse seconds from reps like "30 sec", "30-45 sec", "20-30 sec each side"
function parseTimedSeconds(reps) {
  const match = reps.match(/(\d+)(?:-(\d+))?\s*sec/i);
  if (!match) return null;
  // Use the higher end of ranges (e.g. "30-45 sec" -> 45)
  return parseInt(match[2] || match[1]);
}

// Generate an alarm beep using Web Audio API
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playBeep = (time, freq, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "square";
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + dur);
      osc.start(time);
      osc.stop(time + dur);
    };
    // Three ascending beeps
    playBeep(ctx.currentTime, 660, 0.15);
    playBeep(ctx.currentTime + 0.2, 880, 0.15);
    playBeep(ctx.currentTime + 0.4, 1100, 0.25);
  } catch (e) {
    // Audio not available — silent fallback
  }
}

function getRecommendation(history) {
  if (!history || history.length === 0) return null;
  const recent = history.slice(-3);
  const lastEntry = recent[recent.length - 1];
  if (lastEntry.feedback === "heavy") {
    return { type: "drop", message: "Drop weight next time", color: "#E85D4A" };
  }
  if (lastEntry.feedback === "light") {
    return { type: "increase", message: "Go heavier next session", color: "#22C55E" };
  }
  const goodStreak = recent.filter(e => e.feedback === "good").length;
  if (goodStreak >= 2 && recent.length >= 2) {
    const sameWeight = recent.every(e => e.weight === lastEntry.weight);
    if (sameWeight) {
      return { type: "increase", message: `${lastEntry.weight} lbs for ${goodStreak} sessions \u2014 time to go up`, color: "#22C55E" };
    }
  }
  return null;
}

function getLastWeight(history) {
  if (!history || history.length === 0) return null;
  return history[history.length - 1].weight;
}

const WORKOUTS = {
  push: {
    name: "Push Day", emoji: "\ud83d\udcaa", color: "#E85D4A",
    warmup: {
      title: "Warm-Up", duration: "5 min",
      exercises: [
        { name: "Band Pull-Aparts", reps: "2\u00d715", coaching: "Squeeze your shoulder blades together at the end of each rep. This is corrective work for your shoulder pain \u2014 treat it like medicine.", trackWeight: false },
        { name: "Shoulder Dislocates", reps: "2\u00d715", coaching: "Use a band or towel. Go slow. Wider grip = easier. Narrow as mobility allows.", trackWeight: false },
        { name: "Arm Circles", reps: "15 each direction", coaching: "Forward then back. Start small, go bigger.", trackWeight: false },
        { name: "Push-Ups", reps: "10 reps", coaching: "Knees or toes \u2014 just get blood into your chest and shoulders. Don\u2019t grind these.", trackWeight: false }
      ]
    },
    circuits: [
      {
        name: "Circuit 1 \u2014 Chest & Shoulders", rounds: 3,
        exercises: [
          { name: "Incline Dumbbell Press", reps: "10 reps", coaching: "Set the bench to about 30-45\u00b0. Incline is better for your posture than flat \u2014 it shifts load off your anterior delts. Control the descent.", trackWeight: true, unit: "lbs each" },
          { name: "Lateral Raises", reps: "12 reps", coaching: "Light weight, slow reps. Lead with your elbows, not your hands. Stop at shoulder height. Ego-check the weight \u2014 these should burn, not swing.", trackWeight: true, unit: "lbs each" }
        ]
      },
      {
        name: "Circuit 2 \u2014 Chest & Shoulders", rounds: 3,
        exercises: [
          { name: "Dumbbell Flyes", reps: "12 reps", coaching: "Slow controlled stretch at the bottom \u2014 this LENGTHENS your tight pecs rather than shortening them. Think about opening your chest. This is therapeutic for your shoulder pain.", trackWeight: true, unit: "lbs each" },
          { name: "Overhead Press", reps: "8 reps", coaching: "Standing or seated. Brace your core so you don\u2019t arch your lower back. Full lockout at the top.", trackWeight: true, unit: "lbs each" }
        ]
      },
      {
        name: "Circuit 3 \u2014 Triceps", rounds: 3,
        exercises: [
          { name: "Cable Tricep Pushdowns", reps: "12 reps", coaching: "Elbows pinned to your sides. Squeeze at the bottom. Don\u2019t let your shoulders round forward \u2014 stay tall.", trackWeight: true, unit: "lbs" },
          { name: "Skull Crushers", reps: "10 reps", coaching: "Lower to your forehead, not behind your head. Keep your elbows pointing at the ceiling, not flaring out.", trackWeight: true, unit: "lbs each" }
        ]
      }
    ],
    abs: {
      title: "Abs", rounds: 2,
      exercises: [
        { name: "Dead Bugs", reps: "10 each side", coaching: "Press your lower back into the floor the ENTIRE time. The moment your back arches, stop. Quality over quantity.", trackWeight: false },
        { name: "Plank Hold", reps: "30-45 sec", coaching: "Squeeze your glutes and brace like someone\u2019s about to poke your stomach. Don\u2019t sag or pike.", trackWeight: false }
      ]
    },
    cooldown: {
      title: "Cool-Down", duration: "5 min",
      exercises: [
        { name: "Doorway Pec Stretch", reps: "30 sec each side", coaching: "NON-NEGOTIABLE. This directly counteracts what your chest weight does to your shoulders all day. Elbow at 90\u00b0, lean through. Breathe into the stretch.", trackWeight: false },
        { name: "Cross-Body Shoulder Stretch", reps: "30 sec each side", coaching: "Pull your arm across your chest. Don\u2019t shrug your shoulder up \u2014 keep it down.", trackWeight: false },
        { name: "Overhead Tricep Stretch", reps: "30 sec each side", coaching: "Reach behind your head, use the other hand to gently press the elbow back.", trackWeight: false },
        { name: "Child\u2019s Pose", reps: "45 sec", coaching: "Sink your hips back and reach your arms forward. Let your chest melt toward the floor. Breathe.", trackWeight: false },
        { name: "Deep Breathing", reps: "5 slow breaths", coaching: "4 counts in, 6 counts out. You\u2019re done. Nice work.", trackWeight: false }
      ]
    }
  },
  pull: {
    name: "Pull Day", emoji: "\ud83d\udd25", color: "#3B82C4",
    warmup: {
      title: "Warm-Up", duration: "5 min",
      exercises: [
        { name: "Band Pull-Aparts", reps: "2\u00d715", coaching: "Same as always \u2014 squeeze those shoulder blades. This is your daily corrective.", trackWeight: false },
        { name: "Shoulder Dislocates", reps: "2\u00d715", coaching: "Slow and controlled. This opens up the front of your shoulders.", trackWeight: false },
        { name: "Cat-Cow Stretches", reps: "10 reps", coaching: "On all fours. Arch and round your back slowly. Match it to your breath \u2014 inhale arch, exhale round.", trackWeight: false },
        { name: "Light Dumbbell Halos", reps: "10 each direction", coaching: "Circle a light dumbbell around your head. Keeps your shoulders mobile and warm.", trackWeight: false }
      ]
    },
    circuits: [
      {
        name: "Circuit 1 \u2014 Upper Back Priority", rounds: 3,
        exercises: [
          { name: "Cable Face Pulls", reps: "15 reps", coaching: "YOUR MOST IMPORTANT EXERCISE. Pull to your face, hands ending beside your ears. Squeeze your shoulder blades and hold for a beat. This builds the muscles that fight your shoulder pain.", trackWeight: true, unit: "lbs" },
          { name: "Barbell Rows", reps: "10 reps", coaching: "Hinge forward about 45\u00b0. Pull to your belly button, not your chest. Squeeze at the top. Keep your core tight so your lower back stays neutral.", trackWeight: true, unit: "lbs total" }
        ]
      },
      {
        name: "Circuit 2 \u2014 Lats & Upper Back", rounds: 3,
        exercises: [
          { name: "Single-Arm Dumbbell Rows", reps: "10 each side", coaching: "One hand and knee on the bench. Pull to your hip, not your armpit. Think about driving your elbow to the ceiling.", trackWeight: true, unit: "lbs" },
          { name: "Cable Straight-Arm Pulldowns", reps: "12 reps", coaching: "Arms nearly straight, slight elbow bend. Pull the bar to your thighs in an arc. This targets lats without the armpit compression that can bother you.", trackWeight: true, unit: "lbs" }
        ]
      },
      {
        name: "Circuit 3 \u2014 Rear Delts & Biceps", rounds: 3,
        exercises: [
          { name: "Bent-Over Reverse DB Flyes", reps: "15 reps", coaching: "Hinge at the hips, let the dumbbells hang. Raise out to the sides squeezing your shoulder blades. Light weight \u2014 these are about the squeeze, not the load.", trackWeight: true, unit: "lbs each" },
          { name: "Dumbbell Curls", reps: "12 reps", coaching: "Standing, palms forward. Don\u2019t swing. Control the descent \u2014 the lowering phase builds just as much muscle.", trackWeight: true, unit: "lbs each" }
        ]
      }
    ],
    abs: {
      title: "Abs", rounds: 2,
      exercises: [
        { name: "Cable Crunches", reps: "15 reps", coaching: "Kneel under the high cable, rope behind your head. Crunch down by flexing your spine \u2014 don\u2019t just bend at the hips. Think about bringing your ribs to your pelvis.", trackWeight: true, unit: "lbs" },
        { name: "Bird Dogs", reps: "10 each side", coaching: "On all fours \u2014 extend opposite arm and leg. Pause for 2 seconds at full extension. Don\u2019t rotate your hips. This builds core stability for your running.", trackWeight: false }
      ]
    },
    cooldown: {
      title: "Cool-Down", duration: "5 min",
      exercises: [
        { name: "Lat Stretch", reps: "30 sec each side", coaching: "Grab a doorframe overhead and lean away. You should feel this down the side of your back and into that armpit area that bothers you.", trackWeight: false },
        { name: "Thread the Needle", reps: "30 sec each side", coaching: "On all fours, reach one arm under your body and rotate. This will feel amazing in your upper back.", trackWeight: false },
        { name: "Chest Opener", reps: "30 sec", coaching: "Clasp hands behind your back and lift. Opens up the front of your shoulders.", trackWeight: false },
        { name: "Neck Rolls", reps: "30 sec each direction", coaching: "Slow and gentle. Don\u2019t force range of motion \u2014 just let gravity do the work.", trackWeight: false },
        { name: "Deep Breathing", reps: "5 slow breaths", coaching: "4 counts in, 6 counts out. Pull day done.", trackWeight: false }
      ]
    }
  },
  legs: {
    name: "Leg Day", emoji: "\ud83c\udf51", color: "#7C3AED",
    warmup: {
      title: "Warm-Up", duration: "5 min",
      exercises: [
        { name: "Bodyweight Glute Bridges", reps: "2\u00d715", coaching: "Squeeze at the top for 2 seconds. Wake those glutes up \u2014 they need to fire today.", trackWeight: false },
        { name: "Standing Hip Circles", reps: "10 each direction each leg", coaching: "Big circles. Hold something for balance. Open up those hip joints.", trackWeight: false },
        { name: "Goblet Squat Hold", reps: "30 sec", coaching: "Bodyweight only. Sit in the bottom of a squat and hang out. Use your elbows to push your knees apart.", trackWeight: false },
        { name: "Lateral Band Walks", reps: "10 each direction", coaching: "If you have a band. Skip if not \u2014 the bridges and hip circles are enough.", trackWeight: false }
      ]
    },
    circuits: [
      {
        name: "Circuit 1 \u2014 Glute Power", rounds: 3,
        exercises: [
          { name: "Dumbbell Hip Thrusts", reps: "10 reps", coaching: "YOUR STAR MOVEMENT. Back against the bench, heavy dumbbell on your lap at the hip crease. Drive up, squeeze glutes HARD at the top for 2 sec. Load these as heavy as you can over time.", trackWeight: true, unit: "lbs" },
          { name: "Goblet Squats", reps: "10 reps", coaching: "Hold a dumbbell at your chest. Only go as deep as your knees feel comfortable. Push your knees out over your toes.", trackWeight: true, unit: "lbs" }
        ]
      },
      {
        name: "Circuit 2 \u2014 Posterior Chain", rounds: 3,
        exercises: [
          { name: "Romanian Deadlifts", reps: "10 reps", coaching: "Dumbbells or barbell. Hinge at the hips, slight knee bend. Feel the stretch in your hamstrings. Keep the weights close to your legs.", trackWeight: true, unit: "lbs each" },
          { name: "Sumo Dumbbell Deadlifts", reps: "10 reps", coaching: "Wide stance, toes out, one heavy dumbbell at center. This hits your glutes from a different angle than the RDLs. Drive through your heels.", trackWeight: true, unit: "lbs" }
        ]
      },
      {
        name: "Circuit 3 \u2014 Glute Isolation", rounds: 3,
        exercises: [
          { name: "Single-Leg Glute Bridges", reps: "12 each side", coaching: "LEFT SIDE FIRST \u2014 give it the extra attention since that\u2019s where your pain is. If the left feels weaker, add an extra set on that side. Hold the squeeze at the top.", trackWeight: false },
          { name: "Glute Back Extensions Off Bench", reps: "12 reps", coaching: "Hang off the end of the bench face down. Round your upper back slightly and squeeze your glutes hard at the top. Hold a dumbbell at your chest to add load.", trackWeight: true, unit: "lbs" }
        ]
      }
    ],
    abs: {
      title: "Abs", rounds: 2,
      exercises: [
        { name: "Bicycle Crunches", reps: "20 total (10 each side)", coaching: "Slow and controlled \u2014 don\u2019t race through these. Touch your elbow toward opposite knee. The rotation builds oblique strength.", trackWeight: false },
        { name: "Side Plank", reps: "20-30 sec each side", coaching: "Stack your feet or stagger them. Squeeze your obliques and glutes. Don\u2019t let your hips sag.", trackWeight: false }
      ]
    },
    cooldown: {
      title: "Cool-Down", duration: "5 min",
      exercises: [
        { name: "Figure-Four Stretch", reps: "45 sec each side", coaching: "Focus on the LEFT SIDE. Lying or seated \u2014 ankle on opposite knee, pull the bottom leg toward you.", trackWeight: false },
        { name: "Kneeling Hip Flexor Stretch", reps: "30 sec each side", coaching: "Back knee down, front foot forward. Push your hips forward gently. Tight hip flexors can contribute to your glute issues.", trackWeight: false },
        { name: "Seated Hamstring Stretch", reps: "30 sec each side", coaching: "One leg extended, reach toward your toes. Don\u2019t round your back \u2014 hinge forward.", trackWeight: false },
        { name: "Supine Spinal Twist", reps: "30 sec each side", coaching: "Lying on your back, drop your knees to one side. Let gravity do the work. Breathe.", trackWeight: false },
        { name: "Deep Breathing", reps: "5 slow breaths", coaching: "4 counts in, 6 counts out. Leg day complete.", trackWeight: false }
      ]
    }
  }
};

const RestTimer = ({ onComplete }) => {
  const [seconds, setSeconds] = useState(75);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running || seconds <= 0) {
      if (seconds <= 0) { playAlarm(); onComplete?.(); }
      return;
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, running, onComplete]);

  return (
    <div style={{
      textAlign: "center", padding: "32px 20px",
      background: "rgba(255,255,255,0.03)", borderRadius: 16, margin: "12px 20px"
    }}>
      <div style={{ fontSize: 13, letterSpacing: 2, color: "#888", marginBottom: 8, textTransform: "uppercase", fontFamily: "var(--mono)" }}>Rest</div>
      <div style={{
        fontSize: 64, fontWeight: 700, fontFamily: "var(--mono)",
        color: seconds <= 10 ? "#E85D4A" : "#fff", transition: "color 0.3s"
      }}>
        {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
        <button onClick={() => setRunning(!running)} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          padding: "10px 24px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "var(--mono)"
        }}>{running ? "Pause" : "Resume"}</button>
        <button onClick={() => onComplete?.()} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#888",
          padding: "10px 24px", borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "var(--mono)"
        }}>Skip</button>
      </div>
    </div>
  );
};

const ExerciseTimer = ({ seconds: initialSeconds, label, accentColor, onDone }) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running || seconds <= 0) {
      if (running && seconds <= 0) { playAlarm(); setFinished(true); setRunning(false); }
      return;
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, running]);

  const handleReset = () => { setSeconds(initialSeconds); setFinished(false); setRunning(false); };

  return (
    <div style={{
      marginTop: 10, padding: "16px 12px", background: finished ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
      borderRadius: 10, textAlign: "center"
    }}>
      {label && <div style={{ fontSize: 11, color: "#888", fontFamily: "var(--mono)", marginBottom: 6 }}>{label}</div>}
      <div style={{
        fontSize: 40, fontWeight: 700, fontFamily: "var(--mono)",
        color: finished ? "#22C55E" : seconds <= 5 && running ? "#E85D4A" : "#fff",
        transition: "color 0.3s"
      }}>
        {finished ? "\u2713" : `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
        {!finished ? (
          <button onClick={() => setRunning(!running)} style={{
            background: running ? "rgba(255,255,255,0.1)" : accentColor,
            border: "none", color: "#fff",
            padding: "8px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
          }}>{running ? "Pause" : "Start"}</button>
        ) : (
          <button onClick={handleReset} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#888",
            padding: "8px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
          }}>Reset</button>
        )}
        {onDone && finished && (
          <button onClick={onDone} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#888",
            padding: "8px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
          }}>Done</button>
        )}
      </div>
    </div>
  );
};

const WeightInput = ({ exerciseKey, log, onLog, accentColor, unit }) => {
  const history = log[exerciseKey] || [];
  const lastWeight = getLastWeight(history);
  const rec = getRecommendation(history);
  const [weight, setWeight] = useState(lastWeight !== null ? String(lastWeight) : "");
  const [feedback, setFeedback] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!weight || !feedback) return;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const entry = { date, weight: parseFloat(weight), feedback };
    const newHistory = [...history.filter(e => e.date !== date), entry];
    const updated = { ...log, [exerciseKey]: newHistory };
    await saveLog(updated);
    onLog(updated);
    setSaved(true);
  };

  if (saved) {
    return (
      <div style={{
        marginTop: 10, padding: "10px 12px", background: "rgba(34,197,94,0.08)",
        borderRadius: 8, fontSize: 13, color: "#22C55E", fontFamily: "var(--mono)", textAlign: "center"
      }}>
        Logged {weight} {unit} {"\u2014"} {feedback === "light" ? "too light" : feedback === "heavy" ? "too heavy" : "good weight"}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 10, padding: "12px", background: "rgba(255,255,255,0.03)",
      borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)"
    }}>
      {rec && (
        <div style={{
          fontSize: 12, color: rec.color, fontFamily: "var(--mono)",
          padding: "6px 10px", background: `${rec.color}15`,
          borderRadius: 6, marginBottom: 10, lineHeight: 1.4
        }}>
          {rec.type === "increase" ? "\u2191" : "\u2193"} {rec.message}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          placeholder={lastWeight ? String(lastWeight) : "0"}
          style={{
            width: 72, padding: "8px 10px", background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
            color: "#fff", fontSize: 16, fontFamily: "var(--mono)",
            outline: "none", textAlign: "center"
          }}
        />
        <span style={{ fontSize: 13, color: "#666", fontFamily: "var(--mono)" }}>{unit}</span>
        {lastWeight !== null && (
          <span style={{ fontSize: 12, color: "#444", fontFamily: "var(--mono)", marginLeft: "auto" }}>
            last: {lastWeight}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[
          { key: "light", label: "Too Light", sym: "\ud83e\udeb6" },
          { key: "good", label: "Good", sym: "\u2713" },
          { key: "heavy", label: "Too Heavy", sym: "\ud83c\udfcb" }
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFeedback(f.key)}
            style={{
              flex: 1, padding: "10px 4px", borderRadius: 8, fontSize: 12,
              fontFamily: "var(--body)", cursor: "pointer", border: "none",
              background: feedback === f.key
                ? f.key === "light" ? "rgba(34,197,94,0.2)" : f.key === "heavy" ? "rgba(232,93,74,0.2)" : `${accentColor}30`
                : "rgba(255,255,255,0.05)",
              color: feedback === f.key
                ? f.key === "light" ? "#22C55E" : f.key === "heavy" ? "#E85D4A" : accentColor
                : "#888",
              fontWeight: feedback === f.key ? 600 : 400,
              transition: "all 0.15s"
            }}
          >
            {f.sym} {f.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={!weight || !feedback}
        style={{
          width: "100%", padding: "10px", borderRadius: 8, border: "none",
          background: weight && feedback ? accentColor : "rgba(255,255,255,0.05)",
          color: weight && feedback ? "#fff" : "#444",
          fontSize: 14, fontWeight: 600, cursor: weight && feedback ? "pointer" : "default",
          fontFamily: "var(--body)", transition: "all 0.15s"
        }}
      >
        Log Weight
      </button>
    </div>
  );
};

const ExerciseCard = ({ exercise, dayKey, isActive, accentColor, log, onLog }) => {
  const [showCoaching, setShowCoaching] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const exKey = getExerciseKey(dayKey, exercise.name);
  const history = log[exKey] || [];
  const rec = getRecommendation(history);
  const lastWeight = getLastWeight(history);
  const timedSeconds = parseTimedSeconds(exercise.reps);
  const isTimed = timedSeconds !== null;
  const hasSides = /each side|each direction/i.test(exercise.reps);

  return (
    <div style={{
      background: isActive ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
      borderLeft: isActive ? `3px solid ${accentColor}` : "3px solid transparent",
      borderRadius: 10, padding: "14px 16px", marginBottom: 8, transition: "all 0.2s"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", fontFamily: "var(--body)" }}>{exercise.name}</div>
            {rec && rec.type === "increase" && (
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                background: "rgba(34,197,94,0.15)", color: "#22C55E",
                fontFamily: "var(--mono)", fontWeight: 600, whiteSpace: "nowrap"
              }}>{"\u2191"} GO UP</span>
            )}
            {rec && rec.type === "drop" && (
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                background: "rgba(232,93,74,0.15)", color: "#E85D4A",
                fontFamily: "var(--mono)", fontWeight: 600, whiteSpace: "nowrap"
              }}>{"\u2193"} DROP</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: accentColor, fontFamily: "var(--mono)", marginTop: 2 }}>
            {exercise.reps}
            {lastWeight !== null && (
              <span style={{ color: "#555", marginLeft: 8 }}>@ {lastWeight} {exercise.unit || "lbs"}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
          {isTimed && (
            <button
              onClick={() => { setShowTimer(!showTimer); if (!showTimer) { setShowCoaching(false); setShowWeight(false); } }}
              style={{
                background: showTimer ? accentColor : "rgba(255,255,255,0.08)",
                border: "none", color: showTimer ? "#fff" : "#aaa",
                width: 36, height: 36, borderRadius: 8, fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s"
              }}
              aria-label="Toggle timer"
              aria-expanded={showTimer}
            >{"\u23f1"}</button>
          )}
          {exercise.trackWeight && (
            <button
              onClick={() => { setShowWeight(!showWeight); if (!showWeight) { setShowCoaching(false); setShowTimer(false); } }}
              style={{
                background: showWeight ? accentColor : "rgba(255,255,255,0.08)",
                border: "none", color: showWeight ? "#fff" : "#aaa",
                width: 36, height: 36, borderRadius: 8, fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s"
              }}
              aria-label="Toggle weight panel"
              aria-expanded={showWeight}
            >{"\u2696"}</button>
          )}
          <button
            onClick={() => { setShowCoaching(!showCoaching); if (!showCoaching) { setShowWeight(false); setShowTimer(false); } }}
            aria-label="Toggle coaching tips"
            aria-expanded={showCoaching}
            style={{
              background: showCoaching ? accentColor : "rgba(255,255,255,0.08)",
              border: "none", color: showCoaching ? "#fff" : "#aaa",
              width: 36, height: 36, borderRadius: 8, fontSize: 16,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s"
            }}
          >?</button>
        </div>
      </div>

      {showTimer && isTimed && (
        hasSides ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}><ExerciseTimer seconds={timedSeconds} label="Side 1" accentColor={accentColor} /></div>
            <div style={{ flex: 1 }}><ExerciseTimer seconds={timedSeconds} label="Side 2" accentColor={accentColor} /></div>
          </div>
        ) : (
          <ExerciseTimer seconds={timedSeconds} accentColor={accentColor} />
        )
      )}

      {showCoaching && (
        <div style={{
          marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)",
          borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#ccc", fontFamily: "var(--body)"
        }}>
          {exercise.coaching}
        </div>
      )}

      {showWeight && exercise.trackWeight && (
        <WeightInput
          exerciseKey={exKey}
          log={log}
          onLog={onLog}
          accentColor={accentColor}
          unit={exercise.unit || "lbs"}
        />
      )}
    </div>
  );
};

const formatPace = (seconds) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

const formatDuration = (totalSec) => {
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (hrs > 0) return `${hrs}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

const RunLogger = ({ runs, onSave }) => {
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayRun = runs.find(r => r.date === todayStr);

  const totalSeconds = (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);
  const dist = parseFloat(distance) || 0;
  const pace = dist > 0 && totalSeconds > 0 ? totalSeconds / dist : 0;

  const handleSave = async () => {
    if (!dist || !totalSeconds) return;
    await onSave({ date: todayStr, distance: dist, duration: totalSeconds, notes });
    setSaved(true);
  };

  if (saved || todayRun) {
    const run = todayRun || { distance: dist, duration: totalSeconds, notes };
    const p = run.distance > 0 ? run.duration / run.distance : 0;
    return (
      <div style={{ padding: "20px", background: "rgba(34,197,94,0.06)", borderRadius: 16, margin: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#22C55E", fontFamily: "var(--mono)", letterSpacing: 2, textTransform: "uppercase" }}>Today's Run Logged</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "var(--mono)" }}>{run.distance}</div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)" }}>miles</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "var(--mono)" }}>{formatDuration(run.duration)}</div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)" }}>time</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: p <= 600 ? "#22C55E" : "#fff", fontFamily: "var(--mono)" }}>{formatPace(p)}</div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)" }}>min/mi</div>
          </div>
        </div>
        {run.notes && <div style={{ marginTop: 12, fontSize: 13, color: "#888", fontFamily: "var(--body)", textAlign: "center" }}>{run.notes}</div>}
      </div>
    );
  }

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "20px", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "var(--body)", marginBottom: 16 }}>Log Today's Run</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#666", fontFamily: "var(--mono)", marginBottom: 6 }}>Distance (miles)</div>
          <input
            type="number" inputMode="decimal" step="0.01" value={distance}
            onChange={e => setDistance(e.target.value)} placeholder="e.g. 1.5"
            style={{
              width: "100%", padding: "12px", background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
              color: "#fff", fontSize: 18, fontFamily: "var(--mono)", outline: "none", boxSizing: "border-box"
            }}
          />
          {dist > 0 && dist < 3.1 && (
            <div style={{ fontSize: 11, color: "#F59E0B", fontFamily: "var(--mono)", marginTop: 4 }}>
              {(3.1 - dist).toFixed(2)} miles to 5K!
            </div>
          )}
          {dist >= 3.1 && <div style={{ fontSize: 11, color: "#22C55E", fontFamily: "var(--mono)", marginTop: 4 }}>5K distance reached!</div>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#666", fontFamily: "var(--mono)", marginBottom: 6 }}>Time</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number" inputMode="numeric" value={minutes}
              onChange={e => setMinutes(e.target.value)} placeholder="min"
              style={{
                flex: 1, padding: "12px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                color: "#fff", fontSize: 18, fontFamily: "var(--mono)", outline: "none", textAlign: "center"
              }}
            />
            <span style={{ color: "#555", fontSize: 18, fontFamily: "var(--mono)" }}>:</span>
            <input
              type="number" inputMode="numeric" value={seconds}
              onChange={e => setSeconds(e.target.value)} placeholder="sec" min="0" max="59"
              style={{
                flex: 1, padding: "12px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                color: "#fff", fontSize: 18, fontFamily: "var(--mono)", outline: "none", textAlign: "center"
              }}
            />
          </div>
        </div>

        {pace > 0 && (
          <div style={{
            padding: "12px", background: pace <= 600 ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
            borderRadius: 8, marginBottom: 16, textAlign: "center"
          }}>
            <span style={{ fontSize: 13, color: "#888", fontFamily: "var(--mono)" }}>Pace: </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: pace <= 600 ? "#22C55E" : "#fff", fontFamily: "var(--mono)" }}>{formatPace(pace)}</span>
            <span style={{ fontSize: 13, color: "#888", fontFamily: "var(--mono)" }}> /mi</span>
            {pace > 600 && (
              <div style={{ fontSize: 11, color: "#F59E0B", fontFamily: "var(--mono)", marginTop: 4 }}>
                {formatPace(pace - 600)} to cut to reach 10:00/mi goal
              </div>
            )}
            {pace <= 600 && <div style={{ fontSize: 11, color: "#22C55E", fontFamily: "var(--mono)", marginTop: 4 }}>Under 10:00/mi — goal pace!</div>}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#666", fontFamily: "var(--mono)", marginBottom: 6 }}>Notes (optional)</div>
          <input
            type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. felt strong, knee a little stiff"
            style={{
              width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
              color: "#fff", fontSize: 13, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box"
            }}
          />
        </div>

        <button
          onClick={handleSave} disabled={!dist || !totalSeconds}
          style={{
            width: "100%", padding: "14px", borderRadius: 10, border: "none",
            background: dist && totalSeconds ? "#22C55E" : "rgba(255,255,255,0.05)",
            color: dist && totalSeconds ? "#fff" : "#444",
            fontSize: 15, fontWeight: 600, cursor: dist && totalSeconds ? "pointer" : "default",
            fontFamily: "var(--body)", transition: "all 0.15s"
          }}
        >Log Run</button>
      </div>
    </div>
  );
};

const RunHistoryView = ({ runs }) => {
  if (runs.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#555", fontSize: 14, fontFamily: "var(--body)" }}>
        No runs logged yet. Tap "Log a Run" to start tracking.
      </div>
    );
  }

  const sorted = [...runs].sort((a, b) => b.date.localeCompare(a.date));
  const bestPace = Math.min(...runs.filter(r => r.distance > 0).map(r => r.duration / r.distance));
  const longestRun = Math.max(...runs.map(r => r.distance));
  const totalMiles = runs.reduce((s, r) => s + Number(r.distance), 0);

  return (
    <div style={{ padding: "0 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 20, padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#22C55E", fontFamily: "var(--mono)" }}>{totalMiles.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)" }}>Total Miles</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F59E0B", fontFamily: "var(--mono)" }}>{longestRun.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)" }}>Longest (mi)</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: bestPace <= 600 ? "#22C55E" : "#fff", fontFamily: "var(--mono)" }}>{formatPace(bestPace)}</div>
          <div style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)" }}>Best Pace</div>
        </div>
      </div>

      {sorted.map((run) => {
        const pace = run.distance > 0 ? run.duration / run.distance : 0;
        const d = new Date(run.date + "T12:00:00");
        const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return (
          <div key={run.date} style={{
            padding: "12px 14px", background: "rgba(255,255,255,0.03)",
            borderRadius: 8, marginBottom: 6
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "#ccc", fontFamily: "var(--body)" }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "var(--mono)" }}>{run.distance} mi</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "#555", fontFamily: "var(--mono)" }}>{formatDuration(run.duration)}</div>
              <div style={{ fontSize: 12, color: pace <= 600 ? "#22C55E" : "#888", fontFamily: "var(--mono)" }}>{formatPace(pace)} /mi</div>
            </div>
            {run.notes && <div style={{ fontSize: 11, color: "#555", fontFamily: "var(--body)", marginTop: 4 }}>{run.notes}</div>}
          </div>
        );
      })}
    </div>
  );
};

const HistoryView = ({ log }) => {
  const entries = Object.entries(log).filter(([_, h]) => h.length > 0).sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#555", fontSize: 14, fontFamily: "var(--body)" }}>
        No weights logged yet. Start a workout and tap the {"\u2696"} button on any exercise to begin tracking.
      </div>
    );
  }

  const grouped = {};
  entries.forEach(([key, history]) => {
    const [day] = key.split("::");
    if (!grouped[day]) grouped[day] = [];
    const exName = key.split("::")[1].replace(/-/g, " ");
    const rec = getRecommendation(history);
    const last = history[history.length - 1];
    grouped[day].push({ name: exName, last, history, rec });
  });

  return (
    <div style={{ padding: "0 20px 40px" }}>
      {Object.entries(grouped).map(([day, exercises]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: WORKOUTS[day]?.color || "#fff",
            fontFamily: "var(--body)", marginBottom: 8
          }}>
            {WORKOUTS[day]?.emoji} {WORKOUTS[day]?.name || day}
          </div>
          {exercises.map((ex, i) => (
            <div key={i} style={{
              padding: "10px 12px", background: "rgba(255,255,255,0.03)",
              borderRadius: 8, marginBottom: 6
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, color: "#ccc", fontFamily: "var(--body)", textTransform: "capitalize" }}>{ex.name}</div>
                <div style={{ fontSize: 14, color: "#fff", fontFamily: "var(--mono)", fontWeight: 600 }}>{ex.last.weight} lbs</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "#555", fontFamily: "var(--mono)" }}>
                  {ex.history.length} session{ex.history.length > 1 ? "s" : ""} logged
                </div>
                {ex.rec && (
                  <div style={{ fontSize: 11, color: ex.rec.color, fontFamily: "var(--mono)" }}>
                    {ex.rec.type === "increase" ? "\u2191 time to go up" : "\u2193 drop weight"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default function WorkoutCoach({ onBack }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [phase, setPhase] = useState("warmup");
  const [circuitIdx, setCircuitIdx] = useState(0);
  const [roundNum, setRoundNum] = useState(1);
  const [resting, setResting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [log, setLog] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState([]);
  const [showRunning, setShowRunning] = useState(false);
  const [runTab, setRunTab] = useState("log");

  const doLoadLog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const l = await loadLog();
      setLog(l);
      const r = await loadRunLog();
      setRuns(r);
    } catch (e) {
      setLoadError(e.message || "Failed to load workout log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doLoadLog();
  }, [doLoadLog]);

  const resetWorkout = useCallback(() => {
    setPhase("warmup"); setCircuitIdx(0); setRoundNum(1);
    setResting(false); setCompleted(false); setRestType(null);
  }, []);

  // Keep screen awake during active workouts
  useEffect(() => {
    if (!selectedDay || completed) return;
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (e) {
        // Wake Lock not available or denied — silent fallback
      }
    };
    requestWakeLock();
    // Re-acquire on visibility change (e.g. switching tabs back)
    const handleVisibility = () => { if (document.visibilityState === "visible") requestWakeLock(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [selectedDay, completed]);

  const workout = selectedDay ? WORKOUTS[selectedDay] : null;

  // Track whether rest is between rounds of the same circuit/abs, or between circuits
  const [restType, setRestType] = useState(null); // "round" or "circuit"

  const handleNext = () => {
    if (phase === "warmup") {
      setPhase("circuits"); setCircuitIdx(0); setRoundNum(1);
    } else if (phase === "circuits") {
      const circuit = workout.circuits[circuitIdx];
      if (roundNum < circuit.rounds) { setRestType("round"); setResting(true); }
      else if (circuitIdx < workout.circuits.length - 1) {
        setCircuitIdx(circuitIdx + 1); setRoundNum(1); setRestType("circuit"); setResting(true);
      } else { setPhase("abs"); setRoundNum(1); }
    } else if (phase === "abs") {
      if (roundNum < workout.abs.rounds) { setRestType("round"); setResting(true); }
      else { setPhase("cooldown"); }
    } else if (phase === "cooldown") { setCompleted(true); }
  };

  const handleRestComplete = () => {
    setResting(false);
    // Only increment round when resting between rounds of the same section
    if (restType === "round") {
      if (phase === "circuits") {
        const circuit = workout.circuits[circuitIdx];
        if (roundNum < circuit.rounds) setRoundNum(roundNum + 1);
      } else if (phase === "abs") {
        if (roundNum < workout.abs.rounds) setRoundNum(roundNum + 1);
      }
    }
    // "circuit" rest type = transitioning to new circuit, round already set to 1
    setRestType(null);
  };

  const cssVars = { "--mono": "'JetBrains Mono', monospace", "--body": "'Outfit', sans-serif" };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "center", ...cssVars }}>
        <div style={{ color: "#555", fontFamily: "var(--body)" }}>Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...cssVars }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u26a0\ufe0f"}</div>
          <div style={{ color: "#E85D4A", fontFamily: "var(--body)", fontSize: 15, marginBottom: 16 }}>{loadError}</div>
          <button onClick={doLoadLog} style={{
            padding: "12px 24px", borderRadius: 10, border: "none",
            background: "#E85D4A", color: "white", fontFamily: "var(--body)", fontSize: 14, cursor: "pointer",
          }}>Retry</button>
        </div>
      </div>
    );
  }

  const handleSaveRun = async (run) => {
    await saveRun(run);
    const updated = await loadRunLog();
    setRuns(updated);
  };

  // Running screen
  if (showRunning) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0D0D", fontFamily: "var(--body)", padding: "0 0 40px 0", ...cssVars }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center" }}>
          <button onClick={() => setShowRunning(false)} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: "#888",
            padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
          }}>{"\u2190"} Back</button>
          <div style={{ fontSize: 13, color: "#555", fontFamily: "var(--mono)", marginLeft: "auto" }}>{"\ud83c\udfc3\u200d\u2640\ufe0f"} Running</div>
        </div>

        <div style={{ padding: "24px 20px 16px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.1 }}>Running</h1>
          <div style={{ fontSize: 13, color: "#22C55E", fontFamily: "var(--mono)", marginTop: 4 }}>Goal: 5K at 10:00/mi pace</div>
        </div>

        <div style={{ padding: "0 20px", display: "flex", gap: 4, marginBottom: 20 }}>
          <button onClick={() => setRunTab("log")} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none", fontSize: 13,
            fontFamily: "var(--mono)", cursor: "pointer",
            background: runTab === "log" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
            color: runTab === "log" ? "#fff" : "#555"
          }}>Log a Run</button>
          <button onClick={() => setRunTab("history")} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none", fontSize: 13,
            fontFamily: "var(--mono)", cursor: "pointer",
            background: runTab === "history" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
            color: runTab === "history" ? "#fff" : "#555"
          }}>Run History{runs.length > 0 ? ` (${runs.length})` : ""}</button>
        </div>

        {runTab === "log" ? (
          <RunLogger runs={runs} onSave={handleSaveRun} />
        ) : (
          <RunHistoryView runs={runs} />
        )}
      </div>
    );
  }

  // Home screen
  if (!selectedDay) {
    return (
      <div style={{ minHeight: "100vh", background: "#0D0D0D", fontFamily: "var(--body)", padding: "0 0 40px 0", ...cssVars }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

        <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center" }}>
          <button onClick={onBack} style={{
            background: "rgba(255,255,255,0.06)", border: "none", color: "#888",
            padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
          }}>{"\u2190"} Check-In</button>
        </div>

        <div style={{ padding: "24px 20px 24px" }}>
          <div style={{ fontSize: 13, letterSpacing: 3, color: "#555", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 8 }}>Katie's</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.1 }}>Workout Coach</h1>
        </div>

        <div style={{ padding: "0 20px", display: "flex", gap: 4, marginBottom: 20 }}>
          <button onClick={() => setShowHistory(false)} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none", fontSize: 13,
            fontFamily: "var(--mono)", cursor: "pointer",
            background: !showHistory ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
            color: !showHistory ? "#fff" : "#555"
          }}>Workouts</button>
          <button onClick={() => setShowHistory(true)} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "none", fontSize: 13,
            fontFamily: "var(--mono)", cursor: "pointer",
            background: showHistory ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
            color: showHistory ? "#fff" : "#555"
          }}>Weight Log</button>
        </div>

        {showHistory ? (
          <HistoryView log={log} />
        ) : (
          <>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Running Card */}
              <button
                onClick={() => setShowRunning(true)}
                style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16, padding: "24px 20px", textAlign: "left", cursor: "pointer",
                  position: "relative", overflow: "hidden"
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#22C55E" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 28 }}>{"\ud83c\udfc3\u200d\u2640\ufe0f"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Running</div>
                      {runs.length > 0 && (() => {
                        const best = Math.max(...runs.map(r => Number(r.distance)));
                        return best >= 3.1 ? (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(34,197,94,0.15)", color: "#22C55E", fontFamily: "var(--mono)", fontWeight: 600 }}>5K REACHED</span>
                        ) : null;
                      })()}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", fontFamily: "var(--mono)", marginTop: 2 }}>
                      {runs.length > 0
                        ? `${runs.length} run${runs.length !== 1 ? "s" : ""} logged \u00b7 goal: 5K at 10:00/mi`
                        : "Log runs, track pace \u00b7 goal: 5K at 10:00/mi"}
                    </div>
                  </div>
                </div>
              </button>

              {Object.entries(WORKOUTS).map(([key, w]) => {
                const dayExercises = [...w.circuits.flatMap(c => c.exercises), ...(w.abs?.exercises || [])].filter(e => e.trackWeight);
                const loggedCount = dayExercises.filter(e => {
                  const k = getExerciseKey(key, e.name);
                  return log[k] && log[k].length > 0;
                }).length;
                const hasRecs = dayExercises.some(e => {
                  const k = getExerciseKey(key, e.name);
                  const r = getRecommendation(log[k] || []);
                  return r && r.type === "increase";
                });

                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedDay(key); resetWorkout(); }}
                    style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 16, padding: "24px 20px", textAlign: "left", cursor: "pointer",
                      position: "relative", overflow: "hidden"
                    }}
                  >
                    <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: w.color }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontSize: 28 }}>{w.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{w.name}</div>
                          {hasRecs && (
                            <span style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 4,
                              background: "rgba(34,197,94,0.15)", color: "#22C55E",
                              fontFamily: "var(--mono)", fontWeight: 600
                            }}>{"\u2191"} INCREASES</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: "#666", fontFamily: "var(--mono)", marginTop: 2 }}>
                          {w.circuits.length} circuits {"\u00b7"} {loggedCount > 0 ? `${loggedCount} exercises tracked` : "no weights logged yet"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{
              margin: "24px 20px 0", padding: 16, background: "rgba(255,255,255,0.02)",
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.04)"
            }}>
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#555", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 8 }}>Reminders</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, fontFamily: "var(--body)" }}>
                Steps first, running second, lifting third. Band pull-aparts and doorway pec stretch every session. Left side first on single-leg work.
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Completed
  if (completed) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0D0D0D", fontFamily: "var(--body)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 20, textAlign: "center", ...cssVars
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ fontSize: 56, marginBottom: 16 }}>{"\u2713"}</div>
        <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 800, margin: 0 }}>{workout.name} Done</h2>
        <p style={{ color: "#666", fontSize: 14, margin: "12px 0 32px", lineHeight: 1.5, maxWidth: 280 }}>
          Nice work. Rest up and come back for the next one in the rotation.
        </p>
        <button onClick={() => { setSelectedDay(null); resetWorkout(); }} style={{
          background: workout.color, border: "none", color: "#fff",
          padding: "14px 32px", borderRadius: 10, fontSize: 15, fontWeight: 600,
          cursor: "pointer", fontFamily: "var(--body)"
        }}>Back to Workouts</button>
      </div>
    );
  }

  // Workout flow
  let sectionTitle = "", sectionSubtitle = "", exercises = [], showRounds = false, totalRounds = 1;

  if (phase === "warmup") {
    sectionTitle = workout.warmup.title; sectionSubtitle = workout.warmup.duration;
    exercises = workout.warmup.exercises;
  } else if (phase === "circuits") {
    const circuit = workout.circuits[circuitIdx];
    sectionTitle = circuit.name; sectionSubtitle = `Round ${roundNum} of ${circuit.rounds}`;
    exercises = circuit.exercises; showRounds = true; totalRounds = circuit.rounds;
  } else if (phase === "abs") {
    sectionTitle = workout.abs.title; sectionSubtitle = `Round ${roundNum} of ${workout.abs.rounds}`;
    exercises = workout.abs.exercises; showRounds = true; totalRounds = workout.abs.rounds;
  } else if (phase === "cooldown") {
    sectionTitle = workout.cooldown.title; sectionSubtitle = workout.cooldown.duration;
    exercises = workout.cooldown.exercises;
  }

  const totalPhases = 3 + workout.circuits.length;
  let currentPhase = phase === "warmup" ? 0
    : phase === "circuits" ? 1 + circuitIdx
    : phase === "abs" ? 1 + workout.circuits.length
    : totalPhases - 1;
  const progress = ((currentPhase + (roundNum / (totalRounds || 1))) / totalPhases) * 100;

  const nextLabel = phase === "warmup" ? "Start Circuit 1"
    : phase === "cooldown" ? "Finish Workout"
    : (phase === "circuits" && roundNum >= workout.circuits[circuitIdx]?.rounds && circuitIdx >= workout.circuits.length - 1) ? "Move to Abs"
    : (phase === "abs" && roundNum >= workout.abs.rounds) ? "Start Cool-Down"
    : `Complete Round ${roundNum}`;

  return (
    <div style={{ minHeight: "100vh", background: "#0D0D0D", fontFamily: "var(--body)", paddingBottom: 100, ...cssVars }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => { setSelectedDay(null); resetWorkout(); }} style={{
          background: "rgba(255,255,255,0.06)", border: "none", color: "#888",
          padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--mono)"
        }}>{"\u2190"} Back</button>
        <div style={{ fontSize: 13, color: "#555", fontFamily: "var(--mono)" }}>{workout.emoji} {workout.name}</div>
      </div>

      <div style={{ margin: "16px 20px 0", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{
          height: "100%", width: `${Math.min(progress, 100)}%`,
          background: workout.color, borderRadius: 2, transition: "width 0.5s ease"
        }} />
      </div>

      <div style={{ padding: "24px 20px 16px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>{sectionTitle}</h2>
        <div style={{ fontSize: 13, color: workout.color, fontFamily: "var(--mono)", marginTop: 4 }}>{sectionSubtitle}</div>
      </div>

      {showRounds && (
        <div style={{ padding: "0 20px 12px", display: "flex", gap: 6 }}>
          {Array.from({ length: totalRounds }, (_, i) => (
            <div key={i} style={{
              height: 4, flex: 1, borderRadius: 2,
              background: i < roundNum ? workout.color : "rgba(255,255,255,0.08)",
              transition: "background 0.3s"
            }} />
          ))}
        </div>
      )}

      {resting && <RestTimer onComplete={handleRestComplete} />}

      {!resting && (
        <div style={{ padding: "0 20px" }}>
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={`${phase}-${circuitIdx}-${roundNum}-${i}`}
              exercise={ex}
              dayKey={selectedDay}
              isActive={phase === "circuits" || phase === "abs"}
              accentColor={workout.color}
              log={log}
              onLog={setLog}
            />
          ))}
        </div>
      )}

      {!resting && (
        <div style={{ padding: "20px 20px 0" }}>
          <button onClick={handleNext} style={{
            width: "100%", background: workout.color, border: "none", color: "#fff",
            padding: "16px", borderRadius: 12, fontSize: 16, fontWeight: 600,
            cursor: "pointer", fontFamily: "var(--body)", letterSpacing: 0.5
          }}>{nextLabel}</button>
        </div>
      )}
    </div>
  );
}
