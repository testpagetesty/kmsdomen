/** Папка со списками доменов в репозитории по умолчанию: countries/de.txt … */
export const DEFAULT_REPO_COUNTRIES_DIR = "countries";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Отсутствует переменная окружения: ${name}`);
  }
  return v.trim();
}

/**
 * PREFIX для путей в GitHub без ведущих/конечных слэшей.
 * Если переменная не задана → `countries`.
 * Если задана пустая строка в окружении → файлы в корне репозитория `{код}.txt`.
 */
export function resolveRepoContentPrefix(): string {
  const raw = process.env.GITHUB_CONTENT_PREFIX;
  if (raw === undefined || raw === null) return DEFAULT_REPO_COUNTRIES_DIR;
  const trimmed = raw.replace(/^\/+|\/+$/g, "").trim();
  if (trimmed === "") return "";
  return trimmed;
}

export function getGithubConfig() {
  return {
    token: requireEnv("GITHUB_TOKEN"),
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    branch: requireEnv("GITHUB_BRANCH"),
    contentPrefix: resolveRepoContentPrefix(),
  };
}

/** Если задано — сохранение только с заголовком Authorization: Bearer <пароль> */
export function getAdminPassword(): string | undefined {
  const p = process.env.ADMIN_PASSWORD;
  if (!p?.trim()) return undefined;
  return p.trim();
}
