import { useChatStore } from "../store/useChatStore";
import { useBackToClose } from "../lib/useBackToClose";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";
import { SafeBlock } from "../components/ErrorBoundary";

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
      <div className={`${selectedChat ? "hidden lg:flex" : "flex list-back-in"} w-full lg:w-auto shrink-0 min-h-0`}>
        <Sidebar />
      </div>
      <div className={`${selectedChat ? "flex chat-slide-in" : "hidden lg:flex"} flex-1 min-w-0 min-h-0`}>
        {selectedChat ? (
          <SafeBlock
            resetKey={`${selectedChat.type}:${selectedChat.data?._id}`}
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center bg-wa-bg">
                <p className="text-wa-text font-medium">This chat couldn't open.</p>
                <button onClick={() => setSelectedChat(null)} className="px-4 py-2 rounded-lg bg-[#00A884] text-white text-sm">
                  Back to chats
                </button>
              </div>
            }
          >
            <ChatContainer />
          </SafeBlock>
        ) : (
          <NoChatSelected />
        )}
      </div>
    </div>
  );
};

export default HomePage;
