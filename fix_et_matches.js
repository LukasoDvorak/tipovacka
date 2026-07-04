// Jednorázový fix: opraví zápasy kde byl rozhodující gól v prodloužení (bez penalt).
// Uloží 90min skóre jako home_score/away_score (pro hodnocení tipů)
// a ET skóre jako penalty_home_score/penalty_away_score (pro bracket propagaci).
// Spusť: SUPABASE_SECRET_KEY=xxx node fix_et_matches.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_KEY) { console.error('Chybí SUPABASE_SECRET_KEY'); process.exit(1); }

async function sbFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: method || 'GET',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Seznam ET zápasů: [home_team_fragment, away_team_fragment, 90min_home, 90min_away, et_home, et_away]
const ET_MATCHES = [
  ['Belgium', 'Senegal', 2, 2, 3, 2],
  ['Argentina', 'Cape Verde', 1, 1, 3, 2],
  // Přidej sem další ET zápasy pokud nastanou
];

async function main() {
  for (const [homeFragment, awayFragment, score90h, score90a, etH, etA] of ET_MATCHES) {
    const found = await sbFetch(
      `/rest/v1/matches?home_team=ilike.*${homeFragment}*&away_team=ilike.*${awayFragment}*&select=id,home_team,away_team,home_score,away_score`,
      'GET'
    );
    if (!found || found.length === 0) {
      console.warn(`⚠️ Zápas nenalezen: ${homeFragment} vs ${awayFragment}`);
      continue;
    }
    const m = found[0];
    await sbFetch(`/rest/v1/matches?id=eq.${m.id}`, 'PATCH', {
      home_score: score90h,
      away_score: score90a,
      penalty_home_score: etH,
      penalty_away_score: etA,
      is_et_win: true,
    });
    console.log(`✅ ${m.home_team} vs ${m.away_team}: 90min=${score90h}:${score90a}, ET=${etH}:${etA}`);
  }

  // Přepočítej body
  await sbFetch('/rest/v1/rpc/recalc_points', 'POST', {});
  console.log('🏆 Body přepočítány');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
