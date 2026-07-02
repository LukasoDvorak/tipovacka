// Automatický sync zápasů MS 2026 z worldcup26.ir do Supabase
// Zdroj: https://github.com/rezarahiminia/worldcup2026 (zdarma, bez API klíče)
// Spouští se přes GitHub Actions každých 30 minut
// Ručně: SUPABASE_SECRET_KEY=xxx node sync_matches.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const API_BASE = 'https://worldcup26.ir/get';
const CT_SPORT_URL = 'https://sport.ceskatelevize.cz/video-vypis/rubrika/fotbal/mistrovstvi-sveta-53';

// Mapování českých názvů zemí → anglické (jak jsou v DB)
const CZ_TO_EN = {
  // Skupina A
  'česko':'Czechia','česká republika':'Czechia',
  'jižní korea':'South Korea','korea':'South Korea',
  'nigérie':'Nigeria',
  'ekvádor':'Ecuador',
  // Skupina B
  'katar':'Qatar',
  'švýcarsko':'Switzerland',
  'senegal':'Senegal',
  'japonsko':'Japan',
  // Skupina C
  'brazílie':'Brazil',
  'maroko':'Morocco',
  'haiti':'Haiti',
  'skotsko':'Scotland',
  // Skupina D
  'austrálie':'Australia',
  'turecko':'Türkiye','turkiye':'Türkiye',
  'usa':'USA','spojené státy':'USA','united states':'USA',
  'paraguay':'Paraguay',
  // Skupina E
  'francie':'France',
  'mexiko':'Mexico',
  'jihoafrická republika':'South Africa','jar':'South Africa',
  'argentina':'Argentina',
  // Skupina F
  'španělsko':'Spain',
  'alžírsko':'Algeria',
  'chorvatsko':'Croatia',
  'kanada':'Canada',
  // Skupina G
  'německo':'Germany',
  'curacao':'Curaçao',
  'belgie':'Belgium',
  'itálie':'Italy',
  // Skupina H
  'portugalsko':'Portugal',
  'irák':'Iraq',
  'uruguaj':'Uruguay','uruguay':'Uruguay',
  'angola':'Angola',
  // Skupina I
  'nizozemsko':'Netherlands','holandsko':'Netherlands',
  'egypt':'Egypt',
  'kolumbie':'Colombia',
  'írán':'Iran',
  // Skupina J
  'anglie':'England',
  'tunisko':'Tunisia',
  'srbsko':'Serbia',
  'panama':'Panama',
  // Skupina K
  'mali':'Mali',
  'slovensko':'Slovakia',
  'polsko':'Poland',
  'slovinsko':'Slovenia',
  // Skupina L
  'bosna':'Bosnia-Herzegovina','bosna a hercegovina':'Bosnia-Herzegovina',
  'uzbekistán':'Uzbekistan',
  'norsko':'Norway',
  'demokratická republika kongo':'Congo DR','kongo':'Congo DR','dr kongo':'Congo DR',
  // Ostatní účastníci / alternativní názvy
  'bolívie':'Bolivia',
  'kapverdy':'Cape Verde Islands','kapverdské ostrovy':'Cape Verde Islands',
  'chile':'Chile',
  'čína':'China',
  'kostarika':'Costa Rica',
  'dánsko':'Denmark',
  'ghana':'Ghana',
  'řecko':'Greece',
  'honduras':'Honduras',
  'maďarsko':'Hungary',
  'indie':'India',
  'indonésie':'Indonesia',
  'jordánsko':'Jordan',
  'nový zéland':'New Zealand',
  'peru':'Peru',
  'filipíny':'Philippines',
  'rumunsko':'Romania',
  'saúdská arábie':'Saudi Arabia',
  'thajsko':'Thailand',
  'ukrajina':'Ukraine',
  'venezuela':'Venezuela',
  'pobřeží slonoviny':'Ivory Coast','pob. slonoviny':'Ivory Coast','pob slonoviny':'Ivory Coast',
  's. arábie':'Saudi Arabia','saúd. arábie':'Saudi Arabia',
  'bosna a h.':'Bosnia-Herzegovina','bosna a h':'Bosnia-Herzegovina',
  'švédsko':'Sweden',
  'rakousko':'Austria',
};

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
      // Parsuj “Jméno Příjmení 67'” nebo “Jméno Příjmení 45+3' (pen.)”
      const minuteMatch = clean.match(/(\d+)(?:\+\d+)?['′]/);
      const minute = minuteMatch ? parseInt(minuteMatch[1]) : null;
      const player_name = clean.replace(/\s*\d+(?:\+\d+)?['′].*$/, '').trim();
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
  "Côte d'Ivoire": 'Ivory Coast',
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
  if (t === 'r32') return 'r32';
  if (t === 'r16' || t.includes('16') || t === 'round_of_16') return 'r16';
  if (t.includes('quarter')) return 'qf';
  if (t.includes('semi')) return 'sf';
  if (t === 'third') return 'third';
  if (t.includes('final') && !t.includes('semi')) return 'final';
  return 'group';
}

const GROUP_NAME_MAP = {
  group: null, r32: 'LAST_32', r16: 'LAST_16',
  qf: 'QUARTER_FINALS', sf: 'SEMI_FINALS', third: 'THIRD_PLACE', final: 'FINAL',
};

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

// Slovník garblovaných jmen z API (samohlásky odstraněny/nahrazeny)
const GARBLED_NAMES = {
  'hri kin': 'Harry Kane',
  'jvd blingham': 'Jude Bellingham',
  'nvnv mndz': 'Nuno Mendes',
  'aldvr shvmvrvdvf': 'Eldor Shomurodov',
  'markvs hlmgrn pdrsn': 'Markus Holmgren Pedersen',
  'dnil mvnvz': 'Daniel Muñoz',
  'j. mcginn': 'John McGinn',
};

function matchPlayerName(apiName, playersList) {
  if (!playersList || playersList.length === 0) return apiName;

  // 0. Kontrola slovníku garblovaných jmen
  const garbled = GARBLED_NAMES[normalize(apiName)];
  if (garbled) return garbled;

  const normApi = normalize(apiName);

  // 1. Přesná shoda
  const exact = playersList.find(p => normalize(p.player_name) === normApi);
  if (exact) return exact.player_name;

  // 2. Shoda příjmení (poslední slovo)
  const apiLastName = normApi.split(' ').pop();
  const byLastName = playersList.filter(p => normalize(p.player_name).split(' ').pop() === apiLastName);
  if (byLastName.length === 1) return byLastName[0].player_name;

  // 3. Shoda příjmení + iniciála (např. "R. Jiménez" → iniciála "r"; nebo první písmeno jména)
  const apiInitial = normApi.includes('.') ? normApi.split('.')[0]?.trim() : normApi.charAt(0);
  if (apiInitial && byLastName.length > 1) {
    const byInitial = byLastName.find(p => normalize(p.player_name).charAt(0) === apiInitial);
    if (byInitial) return byInitial.player_name;
  }

  // 4. Nenalezeno — vrátíme původní jméno z API
  return apiName;
}

// Stáhne seznam highlights z ČT sport a matchuje na zápasy podle jmen týmů
let ctHighlightsCache = null;
async function loadCtHighlights() {
  if (ctHighlightsCache) return ctHighlightsCache;
  const videos = [];
  try {
    // Projdi všechny stránky (max 10) dokud nenajdeme méně videí než očekáváme
    for (let page = 1; page <= 10; page++) {
      const url = page === 1 ? CT_SPORT_URL : `${CT_SPORT_URL}?page=${page}`;
      const res = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'cs,en;q=0.5',
        }
      });
      const html = await res.text();
      const before = videos.length;
      const chunks = html.split(/href="\/video\//);
      for (let i = 1; i < chunks.length; i++) {
        const slug = chunks[i].split('"')[0];
        // Zajímají nás jen sestřihy a záznamy utkání
        if (!slug.includes('sestrih')) continue;
        const videoUrl = `https://sport.ceskatelevize.cz/video/${slug}`;
        // Jméno z URL slugu (bez číselného ID na konci)
        const title = slug.replace(/-\d+$/, '').replace(/-/g, ' ');
        if (!videos.find(v => v.url === videoUrl)) {
          videos.push({ url: videoUrl, title });
        }
      }
      console.log(`   📺 ČT sport stránka ${page}: ${videos.length - before} nových videí`);
      // Pokud stránka nepřidala žádná nová videa, jsme na konci
      if (videos.length === before) break;
    }
    ctHighlightsCache = videos;
    console.log(`   📺 ČT sport celkem: ${videos.length} sestřihů/záznamů`);
    return videos;
  } catch (e) {
    console.warn('   ⚠️ ČT sport scraping selhal:', e.message);
    return videos;
  }
}

function normCz(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Převede anglické jméno týmu z DB na normalizované české pro matching
function enToCzNorm(enName) {
  const lower = enName.toLowerCase();
  for (const [cz, en] of Object.entries(CZ_TO_EN)) {
    if (en.toLowerCase() === lower) return normCz(cz);
  }
  return normCz(enName);
}

function findHighlight(homeTeam, awayTeam, videos) {
  try {
    const normHome = enToCzNorm(homeTeam);
    const normAway = enToCzNorm(awayTeam);
    const matches = videos.filter(v => {
      const t = normCz(v.title);
      return t.includes(normHome) && t.includes(normAway);
    });
    if (matches.length === 0) return null;
    // Preferuj sestřih před záznamem
    const sestrih = matches.find(v => v.url.includes('sestrih'));
    return (sestrih || matches[0]).url;
  } catch (e) {
    console.warn('   ⚠️ findHighlight selhal:', e.message);
    return null;
  }
}

// Doplní tým do navazujícího playoff zápasu na základě výsledku zdrojového zápasu
// (home_source_id/away_source_id + home_source_type/away_source_type = 'winner'/'loser')
async function propagateBracketWinners() {
  const pending = await supabaseFetch(
    `/rest/v1/matches?or=(home_source_id.not.is.null,away_source_id.not.is.null)&select=id,home_team,away_team,home_flag,away_flag,home_source_id,away_source_id,home_source_type,away_source_type`,
    'GET'
  );
  if (!pending || pending.length === 0) return;

  let propagated = 0;
  for (const m of pending) {
    const patch = {};
    if (m.home_source_id && (!m.home_team || m.home_team.includes('TBD') || m.home_team.includes('null'))) {
      const resolved = await resolveSourceTeam(m.home_source_id, m.home_source_type || 'winner');
      if (resolved) { patch.home_team = `${resolved.flag} ${resolved.name}`; patch.home_flag = resolved.flag; }
    }
    if (m.away_source_id && (!m.away_team || m.away_team.includes('TBD') || m.away_team.includes('null'))) {
      const resolved = await resolveSourceTeam(m.away_source_id, m.away_source_type || 'winner');
      if (resolved) { patch.away_team = `${resolved.flag} ${resolved.name}`; patch.away_flag = resolved.flag; }
    }
    if (Object.keys(patch).length > 0) {
      await supabaseFetch(`/rest/v1/matches?id=eq.${m.id}`, 'PATCH', patch);
      console.log(`   🏆 Bracket: doplněno ${JSON.stringify(patch)} → match ${m.id}`);
      propagated++;
    }
  }
  if (propagated > 0) console.log(`✅ Propagováno ${propagated} bracket týmů`);
}

async function resolveSourceTeam(sourceId, type) {
  const src = await supabaseFetch(
    `/rest/v1/matches?id=eq.${sourceId}&select=status,home_team,away_team,home_flag,away_flag,home_score,away_score,penalty_home_score,penalty_away_score`,
    'GET'
  );
  if (!src || src.length === 0 || src[0].status !== 'done') return null;
  const s = src[0];
  if (s.home_score == null || s.away_score == null) return null;
  let homeWins;
  if (s.home_score !== s.away_score) {
    homeWins = s.home_score > s.away_score;
  } else if (s.penalty_home_score != null && s.penalty_away_score != null) {
    homeWins = s.penalty_home_score > s.penalty_away_score;
  } else {
    return null; // remíza bez penalt — výsledek zatím neznámý
  }
  const winnerIsHome = type === 'winner' ? homeWins : !homeWins;
  return winnerIsHome
    ? { name: (s.home_team || '').replace(/^\S+\s/, ''), flag: s.home_flag }
    : { name: (s.away_team || '').replace(/^\S+\s/, ''), flag: s.away_flag };
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

  // Načti ČT videa jednou pro celý sync
  const ctVideos = await loadCtHighlights();

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

    const phase = matchPhase(g.type);
    const groupName = GROUP_NAME_MAP[phase];

    // Najdi zápas v Supabase — nejdřív podle jmen, pak podle kickoff_at pro playoff TBD
    let existing = await supabaseFetch(
      `/rest/v1/matches?home_team=ilike.*${encodeURIComponent(homeTeam.name)}*&away_team=ilike.*${encodeURIComponent(awayTeam.name)}*&select=id,status,home_score,highlight_url,home_team,is_et_win`,
      'GET'
    );
    // Fallback pro playoff: najdi podle group_name + kickoff_at (pro TBD zápasy)
    if ((!existing || existing.length === 0) && groupName) {
      const apiKickoff = new Date(g.local_date.replace(/(\d+)\/(\d+)\/(\d+) (.+)/, '$3-$1-$2T$4:00Z'));
      const byGroup = await supabaseFetch(
        `/rest/v1/matches?group_name=eq.${groupName}&select=id,status,home_score,highlight_url,home_team,kickoff_at,is_et_win`,
        'GET'
      );
      if (byGroup && byGroup.length > 0) {
        const closest = byGroup.sort((a, b) =>
          Math.abs(new Date(a.kickoff_at) - apiKickoff) - Math.abs(new Date(b.kickoff_at) - apiKickoff)
        )[0];
        if (Math.abs(new Date(closest.kickoff_at) - apiKickoff) < 8 * 3600 * 1000) {
          existing = [closest];
          // Doplň jména týmů pokud jsou TBD
          if (closest.home_team?.includes('null') && homeTeam.name) {
            await supabaseFetch(`/rest/v1/matches?id=eq.${closest.id}`, 'PATCH', {
              home_team: `${homeFlag} ${homeTeam.name}`, home_flag: homeFlag,
              away_team: `${awayFlag} ${awayTeam.name}`, away_flag: awayFlag,
              phase, group_name: groupName,
            });
          }
        }
      }
    }

    if (existing && existing.length > 0) {
      const dbMatch = existing[0];
      // Aktualizuj skóre a status
      // is_et_win = true → skóre bylo ručně opraveno na 90min výsledek, nepřepisovat
      if (dbMatch.is_et_win) {
        await supabaseFetch(`/rest/v1/matches?id=eq.${dbMatch.id}`, 'PATCH', { status });
      } else {
        const penaltyPatch = {};
        if (g.home_penalty_score !== undefined && g.home_penalty_score !== null && g.home_penalty_score !== '' && g.home_penalty_score !== 'null') {
          penaltyPatch.penalty_home_score = parseInt(g.home_penalty_score) || 0;
          penaltyPatch.penalty_away_score = parseInt(g.away_penalty_score) || 0;
        }
        await supabaseFetch(`/rest/v1/matches?id=eq.${dbMatch.id}`, 'PATCH', {
          status,
          home_score: homeScore,
          away_score: awayScore,
          ...penaltyPatch,
        });
      }

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
        if (!dbMatch.highlight_url && ctVideos) {
          // Odstraň emoji vlajku ze začátku jména
          const cleanHome = homeTeam.name.replace(/^\S+\s/, '');
          const cleanAway = awayTeam.name.replace(/^\S+\s/, '');
          const highlightUrl = findHighlight(cleanHome, cleanAway, ctVideos);
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

  // Propaguj vítěze/poražené dokončených zápasů do navazujících playoff zápasů (bracket)
  await propagateBracketWinners();

  // Přepočítej body
  try {
    await supabaseFetch('/rest/v1/rpc/recalc_points', 'POST', {});
    console.log('🏆 Body přepočítány');
  } catch (e) {
    console.warn('⚠️ Přepočet bodů selhal:', e.message);
  }

  // Doplň highlights pro všechny done zápasy bez URL (vždy, i mimo zápasový čas)
  console.log('📺 Hledám chybějící highlights na ČT sport...');
  const doneWithoutHighlight = await supabaseFetch(
    '/rest/v1/matches?status=eq.done&highlight_url=is.null&select=id,home_team,away_team', 'GET'
  );
  if (doneWithoutHighlight && doneWithoutHighlight.length > 0) {
    let hlFound = 0;
    for (const match of doneWithoutHighlight) {
      const cleanHome = match.home_team.replace(/^\S+\s/, '');
      const cleanAway = match.away_team.replace(/^\S+\s/, '');
      const hlUrl = findHighlight(cleanHome, cleanAway, ctVideos);
      if (hlUrl) {
        await supabaseFetch(`/rest/v1/matches?id=eq.${match.id}`, 'PATCH', { highlight_url: hlUrl });
        console.log(`   🎬 ${cleanHome} vs ${cleanAway} → ${hlUrl}`);
        hlFound++;
      }
    }
    console.log(`   📺 Highlights doplněno: ${hlFound}/${doneWithoutHighlight.length}`);
  } else {
    console.log('   ✅ Všechny zápasy mají highlight nebo ještě neskončily');
  }

  console.log('✅ Sync dokončen');
}

main().catch(e => {
  console.error('❌ Sync selhal:', e.message);
  process.exit(1);
});
