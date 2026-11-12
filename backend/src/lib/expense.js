// Split bills. Money is kept in paise (whole numbers) so shares never drift: ₹100 between 3 people is 33.34 + 33.33 + 33.33.
const MAX_PAISE = 1_000_000 * 100; // ₹10 lakh per bill is more than any outing needs; it also catches typos

// An "expense" message from the client: what for, how much (rupees), who shares it. The payer is the sender.
export function sanitizeExpense(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 100);
  const paise = Math.round(Number(raw.amount) * 100);
  if (!title || !Number.isInteger(paise) || paise < 100 || paise > MAX_PAISE) return null; // at least ₹1
  const ids = [...new Set((Array.isArray(raw.splitAmong) ? raw.splitAmong : []).map((x) => String(x)))].filter((x) => /^[a-f\d]{24}$/i.test(x));
  return { title, amount: paise, splitAmong: ids, settled: [] };
}

// Keep only people who are really in this chat. Nobody valid left = no bill.
export function scopeExpense(expense, memberIds) {
  const ok = new Set(memberIds.map(String));
  const splitAmong = expense.splitAmong.filter((id) => ok.has(String(id)));
  return splitAmong.length ? { ...expense, splitAmong } : null;
}

// One person's share, in paise; the odd paise go to the first people in the list.
export function shareOf(expense, userId) {
  const list = (expense.splitAmong || []).map(String);
  const i = list.indexOf(String(userId));
  if (i < 0 || !list.length) return 0;
  const base = Math.floor(expense.amount / list.length);
  return base + (i < expense.amount % list.length ? 1 : 0);
}

// Who owes whom across many bills. bills = [{ payer, amount, splitAmong, settled }]. Returns { net, transfers }:
// net[user] > 0 = is owed money, < 0 = owes; transfers = the fewest-ish payments that settle everything.
export function computeBalances(bills) {
  const net = new Map();
  const add = (id, v) => net.set(id, (net.get(id) || 0) + v);
  for (const b of bills) {
    const payer = String(b.payer);
    const settled = new Set((b.settled || []).map(String));
    for (const p of (b.splitAmong || []).map(String)) {
      if (p === payer || settled.has(p)) continue; // own share, or already paid back
      const s = shareOf(b, p);
      add(p, -s);
      add(payer, s);
    }
  }
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return { net: Object.fromEntries([...net].filter(([, v]) => v !== 0)), transfers };
}
