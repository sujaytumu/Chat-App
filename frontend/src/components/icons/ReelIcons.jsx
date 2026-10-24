// Instagram-style action icons for Reels: clean 2px outlines with round joins, filled when switched on.
const make = (name, body) => {
  const Icon = ({ size = 28, className = "", fill = "none", strokeWidth = 2, ...rest }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {body}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
};

export const ReelHeart = make("ReelHeart", <path d="M12 20.8C5.3 15.5 2.5 12.1 2.5 8.5 2.5 5.7 4.7 3.5 7.4 3.5c1.8 0 3.5 1 4.6 2.6 1.1-1.6 2.8-2.6 4.6-2.6 2.7 0 4.9 2.2 4.9 5 0 3.6-2.8 7-9.5 12.3z" />);
export const ReelComment = make("ReelComment", <path d="M12 2.8a9.2 9.2 0 1 1-4.2 17.4L3 21.3l1.4-4.6A9.2 9.2 0 0 1 12 2.8z" />);
export const ReelRepost = make("ReelRepost", <><path d="M17 2.500 20.500 6 17 9.500" /><path d="M3.500 11.500V10A4 4 0 0 1 7.500 6h13" /><path d="M7 21.500 3.500 18 7 14.500" /><path d="M20.500 12.500V14a4 4 0 0 1-4 4h-13" /></>);
export const ReelSend = make("ReelSend", <><path d="M21.400 3.200 2.800 9.600l7.200 3.400 3.400 7.200 8-17z" /><path d="M10 13 21.400 3.200" /></>);
export const ReelSave = make("ReelSave", <path d="M5.500 3h13v18.500L12 16.800 5.500 21.500z" />);
export const ReelMenu = make("ReelMenu", <><path d="M4 8h16" /><path d="M4 15.500h10" /></>);
