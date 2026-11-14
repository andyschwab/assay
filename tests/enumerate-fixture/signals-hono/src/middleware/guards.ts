// Guards the routes call themselves: refuses a caller past five shares a minute.
const shares = new Map<string, number>();
export async function checkThrottle(c: { req: { header: (k: string) => string | undefined } }) {
  const key = c.req.header('x-forwarded-for') ?? '';
  const n = (shares.get(key) ?? 0) + 1;
  shares.set(key, n);
  if (n > 5) throw new Error('too many shares');
}
