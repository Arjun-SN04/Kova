import { useEffect, useState } from "react";
import axios from "axios";
import useConversation from "../Zustand/UserConversation";
import { messagesUrl } from "../utils/groups";
import { pendingFor } from "../utils/outbox";

// Loads the open chat a page at a time: the newest 50 messages first, older ones as you
// scroll up (loadOlderMessages), or from a given message on when jumping to an old one
// (loadMessagesFrom). The server answers { messages (oldest first), more, people? }.

const api = { withCredentials: true };
const urlFor = (chat, params) => `${messagesUrl(chat)}?${new URLSearchParams(params)}`;
const idOf = (m) => String(m._id);

const openChat = () => {
  const c = useConversation.getState().selectedConversation;
  return c?._id && !c.isCommunity && !c.isAi ? c : null;
};

// Groups also send who wrote the messages; keep everyone we've seen so far
const addPeople = (people) => {
  if (!people?.length) return;
  const { groupPeople, setGroupPeople } = useConversation.getState();
  setGroupPeople({ ...groupPeople, ...Object.fromEntries(people.map((p) => [String(p._id), p])) });
};

// Older messages, added above the ones already shown
export const loadOlderMessages = async () => {
  const chat = openChat();
  const st = useConversation.getState();
  if (!chat || !st.hasOlder || st.loadingOlder || !st.messages.length) return;
  const oldest = st.messages.find((m) => !String(m._id).startsWith("temp-"));
  if (!oldest) return;
  st.setHistory({ loadingOlder: true });
  try {
    const res = await axios.get(urlFor(chat, { before: oldest._id }), api);
    if (String(useConversation.getState().selectedConversation?._id) !== String(chat._id)) return;
    addPeople(res.data.people);
    useConversation.getState().setMessages((prev) => {
      const have = new Set(prev.map(idOf));
      return [...res.data.messages.filter((m) => !have.has(idOf(m))), ...prev];
    });
    useConversation.getState().setHistory({ hasOlder: !!res.data.more });
  } catch (err) {
    console.log("loadOlderMessages error:", err);
  } finally {
    useConversation.getState().setHistory({ loadingOlder: false });
  }
};

// Load the chat from this message to the newest (to jump to an old message).
// Returns whether the message was found.
export const loadMessagesFrom = async (messageId) => {
  const chat = openChat();
  if (!chat) return false;
  try {
    const res = await axios.get(urlFor(chat, { from: messageId }), api);
    if (String(useConversation.getState().selectedConversation?._id) !== String(chat._id)) return false;
    const found = res.data.messages.some((m) => idOf(m) === String(messageId));
    if (!found) return false;
    addPeople(res.data.people);
    useConversation.getState().setMessages((prev) => {
      // Keep anything newer that arrived meanwhile (live messages, my own sends)
      const have = new Set(res.data.messages.map(idOf));
      return [...res.data.messages, ...prev.filter((m) => !have.has(idOf(m)) && new Date(m.createdAt) >= new Date(res.data.messages.at(-1)?.createdAt || 0))];
    });
    useConversation.getState().setHistory({ hasOlder: !!res.data.more });
    return true;
  } catch (err) {
    console.log("loadMessagesFrom error:", err);
    return false;
  }
};

// Loads the open chat's messages (and, for groups, who sent them).
const useGetMessages = () => {
  const [loading, setLoading] = useState(false);
  const { selectedConversation, setMessages, setGroupPeople, setHistory, messages } = useConversation();
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
      setHistory({ hasOlder: false, loadingOlder: false });
      // Opened to show one message (search result, reminder, starred): start from it
      const jump = useConversation.getState().pendingJump;
      try {
        let res = await axios.get(urlFor({ _id: chatId, isGroup }, jump ? { from: jump } : {}), api);
        // That message is gone: open the chat normally
        if (jump && !res.data.messages?.some((m) => idOf(m) === String(jump))) res = await axios.get(urlFor({ _id: chatId, isGroup }, {}), api);
        if (stale) return;
        if (isGroup) setGroupPeople(Object.fromEntries((res.data.people || []).map((p) => [String(p._id), p])));
        useConversation.getState().setGroupReads(isGroup ? res.data.reads || {} : {});
        // Messages still on their way (or waiting to be retried) stay at the end
        setMessages([...(res.data.messages || []), ...pendingFor(chatId)]);
        setHistory({ hasOlder: !!res.data.more });
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
