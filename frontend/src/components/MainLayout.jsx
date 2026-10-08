import MainNav from "./MainNav";

// Shared shell for the main app screens (Chats / Updates / Calls) — puts the
// persistent WhatsApp-style nav (rail on desktop, bottom bar on mobile)
// alongside whichever page is active. 100dvh so the layout fits the visible
// area on phones (browser toolbars / on-screen keyboard) instead of 100vh.
const MainLayout = ({ children }) => {
  return (
    <div className="h-[100dvh] bg-[#0B141A] flex">
      <MainNav />
      <div className="flex-1 flex overflow-hidden">{children}</div>
    </div>
  );
};

export default MainLayout;
