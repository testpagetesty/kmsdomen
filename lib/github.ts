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
  if (data.encoding !== "base64" || !data.content) {
    throw new Error("Неожиданный ответ GitHub: ожидался файл в base64");
  }

  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { text, sha: data.sha ?? "" };
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
