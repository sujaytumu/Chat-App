import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Share2, Pencil, Bell, Palette, Users, LogOut, ChevronDown, X, Loader2, KeyRound, Lock, Star, MessageSquareText, PieChart, PersonStanding, HelpCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";
import { compressImage } from "../lib/imageUtils";
import Avatar from "../components/Avatar";
import { useScrollMemory } from "../lib/useScrollMemory";

const iconCls = "text-wa-icon";

// WhatsApp's "You" tab: photo + name on top, then the settings list.
const ProfilePage = () => {
  const scrollRef = useScrollMemory("profile");
  const { authUser, isUpdatingProfile, updateProfile, logout } = useAuthStore();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const handle = `@${(authUser?.email || "").split("@")[0]}`;

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file");
    try {
      const img = await compressImage(file, { maxDimension: 800, quality: 0.85 });
      await updateProfile({ profilePic: img });
    } catch {
      toast.error("Could not update your photo");
    }
  };

  const share = async () => {
    const data = { title: "Talkies", text: "Chat with me on Talkies", url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        toast("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  const rows = [
    { icon: KeyRound, title: "Account", sub: "Name, about, password, two-step verification", to: "/settings/account" },
    { icon: Lock, title: "Privacy", sub: "Read receipts, typing, blocked contacts", to: "/settings/privacy" },
    { icon: Star, title: "Starred messages", sub: "Messages you've saved", to: "/starred" },
    { icon: MessageSquareText, title: "Chats", sub: "Enter key, archive, chat history", to: "/settings/chats" },
    { icon: Bell, title: "Notifications", sub: "Message, group & call tones", to: "/settings/notifications" },
    { icon: Palette, title: "Appearance", sub: "Theme, chat wallpaper", to: "/settings/appearance" },
    { icon: PieChart, title: "Storage and data", sub: "Storage by chat, backup, cache", to: "/settings/storage" },
    { icon: PersonStanding, title: "Accessibility", sub: "Animation, vibration", to: "/settings/accessibility" },
    { icon: HelpCircle, title: "Help and feedback", sub: "App version, updates, report a problem", to: "/settings/help" },
    { icon: Users, title: "Invite a friend", onClick: share },
  ].filter((r) => !query.trim() || `${r.title} ${r.sub || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  const rowCls =
    "w-full flex items-center gap-4 pl-4 pr-4 py-4 text-left hover:bg-white/5 active:bg-wa-surface transition-colors";

  const body = (r) => (
    <>
      <span className="size-12 flex items-center justify-center shrink-0">
        <r.icon size={26} strokeWidth={1.7} className={iconCls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-[22px] text-wa-text">{r.title}</span>
        {r.sub && <span className="block text-[12.5px] leading-5 text-wa-muted mt-0.5">{r.sub}</span>}
      </span>
    </>
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-wa-bg overflow-hidden relative">
      {/* Top bar: the name slides in once you scroll past the big one */}
      <div className="relative z-10 flex items-center h-14 pl-4 pr-1 shrink-0 bg-wa-bg/90 backdrop-blur-sm">
        {searching ? (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              className="flex-1 min-w-0 bg-transparent text-[15.5px] text-wa-text placeholder:text-wa-muted focus:outline-none"
            />
            <button
              onClick={() => {
                setSearching(false);
                setQuery("");
              }}
              className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10"
              aria-label="Close search"
            >
              <X size={24} />
            </button>
          </>
        ) : (
          <>
            <h1
              className={`flex-1 min-w-0 truncate text-[24px] leading-none font-normal text-wa-text transition-opacity ${
                scrolled ? "opacity-100" : "opacity-0"
              }`}
            >
              {authUser?.fullName}
            </h1>
            <button onClick={() => setSearching(true)} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Search">
              <Search size={24} strokeWidth={2.2} />
            </button>
            <button onClick={share} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Share">
              <Share2 size={24} strokeWidth={2.2} />
            </button>
            <button onClick={() => navigate("/settings/account")} className="size-12 rounded-full flex items-center justify-center text-wa-text active:bg-white/10" aria-label="Edit profile">
              <Pencil size={24} strokeWidth={2.2} />
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-6"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 150)}
      >
        {!query && (
          <div className="relative">
            <div
              className="chat-wallpaper absolute inset-x-0 top-0 h-[300px] opacity-90 pointer-events-none"
              style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)", maskImage: "linear-gradient(to bottom, #000 55%, transparent)" }}
            />
            <div className="relative flex flex-col items-center pt-6 pb-6">
              {authUser?.about && (
                <Link to="/settings/account" className="relative mb-3 max-w-[80%] rounded-3xl bg-wa-surface px-5 py-3 text-[13.5px] text-wa-text text-center">
                  <span className="line-clamp-2 break-words">{authUser.about}</span>
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-3 rotate-45 bg-wa-surface" />
                </Link>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="relative rounded-full active:scale-[.98] transition-transform"
                aria-label="Change photo"
              >
                <Avatar src={authUser?.profilePic} name={authUser?.fullName} size="size-[120px]" textSize="text-5xl" />
                {isUpdatingProfile && (
                  <span className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <Loader2 className="animate-spin text-white" size={28} />
                  </span>
                )}
              </button>
              <div className="mt-6 flex items-center gap-2 px-6 max-w-full">
                <h2 className="text-[24px] leading-8 font-normal text-wa-text truncate">{authUser?.fullName}</h2>
                <ChevronDown size={22} className="text-wa-muted shrink-0" />
              </div>
              <p className="mt-1 text-[14.5px] text-wa-muted truncate max-w-full px-6">{handle}</p>
            </div>
          </div>
        )}

        {rows.map((r) =>
          r.to ? (
            <Link key={r.title} to={r.to} className={rowCls}>
              {body(r)}
            </Link>
          ) : (
            <button key={r.title} onClick={r.onClick} className={rowCls}>
              {body(r)}
            </button>
          )
        )}

        {rows.length === 0 && <p className="text-center text-wa-muted py-10 text-[13px]">No results</p>}

        {!query && (
          <>
            <div className="h-px bg-white/5 my-2" />
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className={rowCls}
            >
              <span className="size-12 flex items-center justify-center shrink-0">
                <LogOut size={26} strokeWidth={1.7} className="text-red-400" />
              </span>
              <span className="text-[14.5px] text-red-400">Log out</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
