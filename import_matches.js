// Import zápasů MS 2026 z football-data.org do Supabase
// Spusť: node import_matches.js

const FOOTBALL_API_KEY = '553a3ff2fe8046caaa4a3ce6693fb2af';
const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'ZDE_VLOZ_SERVICE_ROLE_KEY';

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
};

function flag(tla) {
  return TEAM_FLAGS[tla] || '🏳️';
}

function matchStatus(apiStatus) {
  if (apiStatus === 'FINISHED') return 'done';
  if (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') return 'live';
  if (apiStatus === 'TIMED' || apiStatus === 'SCHEDULED') return 'open';
  return 'open';
}

function matchId(m) {
  return `${m.id}`;
}

async function fetchMatches() {
  const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches?season=2026', {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
  });
  const data = await res.json();
  return data.matches;
}

async function upsertToSupabase(matches) {
  const rows = matches.map(m => ({
    id: matchId(m),
    home_team: `${flag(m.homeTeam.tla)} ${m.homeTeam.name}`,
    away_team: `${flag(m.awayTeam.tla)} ${m.awayTeam.name}`,
    home_flag: flag(m.homeTeam.tla),
    away_flag: flag(m.awayTeam.tla),
    group_name: m.group ? m.group.replace('GROUP_', 'Skupina ') : m.stage,
    kickoff_at: m.utcDate,
    status: matchStatus(m.status),
    home_score: m.score?.fullTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? null,
    phase: m.stage === 'GROUP_STAGE' ? 'group' :
           m.stage === 'ROUND_OF_16' ? 'r16' :
           m.stage === 'QUARTER_FINALS' ? 'qf' :
           m.stage === 'SEMI_FINALS' ? 'sf' :
           m.stage === 'FINAL' ? 'final' : 'group',
    api_match_id: m.id,
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
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
    console.error('Supabase chyba:', err);
  } else {
    console.log(`✅ Nahráno ${rows.length} zápasů do Supabase`);
  }
}

async function main() {
  console.log('📡 Stahuji zápasy z football-data.org...');
  const matches = await fetchMatches();
  console.log(`   Staženo ${matches.length} zápasů`);
  console.log('💾 Nahrávám do Supabase...');
  await upsertToSupabase(matches);
}

main().catch(console.error);
