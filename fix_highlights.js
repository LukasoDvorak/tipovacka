// Jednorázový script: doplní highlight_url pro všechny dokončené zápasy
// Spusť: SUPABASE_SECRET_KEY=xxx node fix_highlights.js

const SUPABASE_URL = 'https://upqmxwaulsjagkranahy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CT_SPORT_URL = 'https://sport.ceskatelevize.cz/video-vypis/rubrika/fotbal/mistrovstvi-sveta-53';

if (!SUPABASE_KEY) { console.error('Chybí SUPABASE_SECRET_KEY'); process.exit(1); }

const CZ_TO_EN = {
  'afghánistán':'Afghanistan','albánie':'Albania','alžírsko':'Algeria','angola':'Angola',
  'argentina':'Argentina','austrálie':'Australia','rakousko':'Austria','bahrajn':'Bahrain',
  'belgie':'Belgium','bolívie':'Bolivia','bosna':'Bosnia-Herzegovina','bosna a hercegovina':'Bosnia-Herzegovina',
  'brazílie':'Brazil','kamerun':'Cameroon','kanada':'Canada','kapverdy':'Cape Verde Islands',
  'chile':'Chile','čína':'China','kolumbie':'Colombia','kongo':'Congo DR',
  'kostarika':'Costa Rica','chorvatsko':'Croatia','curacao':'Curaçao','česká republika':'Czechia',
  'česko':'Czechia','dánsko':'Denmark','ekvádor':'Ecuador','egypt':'Egypt',
  'anglie':'England','francie':'France','německo':'Germany','ghana':'Ghana',
  'řecko':'Greece','haiti':'Haiti','honduras':'Honduras','maďarsko':'Hungary',
  'indie':'India','indonésie':'Indonesia','írán':'Iran','irák':'Iraq',
  'irsko':'Ireland','izrael':'Israel','itálie':'Italy','japonsko':'Japan',
  'jordánsko':'Jordan','jižní korea':'South Korea','korea':'South Korea','katar':'Qatar',
  'mali':'Mali','maroko':'Morocco','mexiko':'Mexico','nizozemsko':'Netherlands',
  'nový zéland':'New Zealand','nigérie':'Nigeria','norsko':'Norway','panama':'Panama',
  'paraguay':'Paraguay','peru':'Peru','filipíny':'Philippines','polsko':'Poland',
  'portugalsko':'Portugal','rumunsko':'Romania','saúdská arábie':'Saudi Arabia',
  'skotsko':'Scotland','senegal':'Senegal','srbsko':'Serbia','slovensko':'Slovakia',
  'slovinsko':'Slovenia','jihoafrická republika':'South Africa','španělsko':'Spain',
  'švýcarsko':'Switzerland','thajsko':'Thailand','tunisko':'Tunisia','turecko':'Türkiye',
  'turkiye':'Türkiye','ukraina':'Ukraine','ukrajina':'Ukraine','usa':'USA',
  'spojené státy':'USA','usa':'USA','united states':'USA','uruguay':'Uruguay','uzbekistán':'Uzbekistan','venezuela':'Venezuela',
  'wales':'Wales','zambie':'Zambia',
};

function normCz(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Vrátí VŠECHNY české varianty pro dané anglické jméno
function enToAllCzNorms(enName) {
  const lower = enName.toLowerCase()
    .replace('türkiye', 'turkey')
    .replace('united states', 'usa')
    .replace('côte d\'ivoire', 'ivory coast');
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
    if (match.highlight_url) { skipped++; continue; }

    // Odstraň emoji vlajku ze začátku jména týmu
    const cleanHome = match.home_team.replace(/^\S+\s/, '');
    const cleanAway = match.away_team.replace(/^\S+\s/, '');
    const normHomes = enToAllCzNorms(cleanHome);
    const normAways = enToAllCzNorms(cleanAway);

    const hit = videos.find(v => {
      const t = normCz(v.title);
      return normHomes.some(h => t.includes(h)) && normAways.some(a => t.includes(a));
    });

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
