import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MessageCircle, Phone, CircleDot } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import Avatar from "./Avatar";

const items = [
  { to: "/", icon: MessageCircle, label: "Chats", end: true },
  { to: "/status", icon: CircleDot, label: "Updates" },
  { to: "/calls", icon: Phone, label: "Calls" },
];

// WhatsApp's persistent nav: Chats / Updates / Calls / You — a vertical rail
// on desktop, a bottom tab bar (with a pill behind the active icon) on phones.
const MainNav = () => {
  const { authUser } = useAuthStore();
  const archived = authUser?.archivedChats;
  // Archived chats don't count towards the badge (like WhatsApp). Select the
  // raw lists and total below so the selector stays stable between renders.
  const users = useChatStore((s) => s.users);
  const groups = useChatStore((s) => s.groups);
  const unread = useMemo(() => {
    const hidden = new Set(archived || []);
    return (
      users.reduce((sum, c) => sum + (hidden.has(`d:${c._id}`) ? 0 : c.unreadCount || 0), 0) +
      groups.reduce((sum, c) => sum + (hidden.has(`g:${c._id}`) ? 0 : c.unreadCount || 0), 0)
    );
  }, [users, groups, archived]);
  const hasOpenChat = useChatStore((s) => !!s.selectedChat);
  const { pathname } = useLocation();

  // On a phone an open chat takes the whole screen, like WhatsApp.
  const hideOnPhone = hasOpenChat && pathname === "/";

  return (
    <>
      {/* Desktop: vertical rail */}
      <nav className="hidden lg:flex flex-col items-center w-[72px] bg-[#111B21] border-r border-white/5 py-4 gap-3 shrink-0">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              `relative size-11 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? "bg-[#2A3942] text-[#E9EDEF]" : "text-[#AEBAC1] hover:bg-white/5"
              }`
            }
          >
            <Icon size={22} />
            {to === "/" && unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-[#0B141A] text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>
        ))}
        <div className="flex-1" />
        <NavLink
          to="/profile"
          title="You"
          className={({ isActive }) =>
            `size-11 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? "bg-[#2A3942]" : "hover:bg-white/5"
            }`
          }
        >
          <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-8" textSize="text-sm" />
        </NavLink>
      </nav>

      {/* Phone: bottom bar */}
      <nav
        className={`${
          hideOnPhone ? "hidden" : "flex"
        } lg:hidden fixed bottom-0 inset-x-0 h-[calc(72px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-[#0B141A] border-t border-white/5 items-stretch justify-around z-30`}
      >
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className="flex-1 flex flex-col items-center justify-center gap-1">
            {({ isActive }) => (
              <>
                <span
                  className={`relative h-8 w-16 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? "bg-[#103629] text-[#E9EDEF]" : "text-[#AEBAC1]"
                  }`}
                >
                  <Icon size={24} strokeWidth={isActive ? 2.4 : 2} />
                  {to === "/" && unread > 0 && (
                    <span className="absolute top-0 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-[#0B141A] text-[10px] font-bold flex items-center justify-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className={`text-xs ${isActive ? "text-[#E9EDEF] font-semibold" : "text-[#AEBAC1]"}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
        <NavLink to="/profile" className="flex-1 flex flex-col items-center justify-center gap-1">
          {({ isActive }) => (
            <>
              <span
                className={`h-8 w-16 rounded-full flex items-center justify-center transition-colors ${
                  isActive ? "bg-[#103629]" : ""
                }`}
              >
                <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-7" textSize="text-xs" />
              </span>
              <span className={`text-xs ${isActive ? "text-[#E9EDEF] font-semibold" : "text-[#AEBAC1]"}`}>You</span>
            </>
          )}
        </NavLink>
      </nav>
    </>
  );
};

export default MainNav;
