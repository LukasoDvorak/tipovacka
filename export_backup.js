// Záloha tipů z Supabase do JSON souboru
// Spusť: node export_backup.js
// Doporučeno: spouštět denně, commitovat do gitu

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const fs = require('fs');
const path = require('path');

async function fetchAll(table, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=created_at`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function main() {
  console.log('📦 Stahuji data ze Supabase...');

  const [tips, scorerTips, goals, profiles] = await Promise.all([
    fetchAll('tips', 'id,user_id,match_id,home_score,away_score,points,created_at,updated_at'),
    fetchAll('scorer_tips', 'id,user_id,match_id,player_name,points,created_at'),
    fetchAll('goals', 'id,match_id,player_name,team,minute,created_at'),
    fetchAll('profiles', 'id,display_name,avatar_emoji,is_approved,has_paid'),
  ]);

  const backup = {
    exported_at: new Date().toISOString(),
    profiles,
    tips,
    scorer_tips: scorerTips,
    goals,
  };

  // Uložit do složky backups/
  const dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const file = path.join(dir, `backup_${date}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));

  // Vždy přepsat latest.json
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(backup, null, 2));

  console.log(`✅ Záloha uložena: backups/backup_${date}.json`);
  console.log(`   Hráčů: ${profiles.length}, Tipů: ${tips.length}, Střelec tipů: ${scorerTips.length}, Gólů: ${goals.length}`);
}

main().catch(console.error);
