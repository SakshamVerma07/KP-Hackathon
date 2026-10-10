import { io } from "socket.io-client";

let socket = null;

export function connectSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || undefined, { withCredentials: true, reconnectionDelayMax: 5000 });
  }
  return socket;
}

export const getSocket = () => socket;

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
