import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// --- Storage API that mirrors window.storage interface ---
export const storage = {
  async getEntries() {
    const { data, error } = await supabase
      .from('checkin_entries')
      .select('*')
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async saveEntry(entry) {
    const { data, error } = await supabase
      .from('checkin_entries')
      .upsert(entry, { onConflict: 'date' })
      .select()
    if (error) throw error
    return data
  },

  async deleteEntry(date) {
    const { error } = await supabase
      .from('checkin_entries')
      .delete()
      .eq('date', date)
    if (error) throw error
  },

  async deleteAll() {
    const { error } = await supabase
      .from('checkin_entries')
      .delete()
      .neq('date', '')  // delete all rows
    if (error) throw error
  }
}
