export function recipeString({ algorithm, case: caseMode, hmac }) {
  const algo = hmac ? 'HMAC-SHA-256' : algorithm;
  const caseLabel = caseMode === 'upper' ? 'uppercase' : 'lowercase';
  const hmacLabel = hmac ? 'with shared passphrase' : 'no HMAC';
  return `${algo}, ${caseLabel}, whitespace trimmed, ${hmacLabel}`;
}
