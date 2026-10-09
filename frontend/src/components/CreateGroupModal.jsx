import { useState, useRef } from "react";
import { X, Users, Camera, Loader2, Check } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { compressImage } from "../lib/imageUtils";
import Avatar from "./Avatar";
import toast from "react-hot-toast";

const CreateGroupModal = ({ onClose, onCreated }) => {
  const { users, createGroup } = useChatStore();
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupPic, setGroupPic] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef(null);

  const toggleMember = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handlePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    try {
      const compressed = await compressImage(file, { maxDimension: 400, quality: 0.8 });
      setGroupPic(compressed);
    } catch {
      toast.error("Could not process image");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Group name is required");
    if (selectedIds.length < 1) return toast.error("Pick at least one member");

    setIsCreating(true);
    try {
      const group = await createGroup({ name: name.trim(), memberIds: selectedIds, groupPic });
      onCreated?.(group);
      onClose();
    } catch {
      // toast already shown by store
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = name.trim().length > 0 && selectedIds.length > 0 && !isCreating;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-wa-panel text-wa-text rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[92dvh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-16 shrink-0">
          <h3 className="text-[20px] font-medium flex items-center gap-3">
            <Users size={22} className="text-wa-muted" /> New group
          </h3>
          <button
            onClick={onClose}
            className="size-11 rounded-full flex items-center justify-center text-wa-icon hover:bg-white/10 active:bg-white/15"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-4 pb-3 shrink-0">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative size-16 rounded-full bg-wa-pop hover:bg-wa-field flex items-center justify-center overflow-hidden shrink-0"
                aria-label="Group photo"
              >
                {groupPic ? (
                  <img src={groupPic} alt="Group" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={24} className="text-wa-muted" />
                )}
              </button>
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handlePicChange} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="flex-1 min-w-0 bg-transparent border-0 border-b-2 border-wa-field focus:border-[#25D366] focus:outline-none focus:ring-0 text-[18px] text-wa-text placeholder:text-wa-muted py-2 transition-colors"
                maxLength={50}
                autoFocus
              />
            </div>
            <p className="text-[13px] text-[#25D366] mt-3 font-medium">
              {selectedIds.length === 0
                ? "Add members"
                : `${selectedIds.length} member${selectedIds.length !== 1 ? "s" : ""} selected`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {users.map((user) => {
              const checked = selectedIds.includes(user._id);
              return (
                <button
                  type="button"
                  key={user._id}
                  onClick={() => toggleMember(user._id)}
                  className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-wa-surface/70 active:bg-wa-surface text-left transition-colors"
                >
                  <Avatar src={user.profilePic} name={user.fullName} size="size-12" />
                  <span className="flex-1 min-w-0 text-[17px] truncate">{user.fullName}</span>
                  <span
                    className={`size-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      checked ? "bg-[#25D366] border-[#25D366] text-wa-bg" : "border-wa-icon"
                    }`}
                  >
                    {checked && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
            {users.length === 0 && (
              <p className="text-center text-wa-muted py-8 text-[15px]">No contacts to add yet</p>
            )}
          </div>

          <div className="p-4 shrink-0 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <button
              type="submit"
              disabled={!canCreate}
              className="w-full h-12 rounded-full bg-[#25D366] text-wa-bg text-[16px] font-semibold flex items-center justify-center hover:bg-[#21c05e] active:scale-[.99] disabled:bg-wa-surface disabled:text-wa-muted2 transition-colors"
            >
              {isCreating ? <Loader2 className="animate-spin" size={20} /> : "Create group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
