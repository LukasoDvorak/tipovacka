// Jednorázový script: doplní highlight_url pro všechny dokončené zápasy
// Spusť: SUPABASE_SECRET_KEY=xxx node fix_highlights.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CT_SPORT_URL = 'https://sport.ceskatelevize.cz/video-vypis/rubrika/fotbal/mistrovstvi-sveta-53';

if (!SUPABASE_KEY) { console.error('Chybí SUPABASE_SECRET_KEY'); process.exit(1); }

const CZ_TO_EN = {
  'česko':'Czechia','česká republika':'Czechia',
  'jižní korea':'South Korea','korea':'South Korea',
  'nigérie':'Nigeria',
  'ekvádor':'Ecuador',
  'katar':'Qatar',
  'švýcarsko':'Switzerland',
  'senegal':'Senegal',
  'japonsko':'Japan',
  'brazílie':'Brazil',
  'maroko':'Morocco',
  'haiti':'Haiti',
  'skotsko':'Scotland',
  'austrálie':'Australia',
  'turecko':'Türkiye','turkiye':'Türkiye',
  'usa':'USA','spojené státy':'USA','united states':'USA',
  'paraguay':'Paraguay',
  'francie':'France',
  'mexiko':'Mexico',
  'jihoafrická republika':'South Africa','jar':'South Africa',
  'argentina':'Argentina',
  'španělsko':'Spain',
  'alžírsko':'Algeria',
  'chorvatsko':'Croatia',
  'kanada':'Canada',
  'německo':'Germany',
  'curacao':'Curaçao',
  'belgie':'Belgium',
  'itálie':'Italy',
  'portugalsko':'Portugal',
  'irák':'Iraq',
  'uruguaj':'Uruguay','uruguay':'Uruguay',
  'angola':'Angola',
  'nizozemsko':'Netherlands','holandsko':'Netherlands',
  'egypt':'Egypt',
  'kolumbie':'Colombia',
  'írán':'Iran',
  'anglie':'England',
  'tunisko':'Tunisia',
  'srbsko':'Serbia',
  'panama':'Panama',
  'mali':'Mali',
  'slovensko':'Slovakia',
  'polsko':'Poland',
  'slovinsko':'Slovenia',
  'bosna':'Bosnia-Herzegovina','bosna a hercegovina':'Bosnia-Herzegovina',
  'uzbekistán':'Uzbekistan',
  'norsko':'Norway',
  'demokratická republika kongo':'Congo DR','kongo':'Congo DR','dr kongo':'Congo DR',
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
  'pobřeží slonoviny':"Côte d'Ivoire",'pob. slonoviny':"Côte d'Ivoire",'pob slonoviny':"Côte d'Ivoire",
  's. arábie':'Saudi Arabia','saúd. arábie':'Saudi Arabia',
  'bosna a h.':'Bosnia-Herzegovina','bosna a h':'Bosnia-Herzegovina',
  'švédsko':'Sweden',
  'rakousko':'Austria',
};

function normCz(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function enToAllCzNorms(enName) {
  const lower = enName.toLowerCase()
    .replace('türkiye', 'turkey')
    .replace('united states', 'usa')
    .replace("côte d'ivoire", 'pobřeží slonoviny');
  const results = [];
  for (const [cz, en] of Object.entries(CZ_TO_EN)) {
    const enLower = en.toLowerCase().replace('türkiye', 'turkey');
    if (enLower === lower) results.push(normCz(cz));
  }
  if (results.length === 0) results.push(normCz(enName));
  return results;
}

async function loadCtHighlights() {
  const videos = [];
  for (let page = 1; page <= 10; page++) {
    const url = page === 1 ? CT_SPORT_URL : `${CT_SPORT_URL}?page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const html = await res.text();
    const before = videos.length;
    const chunks = html.split(/href="\/video\//);
    for (let i = 1; i < chunks.length; i++) {
      const slug = chunks[i].split('"')[0];
      if (!slug.includes('sestrih') && !slug.includes('zaznam-utkani')) continue;
      const videoUrl = `https://sport.ceskatelevize.cz/video/${slug}`;
      const title = slug.replace(/-\d+$/, '').replace(/-/g, ' ');
      if (!videos.find(v => v.url === videoUrl)) {
        videos.push({ url: videoUrl, title });
      }
    }
    console.log(`   Stránka ${page}: ${videos.length - before} nových videí (celkem ${videos.length})`);
    if (videos.length === before) break;
  }
  return videos;
}

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

async function main() {
  console.log('📺 Stahuji videa z ČT sport...');
  const videos = await loadCtHighlights();
  console.log(`✅ Celkem ${videos.length} sestřihů/záznamů\n`);

  console.log('📋 Načítám dokončené zápasy z DB...');
  const matches = await sbFetch('/rest/v1/matches?status=eq.done&select=id,home_team,away_team,highlight_url&limit=500', 'GET');
  console.log(`   ${matches.length} dokončených zápasů\n`);

  let found = 0, skipped = 0, notFound = 0;

  for (const match of matches) {
    // Přeskoč jen pokud už má sestřih (ne záznam)
    if (match.highlight_url && match.highlight_url.includes('sestrih')) { skipped++; continue; }

    const cleanHome = match.home_team.replace(/^\S+\s/, '');
    const cleanAway = match.away_team.replace(/^\S+\s/, '');
    const normHomes = enToAllCzNorms(cleanHome);
    const normAways = enToAllCzNorms(cleanAway);

    const hits = videos.filter(v => {
      const t = normCz(v.title);
      return normHomes.some(h => t.includes(h)) && normAways.some(a => t.includes(a));
    });
    const hit = hits.find(v => v.url.includes('sestrih')) || hits[0];

    if (hit) {
      await sbFetch(`/rest/v1/matches?id=eq.${match.id}`, 'PATCH', { highlight_url: hit.url });
      console.log(`   ✅ ${match.home_team} vs ${match.away_team} → ${hit.url}`);
      found++;
    } else {
      console.log(`   ❌ ${match.home_team} vs ${match.away_team} — nenalezeno (hledám: [${normHomes.join('/')}] + [${normAways.join('/')}])`);
      notFound++;
    }
  }

  console.log(`\n✅ Hotovo: ${found} doplněno, ${skipped} přeskočeno (už mělo URL), ${notFound} nenalezeno`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
