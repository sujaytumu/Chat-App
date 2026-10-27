import { useMemo, useState, lazy, Suspense } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { goTab } from "../lib/tabNav";
import { Clapperboard, Search, SquarePlus } from "lucide-react";
import { WaChats, WaUpdates, WaCalls } from "./icons/WaIcons";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useReelsModeStore } from "../store/useReelsModeStore";
import Avatar from "./Avatar";

const ReelIcon = ({ size = 24 }) => <Clapperboard size={size} strokeWidth={2} />;

const PostIcon = ({ size = 24 }) => <SquarePlus size={size} strokeWidth={2} />;

// The post composer opens right from the bar, on any screen
const NewPost = lazy(() => import("./FeedView").then((m) => ({ default: m.NewPost })));

const SearchIcon = ({ size = 24 }) => <Search size={size} strokeWidth={2} />;

const items = [
  { to: "/", icon: WaChats, label: "Chats", end: true },
  { to: "/status", icon: WaUpdates, label: "Updates" },
  { action: "post", icon: PostIcon, label: "Post" },
  { to: "/reels", icon: ReelIcon, label: "Reels" },
  { to: "/explore", icon: SearchIcon, label: "Search" },
  { to: "/calls", icon: WaCalls, label: "Calls" },
];

// WhatsApp's persistent nav: Chats / Updates / Calls / You — a vertical rail
// on desktop, a bottom tab bar (with a pill behind the active icon) on phones.
// bottomOnly: full-screen pages (Reels, Explore) use the same bottom bar at every screen size.
const MainNav = ({ bottomOnly = false }) => {
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
  const setReelsMode = useReelsModeStore((s) => s.setMode);
  const bumpFeed = useReelsModeStore((s) => s.bumpFeed);
  const [posting, setPosting] = useState(false);
  const tabClick = (to) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    goTab(navigate, pathname, to);
  };
  const posted = () => {
    setPosting(false);
    setReelsMode("feed");
    bumpFeed();
    if (pathname !== "/reels") goTab(navigate, pathname, "/reels");
  };
  const youActive = pathname === "/profile" || pathname === "/starred" || pathname.startsWith("/settings");

  // On a phone an open chat takes the whole screen, like WhatsApp.
  const hideOnPhone = hasOpenChat && pathname === "/";

  return (
    <>
      {/* Desktop: vertical rail */}
      {!bottomOnly && (
      <nav className="hidden lg:flex flex-col items-center w-[72px] bg-wa-panel border-r border-white/5 py-4 gap-3 shrink-0">
        {items.map((it) => { const { to, icon: Icon, label, end } = it; return it.action ? (
          <button key={label} onClick={() => setPosting(true)} title={label} className="size-11 rounded-xl flex items-center justify-center text-wa-icon hover:bg-white/5"><Icon size={24} /></button>
        ) : (
          <NavLink
            key={label}
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
        ); })}
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
      )}

      {/* Phone: bottom bar */}
      <nav
        className={`${
          hideOnPhone ? "hidden" : "flex"
        } ${bottomOnly ? "" : "lg:hidden"} fixed bottom-0 inset-x-0 h-[calc(72px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-wa-bg border-t border-white/5 items-stretch justify-around z-30`}
      >
        {items.map((it) => { const { to, icon: Icon, label, end } = it; return it.action ? (
          <button key={label} onClick={() => setPosting(true)} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1">
            <span className="h-8 w-10 rounded-full flex items-center justify-center text-wa-text2 active:bg-white/5"><Icon size={26} /></span>
            <span className="text-[10.5px] leading-none whitespace-nowrap text-wa-text">{label}</span>
          </button>
        ) : (
          <NavLink key={label} to={to} end={end} onClick={tabClick(to)} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1">
            {({ isActive }) => { return (
              <>
                <span
                  className={`relative h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                    isActive ? "w-12 bg-wa-tint text-wa-tinttext" : "w-10 text-wa-text2 active:bg-white/5"
                  }`}
                >
                  <Icon size={26} filled={isActive} />
                  {to === "/" && unread > 0 && (
                    <span className="absolute -top-1 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#21C063] text-wa-bg text-[9.4px] font-semibold flex items-center justify-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className={`text-[10.5px] leading-none whitespace-nowrap text-wa-text ${isActive ? "font-semibold" : ""}`}>{label}</span>
              </>
            ); }}
          </NavLink>
        ); })}
        <NavLink to="/profile" onClick={tabClick("/profile")} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1">
          <span className={`h-8 w-12 rounded-full flex items-center justify-center`}>
            <span className={`rounded-full p-[3px] ${youActive ? "bg-wa-tint ring-0" : ""}`}>
              <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-7" textSize="text-xs" />
            </span>
          </span>
          <span className={`text-[10.5px] leading-none whitespace-nowrap text-wa-text ${youActive ? "font-semibold" : ""}`}>You</span>
        </NavLink>
      </nav>
      {posting && (
        <Suspense fallback={null}>
          <NewPost onClose={() => setPosting(false)} onPosted={posted} />
        </Suspense>
      )}
    </>
  );
};

export default MainNav;
