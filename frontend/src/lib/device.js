// Phones/tablets have a front + back camera (flip button) and their browsers
// cannot capture the screen (no getDisplayMedia on Android or iOS).
export const isPhoneLike = () =>
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
    (navigator.maxTouchPoints > 1 && window.matchMedia?.("(pointer: coarse)").matches));
