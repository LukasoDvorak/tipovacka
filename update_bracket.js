// Jednorázový script: naplní home_source_id/away_source_id (+ typ winner/loser)
// pro navazující playoff zápasy (1/16, QF, SF, o 3. místo, finále) podle pevné
// bracket struktury z https://github.com/rezarahiminia/worldcup2026
// Spusť: SUPABASE_SECRET_KEY=xxx node update_bracket.js

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

async function main() {
  console.log('📡 Načítám bracket strukturu z GitHub repa...');
  const data = await fetch('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json').then(r => r.json());
  const apiMatches = Array.isArray(data) ? data : data.matches || data.games || [];

  // Mapuj fázi → seznam API id seřazených podle local_date
  const byPhase = {};
  for (const m of apiMatches) {
    const g = String(m.group || '').toUpperCase();
    const phaseKey = { R32: 'r32', R16: 'r16', QF: 'qf', SF: 'sf', '3RD': 'third', FINAL: 'final' }[g];
    if (!phaseKey) continue;
    (byPhase[phaseKey] ||= []).push(m);
  }
  for (const k in byPhase) byPhase[k].sort((a, b) => new Date(a.local_date) - new Date(b.local_date));

  // Mapuj DB id → fázi, seřazené podle kickoff_at
  const dbMatches = await sbFetch(
    '/rest/v1/matches?phase=in.(r32,r16,qf,sf,final)&select=id,phase,kickoff_at&order=kickoff_at', 'GET'
  );
  const thirdMatch = await sbFetch(
    `/rest/v1/matches?group_name=eq.THIRD_PLACE&select=id,phase,kickoff_at`, 'GET'
  );

  const dbByPhase = { r32: [], r16: [], qf: [], sf: [], third: [], final: [] };
  for (const m of dbMatches) dbByPhase[m.phase]?.push(m);
  for (const k in dbByPhase) dbByPhase[k].sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
  if (thirdMatch && thirdMatch.length > 0) dbByPhase.third = thirdMatch;

  // API id → DB id mapování (pozičně, podle data v rámci fáze)
  const apiToDbId = {};
  for (const phase of ['r32', 'r16', 'qf', 'sf', 'third', 'final']) {
    const apiList = byPhase[phase] || [];
    const dbList = dbByPhase[phase] || [];
    if (apiList.length !== dbList.length) {
      console.warn(`⚠️ [${phase}] počty nesedí: API ${apiList.length} vs DB ${dbList.length}`);
    }
    for (let i = 0; i < Math.min(apiList.length, dbList.length); i++) {
      apiToDbId[apiList[i].id] = dbList[i].id;
    }
  }

  // Oprav phase pro third place zápas (byl 'group')
  if (thirdMatch && thirdMatch.length > 0 && thirdMatch[0].phase !== 'third') {
    await sbFetch(`/rest/v1/matches?id=eq.${thirdMatch[0].id}`, 'PATCH', { phase: 'third' });
    console.log(`🔧 Opravena phase třetího místa na 'third' (id ${thirdMatch[0].id})`);
  }

  // Parsuj "Winner Match X" / "Loser Match X" z home/away_team_label
  function parseLabel(label) {
    if (!label) return null;
    const m = label.match(/^(Winner|Loser) Match (\d+)$/);
    if (!m) return null;
    return { type: m[1] === 'Winner' ? 'winner' : 'loser', apiId: m[2] };
  }

  let updated = 0;
  for (const phase of ['r16', 'qf', 'sf', 'third', 'final']) {
    for (const apiMatch of byPhase[phase] || []) {
      const dbId = apiToDbId[apiMatch.id];
      if (!dbId) continue;
      const home = parseLabel(apiMatch.home_team_label);
      const away = parseLabel(apiMatch.away_team_label);
      const patch = {};
      if (home) {
        patch.home_source_id = apiToDbId[home.apiId] || null;
        patch.home_source_type = home.type;
      }
      if (away) {
        patch.away_source_id = apiToDbId[away.apiId] || null;
        patch.away_source_type = away.type;
      }
      if (Object.keys(patch).length > 0) {
        await sbFetch(`/rest/v1/matches?id=eq.${dbId}`, 'PATCH', patch);
        console.log(`✅ [${phase}] match ${dbId}: ${JSON.stringify(patch)}`);
        updated++;
      }
    }
  }

  console.log(`\n✅ Hotovo: ${updated} zápasů má nastavenou bracket strukturu`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
