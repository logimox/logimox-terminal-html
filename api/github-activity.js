const USERNAME = 'logimox';
const API = 'https://api.github.com';

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
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(502).json({ error: 'GitHub activity is temporarily unavailable.' });
  }
}
