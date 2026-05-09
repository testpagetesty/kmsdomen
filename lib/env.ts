function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Отсутствует переменная окружения: ${name}`);
  }
  return v.trim();
}

export function getGithubConfig() {
  return {
    token: requireEnv("GITHUB_TOKEN"),
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    branch: requireEnv("GITHUB_BRANCH"),
    contentPrefix: process.env.GITHUB_CONTENT_PREFIX?.replace(/^\/+|\/+$/g, "") ?? "",
  };
}

/** Если задано — сохранение только с заголовком Authorization: Bearer <пароль> */
export function getAdminPassword(): string | undefined {
  const p = process.env.ADMIN_PASSWORD;
  if (!p?.trim()) return undefined;
  return p.trim();
}
