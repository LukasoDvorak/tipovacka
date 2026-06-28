// Jednorázový script: doplní týmy do r32 playoff zápasů a opraví phase
// Spusť: SUPABASE_SECRET_KEY=xxx node update_playoff.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const API_BASE = 'https://worldcup26.ir/get';

if (!SUPABASE_KEY) { console.error('Chybí SUPABASE_SECRET_KEY'); process.exit(1); }

const TEAM_NAME_MAP = {
  'Czech Republic': 'Czechia',
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
  'Cape Verde': 'Cape Verde Islands',
  'Democratic Republic of the Congo': 'Congo DR',
  'IR Iran': 'Iran',
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
};

const FIFA_FLAGS = {
  'MEX':'🇲🇽','USA':'🇺🇸','CAN':'🇨🇦','BRA':'🇧🇷','ARG':'🇦🇷','COL':'🇨🇴','URU':'🇺🇾','ECU':'🇪🇨',
  'CHI':'🇨🇱','PAR':'🇵🇾','BOL':'🇧🇴','VEN':'🇻🇪','PER':'🇵🇪','HAI':'🇭🇹','PAN':'🇵🇦','CRC':'🇨🇷',
  'ESP':'🇪🇸','FRA':'🇫🇷','GER':'🇩🇪','ENG':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','POR':'🇵🇹','ITA':'🇮🇹','NED':'🇳🇱','BEL':'🇧🇪',
  'CRO':'🇭🇷','SRB':'🇷🇸','SUI':'🇨🇭','DEN':'🇩🇰','POL':'🇵🇱','SVK':'🇸🇰','SVN':'🇸🇮','AUT':'🇦🇹',
  'NOR':'🇳🇴','SWE':'🇸🇪','SCO':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','GRE':'🇬🇷','ROM':'🇷🇴','HUN':'🇭🇺','BIH':'🇧🇦','UKR':'🇺🇦',
  'TUR':'🇹🇷','MOR':'🇲🇦','SEN':'🇸🇳','NGA':'🇳🇬','EGY':'🇪🇬','ALG':'🇩🇿','TUN':'🇹🇳','GHA':'🇬🇭',
  'CIV':'🇨🇮','CMR':'🇨🇲','MLI':'🇲🇱','ANG':'🇦🇴','ZAF':'🇿🇦','COD':'🇨🇩','CPV':'🇨🇻',
  'JPN':'🇯🇵','KOR':'🇰🇷','AUS':'🇦🇺','IRN':'🇮🇷','KSA':'🇸🇦','JOR':'🇯🇴','IRQ':'🇮🇶',
  'UZB':'🇺🇿','IND':'🇮🇳','IDN':'🇮🇩','PHI':'🇵🇭','THA':'🇹🇭','CHN':'🇨🇳','NZL':'🇳🇿',
  'CUR':'🇨🇼','SCO':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
};

async function sbFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function parseLocalDate(dateStr) {
  // "06/28/2026 12:00" → Date object (treat as UTC for sorting only)
  const [datePart, timePart] = dateStr.split(' ');
  const [m, d, y] = datePart.split('/');
  const [h, min] = timePart.split(':');
  return new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
}

async function main() {
  console.log('📡 Načítám API data...');
  const [gamesRes, teamsRes] = await Promise.all([
    fetch(`${API_BASE}/games`).then(r => r.json()),
    fetch(`${API_BASE}/teams`).then(r => r.json()),
  ]);

  const games = gamesRes.games || gamesRes;
  const teams = teamsRes.teams || teamsRes;
  const teamMap = {};
  for (const t of teams) teamMap[t.id] = t;

  // Playoff zápasy z API seřazené podle data
  const apiPlayoff = games
    .filter(g => ['r32', 'r16', 'qf', 'sf', 'third', 'final'].includes(g.type))
    .sort((a, b) => parseLocalDate(a.local_date) - parseLocalDate(b.local_date));

  console.log(`   ${apiPlayoff.length} playoff zápasů v API`);

  // DB playoff zápasy (group_name = LAST_32, LAST_16 nebo phase != group)
  const dbPlayoff = await sbFetch(
    '/rest/v1/matches?or=(group_name.like.LAST_32,group_name.like.LAST_16,group_name.like.QUARTER_FINALS,group_name.like.SEMI_FINALS,group_name.like.FINAL,phase.neq.group)&select=id,group_name,kickoff_at,home_team,away_team,phase&order=kickoff_at',
    'GET'
  );
  console.log(`   ${dbPlayoff.length} playoff zápasů v DB\n`);

  const phaseMap = { r32: 'r32', r16: 'r16', qf: 'qf', sf: 'sf', third: 'third', final: 'final' };
  const groupNameMap = {
    r32: 'LAST_32', r16: 'LAST_16', qf: 'QUARTER_FINALS', sf: 'SEMI_FINALS', third: 'THIRD_PLACE', final: 'FINAL'
  };

  let updated = 0;

  // Skupinuj API a DB zápasy podle fáze a matchuj pozičně (seřazeno chronologicky)
  const phases = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  for (const phaseKey of phases) {
    const groupName = groupNameMap[phaseKey];
    const apiMatches = apiPlayoff.filter(g => g.type === phaseKey);
    const dbMatches = dbPlayoff
      .filter(d => d.group_name === groupName)
      .sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));

    if (apiMatches.length !== dbMatches.length) {
      console.log(`   ⚠️ [${groupName}] Počty nesedí: API ${apiMatches.length} vs DB ${dbMatches.length}`);
    }

    for (let i = 0; i < Math.min(apiMatches.length, dbMatches.length); i++) {
      const g = apiMatches[i];
      const dbMatch = dbMatches[i];
      const homeTeamRaw = teamMap[g.home_team_id];
      const awayTeamRaw = teamMap[g.away_team_id];
      const homeName = homeTeamRaw ? (TEAM_NAME_MAP[homeTeamRaw.name_en] || homeTeamRaw.name_en) : null;
      const awayName = awayTeamRaw ? (TEAM_NAME_MAP[awayTeamRaw.name_en] || awayTeamRaw.name_en) : null;
      const homeFlag = homeTeamRaw ? (FIFA_FLAGS[homeTeamRaw.fifa_code] || '🏳️') : '🏳️';
      const awayFlag = awayTeamRaw ? (FIFA_FLAGS[awayTeamRaw.fifa_code] || '🏳️') : '🏳️';

      const patch = { phase: phaseMap[phaseKey], group_name: groupName };
      if (homeName) { patch.home_team = `${homeFlag} ${homeName}`; patch.home_flag = homeFlag; }
      if (awayName) { patch.away_team = `${awayFlag} ${awayName}`; patch.away_flag = awayFlag; }

      await sbFetch(`/rest/v1/matches?id=eq.${dbMatch.id}`, 'PATCH', patch);
      console.log(`   ✅ [${groupName}] ${homeName || '?'} vs ${awayName || '?'} → id ${dbMatch.id}`);
      updated++;
    }
  }

  console.log(`\n✅ Hotovo: ${updated} zápasů aktualizováno`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
