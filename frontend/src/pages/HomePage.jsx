import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

// Phone: either the chat list OR the open chat, full screen (like WhatsApp).
// Desktop (lg+): list and chat side by side.
const HomePage = () => {
  const { selectedChat } = useChatStore();

  return (
    <div
      className={`flex w-full h-full overflow-hidden bg-[#0B141A] ${
        selectedChat ? "pb-0" : "pb-[72px]"
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
