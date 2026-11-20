/** Construct a GitHub repository REST endpoint without allowing path injection. */
export function githubRepositoryPath(owner, repository) {
  for (const [name, value] of Object.entries({ owner, repository })) {
    if (typeof value !== 'string' || value.trim() !== value || !value || /[\\/\s?#]/u.test(value) || value === '.' || value === '..') {
      throw new TypeError(`${name} must be a non-empty GitHub path segment`);
    }
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

function validateNumber(number, name) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`${name} must be a positive integer`);
}

function pageQuery(page, perPage) {
  validateNumber(page, 'page');
  validateNumber(perPage, 'perPage');
  if (perPage > 100) throw new TypeError('perPage must be at most 100');
  return `?per_page=${perPage}&page=${page}`;
}

/** A minimal GitHub Cloud pull request client with an injectable transport. */
export function createGitHubClient({ owner, repository, token, fetchImpl = globalThis.fetch }) {
  const path = githubRepositoryPath(owner, repository);
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('token is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  async function request(method, suffix, body) {
    const response = await fetchImpl(`https://api.github.com${path}${suffix}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error(`GitHub request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  return {
    getPullRequest(number) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}`);
    },
    listReviewComments(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}/comments${pageQuery(page, perPage)}`);
    },
    listIssueComments(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/issues/${number}/comments${pageQuery(page, perPage)}`);
    },
    createPullRequest({ title, head, base, body = '', draft = false }) {
      for (const [name, value] of Object.entries({ title, head, base })) {
        if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
      }
      if (typeof body !== 'string' || typeof draft !== 'boolean') throw new TypeError('invalid pull request body or draft flag');
      return request('POST', '/pulls', { title, head, base, body, draft });
    },
  };
}
