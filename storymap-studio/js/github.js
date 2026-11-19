// github.js — the few GitHub REST calls the studio needs (token in the browser).
const API = "https://api.github.com";

export class GitHub {
  constructor({ owner, repo, token }) {
    this.owner = owner; this.repo = repo; this.token = token;
  }
  async req(path, { method = "GET", body, accept, raw = false } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept || "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) { const e = new Error("Nicht gefunden: " + path); e.status = 404; throw e; }
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch (_) {}
      const e = new Error(`GitHub ${res.status}: ${msg}`); e.status = res.status; throw e;
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }
  get base() { return `/repos/${this.owner}/${this.repo}`; }

  repoInfo() { return this.req(this.base); }
  user() { return this.req("/user"); }

  async refSha(branch) {
    const r = await this.req(`${this.base}/git/ref/heads/${encodeURIComponent(branch)}`);
    return r.object.sha;
  }
  async ensureBranch(branch, from) {
    try { return await this.refSha(branch); }
    catch (e) {
      if (e.status !== 404) throw e;
      const sha = await this.refSha(from);
      await this.req(`${this.base}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha } });
      return sha;
    }
  }

  // text file -> { text, sha } or null
  async readText(path, ref) {
    try {
      const r = await this.req(`${this.base}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {
        accept: "application/vnd.github.raw", raw: true });
      return await r.text();
    } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async readBlob(path, ref) {
    const r = await this.req(`${this.base}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {
      accept: "application/vnd.github.raw", raw: true });
    return await r.blob();
  }
  async fileSha(path, ref) {
    try {
      const r = await this.req(`${this.base}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
      return r.sha;
    } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async list(path, ref) {
    try { return await this.req(`${this.base}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`); }
    catch (e) { if (e.status === 404) return []; throw e; }
  }

  // one commit with several files: [{ path, content (base64) }] and optional deletions [path]
  async commit(branch, message, files, deletions = []) {
    const head = await this.refSha(branch);
    const commit = await this.req(`${this.base}/git/commits/${head}`);
    const tree = [];
    for (const f of files) {
      const blob = await this.req(`${this.base}/git/blobs`, { method: "POST", body: { content: f.content, encoding: "base64" } });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    for (const p of deletions) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    const newTree = await this.req(`${this.base}/git/trees`, { method: "POST", body: { base_tree: commit.tree.sha, tree } });
    const c = await this.req(`${this.base}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
    await this.req(`${this.base}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: { sha: c.sha } });
    return c.sha;
  }

  // publish: merge the draft branch into main (fast and keeps history)
  merge(base, head, message) {
    return this.req(`${this.base}/merges`, { method: "POST", body: { base, head, commit_message: message } });
  }
  commits(branch, path, n = 15) {
    return this.req(`${this.base}/commits?sha=${encodeURIComponent(branch)}${path ? "&path=" + encodePath(path) : ""}&per_page=${n}`);
  }
  compare(base, head) { return this.req(`${this.base}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`); }
  latestRun(branch) {
    return this.req(`${this.base}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`).then((r) => r.workflow_runs[0] || null).catch(() => null);
  }
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
