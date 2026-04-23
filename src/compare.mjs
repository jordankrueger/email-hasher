export function intersection(a, b) {
  const setB = new Set(b);
  const out = new Set();
  for (const v of a) if (setB.has(v)) out.add(v);
  return out;
}

export function difference(a, b) {
  const setB = new Set(b);
  const out = new Set();
  for (const v of a) if (!setB.has(v)) out.add(v);
  return out;
}
