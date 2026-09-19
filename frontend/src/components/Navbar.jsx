import { Link } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { LogOut, MessageSquare, Settings, User } from "lucide-react";//lucide-react

const Navbar = () => {
  const { logout, authUser } = useAuthStore();

  return (
    <header
      className="bg-[#202C33] border-b border-black/30 fixed w-full top-0 z-40"
    >
      <div className="container mx-auto px-4 h-16">
        <div className="flex items-center justify-between h-full">
          {/* Left side - Talkies */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-all">
              <div className="size-9 rounded-lg bg-[#e91e8c]/15 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-[#e91e8c]" />
              </div>
              <h1 className="text-lg font-bold text-[#E9EDEF]">Talkies 💬</h1>
            </Link>
          </div>

          {/* Right side - icons only, text appears on hover */}
          <div className="flex items-center gap-2">
            <Link
              to={"/settings"}
              className="size-9 rounded-full flex items-center justify-center text-[#AEBAC1] hover:bg-white/10 transition-colors group relative"
            >
              <Settings className="w-4 h-4" />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-[#233138] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Settings
              </span>
            </Link>

            {authUser && (
              <>
                <Link
                  to={"/profile"}
                  className="size-9 rounded-full flex items-center justify-center text-[#AEBAC1] hover:bg-white/10 transition-colors group relative"
                >
                  <User className="size-5" />
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-[#233138] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Profile
                  </span>
                </Link>

                <button
                  className="size-9 rounded-full flex items-center justify-center text-[#AEBAC1] hover:bg-white/10 transition-colors group relative"
                  onClick={logout}
                >
                  <LogOut className="size-5" />
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-[#233138] text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Logout
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;

