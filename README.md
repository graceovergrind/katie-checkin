# Katie's Check-In Tracker

A personal daily fitness and nutrition tracker with charts, insights, and a coaching export feature.

## Setup (15 minutes)

### 1. Supabase (Database)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once it's ready, go to **SQL Editor** in the sidebar
3. Paste the contents of `supabase_setup.sql` and click **Run**
4. Go to **Settings > API** and copy your:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public key** (the long string under "Project API keys")

### 2. Local Setup

```bash
# Clone or copy this project
cd katie-checkin

# Create your .env file
cp .env.example .env

# Edit .env with your Supabase credentials and desired PIN
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
# VITE_APP_PIN=your-pin-here

# Install dependencies
npm install

# Test locally
npm run dev
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Deploy
vercel

# Set your environment variables in Vercel:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_APP_PIN

# Redeploy with env vars
vercel --prod
```

Or connect your GitHub repo to Vercel and add the env vars in the Vercel dashboard under Settings > Environment Variables.

### 4. Add to Home Screen (PWA)

On your phone, open the deployed URL in Safari/Chrome and use "Add to Home Screen." It'll look and feel like a native app.

## Features

- **Today**: Log weight, steps, workout, sleep, mood, energy, stress, eating times, meals, treats, water, and window compliance
- **Insights**: Weight trend chart, 7-day scorecard, steps bar chart, eating window duration chart, mood/energy/stress lines, 21-day consistency tracker
- **History**: Browse and edit past entries
- **Coach Me**: Copy a formatted 7-day report to paste into Claude for coaching

## Architecture

- **Frontend**: React + Vite + Recharts
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Auth**: Simple PIN lock (stored as env var, checked client-side via sessionStorage)
