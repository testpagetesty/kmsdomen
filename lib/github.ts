import { getGithubConfig } from "@/lib/env";

const GH_API = "https://api.github.com";

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodeContentPath(rel: string) {
  return rel
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/**
 * Читает файл из репозитория по полному относительному пути от корня.
 * Например: "countries/de.txt" или "teasers/ru.txt"
 */
export async function fetchRepoFile(repoRelPath: string): Promise<{ text: string; sha: string }> {
  const { token, owner, repo, branch } = getGithubConfig();
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeContentPath(repoRelPath)}?ref=${encodeURIComponent(branch)}`;

  const res = await fetch(url, {
    headers: authHeaders(token),
    cache: "no-store",
  });

  if (res.status === 404) return { text: "", sha: "" };

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub GET ${repoRelPath}: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as { encoding: string; content?: string; sha?: string };
  // content может быть пустой строкой для пустого файла — это валидно
  if (data.encoding !== "base64" || data.content === undefined) {
    throw new Error("Неожиданный ответ GitHub: ожидался файл в base64");
  }

  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { text, sha: data.sha ?? "" };
}

/**
 * Список файлов/папок в каталоге репозитория.
 * Для файла вернёт пустой массив.
 */
export async function listRepoDir(
  repoRelPath: string,
): Promise<Array<{ name: string; path: string; type: "file" | "dir" }>> {
  const { token, owner, repo, branch } = getGithubConfig();
  const base = repoRelPath.replace(/^\/+|\/+$/g, "");
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeContentPath(base)}?ref=${encodeURIComponent(branch)}`;

  const res = await fetch(url, {
    headers: authHeaders(token),
    cache: "no-store",
  });

  if (res.status === 404) return [];

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub LIST ${repoRelPath}: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const o = item as { name?: unknown; path?: unknown; type?: unknown };
      if (typeof o.name !== "string" || typeof o.path !== "string") return null;
      const type = o.type === "dir" ? "dir" : o.type === "file" ? "file" : null;
      if (!type) return null;
      return { name: o.name, path: o.path, type };
    })
    .filter((x): x is { name: string; path: string; type: "file" | "dir" } => x !== null);
}

/**
 * Записывает (создаёт или обновляет) файл в репозитории.
 * repoRelPath — полный путь от корня, например "countries/de.txt"
 */
export async function putRepoFile(
  repoRelPath: string,
  text: string,
  existingSha: string | undefined,
) {
  const { token, owner, repo, branch } = getGithubConfig();
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeContentPath(repoRelPath)}`;
  const content = Buffer.from(text, "utf8").toString("base64");

  const body: Record<string, string> = {
    message: `Обновление: ${repoRelPath}`,
    content,
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub PUT ${repoRelPath}: ${res.status} ${msg}`);
  }
}
