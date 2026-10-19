// Tiny hook so the User model can tell the auth cache "this person changed" without importing it
// (the cache imports the model — this avoids a cycle).
let handler = () => {};
export const setUserWriteHandler = (fn) => {
  handler = fn;
};
export const userWritten = (id) => handler(id);
