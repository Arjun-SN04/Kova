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
    messages : [
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"Message",
            default:[]
        }
    ]
} ,{timestamps:true} )
export const Conversation = mongoose.model("Conversation" , conversation)