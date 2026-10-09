// Lets the 1-to-1 call store and the group call store know about each other
// without importing each other (no circular imports).
let groupBusy = false;
export const setGroupCallBusy = (v) => {
  groupBusy = !!v;
};
export const isGroupCallBusy = () => groupBusy;
