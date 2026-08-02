// This helper robot visits LogiMoX’s public GitHub page.
const USERNAME = 'logimox';
const API = 'https://api.github.com';

// The Matrix rain needs real code to rain down.
// We choose this portfolio first, or the first project if it is not there.
async function getCodeSignal(repos, headers) {
  const repo = repos.find((item) => item.name === 'logimox-terminal-html') || repos[0];
  if (!repo) return [];
  try {
    // Ask GitHub for the page’s index.html file.
    const response = await fetch(`${API}/repos/${USERNAME}/${repo.name}/contents/index.html?ref=${repo.default_branch}`, { headers });
    if (!response.ok) throw new Error('Code request failed');
    const file = await response.json();

    // GitHub wraps the code in base64, like a secret present.
    // Open it, tidy it, and cut it into small rain-sized pieces.
    const text = Buffer.from(file.content || '', 'base64').toString('utf8');
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<=[;{}>])/)
      .map((line) => line.trim())
      .filter((line) => line.length > 12)
      .flatMap((line) => line.match(/.{16,72}/g) || [])
      .slice(0, 96);
  } catch {
    // No code is okay. The site can use its normal rain instead.
    return [];
  }
}

// Vercel runs this when the portfolio asks for fresh GitHub news.
export default async function handler(request, response) {
  try {
    // These stickers tell GitHub what kind of answer we would like.
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'logimox-portfolio-activity/1.0',
    };

    // Ask for the profile, projects and recent public happenings at the same time.
    const [userResponse, reposResponse, eventsResponse] = await Promise.all([
      fetch(`${API}/users/${USERNAME}`, { headers }),
      fetch(`${API}/users/${USERNAME}/repos?per_page=100&sort=updated`, { headers }),
      fetch(`${API}/users/${USERNAME}/events/public?per_page=10`, { headers }),
    ]);
    if (!userResponse.ok || !reposResponse.ok || !eventsResponse.ok) throw new Error('GitHub request failed');

    const [user, repos, events] = await Promise.all([
      userResponse.json(), reposResponse.json(), eventsResponse.json(),
    ]);

    // Count every star and fork from all public projects.
    const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const forks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);

    // Keep only the kinds of news that make sense in the small live ticker.
    const latest = events
      .filter((event) => event.type === 'PushEvent' || event.type === 'CreateEvent' || event.type === 'WatchEvent')
      .slice(0, 4)
      .map((event) => ({ type: event.type, repo: event.repo.name, at: event.created_at }));

    // Give the portfolio a small, tidy lunchbox of public GitHub information.
    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    response.status(200).json({
      profile: user.html_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      stars,
      forks,
      latest,
      code: await getCodeSignal(repos, headers),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // If GitHub is busy, the page gets a gentle message instead of an explosion.
    response.status(502).json({ error: 'GitHub activity is temporarily unavailable.' });
  }
}
