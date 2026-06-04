// Import soupisek MS 2026 z football-data.org do Supabase
// Spusť: node import_players.js

const FOOTBALL_API_KEY = '553a3ff2fe8046caaa4a3ce6693fb2af';
const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'ZDE_VLOZ_SERVICE_ROLE_KEY';

const POSITION_MAP = {
  'Goalkeeper': 'Brankář',
  'Defence': 'Obránce',
  'Midfield': 'Záložník',
  'Offence': 'Útočník',
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchTeams() {
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/teams?season=2026', {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
  });
  const data = await res.json();
  return data.teams;
}

async function fetchSquad(teamId) {
  const res = await fetch(`https://api.football-data.org/v4/teams/${teamId}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
  });
  const data = await res.json();
  return data.squad || [];
}

async function createPlayersTable() {
  // Vytvoříme tabulku přes SQL pokud neexistuje
  const sql = `
    create table if not exists public.players (
      id bigserial primary key,
      team_tla text not null,
      team_name text not null,
      player_name text not null,
      position text,
      shirt_number int,
      created_at timestamptz default now(),
      unique(team_tla, player_name)
    );
    alter table public.players enable row level security;
    drop policy if exists "Hráči vidí všichni" on public.players;
    create policy "Hráči vidí všichni" on public.players for select using (true);
  `;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
}

async function upsertPlayers(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('  Chyba:', err);
  }
}

async function main() {
  console.log('📡 Stahuji seznam týmů...');
  const teams = await fetchTeams();
  console.log(`   ${teams.length} týmů`);

  let total = 0;
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    process.stdout.write(`[${i+1}/${teams.length}] ${team.name}...`);

    const squad = await fetchSquad(team.id);
    const rows = squad.map(p => ({
      team_tla: team.tla,
      team_name: team.name,
      player_name: p.name,
      position: POSITION_MAP[p.position] || p.position,
      shirt_number: p.shirtNumber || null,
    }));

    if (rows.length > 0) {
      await upsertPlayers(rows);
      total += rows.length;
      console.log(` ${rows.length} hráčů ✓`);
    } else {
      console.log(' žádní hráči');
    }

    // Rate limit: max 10 req/min = čekej 7s mezi požadavky
    if (i < teams.length - 1) await sleep(7000);
  }

  console.log(`\n✅ Hotovo! Celkem ${total} hráčů nahráno.`);
}

main().catch(console.error);
