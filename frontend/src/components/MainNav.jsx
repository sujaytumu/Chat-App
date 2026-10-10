import { useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { goTab } from "../lib/tabNav";
import { WaChats, WaUpdates, WaCalls } from "./icons/WaIcons";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";

const items = [
  { to: "/", icon: WaChats, label: "Chats", end: true },
  { to: "/status", icon: WaUpdates, label: "Updates" },
  { to: "/calls", icon: WaCalls, label: "Calls" },
];

// WhatsApp's persistent nav: Chats / Updates / Calls / You — a vertical rail
// on desktop, a bottom tab bar (with a pill behind the active icon) on phones.
const MainNav = () => {
  const { authUser } = useAuthStore();
  const archived = authUser?.archivedChats;
  const lockedKeys = authUser?.lockedChats;
  // Archived chats don't count towards the badge (like WhatsApp). Select the
  // raw lists and total below so the selector stays stable between renders.
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const unread = useMemo(() => {
    const hidden = new Set([...(archived || []), ...(lockedKeys || [])]);
    return (
      users.reduce((sum, c) => sum + (hidden.has(`d:${c._id}`) ? 0 : c.unreadCount || 0), 0) +
      groups.reduce((sum, c) => sum + (hidden.has(`g:${c._id}`) ? 0 : c.unreadCount || 0), 0)
    );
  }, [users, groups, archived, lockedKeys]);
  const hasOpenChat = useChatStore((s) => !!s.selectedChat);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabClick = (to) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    goTab(navigate, pathname, to);
  };
  const youActive = pathname === "/profile" || pathname === "/starred" || pathname.startsWith("/settings");

  // On a phone an open chat takes the whole screen, like WhatsApp.
  const hideOnPhone = hasOpenChat && pathname === "/";

  return (
    <>
      {/* Desktop: vertical rail */}
      <nav className="hidden lg:flex flex-col items-center w-[72px] bg-wa-panel border-r border-white/5 py-4 gap-3 shrink-0">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={tabClick(to)}
            title={label}
            className={({ isActive }) =>
              `relative size-11 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? "bg-wa-field text-wa-text" : "text-wa-icon hover:bg-white/5"
              }`
            }
          >
            <Icon size={24} filled={false} />
            {to === "/" && unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-wa-bg text-[8.5px] font-bold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>
        ))}
        <div className="flex-1" />
        <NavLink
          to="/profile"
          onClick={tabClick("/profile")}
          title="You"
          className={`size-11 rounded-xl flex items-center justify-center transition-colors ${
            youActive ? "bg-wa-field" : "hover:bg-white/5"
          }`}
        >
          <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-8" textSize="text-sm" />
        </NavLink>
      </nav>

      {/* Phone: bottom bar */}
      <nav
        className={`${
          hideOnPhone ? "hidden" : "flex"
        } lg:hidden fixed bottom-0 inset-x-0 h-[calc(72px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-wa-bg border-t border-white/5 items-stretch justify-around z-30`}
      >
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={tabClick(to)} className="flex-1 flex flex-col items-center justify-center gap-1">
            {({ isActive }) => (
              <>
                <span
                  className={`relative h-8 w-16 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? "bg-wa-tint text-wa-tinttext" : "text-wa-text2 active:bg-white/5"
                  }`}
                >
                  <Icon size={26} filled={isActive} />
                  {to === "/" && unread > 0 && (
                    <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#21C063] text-wa-bg text-[9.4px] font-semibold flex items-center justify-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] leading-none text-wa-text ${isActive ? "font-semibold" : ""}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <NavLink to="/profile" onClick={tabClick("/profile")} className="flex-1 flex flex-col items-center justify-center gap-1">
          <span className={`h-8 w-16 rounded-full flex items-center justify-center`}>
            <span className={`rounded-full p-[3px] ${youActive ? "bg-wa-tint ring-0" : ""}`}>
              <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-7" textSize="text-xs" />
            </span>
          </span>
          <span className={`text-[11px] leading-none text-wa-text ${youActive ? "font-semibold" : ""}`}>You</span>
        </NavLink>
      </nav>
    </>
  );
};

export default MainNav;
