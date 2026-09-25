'use strict';
// Split a list into pages, and keep a requested page number in range.
//
//   const pages = paginate(items, 10);
//   const page = pages[clampPage(requested, pages.length)];

function paginate(items, perPage) {
  if (perPage < 1) throw new Error('perPage must be at least 1');
  if (!items.length) return [[]];
  const out = [];
  for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
  return out;
}

/** Keep a 0-based page index inside [0, totalPages - 1]. */
const clampPage = (page, totalPages) => Math.max(0, Math.min(page, Math.max(totalPages - 1, 0)));

/** 0-based page -> "Page 1 of 5". */
const pageLabel = (page, totalPages) => `Page ${page + 1} of ${Math.max(totalPages, 1)}`;

module.exports = { paginate, clampPage, pageLabel };
