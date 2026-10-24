import toast from "react-hot-toast";

// Free, no-signup translation API (MyMemory) — good enough for casual
// message translation without needing any API keys/billing setup.
export async function translateAndToast(text, targetLang = "en") {
  if (!text?.trim()) return;
  const loadingToast = toast.loading("Translating…");
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`
    );
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    toast.dismiss(loadingToast);
    if (translated) {
      toast(translated, { icon: "🌐", duration: 6000 });
    } else {
      toast.error("Couldn't translate that");
    }
  } catch {
    toast.dismiss(loadingToast);
    toast.error("Translation failed");
  }
}
