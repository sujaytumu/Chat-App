import { useState, useRef } from "react";
import { X, Users, Camera, Loader2 } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { compressImage } from "../lib/imageUtils";
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

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h3 className="font-semibold flex items-center gap-2">
            <Users size={18} /> New group
          </h3>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 space-y-3 border-b border-base-300">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative size-14 rounded-full bg-base-200 flex items-center justify-center overflow-hidden shrink-0"
              >
                {groupPic ? (
                  <img src={groupPic} alt="Group" className="w-full h-full object-cover" />
                ) : (
                  <Camera size={20} className="text-zinc-400" />
                )}
              </button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handlePicChange}
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="input input-bordered flex-1"
                maxLength={50}
                autoFocus
              />
            </div>
            <p className="text-xs text-zinc-500">
              {selectedIds.length} member{selectedIds.length !== 1 ? "s" : ""} selected
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {users.map((user) => (
              <label
                key={user._id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={selectedIds.includes(user._id)}
                  onChange={() => toggleMember(user._id)}
                />
                <img
                  src={user.profilePic || "/avatar.png"}
                  alt={user.fullName}
                  className="size-9 rounded-full object-cover"
                />
                <span className="font-medium truncate">{user.fullName}</span>
              </label>
            ))}
            {users.length === 0 && (
              <p className="text-center text-zinc-500 py-6 text-sm">No contacts to add yet</p>
            )}
          </div>

          <div className="p-4 border-t border-base-300">
            <button type="submit" className="btn btn-primary w-full" disabled={isCreating}>
              {isCreating ? <Loader2 className="animate-spin" size={18} /> : "Create group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
