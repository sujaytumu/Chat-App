import { useState } from "react";
import { X, Crown, UserMinus, UserPlus, LogOut } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";

const GroupInfoModal = ({ group, onClose }) => {
  const { users, addMembersToGroup, removeMemberFromGroup, leaveGroup } = useChatStore();
  const { authUser } = useAuthStore();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [toAdd, setToAdd] = useState([]);

  const isAdmin = group.admins.some((a) => (a._id || a) === authUser._id);
  const memberIds = new Set(group.members.map((m) => m._id || m));
  const nonMembers = users.filter((u) => !memberIds.has(u._id));

  const handleAdd = async () => {
    if (toAdd.length === 0) return;
    await addMembersToGroup(group._id, toAdd);
    setToAdd([]);
    setShowAddMembers(false);
  };

  const handleLeave = async () => {
    if (!confirm(`Leave "${group.name}"?`)) return;
    await leaveGroup(group._id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h3 className="font-semibold">Group info</h3>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 p-6 border-b border-base-300">
          <img
            src={group.groupPic || "/avatar.png"}
            alt={group.name}
            className="size-20 rounded-full object-cover"
          />
          <h4 className="text-lg font-semibold">{group.name}</h4>
          <p className="text-sm text-zinc-500">{group.members.length} members</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-sm font-medium text-zinc-500">Members</span>
            {isAdmin && (
              <button
                onClick={() => setShowAddMembers((s) => !s)}
                className="btn btn-xs gap-1"
              >
                <UserPlus size={14} /> Add
              </button>
            )}
          </div>

          {showAddMembers && (
            <div className="px-4 pb-3 space-y-2 border-b border-base-300">
              <div className="max-h-40 overflow-y-auto space-y-1">
                {nonMembers.map((u) => (
                  <label key={u._id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={toAdd.includes(u._id)}
                      onChange={() =>
                        setToAdd((prev) =>
                          prev.includes(u._id) ? prev.filter((x) => x !== u._id) : [...prev, u._id]
                        )
                      }
                    />
                    <span className="text-sm">{u.fullName}</span>
                  </label>
                ))}
                {nonMembers.length === 0 && (
                  <p className="text-xs text-zinc-500">Everyone is already in this group</p>
                )}
              </div>
              <button className="btn btn-xs btn-primary" onClick={handleAdd} disabled={toAdd.length === 0}>
                Add selected
              </button>
            </div>
          )}

          {group.members.map((member) => {
            const memberIsAdmin = group.admins.some((a) => (a._id || a) === member._id);
            return (
              <div key={member._id} className="flex items-center gap-3 px-4 py-2.5">
                <img
                  src={member.profilePic || "/avatar.png"}
                  alt={member.fullName}
                  className="size-9 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate flex items-center gap-1">
                    {member.fullName}
                    {member._id === authUser._id && <span className="text-xs text-zinc-500">(you)</span>}
                  </p>
                  {memberIsAdmin && (
                    <p className="text-xs text-amber-500 flex items-center gap-1">
                      <Crown size={11} /> Admin
                    </p>
                  )}
                </div>
                {isAdmin && member._id !== authUser._id && (
                  <button
                    onClick={() => removeMemberFromGroup(group._id, member._id)}
                    className="btn btn-xs btn-ghost text-error"
                    title="Remove member"
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-base-300">
          <button onClick={handleLeave} className="btn btn-outline btn-error btn-sm w-full gap-2">
            <LogOut size={14} /> Leave group
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupInfoModal;
