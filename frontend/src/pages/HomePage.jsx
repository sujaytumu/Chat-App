import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser } = useChatStore();

  return (
    <div className="h-screen bg-base-200">
      {/* Removed flex and horizontal padding from this container */}
      <div className="pt-20">
        {/* Removed max-w-6xl and px-4 to allow full width */}
        <div className="bg-base-100 rounded-lg shadow-cl w-full h-[calc(100vh-8rem)]">
          {/* Flex container for sidebar and chat */}
          <div className="flex h-full rounded-lg overflow-hidden">
            {/* Sidebar should have fixed width without margin/padding */}
            <Sidebar />

            {/* Chat area will fill remaining space */}
            {!selectedUser ? <NoChatSelected /> : <ChatContainer />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

