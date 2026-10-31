import { useEffect, useState } from "react";
import axios from "axios";
import useConversation from "../Zustand/UserConversation";
import { messagesUrl } from "../utils/groups";

// Loads the open chat's messages (and, for groups, who sent them).
const useGetMessages = () => {
  const [loading, setLoading] = useState(false);
  const { selectedConversation, setMessages, setGroupPeople, messages } = useConversation();
  const chatId = selectedConversation?._id;
  const isGroup = !!selectedConversation?.isGroup;

  useEffect(() => {
    if (!chatId || selectedConversation?.isCommunity || selectedConversation?.isAi) {
      setLoading(false);
      return;
    }
    let stale = false;
    const getMessages = async () => {
      setLoading(true);
      try {
        const res = await axios.get(messagesUrl({ _id: chatId, isGroup }), { withCredentials: true });
        if (stale) return;
        if (isGroup) {
          setMessages(res.data.messages);
          setGroupPeople(Object.fromEntries(res.data.people.map((p) => [String(p._id), p])));
        } else {
          setMessages(res.data);
        }
      } catch (error) {
        console.log(error);
        if (!stale) setMessages([]);
      } finally {
        if (!stale) setLoading(false);
      }
    };
    getMessages();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, isGroup, setMessages, setGroupPeople]);

  return { loading, messages };
};

export default useGetMessages;
