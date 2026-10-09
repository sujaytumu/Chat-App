import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

// Phone: either the chat list OR the open chat, full screen (like WhatsApp).
// Desktop (lg+): list and chat side by side.
const HomePage = () => {
  const { selectedChat, setSelectedChat } = useChatStore();

  // Phone Back closes the open chat (back to the list) instead of leaving the app.
  useBackToClose(!!selectedChat, () => setSelectedChat(null));

  return (
    <div
      className={`flex w-full h-full overflow-hidden bg-wa-bg ${
        selectedChat ? "pb-0" : "pb-[calc(72px+env(safe-area-inset-bottom))]"
      } lg:pb-0`}
    >
      <div className={`${selectedChat ? "hidden lg:flex" : "flex"} w-full lg:w-auto shrink-0 min-h-0`}>
        <Sidebar />
      </div>
      <div className={`${selectedChat ? "flex" : "hidden lg:flex"} flex-1 min-w-0 min-h-0`}>
        {selectedChat ? <ChatContainer /> : <NoChatSelected />}
      </div>
    </div>
  );
};

export default HomePage;
