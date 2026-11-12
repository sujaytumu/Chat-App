// Split bills (client side). Amounts travel and are stored in paise; shares are exact (the odd paise go to the first people).
export const shareOf = (expense, userId) => {
  const list = (expense?.splitAmong || []).map(String);
  const i = list.indexOf(String(userId));
  if (i < 0 || !list.length) return 0;
  const base = Math.floor(expense.amount / list.length);
  return base + (i < expense.amount % list.length ? 1 : 0);
};

// 120050 -> "₹1,200.50", 120000 -> "₹1,200"
export const rupees = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
