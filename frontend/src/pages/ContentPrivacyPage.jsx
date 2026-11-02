import { useEffect, useState } from "react";
import { ChevronRight, ShieldCheck, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import SettingsShell from "../components/SettingsShell";
import StatusAudienceSheet, { audienceLabel } from "../components/StatusAudienceSheet";
import { axiosInstance } from "../lib/axios";
import { useChatStore } from "../store/useChatStore";

const KINDS = [
  { id: "status", noun: "status", title: "Status", sub: "Who sees my status updates" },
  { id: "highlights", noun: "highlight", title: "Highlights", sub: "Who sees the highlights I create" },
  { id: "reels", noun: "reel", title: "Reels", sub: "Who sees the reels I post" },
  { id: "posts", noun: "post", title: "Posts", sub: "Who sees the photos I post" },
];

// "Who can see my content": the default audience for each kind of thing I share. Every new item starts with it,
// and the server only shows an item to the people it allows (on top of the owner's "who can see whom" rules).
const ContentPrivacyPage = () => {
  const getUsers = useChatStore((s) => s.getUsers);
  const [priv, setPriv] = useState(null);
  const [editing, setEditing] = useState(null); // a KINDS entry

  useEffect(() => {
    getUsers?.();
    axiosInstance.get("/privacy").then((r) => setPriv(r.data)).catch(() => toast.error("Couldn't load your settings"));
  }, [getUsers]);

  const save = async (kind, audience) => {
    try {
      const { data } = await axiosInstance.put("/privacy", { kind: kind.id, audience });
      setPriv(data);
      toast.success(`${kind.title}: saved`);
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't save");
    }
    setEditing(null);
  };

  return (
    <SettingsShell title="Who can see my content">
      <p className="text-[13.5px] text-wa-muted leading-snug pt-1">
        Pick who sees each kind of thing you share. New items start with this choice, and you can still change it for a single status or post.
      </p>
      {!priv ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-wa-muted" /></div>
      ) : (
        <div className="rounded-2xl bg-wa-surface overflow-hidden">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setEditing(k)} className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-white/5 border-b border-white/5 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-[16.5px] text-wa-text">{k.title}</p>
                <p className="text-[13px] text-wa-muted truncate">{k.sub}</p>
              </div>
              <span className="text-[14px] text-[#21C063] shrink-0">{audienceLabel(priv[k.id])}</span>
              <ChevronRight size={20} className="text-wa-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 rounded-2xl bg-wa-surface p-4 text-[13px] text-wa-muted leading-snug">
        <ShieldCheck size={20} className="text-[#21C063] shrink-0 mt-0.5" />
        <p>Sujay is visible to everyone in the app. Everyone else can only be seen by the people Sujay allowed, and your choices here can only make that stricter, never wider. Contacts means everyone who is allowed to see you.</p>
      </div>

      {editing && priv && (
        <div className="fixed inset-0 z-[80]">
          <StatusAudienceSheet noun={editing.noun} value={priv[editing.id]} onClose={() => setEditing(null)} onSave={(a) => save(editing, a)} />
        </div>
      )}
    </SettingsShell>
  );
};

export default ContentPrivacyPage;
