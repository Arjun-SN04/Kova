import { useState } from "react";
import axios from "axios";
import useConversation from "../Zustand/UserConversation";
import { sendUrl } from "../utils/groups";

// Sends a text message, optionally with a reply target, a file, or a GIF / sticker.
// Returns null on success, or an error message.
const useSendMessage = () => {
  const [loading, setLoading] = useState(false);
  const { selectedConversation, setMessages, upsertPreview } = useConversation();

  // `media`: a GIF or sticker { kind, url, title, width, height }
  // `askNexa`: Nexa mode is on, so Nexa answers this message without "@Nexa"
  const sendMessage = async (messageText, replyTo = null, file = null, onProgress, media = null, { askNexa = false } = {}) => {
    if (!selectedConversation?._id || (!messageText.trim() && !file && !media)) return null;

    let body = { message: messageText, replyTo, ...(media ? { media } : {}), ...(askNexa ? { askNexa: true } : {}) };
    if (file) {
      body = new FormData();
      body.append("message", messageText);
      if (replyTo) body.append("replyTo", replyTo);
      if (askNexa) body.append("askNexa", "true");
      body.append("file", file);
    }

    setLoading(true);
    try {
      const res = await axios.post(sendUrl(selectedConversation), body, {
        withCredentials: true,
        onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
      });
      setMessages((prev) => [...prev, res.data]);
      upsertPreview(selectedConversation._id, res.data);
      if (askNexa || /(^|[^\w@])@nexa\b/i.test(messageText)) {
        const chatId = selectedConversation._id;
        useConversation.getState().setNexaThinking(chatId, true);
        setTimeout(() => {
          const started = useConversation.getState().nexaThinking[String(chatId)];
          if (started && Date.now() - started >= 44_000) useConversation.getState().setNexaThinking(chatId, false);
        }, 45_000);
      }
      return null;
    } catch (error) {
      console.log("sendMessage error:", error);
      return error.response?.data?.error || "Message failed to send. Try again.";
    } finally {
      setLoading(false);
    }
  };

  return { loading, sendMessage };
};

export default useSendMessage;
