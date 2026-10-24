// Loads Razorpay's checkout window only when someone actually pays (never on app start).
let loading = null;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay didn't load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't reach Razorpay. Check your internet."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const inr = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
