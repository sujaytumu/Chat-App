import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedChat } = useChatStore();

  return (
    <div className="flex w-full h-full overflow-hidden bg-[#111B21] pb-16 lg:pb-0">
      <Sidebar />
      {!selectedChat ? <NoChatSelected /> : <ChatContainer />}
    </div>
  );
};

export default HomePage;
