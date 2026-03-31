-- Run this in your Supabase SQL Editor (supabase.com > your project > SQL Editor)

CREATE TABLE checkin_entries (
  date DATE PRIMARY KEY,
  weight TEXT DEFAULT '',
  steps TEXT DEFAULT '',
  workout TEXT DEFAULT '',
  workout_notes TEXT DEFAULT '',
  first_food TEXT DEFAULT '',
  last_food TEXT DEFAULT '',
  meals TEXT DEFAULT '',
  hunger TEXT DEFAULT 'satisfied',
  water TEXT DEFAULT 'okay',
  treats TEXT DEFAULT '',
  window_kept TEXT DEFAULT 'yes',
  window_notes TEXT DEFAULT '',
  stress TEXT DEFAULT 'medium',
  mood TEXT DEFAULT 'good',
  energy TEXT DEFAULT 'good',
  sleep TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE checkin_entries ENABLE ROW LEVEL SECURITY;

-- Since this is a single-user app with PIN protection,
-- we'll allow all operations through the anon key.
-- The PIN in the app provides the access control.
CREATE POLICY "Allow all operations" ON checkin_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON checkin_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
