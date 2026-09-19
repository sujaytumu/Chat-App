// Filled paper-plane glyph matching the shape WhatsApp uses for its send
// button (a solid angled arrow, not an outlined icon like generic UI kits).
const WhatsAppSendIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

export default WhatsAppSendIcon;
