// WhatsApp-style icon set (24px grid, 2px rounded strokes) so every button in
// the chat list, selection bar and bottom bar has the same shape, size and weight.
const base = (size, className) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  className,
  "aria-hidden": true,
});
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const WaBack = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

export const WaKebab = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

// Pin chat (selection bar): outlined tack with a small star, like WhatsApp
export const WaPinAction = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z" />
  </svg>
);

export const WaUnpinAction = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z" />
    <path d="M4 3.4L20.6 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

// Pinned marker next to the time in the chat list: solid, upright tack
export const WaPinSolid = ({ size = 18, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
  </svg>
);

export const WaTrash = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" />
  </svg>
);

export const WaBell = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
  </svg>
);

export const WaBellOff = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
    <path d="M4 3.4L20.6 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

// Archive: wide lid, box below, arrow down (unarchive = arrow up)
export const WaArchive = ({ size = 24, className = "", up = false }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d={up ? "M20.55 5.22l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.15.55L3.46 5.22C3.17 5.57 3 6.01 3 6.5V19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.49-.17-.93-.45-1.28zM6.24 5h11.52l.83 1H5.42l.82-1zM5 19V8h14v11H5zm3-5h2.55v3h2.9v-3H16l-4-4z" : "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM6.24 5h11.52l.81.97H5.44l.8-.97zM5 19V8h14v11H5zm8.45-9h-2.9v3H8l4 4 4-4h-2.55z"} />
  </svg>
);

export const WaCheck = ({ size = 16, className = "" }) => (
  <svg {...base(size, className)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// New chat button: solid bubble with a plus cut out
export const WaNewChat = ({ size = 28, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path
      fillRule="evenodd"
      d="M6 3h12a3 3 0 013 3v8a3 3 0 01-3 3h-6l-4.5 4v-4H6a3 3 0 01-3-3V6a3 3 0 013-3zm5.25 3.5v2.75H8.5v1.5h2.75v2.75h1.5v-2.75h2.75v-1.5h-2.75V6.5z"
    />
  </svg>
);

// Bottom bar
export const WaChats = ({ size = 26, className = "", filled = false }) =>
  filled ? (
    <svg {...base(size, className)} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M6 3h12a3 3 0 013 3v9a3 3 0 01-3 3h-7l-4 3.5V18H6a3 3 0 01-3-3V6a3 3 0 013-3zm1.5 5v1.5h9V8h-9zm0 3.5V13h6v-1.5h-6z"
      />
    </svg>
  ) : (
    <svg {...base(size, className)}>
      <g {...stroke}>
        <path d="M6 3.5h12a2.5 2.5 0 012.5 2.5v9a2.5 2.5 0 01-2.5 2.5h-7l-4 3.5v-3.5H6A2.5 2.5 0 013.5 15V6A2.5 2.5 0 016 3.5zM8 9h8M8 12.5h5" />
      </g>
    </svg>
  );

export const WaUpdates = ({ size = 26, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="4.2" />
    </g>
  </svg>
);

export const WaCalls = ({ size = 26, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M20.5 16.6v3a1.9 1.9 0 01-2.1 1.9 18.8 18.8 0 01-8.2-2.9 18.5 18.5 0 01-5.7-5.7A18.8 18.8 0 013.6 4.7 1.9 1.9 0 015.5 2.6h3a1.9 1.9 0 011.9 1.6c.1 1 .4 1.9.7 2.8a1.9 1.9 0 01-.4 2L9.4 10.3a15.2 15.2 0 005.7 5.7l1.3-1.3a1.9 1.9 0 012-.4c.9.3 1.8.6 2.8.7a1.9 1.9 0 011.6 1.9z" transform="translate(-.5 0)" />
    </g>
  </svg>
);
