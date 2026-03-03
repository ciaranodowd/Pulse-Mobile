import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zxrtxrscmcvbewgdczaw.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cnR4cnNjbWN2YmV3Z2RjemF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NjY1OTIsImV4cCI6MjA4ODA0MjU5Mn0.zLf5KUAiL5jsBow3X3T1EDDzwKEoH08a-E0ApC1Oct8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});