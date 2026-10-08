import { MessageCircleHeart } from "lucide-react";

// Desktop-only empty state (on phones the chat list fills the screen).
const NoChatSelected = () => {
  return (
    <div className="w-full flex flex-1 flex-col items-center justify-center p-16 bg-[#222E35] border-b-[6px] border-[#25D366]">
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto size-24 rounded-full bg-[#1F2C34] flex items-center justify-center">
          <MessageCircleHeart className="size-11 text-[#25D366]" strokeWidth={1.6} />
        </div>
        <h2 className="text-[28px] font-light text-[#E9EDEF]">Talkies</h2>
        <p className="text-[#8696A0] text-[15px] leading-relaxed">
          Send and receive messages, share photos and make voice or video calls. Select a chat from the list to
          get started.
        </p>
      </div>
    </div>
  );
};

export default NoChatSelected;
