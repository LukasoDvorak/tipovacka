// Automatický sync zápasů MS 2026 z worldcup26.ir do Supabase
// Zdroj: https://github.com/rezarahiminia/worldcup2026 (zdarma, bez API klíče)
// Spouští se přes GitHub Actions každých 30 minut
// Ručně: SUPABASE_SECRET_KEY=xxx node sync_matches.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const API_BASE = 'https://worldcup26.ir/get';
const FIFA_YT_CHANNEL = 'UCpcTrCXblq78GZrTUTLWeBw';

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
    // Odstraň { a } a všechny uvozovky (ASCII 0x22, curly 0x201C/0x201D) přes charCode
    const stripped = [...scorersStr].map(c => {
      const code = c.charCodeAt(0);
      if (code === 0x22 || code === 0x201C || code === 0x201D) return '|';
      return c;
    }).join('').replace(/^\{/, '').replace(/\}$/, '');
    // Rozdělení: položky jsou mezi | a |
    const parts = stripped.split('|').map(s => s.replace(/^,/, '').trim()).filter(s => s && s !== ',');
    return parts.map(clean => {
      // Parsuj “Jméno Příjmení 67'” nebo “Jméno Příjmení 67' (pen.)”
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

// Různé API používají různé názvy zemí — normalizujeme na football-data.org verzi
const TEAM_NAME_MAP = {
  'Czech Republic': 'Czechia',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
  'Cape Verde': 'Cape Verde Islands',
  'Democratic Republic of the Congo': 'Congo DR',
  'IR Iran': 'Iran',
  'Korea Republic': 'South Korea',
  'Ivory Coast': "Côte d'Ivoire",
};

function normalizeTeamName(name) {
  return TEAM_NAME_MAP[name] || name;
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

async function fetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i < retries - 1) {
        console.warn(`   ⚠️ Fetch selhal (${i+1}/${retries}): ${e.message} — zkouším znovu za ${delay/1000}s`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
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

// Zkusí matchnout zkrácené jméno (např. "R. Jiménez") na plné jméno z players tabulky
// Porovnává příjmení (poslední slovo) bez diakritiky
function normalize(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function matchPlayerName(apiName, playersList) {
  if (!playersList || playersList.length === 0) return apiName;

  const normApi = normalize(apiName);

  // 1. Přesná shoda
  const exact = playersList.find(p => normalize(p.player_name) === normApi);
  if (exact) return exact.player_name;

  // 2. Shoda příjmení (poslední slovo)
  const apiLastName = normApi.split(' ').pop();
  const byLastName = playersList.filter(p => normalize(p.player_name).split(' ').pop() === apiLastName);
  if (byLastName.length === 1) return byLastName[0].player_name;

  // 3. Shoda příjmení + iniciála (např. "R. Jiménez" → příjmení "jimenez", iniciála "r")
  const apiInitial = normApi.split('.')[0]?.trim();
  if (apiInitial && byLastName.length > 1) {
    const byInitial = byLastName.find(p => normalize(p.player_name).charAt(0) === apiInitial);
    if (byInitial) return byInitial.player_name;
  }

  // 4. Nenalezeno — vrátíme původní jméno z API
  return apiName;
}

// Hledá highlight video na FIFA YouTube kanálu pro daný zápas
async function findHighlight(homeTeam, awayTeam) {
  if (!YOUTUBE_API_KEY) return null;
  try {
    const query = encodeURIComponent(`${homeTeam} v ${awayTeam} FIFA World Cup 2026 Highlights`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${FIFA_YT_CHANNEL}&q=${query}&type=video&order=date&maxResults=3&key=${YOUTUBE_API_KEY}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;
    // Najdi video jehož název obsahuje obě jména týmů
    const normHome = homeTeam.toLowerCase().replace(/[^a-z]/g, '');
    const normAway = awayTeam.toLowerCase().replace(/[^a-z]/g, '');
    const match = data.items.find(item => {
      const title = item.snippet.title.toLowerCase().replace(/[^a-z]/g, '');
      return title.includes(normHome) && title.includes(normAway);
    });
    if (!match) return null;
    return `https://www.youtube.com/watch?v=${match.id.videoId}`;
  } catch (e) {
    console.warn('   ⚠️ YouTube search selhal:', e.message);
    return null;
  }
}

async function main() {
  console.log(`🔄 Sync spuštěn: ${new Date().toISOString()}`);

  // Stáhni zápasy, týmy a hráče (pro matching jmen)
  const [gamesRes, teamsRes, playersRes] = await Promise.all([
    fetchWithRetry(`${API_BASE}/games`).then(r => r.json()),
    fetchWithRetry(`${API_BASE}/teams`).then(r => r.json()),
    supabaseFetch('/rest/v1/players?select=player_name', 'GET'),
  ]);

  const games = Array.isArray(gamesRes) ? gamesRes : gamesRes.games || gamesRes.data || [];
  const teams = Array.isArray(teamsRes) ? teamsRes : teamsRes.teams || teamsRes.data || [];
  const players = playersRes || [];

  console.log(`📋 Staženo ${games.length} zápasů, ${teams.length} týmů, ${players.length} hráčů v DB`);

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
    const homeTeamRaw = teamMap[g.home_team_id] || { fifaCode: '???', name: g.home_team_name_en };
    const awayTeamRaw = teamMap[g.away_team_id] || { fifaCode: '???', name: g.away_team_name_en };
    const homeTeam = { ...homeTeamRaw, name: normalizeTeamName(homeTeamRaw.name) };
    const awayTeam = { ...awayTeamRaw, name: normalizeTeamName(awayTeamRaw.name) };
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

    // Najdi zápas v Supabase podle home+away týmu
    const existing = await supabaseFetch(
      `/rest/v1/matches?home_team=ilike.*${encodeURIComponent(homeTeam.name)}*&away_team=ilike.*${encodeURIComponent(awayTeam.name)}*&select=id,status,home_score,highlight_url`,
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
            player_name: matchPlayerName(gl.player_name, players),
            team: gl.team,
            minute: gl.minute,
          }));
          await supabaseFetch('/rest/v1/goals', 'POST', goalRows);
          goalsTotal += allGoals.length;
          console.log(`   ⚽ ${homeTeam.name} ${homeScore}:${awayScore} ${awayTeam.name} — střelci: ${allGoals.map(x => x.player_name).join(', ')}`);
        } else {
          console.log(`   📊 ${homeTeam.name} ${homeScore}:${awayScore} ${awayTeam.name}`);
        }

        // Hledej highlight video pokud ještě nemáme URL
        if (!dbMatch.highlight_url) {
          const highlightUrl = await findHighlight(homeTeam.name, awayTeam.name);
          if (highlightUrl) {
            await supabaseFetch(`/rest/v1/matches?id=eq.${dbMatch.id}`, 'PATCH', { highlight_url: highlightUrl });
            console.log(`   🎬 Highlight nalezen: ${highlightUrl}`);
          }
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
