import { getGithubConfig } from "@/lib/env";

const GH_API = "https://api.github.com";

function authHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  } as Record<string, string>;
}

function encodeContentPath(rel: string) {
  return rel
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export async function fetchRepoFile(fullPath: string): Promise<{ text: string; sha: string }> {
  const { token, owner, repo, branch, contentPrefix } = getGithubConfig();
  const rel = contentPrefix ? `${contentPrefix}/${fullPath}` : fullPath;
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeContentPath(rel)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: authHeaders(token),
    cache: "no-store",
  });

  if (res.status === 404) {
    return { text: "", sha: "" };
  }
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub GET ${rel}: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as {
    encoding: string;
    content?: string;
    sha?: string;
  };
  if (data.encoding !== "base64" || !data.content) {
    throw new Error("Неожиданный ответ GitHub: ожидался файл в base64");
  }
  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { text, sha: data.sha ?? "" };
}

export async function putRepoFile(fullPath: string, text: string, existingSha: string | undefined) {
  const { token, owner, repo, branch, contentPrefix } = getGithubConfig();
  const rel = contentPrefix ? `${contentPrefix}/${fullPath}` : fullPath;
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeContentPath(rel)}`;
  const content = Buffer.from(text, "utf8").toString("base64");
  const body: Record<string, string> = {
    message: `Обновление доменов ${fullPath}`,
    content,
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub PUT ${rel}: ${res.status} ${msg}`);
  }
}
