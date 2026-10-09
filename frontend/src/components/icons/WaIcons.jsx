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
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M8 3h8M9.5 3v6L6.5 13h11l-3-4V3M12 13v6" />
    </g>
    <path fill="currentColor" d="M18.5 15.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z" />
  </svg>
);

export const WaUnpinAction = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M8 3h8M9.5 3v6L6.5 13h11l-3-4V3M12 13v6M3.5 3.5l17 17" />
    </g>
  </svg>
);

// Pinned marker next to the time in the chat list: solid, upright tack
export const WaPinSolid = ({ size = 18, className = "" }) => (
  <svg {...base(size, className)} fill="currentColor">
    <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
  </svg>
);

export const WaTrash = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.2A1.8 1.8 0 009.1 21h5.8a1.8 1.8 0 001.8-1.8L17.5 7M10 11v6M14 11v6" />
    </g>
  </svg>
);

export const WaBell = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M5.5 17.5h13l-1.7-2.2v-4.8a4.8 4.8 0 00-9.6 0v4.8L5.5 17.5zM10 20.3a2.2 2.2 0 004 0" />
    </g>
  </svg>
);

export const WaBellOff = ({ size = 24, className = "" }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <path d="M5.5 17.5h13l-1.7-2.2v-4.8a4.8 4.8 0 00-9.6 0v4.8L5.5 17.5zM10 20.3a2.2 2.2 0 004 0M3.5 3.5l17 17" />
    </g>
  </svg>
);

// Archive: wide lid, box below, arrow down (unarchive = arrow up)
export const WaArchive = ({ size = 24, className = "", up = false }) => (
  <svg {...base(size, className)}>
    <g {...stroke}>
      <rect x="3" y="3.5" width="18" height="4.5" rx="1.3" />
      <path d="M4.5 8v11a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V8" />
      {up ? <path d="M12 17.5V11.5M9.3 14.2l2.7-2.7 2.7 2.7" /> : <path d="M12 11v6M9.3 14.3l2.7 2.7 2.7-2.7" />}
    </g>
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
