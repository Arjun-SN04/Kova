import mongoose from "mongoose"
import { currentViewer } from "../utils/viewer.js";

const userSchema = mongoose.Schema({
    fullName:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true,
    },
    // Logins made before this time are signed out (set when the password changes)
    passwordChangedAt:{ type:Date, default:null },
    // "Sign out other devices": older logins without a session record stop working
    sessionsResetAt:{ type:Date, default:null },
    confirmPassword:{
        type:String,

    },
    // Public handle people use to find you: lowercase letters, numbers, _ and .
    username:{
        type:String,
        unique:true,
        sparse:true,
        lowercase:true,
        trim:true
    },
    // The built-in Nexa assistant account (posts @Nexa answers in groups; can't log in)
    isBot:{ type:Boolean, default:false },
    // People I can chat with (always mutual)
    contacts:[{ type:mongoose.Schema.Types.ObjectId, ref:"User" }],
    // Secret part of my invite link / QR code. Opening it adds me instantly.
    inviteToken:{
        type:String,
        unique:true,
        sparse:true
    },
    // My chat with Nexa disappears after this many seconds (0 = keep everything)
    nexaDisappearAfter:{ type:Number, default:86400 },
    // Which image model Nexa tries first ("auto" = best available); see utils/imageGen.js
    nexaImageModel:{ type:String, default:"auto" },
    // Chats pinned to the top of my list (user or group ids, in pin order)
    pinnedChats:{ type:[String], default:[] },
    // Chats moved out of the main list (Archived), and chats with notifications off
    // (until: null = always)
    archivedChats:{ type:[String], default:[] },
    mutedChats:{ type:[{ _id:false, chat:String, until:{ type:Date, default:null } }], default:[] },
    // Chat wallpapers: { global: spec | null, chats: { [chatId]: spec } }
    // spec = { kind: "preset", id, dim } or { kind: "image", url, publicId, dim }
    wallpapers:{ type:mongoose.Schema.Types.Mixed, default:() => ({ global:null, chats:{} }) },
    // Locked chats: hidden from the list until the secret code is entered
    lockedChats:{ type:[String], default:[] },
    lockCode:{ type:String, default:null },
    // "numeric" (digits only) or "alnum" (letters and numbers): picks the keyboard
    lockCodeKind:{ type:String, default:"numeric" },
    // Hidden chats: left out of the list until the secret word is typed in search.
    // Only a SHA-256 of "userId:word" is kept (the browser compares what you type).
    hiddenChats:{ type:[String], default:[] },
    hiddenWordHash:{ type:String, default:null },
    // My own security question, to reset a forgotten lock code / secret word / app PIN.
    // Only a bcrypt hash of the answer (lower-cased) is kept.
    securityQuestion:{ type:String, default:null },
    securityAnswer:{ type:String, default:null },
    // Data export (ZIP of my chats and files): building → ready (download link for 24 h) or failed
    dataExport:{
        status:{ type:String, default:null },
        token:String,
        size:Number,
        requestedAt:Date,
        readyAt:Date,
        expiresAt:Date,
    },
    // Account deletion: scheduled 30 days after the request; signing in cancels it
    deletion:{
        requestedAt:Date,
        scheduledFor:Date,
    },
    // Saved GIFs / stickers and stickers I made (publicId set on my own uploads)
    stickers:{
        type:[{
            kind:{ type:String, enum:["gif","sticker"], default:"sticker" },
            url:String,
            publicId:String,
            title:String,
            width:Number,
            height:Number,
        }],
        default:[],
    },
    // Daily email of unread messages while I'm away (off by default)
    emailDigest:{
        enabled:{ type:Boolean, default:false },
        lastSentAt:Date,
    },
    // Emailed one-time code for resetting a forgotten login password
    securityCode:{
        purpose:String,
        hash:String,
        expires:Date,
        tries:{ type:Number, default:0 },
        sentAt:Date,
    },
    // Messages I starred (saved), newest last
    starred:[{ type:mongoose.Schema.Types.ObjectId, ref:"Message" }],
    // People I blocked: we can't be contacts or message each other
    blocked:[{ type:mongoose.Schema.Types.ObjectId, ref:"User" }],
    // Business account: the public part of the profile (private settings live in BusinessSettings)
    business:{
        type:{
            enabled:{ type:Boolean, default:false },
            category:String,
            description:String,
            address:String,
            website:String,
            email:String,
            // UPI ID for payment requests (shown to customers on a payment card)
            upiId:String,
            // Opening hours: 7 days, Sunday first. Times are "HH:MM" in `timeZone`.
            timeZone:String,
            hours:[{ _id:false, open:String, close:String, closed:Boolean }],
            verified:{ type:Boolean, default:false },
            verificationRequested:{ type:Boolean, default:false },
            // Banner photo on the business page (null = a stock photo for the category)
            cover:{ type:{ url:String, publicId:String }, default:null },
            // Payment QR code (any UPI / bank / wallet QR), shown to customers on payment requests and the business page
            paymentQr:{ type:{ url:String, publicId:String, label:String }, default:null },
            _id:false,
        },
        default:null
    },
    // When they last closed Kova (shown as "Active 5 min ago" if both allow it)
    lastSeen:{ type:Date, default:null },
    // Short line about me, shown on my profile
    about:{ type:String, default:"", maxlength:140 },
    // Privacy. activity / seen work both ways; photo / about: who can see them;
    // groups: who can add me to a group without asking (approve = I get an invite)
    privacy:{
        activity:{ type:Boolean, default:true },
        seen:{ type:Boolean, default:true },
        photo:{ type:String, enum:["everyone","contacts","nobody"], default:"everyone" },
        about:{ type:String, enum:["everyone","contacts","nobody"], default:"everyone" },
        groups:{ type:String, enum:["contacts","approve"], default:"contacts" },
    },
    // Profile photo stored on Cloudinary (null = show initials)
    avatar:{
        type:{ url:String, publicId:String },
        default:null
    }
},{timestamps:true}) 


