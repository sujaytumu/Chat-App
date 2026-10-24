import Avatar from "./Avatar";

// A shared contact inside a bubble, with a button that opens a chat with them.
const ContactCard = ({ contact, isMe, onMessage }) => (
  <div className="w-[230px] max-w-full pb-4">
    <div className="flex items-center gap-3">
      <Avatar src={contact.profilePic} name={contact.fullName} size="size-12" textSize="text-xl" />
      <p className="text-[14.5px] font-medium break-words min-w-0">{contact.fullName}</p>
    </div>
    <button
      type="button"
      onClick={onMessage}
      className="mt-2.5 w-full h-9 rounded-full border border-wa-text/20 text-[13.5px] text-[#25D366] font-medium active:bg-wa-text/10"
    >
      {isMe ? "Open chat" : "Message"}
    </button>
  </div>
);

export default ContactCard;
