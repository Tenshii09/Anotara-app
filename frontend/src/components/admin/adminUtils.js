export function formatNumber(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString();
  }
  return value ?? "0";
}
