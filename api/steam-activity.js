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
    const games = [...recentSection.matchAll(/<div class="recent_game">([\s\S]*?)<div style="clear: both;"><\/div>\s*<\/div>/g)]
      .slice(0, 10)
      .map((match) => {
        const block = match[1];
        const appId = (block.match(/steamcommunity\.com\/app\/(\d+)/) || [])[1];
        const name = decode((block.match(/<div class="game_name"><a[^>]*>([^<]+)<\/a>/) || [])[1] || 'Unknown game');
        const capsule = (block.match(/class="game_capsule" src="([^"]+)/) || [])[1] || '';
        const details = text((block.match(/<div class="game_info_details">([\s\S]*?)<\/div>/) || [])[1]);
        const achievements = text((block.match(/(\d+) of \d+ achievements/) || [])[1]);
        return { appId, name, capsule, details, achievements, url: `https://store.steampowered.com/app/${appId}/` };
      });
    if (!games.length) {
      games.push(...[...recentSection.matchAll(/<div class="game_name"><a[^>]+steamcommunity\.com\/app\/(\d+)[^>]*>([^<]+)<\/a>/g)]
        .slice(0, 10).map((match) => ({ appId: match[1], name: decode(match[2]), capsule: '', details: '', achievements: '', url: `https://store.steampowered.com/app/${match[1]}/` })));
    }

    const hours = text((recentSection.match(/(\d+(?:\.\d+)?) hrs? on record/) || [])[0]);
    const library = text((html.match(/[\d,]+ games owned/) || [])[0]);
    const header = html.slice(html.indexOf('profile_header_content'), html.indexOf('profile_header_content') + 12000);
    const avatar = (header.match(/class="playerAvatar[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1] || '';
    const banner = (html.match(/<source src="([^"]+\.mp4)" type="video\/mp4">/) || [])[1] || '';
    const name = text((header.match(/actual_persona_name">([\s\S]*?)<\//) || [])[1]);
    const level = text((header.match(/friendPlayerLevelNum">(\d+)/) || [])[1]);
    const friends = text((html.match(/count_link_label">Friends[\s\S]*?profile_count_link_total">\s*([\d,]+)/) || [])[1]);
    const recentHours = text((html.match(/recentgame_recentplaytime[\s\S]*?<div>([^<]+)<\//) || [])[1]);
    const memberSince = text((html.match(/Member since ([^.<]+)\./) || [])[1]);
    const status = /profile_in_game_header">Currently Online/.test(header) ? 'ONLINE' : 'OFFLINE';

    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    response.status(200).json({
      games, hours, library, avatar, banner, name, level, friends, recentHours, memberSince, status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(502).json({ error: 'Steam activity is temporarily unavailable.' });
  }
}
