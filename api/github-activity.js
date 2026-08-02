const USERNAME = 'logimox';
const API = 'https://api.github.com';

async function getCodeSignal(repos, headers) {
  const repo = repos.find((item) => item.name === 'logimox-terminal-html') || repos[0];
  if (!repo) return [];
  try {
    const response = await fetch(`${API}/repos/${USERNAME}/${repo.name}/contents/index.html?ref=${repo.default_branch}`, { headers });
    if (!response.ok) throw new Error('Code request failed');
    const file = await response.json();
    const text = Buffer.from(file.content || '', 'base64').toString('utf8');
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<=[;{}>])/)
      .map((line) => line.trim())
      .filter((line) => line.length > 12)
      .flatMap((line) => line.match(/.{16,72}/g) || [])
      .slice(0, 96);
  } catch {
    return [];
  }
}

export default async function handler(request, response) {
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'logimox-portfolio-activity/1.0',
    };
    const [userResponse, reposResponse, eventsResponse] = await Promise.all([
      fetch(`${API}/users/${USERNAME}`, { headers }),
      fetch(`${API}/users/${USERNAME}/repos?per_page=100&sort=updated`, { headers }),
      fetch(`${API}/users/${USERNAME}/events/public?per_page=10`, { headers }),
    ]);
    if (!userResponse.ok || !reposResponse.ok || !eventsResponse.ok) throw new Error('GitHub request failed');

    const [user, repos, events] = await Promise.all([
      userResponse.json(), reposResponse.json(), eventsResponse.json(),
    ]);
    const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const forks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
    const latest = events
      .filter((event) => event.type === 'PushEvent' || event.type === 'CreateEvent' || event.type === 'WatchEvent')
      .slice(0, 4)
      .map((event) => ({ type: event.type, repo: event.repo.name, at: event.created_at }));

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
    response.status(502).json({ error: 'GitHub activity is temporarily unavailable.' });
  }
}
