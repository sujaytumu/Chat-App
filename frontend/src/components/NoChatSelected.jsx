import { MessageCircleHeart } from "lucide-react";

// Desktop-only empty state (on phones the chat list fills the screen).
const NoChatSelected = () => {
  return (
    <div className="w-full flex flex-1 flex-col items-center justify-center p-16 bg-wa-surface border-b-[6px] border-[#25D366]">
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto size-24 rounded-full bg-wa-surface flex items-center justify-center">
          <MessageCircleHeart className="size-11 text-[#25D366]" strokeWidth={1.6} />
        </div>
        <h2 className="text-[24px] font-light text-wa-text">Talkies</h2>
        <p className="text-wa-muted text-[13px] leading-relaxed">
          Send and receive messages, share photos and make voice or video calls. Select a chat from the list to
          get started.
        </p>
      </div>
    </div>
  );
};

export default NoChatSelected;
