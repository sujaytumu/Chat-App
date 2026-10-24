import { useState } from "react";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useBackToClose } from "../lib/useBackToClose";

const REASONS = [
  ["spam", "Spam"],
  ["abuse", "Harassment or abuse"],
  ["inappropriate", "Inappropriate content"],
  ["scam", "Scam or fraud"],
  ["other", "Something else"],
];

const ReportGroupDialog = ({ group, onClose, onReportedAndExit }) => {
  const [reason, setReason] = useState("spam");
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(false);
  useBackToClose(true, onClose);

  const submit = async () => {
    setBusy(true);
    try {
      await axiosInstance.post(`/groups/${group._id}/report`, { reason });
      toast.success("Report sent. Thank you.");
      if (exit) await onReportedAndExit();
      else onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't send the report");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[97] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-wa-pop text-wa-text p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] mb-1">Report "{group.name}"?</h3>
        <p className="text-[12px] text-wa-muted mb-3">The group won't be told. Pick the closest reason.</p>
        {REASONS.map(([id, label]) => (
          <label key={id} className="flex items-center gap-3 py-2 cursor-pointer">
            <input type="radio" className="radio radio-success radio-sm" checked={reason === id} onChange={() => setReason(id)} />
            <span className="text-[13px]">{label}</span>
          </label>
        ))}
        <label className="flex items-center gap-3 py-2 mt-1 cursor-pointer border-t border-white/10 pt-3">
          <input type="checkbox" className="checkbox checkbox-success checkbox-sm" checked={exit} onChange={(e) => setExit(e.target.checked)} />
          <span className="text-[13px]">Also exit this group</span>
        </label>
        <div className="flex justify-end gap-5 mt-4 text-[13px]">
          <button onClick={onClose} className="text-[#21C063]" disabled={busy}>
            Cancel
          </button>
          <button onClick={submit} className="text-[#F15C6D]" disabled={busy}>
            {busy ? "Sending…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportGroupDialog;
