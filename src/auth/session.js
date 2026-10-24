// Session store. In memory, with an optional sessionStorage copy of the email only.
// No token is ever stored in localStorage (the backend defines auth, MI-2).
import { useSyncExternalStore } from "react";

const KEY = "iosudoku.session";
const listeners = new Set();

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let current = load();
let expiredNote = false;

function emit() {
  listeners.forEach((fn) => fn());
}

export function getSession() {
  return current;
}

export function signInSession(user) {
  current = { email: user.email };
  expiredNote = false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: memory only */
  }
  emit();
}

export function signOutSession({ expired = false } = {}) {
  current = null;
  expiredNote = expired;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function consumeExpiredNote() {
  const was = expiredNote;
  expiredNote = false;
  return was;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
