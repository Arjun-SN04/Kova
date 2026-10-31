import mongoose from "mongoose";

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
    // Chats pinned to the top of my list (user or group ids, in pin order)
    pinnedChats:{ type:[String], default:[] },
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
            _id:false,
        },
        default:null
    },
    // Profile photo stored on Cloudinary (null = show initials)
    avatar:{
        type:{ url:String, publicId:String },
        default:null
    }
},{timestamps:true}) 


const User = mongoose.model("User",userSchema)

export default User