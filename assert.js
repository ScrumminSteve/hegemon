export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}
export function ok(cond, msg = 'expected truthy') {
  if (!cond) throw new Error(msg);
}
export function throws(fn, msg = 'expected throw') {
  try { fn(); } catch { return; }
  throw new Error(msg);
}
