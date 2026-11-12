import { useState } from "react";
import { X } from "lucide-react";
import Avatar from "./Avatar";
import { useChatStore } from "../store/useChatStore";
import { daysUntilBirthday, birthdayWhen } from "../lib/birthdays";

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "them";

// Top of the chat list: whose birthday is coming up this week (and yours), tap to open the chat and wish them.
const BirthdayStrip = ({ users, authUser, onOpen }) => {
  const now = new Date();
  const rows = [];
  for (const u of users || []) {
    const n = daysUntilBirthday(u.birthday, now);
    if (n !== null && n <= 7) rows.push({ u, n });
  }
  rows.sort((a, b) => a.n - b.n);
  const mine = daysUntilBirthday(authUser?.birthday, now);
  if (!rows.length && mine !== 0) return null;
  return (
    <div className="px-3 pt-2 pb-1">
      <p className="px-1 pb-1.5 text-[12px] font-medium text-wa-muted">🎂 Birthdays</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {mine === 0 && (
          <div className="shrink-0 flex items-center gap-2 rounded-full bg-[#25D366]/15 pl-1.5 pr-3.5 h-11">
            <Avatar src={authUser.profilePic} name={authUser.fullName} size="size-8" textSize="text-sm" />
            <span className="text-[13px] text-wa-text">Happy birthday! 🎉</span>
          </div>
        )}
        {rows.map(({ u, n }) => (
          <button
            key={u._id}
            type="button"
            onClick={() => onOpen(u)}
            className={`shrink-0 flex items-center gap-2 rounded-full pl-1.5 pr-3.5 h-11 text-left active:opacity-80 ${n === 0 ? "bg-[#25D366]/15" : "bg-wa-surface"}`}
          >
            <Avatar src={u.profilePic} name={u.fullName} size="size-8" textSize="text-sm" />
            <span className="leading-tight">
              <span className="block text-[13px] text-wa-text max-w-[110px] truncate">{firstName(u.fullName)}</span>
              <span className={`block text-[11.5px] ${n === 0 ? "text-[#25D366] font-medium" : "text-wa-muted"}`}>{n === 0 ? "🎂 today" : birthdayWhen(n)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Inside a 1:1 chat on the day itself: a one-tap way to send the wish.
export const BirthdayBanner = ({ peer }) => {
  const dayKey = `bday-${peer?._id}-${new Date().toDateString()}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return !!localStorage.getItem(dayKey);
    } catch {
      return false;
    }
  });
  if (!peer || hidden || daysUntilBirthday(peer.birthday) !== 0) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(dayKey, "1");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mx-3 mt-2 mb-1 flex items-center gap-2 rounded-2xl bg-[#25D366]/15 px-3.5 py-2.5">
      <span className="text-xl">🎂</span>
      <p className="flex-1 min-w-0 text-[13px] text-wa-text leading-snug">Today is {firstName(peer.fullName)}'s birthday</p>
      <button
        type="button"
        onClick={() => {
          useChatStore.getState().sendMessage({ text: `Happy birthday ${firstName(peer.fullName)}! 🎂🎉` });
          hide();
        }}
        className="shrink-0 h-8 px-3.5 rounded-full bg-[#25D366] text-wa-bg text-[12.5px] font-medium"
      >
        Wish
      </button>
      <button type="button" onClick={hide} className="shrink-0 size-7 flex items-center justify-center text-wa-muted" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
};

export default BirthdayStrip;
