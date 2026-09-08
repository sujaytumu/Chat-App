const MESSAGE_SOUND_KEY = "talkies-message-sound-enabled";
const CALL_RINGTONE_KEY = "talkies-call-ringtone-enabled";

export function isMessageSoundEnabled() {
  return localStorage.getItem(MESSAGE_SOUND_KEY) !== "false"; // default on
}
export function setMessageSoundEnabled(enabled) {
  localStorage.setItem(MESSAGE_SOUND_KEY, String(enabled));
}

export function isCallRingtoneEnabled() {
  return localStorage.getItem(CALL_RINGTONE_KEY) !== "false"; // default on
}
export function setCallRingtoneEnabled(enabled) {
  localStorage.setItem(CALL_RINGTONE_KEY, String(enabled));
}
