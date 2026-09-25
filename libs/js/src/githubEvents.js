'use strict';
// Turn GitHub webhook payloads into Discord embeds (plain objects you can send with any client).
//
//   const embed = githubEventToEmbed(req.headers['x-github-event'], payload);
//   if (embed) await postToDiscord({ embeds: [embed] });
//
// Handles: ping, push, pull_request, issues, issue_comment, release, star, fork. Returns null for events
// that aren't worth a message (for example "labeled"). Verify the signature first (see webhooks.js).
// (Discord webhooks also accept GitHub payloads directly if you add /github to the webhook URL.)

const { truncate } = require('./textfmt');

const GREEN = 0x2ECC71;
const PURPLE = 0x8957E5;
const RED = 0xE74C3C;
const BLUE = 0x3498DB;
const BRAND = 0x5865F2;

const firstLine = (text, limit = 72) => truncate(String(text || '').trim().split('\n')[0], limit);

function embed(title, { url, description, color = BRAND, author, footer } = {}) {
  const e = { title: truncate(title, 256), color };
  if (url) e.url = url;
  if (description) e.description = description;
  if (author) e.author = { name: author };
  if (footer) e.footer = { text: footer };
  return e;
}

function githubEventToEmbed(event, p) {
  const repo = p.repository?.full_name || '';
  const sender = p.sender?.login;
  const action = p.action;

  if (event === 'ping') return embed('Webhook connected', { description: p.zen, color: BLUE, footer: repo || undefined });

  if (event === 'push') {
    const ref = p.ref || '';
    const branch = ref.replace('refs/heads/', '').replace('refs/tags/', '');
    if (p.deleted) return embed(`[${repo}] Deleted ${branch}`, { color: RED, author: sender });
    const commits = p.commits || [];
    if (!commits.length) return null;
    const lines = commits.slice(0, 5).map((c) => `[\`${c.id.slice(0, 7)}\`](${c.url}) ${firstLine(c.message)} - ${c.author?.name || '?'}`);
    if (commits.length > 5) lines.push(`...and ${commits.length - 5} more`);
    return embed(`[${repo}:${branch}] ${commits.length} new commit${commits.length === 1 ? '' : 's'}`, { url: p.compare, description: lines.join('\n'), color: BRAND, author: p.pusher?.name || sender });
  }

  if (event === 'pull_request') {
    const pr = p.pull_request;
    let state = { opened: 'opened', reopened: 'reopened', ready_for_review: 'ready for review' }[action];
    if (action === 'closed') state = pr.merged ? 'merged' : 'closed';
    if (!state) return null;
    const color = { merged: PURPLE, closed: RED }[state] || GREEN;
    return embed(`[${repo}] Pull request ${state}: #${pr.number} ${pr.title}`, {
      url: pr.html_url, description: truncate(pr.body || '', 300) || undefined, color, author: pr.user?.login, footer: `${repo} • ${pr.head.ref} → ${pr.base.ref}`,
    });
  }

  if (event === 'issues') {
    if (!['opened', 'closed', 'reopened'].includes(action)) return null;
    const i = p.issue;
    return embed(`[${repo}] Issue ${action}: #${i.number} ${i.title}`, { url: i.html_url, description: truncate(i.body || '', 300) || undefined, color: action === 'closed' ? RED : GREEN, author: i.user?.login });
  }

  if (event === 'issue_comment') {
    if (action !== 'created') return null;
    const { issue: i, comment: c } = p;
    return embed(`[${repo}] New comment on #${i.number}: ${i.title}`, { url: c.html_url, description: truncate(c.body || '', 300), color: BRAND, author: c.user?.login });
  }

  if (event === 'release') {
    if (action !== 'published') return null;
    const r = p.release;
    return embed(`[${repo}] ${r.prerelease ? 'Pre-release' : 'Released'} ${r.name || r.tag_name}`, { url: r.html_url, description: truncate(r.body || '', 500) || undefined, color: GREEN, author: r.author?.login });
  }

  if (event === 'star') {
    if (action !== 'created') return null;
    return embed(`[${repo}] New star`, { description: `${sender} starred it. Total: ${p.repository?.stargazers_count ?? '?'}`, color: BRAND });
  }

  if (event === 'fork') {
    const f = p.forkee;
    return embed(`[${repo}] Forked`, { url: f.html_url, description: f.full_name, color: BRAND, author: sender });
  }

  return null;
}

module.exports = { githubEventToEmbed };
