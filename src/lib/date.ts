export function formatYmdShort(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const yy = String(Number(m[1]) % 100);
  const mm = String(Number(m[2]));
  const dd = String(Number(m[3]));
  return `${yy}. ${mm}. ${dd}`;
}


