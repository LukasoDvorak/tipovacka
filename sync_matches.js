// Automatický sync zápasů MS 2026 z football-data.org do Supabase
// Spouští se přes GitHub Actions každých 5 minut
// Ručně: SUPABASE_SECRET_KEY=xxx node sync_matches.js

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '553a3ff2fe8046caaa4a3ce6693fb2af';
const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Chybí SUPABASE_SECRET_KEY');
  process.exit(1);
}

const TEAM_FLAGS = {
  'MEX': '🇲🇽', 'RSA': '🇿🇦', 'ARG': '🇦🇷', 'MAR': '🇲🇦', 'BRA': '🇧🇷',
  'ESP': '🇪🇸', 'FRA': '🇫🇷', 'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'GER': '🇩🇪', 'POR': '🇵🇹',
  'NED': '🇳🇱', 'BEL': '🇧🇪', 'ITA': '🇮🇹', 'CRO': '🇭🇷', 'URU': '🇺🇾',
  'USA': '🇺🇸', 'CAN': '🇨🇦', 'JPN': '🇯🇵', 'KOR': '🇰🇷', 'AUS': '🇦🇺',
  'SEN': '🇸🇳', 'CMR': '🇨🇲', 'GHA': '🇬🇭', 'NGA': '🇳🇬', 'EGY': '🇪🇬',
  'IRN': '🇮🇷', 'SAU': '🇸🇦', 'JOR': '🇯🇴', 'QAT': '🇶🇦', 'UAE': '🇦🇪',
  'SUI': '🇨🇭', 'AUT': '🇦🇹', 'DEN': '🇩🇰', 'SWE': '🇸🇪', 'NOR': '🇳🇴',
  'POL': '🇵🇱', 'CZE': '🇨🇿', 'SVK': '🇸🇰', 'HUN': '🇭🇺', 'ROU': '🇷🇴',
  'SRB': '🇷🇸', 'UKR': '🇺🇦', 'SVN': '🇸🇮', 'GRE': '🇬🇷', 'TUR': '🇹🇷',
  'ECU': '🇪🇨', 'COL': '🇨🇴', 'VEN': '🇻🇪', 'CHI': '🇨🇱', 'PER': '🇵🇪',
  'BOL': '🇧🇴', 'PAR': '🇵🇾', 'CRC': '🇨🇷', 'PAN': '🇵🇦', 'HON': '🇭🇳',
  'NZL': '🇳🇿', 'PHI': '🇵🇭', 'THA': '🇹🇭', 'IND': '🇮🇳', 'CHN': '🇨🇳',
  'URY': '🇺🇾', 'ALG': '🇩🇿', 'KSA': '🇸🇦', 'TUN': '🇹🇳', 'HAI': '🇭🇹',
  'BIH': '🇧🇦', 'CPV': '🇨🇻', 'COD': '🇨🇩', 'CIV': '🇨🇮', 'IRQ': '🇮🇶',
  'UZB': '🇺🇿', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'CUW': '🇨🇼',
};

function flag(tla) {
  return TEAM_FLAGS[tla] || '🏳️';
}

function matchStatus(apiStatus) {
  if (apiStatus === 'FINISHED') return 'done';
  if (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') return 'live';
  return 'open';
}

function matchPhase(stage) {
  if (stage === 'GROUP_STAGE') return 'group';
  if (stage === 'ROUND_OF_16') return 'r16';
  if (stage === 'QUARTER_FINALS') return 'qf';
  if (stage === 'SEMI_FINALS') return 'sf';
  if (stage === 'FINAL') return 'final';
  return 'group';
}

async function fetchAllMatches() {
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches?season=2026', {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
  });
  if (!res.ok) throw new Error(`API chyba: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.matches || [];
}

async function fetchMatchDetail(apiMatchId) {
  const res = await fetch(`https://api.football-data.org/v4/matches/${apiMatchId}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data;
}

