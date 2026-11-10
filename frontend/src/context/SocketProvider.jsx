import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { useAuth } from "./AuthProvider";

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

// In production (Vercel), the socket server URL is same as backend deployed URL.
// Set VITE_SOCKET_URL in your Vercel environment variables to your backend URL.
// In development, it will fall back to localhost:3000.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [connected, setConnected] = useState(false); // for the "Connecting…" banner
  const [AuthUser] = useAuth();

  // The previous socket is closed by this effect's cleanup when the user changes
  useEffect(() => {
    const userId = AuthUser?._id;
    if (!userId) return;

    console.log("🔌 Connecting socket for user:", userId);

    // The server only accepts a connection with a fresh pass from the API (it proves who we are).
    // Called again on every reconnect, so an expired pass is never reused.
    const newSocket = io(SOCKET_URL, {
      auth: (cb) => {
        axios.get("/api/user/socket-token", { withCredentials: true })
          .then((res) => cb({ token: res.data.token }))
          .catch(() => cb({ token: "" }));
      },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    let retry = null;
    newSocket.on("connect", () => {
      console.log("✅ Socket connected:", newSocket.id);
      setConnected(true);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected");
      setConnected(false);
      // The server signed this device out (password reset elsewhere): try again,
      // which fails and stops if the login is no longer valid
      if (reason === "io server disconnect") { clearTimeout(retry); retry = setTimeout(() => newSocket.connect(), 3000); }
    });

    newSocket.on("getOnlineUsers", (users) => {
      console.log("👥 Online users:", users);
      setOnlineUsers(users);
    });

    // The server refused us (e.g. the pass couldn't be fetched while offline).
    // Socket.IO doesn't retry those on its own, so try again in a few seconds.
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
      if (!newSocket.active) {
        clearTimeout(retry);
        retry = setTimeout(() => newSocket.connect(), 5000);
      }
    });

    socketRef.current = newSocket;
    // Hands the new connection to the rest of the app (it's created here, so this is the place)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(newSocket);

    return () => {
      clearTimeout(retry);
      setConnected(false);
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [AuthUser?._id]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;
