/* Shared online leaderboard (Supabase).
   Leave these blank and the leaderboard stays on each player's own device.
   Fill them in from Supabase: Project Settings > API (or "Connect"):
     url = the Project URL, e.g. https://abcdefghijkl.supabase.co
     key = the publishable / "anon public" key (safe to put in a web page;
           never use the secret / service_role key here)
   The database table is created by tools/leaderboard.sql. */
window.LEADERBOARD_CONFIG = {
  url: '',
  key: '',
};
