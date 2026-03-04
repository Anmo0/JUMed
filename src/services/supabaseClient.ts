
import { createClient } from '@supabase/supabase-js';

let supabase: any;

try {
    // For Vite, environment variables exposed to the client must be prefixed with VITE_
    const env = (import.meta as any).env || {};
    const supabaseUrl = env.VITE_SUPABASE_URL || (process.env as any).VITE_SUPABASE_URL;
    const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || (process.env as any).VITE_SUPABASE_ANON_KEY;
    
    if (typeof supabaseUrl === 'string' && typeof supabaseAnonKey === 'string' && supabaseUrl.startsWith('http')) {
        // Attempt to create the client with specific auth persistence settings to avoid issues in some environments
        supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });
    } else {
        supabase = undefined;
    }
} catch (error) {
    supabase = undefined;
}

export { supabase };