async function supabaseFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function syncGoals(matchId, apiMatchId, homeTeamName, awayTeamName) {
  const detail = await fetchMatchDetail(apiMatchId);
  if (!detail || !detail.goals) return 0;

  const goals = detail.goals;
  if (goals.length === 0) return 0;

  // Smaž stávající góly pro tento zápas a nahraď novými (jednoduchý přístup)
  await supabaseFetch(`/rest/v1/goals?match_id=eq.${matchId}`, 'DELETE');

  const rows = goals.map(g => ({
    match_id: String(matchId),
    player_name: g.scorer?.name || 'Neznámý',
    team: g.team?.name || '',
    minute: g.minute || null,
  }));

  if (rows.length > 0) {
    await supabaseFetch('/rest/v1/goals', 'POST', rows);
  }

  return rows.length;
}

async function main() {
  console.log(`🔄 Sync spuštěn: ${new Date().toISOString()}`);

  const allMatches = await fetchAllMatches();
  console.log(`📋 Staženo ${allMatches.length} zápasů z API`);

  // Synchronizuj všechny live nebo dokončené zápasy (ne budoucí open)
  const relevantMatches = allMatches.filter(m =>
    ['IN_PLAY', 'PAUSED', 'FINISHED'].includes(m.status)
  );

  console.log(`⚽ Relevantní zápasy (live/done): ${relevantMatches.length}`);

  if (relevantMatches.length === 0) {
    console.log('💤 Žádné aktivní zápasy, sync přeskočen');
    return;
  }

  // Upsert skóre a statusů
  const rows = relevantMatches.map(m => ({
    id: String(m.id),
    home_team: `${flag(m.homeTeam.tla)} ${m.homeTeam.name}`,
    away_team: `${flag(m.awayTeam.tla)} ${m.awayTeam.name}`,
    home_flag: flag(m.homeTeam.tla),
    away_flag: flag(m.awayTeam.tla),
    group_name: m.group ? m.group.replace('GROUP_', 'Skupina ') : m.stage,
    kickoff_at: m.utcDate,
    status: matchStatus(m.status),
    home_score: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
    phase: matchPhase(m.stage),
    api_match_id: m.id,
  }));

  await supabaseFetch('/rest/v1/matches', 'POST', rows);
  console.log(`✅ Skóre uloženo pro ${rows.length} zápasů`);

  // Pro dokončené zápasy načti detail (skóre + góly) — list endpoint nevrací skóre
  const finishedMatches = relevantMatches.filter(m => m.status === 'FINISHED');
  let totalGoals = 0;
  for (const m of finishedMatches) {
    try {
      const detail = await fetchMatchDetail(m.id);
      if (detail) {
        const homeScore = detail.score?.fullTime?.home ?? null;
        const awayScore = detail.score?.fullTime?.away ?? null;
        if (homeScore !== null) {
          await supabaseFetch(`/rest/v1/matches?id=eq.${m.id}`, 'PATCH', {
            home_score: homeScore,
            away_score: awayScore,
            status: 'done',
          });
          console.log(`   📊 ${m.homeTeam.name} ${homeScore}:${awayScore} ${m.awayTeam.name}`);
        }
      }
      await new Promise(r => setTimeout(r, 700));
      const count = await syncGoals(
        String(m.id), m.id,
        m.homeTeam.name, m.awayTeam.name
      );
      if (count > 0) {
        console.log(`   ⚽ ${m.homeTeam.name} vs ${m.awayTeam.name}: ${count} gólů`);
        totalGoals += count;
      }
      // Pause aby se nepřekročil rate limit API (10 req/min)
      await new Promise(r => setTimeout(r, 700));
    } catch (e) {
      console.warn(`   ⚠️ Góly pro zápas ${m.id} se nepodařilo načíst: ${e.message}`);
    }
  }

  if (totalGoals > 0) {
    console.log(`⚽ Celkem syncnutých gólů: ${totalGoals}`);
  }

  // Přepočítej body
  try {
    await supabaseFetch('/rest/v1/rpc/recalc_points', 'POST', {});
    console.log('🏆 Body přepočítány');
  } catch (e) {
    console.warn('⚠️ Přepočet bodů selhal:', e.message);
  }

  console.log('✅ Sync dokončen');
}

main().catch(e => {
  console.error('❌ Sync selhal:', e.message);
  process.exit(1);
});
