import { NavLink } from "react-router-dom";
import { MessageCircle, Phone, CircleDot } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

const items = [
  { to: "/", icon: MessageCircle, label: "Chats", end: true },
  { to: "/status", icon: CircleDot, label: "Status" },
  { to: "/calls", icon: Phone, label: "Calls" },
];

// WhatsApp's persistent nav: Chats / Status / Calls / You — a vertical rail
// on desktop, a bottom tab bar on mobile.
const MainNav = () => {
  const { authUser } = useAuthStore();

  const linkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-1 transition-colors ${
      isActive ? "text-[#00A884]" : "text-[#8696A0] hover:text-[#D1D7DB]"
    }`;

  return (
    <>
      {/* Desktop: vertical rail */}
      <nav className="hidden lg:flex flex-col items-center w-16 bg-[#111B21] border-r border-black/40 py-4 gap-6 shrink-0">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass} title={label}>
            <Icon size={22} />
          </NavLink>
        ))}
        <div className="flex-1" />
        <NavLink to="/profile" className={linkClass} title="You">
          <img
            src={authUser?.profilePic || "/avatar.png"}
            alt="You"
            className="size-8 rounded-full object-cover"
          />
        </NavLink>
      </nav>

      {/* Mobile: bottom bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 bg-[#111B21] border-t border-black/40 flex items-center justify-around z-30">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon size={22} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}
        <NavLink to="/profile" className={linkClass}>
          <img
            src={authUser?.profilePic || "/avatar.png"}
            alt="You"
            className="size-6 rounded-full object-cover"
          />
          <span className="text-[10px]">You</span>
        </NavLink>
      </nav>
    </>
  );
};

export default MainNav;
