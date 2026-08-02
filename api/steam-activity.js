// Vercel serverless function. Steam profile must stay public.
const STEAM_PROFILE = 'https://steamcommunity.com/id/logimox?l=english';

function decode(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function text(value = '') {
  return decode(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

export default async function handler(request, response) {
  try {
    const steamResponse = await fetch(STEAM_PROFILE, {
      headers: { 'user-agent': 'logimox-portfolio-activity/1.0' },
      next: { revalidate: 300 },
    });
    if (!steamResponse.ok) throw new Error(`Steam returned ${steamResponse.status}`);
    const html = await steamResponse.text();

    const activityStart = html.indexOf('profile_recentgame');
    const recentSection = html.slice(activityStart, activityStart + 30000);
    const games = [...recentSection.matchAll(/<div class="game_name"><a[^>]+steamcommunity\.com\/app\/(\d+)[^>]*>([^<]+)<\/a>/g)]
      .slice(0, 5)
      .map((match) => ({
        appId: match[1],
        name: decode(match[2]),
        url: `https://store.steampowered.com/app/${match[1]}/`,
      }));

    const hours = text((recentSection.match(/(\d+(?:\.\d+)?) hrs? on record/) || [])[0]);
    const library = text((html.match(/[\d,]+ games owned/) || [])[0]);

    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    response.status(200).json({ games, hours, library, updatedAt: new Date().toISOString() });
  } catch (error) {
    response.status(502).json({ error: 'Steam activity is temporarily unavailable.' });
  }
}
