import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedChat } = useChatStore();

  return (
    <div className="h-screen bg-[#0B141A]">
      <div className="h-full">
        <div className="bg-[#111B21] w-full h-full">
          <div className="flex h-full overflow-hidden">
            <Sidebar />
            {!selectedChat ? <NoChatSelected /> : <ChatContainer />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
