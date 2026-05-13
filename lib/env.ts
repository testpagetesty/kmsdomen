function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Отсутствует переменная окружения: ${name}`);
  return v.trim();
}

export function getGithubConfig() {
  return {
    token: requireEnv("GITHUB_TOKEN"),
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    branch: requireEnv("GITHUB_BRANCH"),
  };
}

/**
 * Папка с новыми доменами (ежедневная загрузка для прохождения).
 * GITHUB_CONTENT_PREFIX не задан → "countries"
 * GITHUB_CONTENT_PREFIX="" → файлы в корне репо
 */
export function resolveDomainsPrefix(): string {
  const raw = process.env.GITHUB_CONTENT_PREFIX;
  if (raw === undefined || raw === null) return "countries";
  return raw.replace(/^\/+|\/+$/g, "").trim();
}

/**
 * Папка с доменами с тизерами (проверенный список).
 * GITHUB_TEASERS_PREFIX не задан → "teasers"
 * GITHUB_TEASERS_PREFIX="" → файлы в корне репо
 */
export function resolveTeasersPrefix(): string {
  const raw = process.env.GITHUB_TEASERS_PREFIX;
  if (raw === undefined || raw === null) return "teasers";
  return raw.replace(/^\/+|\/+$/g, "").trim();
}

/**
 * Папка с историей добавлений доменов с тизерами (JSONL).
 * GITHUB_TEASERS_HISTORY_PREFIX не задан → "teasers-meta"
 * GITHUB_TEASERS_HISTORY_PREFIX="" → файлы в корне репо
 */
export function resolveTeasersHistoryPrefix(): string {
  const raw = process.env.GITHUB_TEASERS_HISTORY_PREFIX;
  if (raw === undefined || raw === null) return "teasers-meta";
  return raw.replace(/^\/+|\/+$/g, "").trim();
}

/**
 * Пройденные новые домены (JSON: нормализованный домен → ISO дата).
 * GITHUB_PASSED_DOMAINS_PREFIX не задан → "passed-domains"
 */
export function resolvePassedDomainsPrefix(): string {
  const raw = process.env.GITHUB_PASSED_DOMAINS_PREFIX;
  if (raw === undefined || raw === null) return "passed-domains";
  return raw.replace(/^\/+|\/+$/g, "").trim();
}

/** Строит полный путь к файлу страны */
export function countryFilePath(prefix: string, code: string) {
  return prefix ? `${prefix}/${code}.txt` : `${code}.txt`;
}

/** JSON по стране, например passed-domains/de.json */
export function countryJsonFilePath(prefix: string, code: string) {
  const base = prefix ? `${prefix}/${code}` : `${code}`;
  return `${base}.json`;
}

/** Если задано — сохранение только с заголовком Authorization: Bearer <пароль> */
export function getAdminPassword(): string | undefined {
  const p = process.env.ADMIN_PASSWORD;
  if (!p?.trim()) return undefined;
  return p.trim();
}
