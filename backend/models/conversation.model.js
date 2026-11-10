import mongoose from "mongoose";
const conversation = mongoose.Schema({
    members: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref:"User"

        }
    ],
    // Disappearing messages for this chat, in seconds (0 = off)
    disappearAfter: { type: Number, default: 0 },
    // Messages aren't listed here any more: they're found by sender / receiver
    // (utils/directChat.js). Old documents may still carry a `messages` array;
    // scripts/drop-conversation-lists.js removes it.
} ,{timestamps:true} )
conversation.index({ members: 1 })
export const Conversation = mongoose.model("Conversation" , conversation)