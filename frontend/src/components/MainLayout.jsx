import MainNav from "./MainNav";

// Shared shell for the main app screens (Chats / Status / Calls) — puts the
// persistent WhatsApp-style nav (rail on desktop, bottom bar on mobile)
// alongside whichever page is active.
const MainLayout = ({ children }) => {
  return (
    <div className="h-screen bg-[#0B141A] flex">
      <MainNav />
      <div className="flex-1 flex overflow-hidden">{children}</div>
    </div>
  );
};

export default MainLayout;
