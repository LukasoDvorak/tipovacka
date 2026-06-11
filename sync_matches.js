// Automatický sync zápasů MS 2026 z worldcup26.ir do Supabase
// Zdroj: https://github.com/rezarahiminia/worldcup2026 (zdarma, bez API klíče)
// Spouští se přes GitHub Actions každých 30 minut
// Ručně: SUPABASE_SECRET_KEY=xxx node sync_matches.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const API_BASE = 'https://worldcup26.ir/get';

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
  'ALG': '🇩🇿', 'TUN': '🇹🇳', 'HAI': '🇭🇹', 'BIH': '🇧🇦', 'CPV': '🇨🇻',
  'COD': '🇨🇩', 'CIV': '🇨🇮', 'IRQ': '🇮🇶', 'UZB': '🇺🇿', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'CUW': '🇨🇼', 'KSA': '🇸🇦', 'MLI': '🇲🇱', 'NMI': '🇲🇵',
};

function flag(fifaCode) {
  return TEAM_FLAGS[fifaCode] || '🏳️';
}

// Parsuje scorers string formátu: {"J. Quiñones 9'","R. Jiménez 67'"}
// nebo "null"
function parseScorers(scorersStr, teamName) {
  if (!scorersStr || scorersStr === 'null' || scorersStr === '{}') return [];
  try {
    // Odstraň { a } a rozděluj čárkou před uvozovkami
    const inner = scorersStr.replace(/^\{/, '').replace(/\}$/, '');
    // Najdi všechny položky v uvozovkách
    const matches = inner.match(/[“””][^“””]+[“””]/g) || [];
    return matches.map(s => {
      const clean = s.replace(/^[“””]/, '').replace(/[“””]$/, '').trim();
      // Parsuj "Jméno Příjmení 67'" nebo "Jméno Příjmení 67' (pen.)"
      const minuteMatch = clean.match(/(\d+)['′]/);
      const minute = minuteMatch ? parseInt(minuteMatch[1]) : null;
      const player_name = clean.replace(/\s*\d+['′].*$/, '').trim();
      return { player_name, team: teamName, minute };
    }).filter(g => g.player_name);
  } catch (e) {
    console.warn('   ⚠️ Nelze parsovat střelce:', scorersStr, e.message);
    return [];
  }
}

function matchStatus(g) {
  if (g.finished === 'TRUE') return 'done';
  const t = (g.time_elapsed || '').toLowerCase();
  if (t === 'notstarted' || t === '' || t === '0') return 'open';
  return 'live';
}

function matchPhase(type) {
  if (!type) return 'group';
  const t = type.toLowerCase();
  if (t === 'group') return 'group';
  if (t.includes('16') || t === 'round_of_16') return 'r16';
  if (t.includes('quarter')) return 'qf';
  if (t.includes('semi')) return 'sf';
  if (t.includes('final') && !t.includes('semi')) return 'final';
  return 'group';
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

async function main() {
  console.log(`🔄 Sync spuštěn: ${new Date().toISOString()}`);

  // Stáhni zápasy a týmy
  const [gamesRes, teamsRes] = await Promise.all([
    fetch(`${API_BASE}/games`).then(r => r.json()),
    fetch(`${API_BASE}/teams`).then(r => r.json()),
  ]);

  const games = Array.isArray(gamesRes) ? gamesRes : gamesRes.games || gamesRes.data || [];
  const teams = Array.isArray(teamsRes) ? teamsRes : teamsRes.teams || teamsRes.data || [];

  console.log(`📋 Staženo ${games.length} zápasů, ${teams.length} týmů`);

  // Mapuj team_id → { fifaCode, name }
  const teamMap = {};
  for (const t of teams) {
    teamMap[t.id] = { fifaCode: t.fifa_code, name: t.name_en };
  }

  // Filtruj relevantní zápasy (live nebo dokončené)
  const relevant = games.filter(g => g.finished === 'TRUE' || matchStatus(g) === 'live');
  console.log(`⚽ Relevantní zápasy (live/done): ${relevant.length}`);

  if (relevant.length === 0) {
    console.log('💤 Žádné aktivní zápasy, sync přeskočen');
    return;
  }

  let updated = 0;
  let goalsTotal = 0;

  for (const g of relevant) {
    const homeTeam = teamMap[g.home_team_id] || { fifaCode: '???', name: g.home_team_name_en };
    const awayTeam = teamMap[g.away_team_id] || { fifaCode: '???', name: g.away_team_name_en };
    const homeFlag = flag(homeTeam.fifaCode);
    const awayFlag = flag(awayTeam.fifaCode);
    const status = matchStatus(g);
    const homeScore = g.home_score !== null && g.home_score !== '' && g.home_score !== '0' || status === 'done'
      ? parseInt(g.home_score) || 0
      : null;
    const awayScore = g.away_score !== null && g.away_score !== '' && g.away_score !== '0' || status === 'done'
      ? parseInt(g.away_score) || 0
      : null;

    // Upsert zápas — použij worldcup26 id jako match_id (prefixované aby nekolidovalo)
    const matchId = `wc26_${g.id}`;

    // Najdi zápas v Supabase podle home+away týmu (zápasy mohly být importovány z jiného API)
    const existing = await supabaseFetch(
      `/rest/v1/matches?home_team=ilike.*${encodeURIComponent(homeTeam.name)}*&select=id,status,home_score`,
      'GET'
    );

    if (existing && existing.length > 0) {
      const dbMatch = existing[0];
      // Aktualizuj skóre a status
      await supabaseFetch(`/rest/v1/matches?id=eq.${dbMatch.id}`, 'PATCH', {
        status,
        home_score: homeScore,
        away_score: awayScore,
      });

      // Sync gólů pro dokončené zápasy
      if (status === 'done') {
        const homeScorers = parseScorers(g.home_scorers, homeTeam.name);
        const awayScorers = parseScorers(g.away_scorers, awayTeam.name);
        const allGoals = [...homeScorers, ...awayScorers];

        if (allGoals.length > 0) {
          await supabaseFetch(`/rest/v1/goals?match_id=eq.${dbMatch.id}`, 'DELETE');
          const goalRows = allGoals.map(gl => ({
            match_id: dbMatch.id,
            player_name: gl.player_name,
            team: gl.team,
            minute: gl.minute,
          }));
          await supabaseFetch('/rest/v1/goals', 'POST', goalRows);
          goalsTotal += allGoals.length;
          console.log(`   ⚽ ${homeTeam.name} ${homeScore}:${awayScore} ${awayTeam.name} — střelci: ${allGoals.map(x => x.player_name).join(', ')}`);
        } else {
          console.log(`   📊 ${homeTeam.name} ${homeScore}:${awayScore} ${awayTeam.name}`);
        }
      } else {
        console.log(`   🔴 LIVE: ${homeTeam.name} ${homeScore ?? '?'}:${awayScore ?? '?'} ${awayTeam.name}`);
      }
      updated++;
    } else {
      console.warn(`   ⚠️ Zápas nenalezen v DB: ${homeTeam.name} vs ${awayTeam.name}`);
    }
  }

  console.log(`✅ Aktualizováno ${updated} zápasů, ${goalsTotal} gólů`);

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