// ── Photo / about privacy ─────────────────────────────────────
// When a query asks for avatar or about, also load the owner's privacy settings
// (and whether it's a business) so they can be applied below.
userSchema.pre(/^find/, function () {
    const proj = this.projection()
    if (!proj) return
    const keys = Object.keys(proj)
    const inclusive = keys.some((k) => proj[k] === 1 || proj[k] === true)
    if (!inclusive || !(("avatar" in proj) || ("about" in proj))) return
    const add = {}
    if (!keys.some((k) => k === "privacy" || k.startsWith("privacy."))) add.privacy = 1
    if (!keys.some((k) => k === "business" || k.startsWith("business."))) add["business.enabled"] = 1
    if (Object.keys(add).length) this.select(add)
})

// Hide the photo / about from people who aren't allowed to see them.
// Business logos are always public. Privacy settings are only shown to their owner.
const canSee = (setting, ownerId, viewer) =>
    setting === "nobody" ? false : setting === "contacts" ? !!viewer?.contacts?.has(ownerId) : true
userSchema.set("toJSON", {
    transform(doc, ret) {
        delete ret.lockCode
        delete ret.passwordChangedAt
        delete ret.sessionsResetAt
        delete ret.securityCode
        delete ret.securityAnswer
        delete ret.dataExport
        delete ret.deletion
        delete ret.stickers
        const viewer = currentViewer()
        const id = String(ret._id)
        if (viewer?.id === id) return ret
        const p = ret.privacy || {}
        if (!ret.business?.enabled && !canSee(p.photo || "everyone", id, viewer)) ret.avatar = null
        if (ret.about !== undefined && !canSee(p.about || "everyone", id, viewer)) ret.about = ""
        delete ret.privacy
        delete ret.lastSeen
        delete ret.lockedChats
        delete ret.lockCodeKind
        delete ret.securityQuestion
        delete ret.emailDigest
        delete ret.hiddenChats
        delete ret.archivedChats
        delete ret.mutedChats
        delete ret.hiddenWordHash
        delete ret.wallpapers
        return ret
    },
})

const User = mongoose.model("User",userSchema)

export default User