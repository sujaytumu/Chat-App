import { KeyRound } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";

// Bottom sheet shown once after signing in (Android app): "Save password?" - like Google's.
// The password goes to the phone's encrypted storage only if the person taps Save.
const SavePasswordPrompt = () => {
  const savePrompt = useAuthStore((s) => s.savePrompt);
  const confirmSavePassword = useAuthStore((s) => s.confirmSavePassword);
  const dismissSavePassword = useAuthStore((s) => s.dismissSavePassword);

  if (!savePrompt) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center px-3"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-label={savePrompt.update ? "Update password?" : "Save password?"}
    >
      <div className="w-full max-w-md rounded-2xl bg-base-100 text-base-content shadow-2xl border border-base-300 p-4 animate-[fadeIn_.15s_ease-out]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{savePrompt.update ? "Update password?" : "Save password?"}</p>
            <p className="text-sm text-base-content/60 truncate">{savePrompt.email}</p>
            <p className="text-xs text-base-content/50 mt-1">
              You'll stay signed in on this phone, and the password is kept encrypted on this device only.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-1 mt-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissSavePassword(true)}>
            Never
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissSavePassword(false)}>
            Not now
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirmSavePassword}>
            {savePrompt.update ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SavePasswordPrompt;
