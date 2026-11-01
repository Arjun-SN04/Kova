// Real-life examples for the FAQ "See an example" button, keyed by question text.
// Same line format as answers: "## Heading", "1. Step", "• Bullet", or a paragraph.
const A = (...lines) => lines.join('\n')

export const EXAMPLES = {
  // Getting started
  'What is Kova?': A(
    'Priya is a college student who also runs a small candle business.',
    '• She chats with friends one-to-one and in a “Hostel Gang” group.',
    '• She video-calls her parents on Sunday.',
    '• She posts a status of her new candle range that disappears the next day.',
    '• She asks Nexa to write a polite reply to a late-paying customer.',
    '• Customers order candles from her business page.',
    'All of it happens in one tab in her browser, with nothing installed.',
  ),
  'How do I create an account?': A(
    '1. Arjun opens Kova and taps Get started.',
    '2. He types “Arjun Nair”, arjun@example.com and a password.',
    '3. He picks the username @arjun.nair.',
    '4. He taps Create account and lands on his chat list.',
    'Now his friends can find him by searching @arjun.nair.',
  ),
  'How do I add people?': A(
    '## Arjun adds his friend Rohan',
    '1. Arjun searches @rohan.k in Contacts and taps Send request.',
    '2. Rohan gets the request and taps Accept.',
    '3. They now appear in each other’s chat lists.',
    '## Arjun adds his whole cricket team',
    '1. He copies his invite link and pastes it in the team’s old group.',
    '2. Everyone who opens it is added to his contacts straight away, no accepting needed.',
    '3. Later he resets the link so it can’t be reused.',
  ),
  'Can I use Kova on my phone?': A(
    '1. Meera opens Kova in Safari on her iPhone and signs in.',
    '2. She taps Share → Add to Home Screen → Add.',
    '3. A Kova icon appears next to her other apps.',
    '4. She opens it from there: it fills the screen like a normal app and shows message notifications.',
  ),
  'Is Kova free?': A(
    'Rahul runs a bakery. He uses chats, group calls with his suppliers, Nexa and the full business tools (catalog, orders, bookings, team inbox).',
    'He pays nothing to Kova. When customers pay him by UPI, the money goes straight to his bank with no cut taken.',
  ),
  'What is “Message yourself”?': A(
    '1. Arjun finds a useful article on his phone and sends the link to Message yourself.',
    '2. Later, on his laptop, he opens Message yourself and the link is there.',
    '3. He asks Nexa “remind me at 6pm to pay rent”.',
    '4. At 6pm a reminder appears in Message yourself.',
  ),

  // Messaging
  'How do replies, reactions and forwarding work?': A(
    'In the “Hostel Gang” group, Rohan asks: “Who’s coming for dinner?” and Sana asks: “Has anyone got the notes?”',
    '• Priya taps Reply on Rohan’s message and writes “Me!”. Her message shows his question above it, so nobody is confused about what she answered.',
    '• Arjun double-clicks Rohan’s message to add a quick ❤️.',
    '• Sana’s notes PDF is useful, so Priya forwards it to 3 classmates at once. Each copy says “Forwarded”.',
  ),
  'Can I edit or delete a message?': A(
    '• Arjun sends “See you at 5” but meant 6. Within 10 minutes he taps ⋯ → Edit, changes it to 6 and saves. It now shows “edited”.',
    '• He sends a photo to the wrong chat. He taps ⋯ → Delete → Delete for everyone, and it’s gone for both of them.',
    '• He wants to tidy old memes from his own view only, so he selects 5 of them → Delete for me.',
  ),
  'How do I find an old message?': A(
    'Meera remembers her landlord sent the Wi-Fi password weeks ago, but not in which chat.',
    '1. She types “wifi” in the search box at the top of her chat list.',
    '2. Under Messages she sees: “Landlord: Wifi password is Sunny@123”.',
    '3. She taps it and the chat opens right at that message.',
  ),
  'What are link previews?': A(
    '1. Arjun pastes a YouTube link into the chat and sends it.',
    '2. Under the link, a card appears with the video’s thumbnail, title and “YouTube”.',
    '3. Rohan sees what it is before deciding to open it.',
  ),
  'How do I share my location?': A(
    '## Meeting at a crowded mall',
    '1. Priya taps + → Location → Live location → 1 hour.',
    '2. Sana sees a map in the chat with Priya’s dot moving as she walks.',
    '3. Sana follows the dot and finds her.',
    '4. Priya taps Stop sharing once they meet.',
    '## Sending an address once',
    'Arjun taps + → Location → Current location to send a single pin of his home to the delivery person.',
  ),
  'Can I make a poll?': A(
    '1. In the “Hostel Gang” group, Rohan taps + → Poll.',
    '2. He asks “Where for dinner?” with options Pizza, Biryani and Chinese.',
    '3. He turns on “allow multiple answers” and sends it.',
    '4. Votes come in live: Biryani 5, Pizza 3, Chinese 1.',
    '5. Rohan closes the poll. Biryani it is.',
  ),
  'What are disappearing messages?': A(
    '1. Arjun and Rohan plan a surprise party for Priya, so they turn on disappearing messages for 24 hours.',
    '2. Their planning messages vanish a day after they’re sent.',
    '3. Rohan taps Keep on the message with the venue address so it stays.',
  ),
  'How do pinned and starred messages work?': A(
    '• In the “Flat 4B” group, the landlord’s message with the rent due date is pinned. It stays at the top for everyone.',
    '• Meera stars her friend’s message with a great recipe. Weeks later she opens the Starred tab and finds it instantly.',
    '• Meera pins her Mom and Work chats so they always sit at the top of her list.',
  ),
  'Does Kova show when someone is typing or has read my message?': A(
    '1. Arjun messages Priya: “Are you free tonight?” He sees one tick: sent.',
    '2. Priya opens the chat. It turns into two ticks: seen.',
    '3. Arjun sees “typing…” while Priya writes back.',
    'If Priya turns off read receipts in Privacy, Arjun won’t see her ticks, and she won’t see his either.',
  ),

  // Photos, files and voice
  'What can I send?': A(
    '• Meera drags 6 holiday photos onto the chat and sends them together.',
    '• She attaches her resume PDF with + → Document.',
    '• She copies a screenshot and pastes it straight into the message box.',
    'A 50 MB video would be too big: each file can be up to 10 MB.',
  ),
  'Can I take a photo or record a voice note?': A(
    '• Rohan taps + → Camera, switches to the back camera, snaps the menu at a café and sends it.',
    '• Driving home, Priya holds the mic, says “Running 10 minutes late, order without me”, and lets go to send.',
    '• Arjun plays her voice note at 1.5× while scrolling through another chat. It keeps playing.',
  ),
  'How do I send GIFs and stickers, or make my own?': A(
    '## Priya replies with a GIF',
    '1. Rohan writes “We won the match!!”.',
    '2. Priya taps the smiley → GIFs, searches “celebrate” and taps a dancing GIF. It’s sent at once.',
    '## Arjun makes a sticker of his dog',
    '1. Arjun opens ⋯ on a photo of his dog Bruno in the chat and taps Make sticker.',
    '2. He picks Circle, zooms in on Bruno’s face and types the caption “NOPE”.',
    '3. He taps Save and send. Everyone laughs.',
    '## Sana keeps it',
    'Sana opens ⋯ on Arjun’s sticker and taps Save sticker. Now it’s under her Stickers → Yours, ready to send whenever she wants to say no.',
  ),
  'Can voice notes be turned into text?': A(
    '1. Meera is in a meeting and gets a 2-minute voice note from her mom.',
    '2. She taps Transcribe and reads the text instead.',
    '3. Next week she searches “doctor” and finds the transcript with the appointment time.',
  ),
  'Where do I find all the photos and files from a chat?': A(
    '1. Arjun needs a bill his roommate sent in March.',
    '2. He opens the chat’s info panel → Media, links and docs → Docs.',
    '3. He scrolls to March, finds “Electricity_Mar.pdf” and downloads it.',
  ),
  'Are my photos compressed?': A(
    'Priya sends a 6 MB phone photo. Kova shrinks it to around 600 KB in her browser before sending.',
    'It sends in a second on slow mobile data and still looks sharp to Sana.',
  ),

  // Nexa
  'What can Nexa do?': A(
    'Arjun opens the Nexa chat and types:',
    '• “Write a short leave application for 2 days” → Nexa writes it.',
    '• “What’s the score in today’s India match?” → Nexa searches the web.',
    '• “Tell Rohan I’ll bring the charger” → Nexa sends that message to Rohan.',
    '• “Wish Priya happy birthday tomorrow at 9am” → it’s scheduled and sent at 9am.',
    '• “Remind me at 6pm to call mom” → the reminder arrives at 6pm.',
  ),
  'Can I use Nexa inside my normal chats?': A(
    '1. In the “Goa Trip” group, Sana types @ne and presses Tab. It becomes @Nexa.',
    '2. She writes: “@Nexa make a 3-day Goa plan under ₹10,000 for 5 people”.',
    '3. Nexa replies in the group with the plan, and everyone sees it.',
  ),
  'What is “Catch me up”?': A(
    '1. Meera was in a meeting and the “Flat 4B” group has 47 unread messages.',
    '2. She taps Catch me up.',
    '3. Nexa summarises: “Water will be off on Saturday 10am–2pm. Rohan is asking who wants to split a new fridge, which needs your reply.”',
  ),
  'What are smart replies and “Rewrite with Nexa”?': A(
    '## Smart replies',
    'Rohan sends “Can we meet at 6?”. Above Arjun’s message box appear: “Sure, see you then” · “Make it 7?” · “Can’t today”. Arjun taps the first one and it’s sent.',
    '## Rewrite with Nexa',
    '1. Meera types to her boss: “cant come tmrw sick”.',
    '2. She taps the pen button → More professional.',
    '3. It becomes: “I’m unwell and won’t be able to come in tomorrow. I’ll keep you updated.”',
    '4. She sends it.',
  ),
  'Can messages be translated or read aloud?': A(
    '• Arjun’s Japanese client writes in Japanese. He taps ⋯ → Translate and reads it in English under the original.',
    '• Priya’s grandmother sends a long Hindi message. Priya taps ⋯ → Listen and hears it read in a natural Hindi voice while she cooks.',
  ),
  'Can Nexa remind me about a message?': A(
    '1. Rohan sends Arjun a link to a form that’s due tomorrow.',
    '2. Arjun taps ⋯ → Remind me → Tomorrow at 9 AM.',
    '3. At 9 AM a reminder arrives in Message yourself.',
    '4. Arjun taps it, jumps to Rohan’s message and fills in the form.',
  ),

  // Groups, communities and channels
  'How do groups work?': A(
    '1. Sana taps New group, picks 5 friends and names it “Goa Trip”.',
    '2. Everyone shares ideas, photos and polls in it.',
    '3. Sana makes Rohan an admin to help manage it.',
    '4. Close to the trip, she turns on “Only admins can send messages” so the final plan doesn’t get buried.',
  ),
  'Can people join a group with a link?': A(
    '1. Coach Vikram makes a “Sunday Football” group and shares its invite link on a noticeboard.',
    '2. He turns on Approve new members.',
    '3. 12 players open the link and ask to join. Vikram approves the 10 he knows.',
    '4. After the season, he resets the link so the old one stops working.',
  ),
  'What are communities?': A(
    'Mrs. Rao creates a “Green Valley School” community with groups for Class 5A, Class 5B and the Sports Club.',
    '• Every parent gets the Announcements group, where only she posts: “School closed on Monday.”',
    '• Parents join only the class groups that matter to them.',
  ),
  'What are channels?': A(
    '1. Rahul creates a channel “Sweet Crumbs Bakery” with the handle @sweetcrumbs.',
    '2. He shares the link on Instagram and 300 people follow it.',
    '3. Every morning he posts “Today’s specials” with a photo.',
    '4. Followers react with 😍 but can’t reply, so the channel stays clean.',
  ),
  'Can I plan events in a group?': A(
    '1. In the “Hostel Gang” group, Rohan taps + → Event.',
    '2. He fills in “Movie night”, Saturday 8 PM, Room 204.',
    '3. 6 friends tap Going, 2 tap Maybe.',
    '4. At 7 PM on Saturday, the group gets a reminder.',
  ),
  'Can a group track tasks?': A(
    '1. In the “Flat 4B” group, Meera writes “Pay the electricity bill”.',
    '2. She taps ⋯ → Make task, assigns it to Arjun and sets the due date to Friday.',
    '3. A task card appears in the group.',
    '4. Arjun pays on Thursday and ticks it off. The card shows “Done” for everyone.',
  ),

  // Calls
  'How do I call someone?': A(
    '1. Priya opens her chat with Mom and taps the camera button.',
    '2. Her browser asks for camera and mic access the first time, and she allows it.',
    '3. Mom answers. Priya mutes herself while the pressure cooker whistles, then unmutes.',
    '4. She taps the red button to hang up.',
  ),
  'Are calls private?': A(
    'When Arjun video-calls Rohan, the video goes straight from Arjun’s laptop to Rohan’s phone.',
    'Kova’s server only rang Rohan’s phone and helped the two devices find each other. It never sees or stores the call.',
  ),
  'Where can I see my call history?': A(
    '1. Meera missed a call from her brother while in the shower.',
    '2. The Calls tab shows a red badge. She opens it: “Missed · Brother · 9:42 PM”.',
    '3. She opens their chat and taps the call-back button on the missed-call bubble.',
  ),
  'Can I call a group?': A(
    'Arjun wants to call his 3 roommates at once. For now he calls them one by one, or uses the group chat and voice notes.',
  ),

  // Status
  'How do I post a status?': A(
    '1. Priya opens the Status tab and taps My status.',
    '2. She picks Photo, chooses a sunset picture and writes “Goa vibes 🌅”.',
    '3. She taps Post.',
    'Her contacts see a ring around her photo and tap to view it.',
  ),
  'How long does a status stay up?': A(
    'Priya posts her sunset photo at 7 PM on Monday. It disappears on its own at 7 PM on Tuesday.',
  ),
  'Who can see my status, and can I see who viewed it?': A(
    '• Priya’s contacts Sana, Rohan and Arjun can see her status. A stranger who knows her @username can’t.',
    '• She opens her own status and sees: “Viewed by Sana 7:05 PM, Rohan 7:20 PM”.',
  ),

  // Privacy and security
  'Who can see my profile photo and about?': A(
    'Meera sells online and doesn’t want customers she hasn’t added to see her family photo.',
    '1. She opens Profile → Privacy.',
    '2. She sets Profile photo to My contacts.',
    'Now only people she has added see her photo. Everyone else sees her initials.',
  ),
  'How do I lock a chat?': A(
    '1. Arjun shares his laptop with his sister and wants his chat with his girlfriend private.',
    '2. He opens that chat → ⋯ → Lock chat.',
    '3. He sets the code “sky42”, and the security question “First pet’s name?” with the answer “bruno”.',
    '4. In his chat list it now shows only her name and photo, with no preview.',
    '5. Opening it asks for “sky42” first.',
  ),
  'What are hidden chats?': A(
    '1. Priya is planning a surprise for her brother, who often uses her phone.',
    '2. She hides the planning chat (⋯ → Hide chat) and sets the secret word “confetti”.',
    '3. The chat vanishes from her list and from search.',
    '4. When she wants it, she types “confetti” in the search box and it appears.',
    '5. She clears the search and it hides again.',
  ),
  'What is app lock?': A(
    '1. Meera leaves her laptop open at the office, so she turns on app lock with the PIN “4821”.',
    '2. She sets it to lock after 1 minute away.',
    '3. When she comes back from lunch and opens Kova, it asks for her fingerprint or PIN first.',
  ),
  'Can I use the same code for app lock and locked chats?': A(
    '1. Arjun sets his app lock PIN to “sky42”.',
    '2. He ticks “Use this for both”.',
    '3. His locked chats now open with “sky42” too. One code to remember.',
  ),
  'I forgot my chat lock code, secret word or app PIN. What now?': A(
    '1. Arjun forgets his chat code and taps Forgot.',
    '2. Kova asks his security question: “First pet’s name?”',
    '3. He types “Bruno”. Capital letters and extra spaces don’t matter.',
    '4. He sets a new code, “moon77”. His chats and messages are all still there.',
  ),
  'I forgot my login password.': A(
    '1. Meera taps Forgot password? and enters meera@example.com.',
    '2. An email from Kova arrives with the code 482913.',
    '3. She enters the code, sets a new password and signs in.',
  ),
  'How do I block or report someone?': A(
    '1. A stranger keeps sending Priya spam after she accepted their request by mistake.',
    '2. She opens their contact info and taps Report, then Block.',
    '3. They disappear from her contacts and can’t message or invite her again.',
  ),

  // Business
  'How do I turn on business tools?': A(
    '1. Rahul opens Profile → Business tools.',
    '2. He picks the category Bakery and writes “Fresh cakes and breads, delivered in Kochi”.',
    '3. His business workspace opens with the inbox, catalog, orders and insights.',
  ),
  'What do my customers see?': A(
    'Meera scans the QR code on Rahul’s shop counter and kova…/b/sweetcrumbs opens in her browser. She sees:',
    '• A cover photo of the bakery, “Open · 8 AM – 9 PM”',
    '• The catalog: Chocolate Truffle Cake ₹800, Garlic Bread ₹120',
    '• Services: “Custom cake consultation, 30 min”',
    '• 4.8 ⭐ from 52 reviews',
    '• Book and Message buttons',
    'This page is hosted by Kova. Rahul doesn’t need his own website.',
  ),
  'Can customers order and pay?': A(
    'Meera orders a cake from Rahul’s “Sweet Crumbs Bakery”.',
    '## 1. Meera orders',
    '1. She opens kova…/b/sweetcrumbs and taps Add to cart on the Chocolate Truffle Cake (₹800).',
    '2. She enters the discount code FIRST10. The total becomes ₹720.',
    '3. She taps Place order. If she’s new to Kova, she signs up first.',
    '4. Rahul gets a chat from Meera with an order card: “Order #1042 · Chocolate Truffle Cake ×1 · ₹720 · New”.',
    '## 2. Rahul moves it along',
    '1. Confirm → Meera gets “Your order #1042 is confirmed ✅”.',
    '2. Ready → “Your order is ready 🎂”.',
    '3. Out for delivery → “Your order is on the way 🛵”.',
    '4. Done → “Delivered! How was it?”',
    '## 3. Meera tracks it',
    '• She opens the live order page from the chat and sees which step it’s at, without asking “where’s my cake?”.',
    '## 4. Rahul gets paid',
    '1. He sends a payment request for ₹720.',
    '2. Meera taps Pay with UPI. GPay opens with the amount and Rahul’s UPI ID filled in.',
    '3. She pays. The money goes straight to Rahul’s bank.',
    '4. Rahul checks his UPI app to confirm it arrived.',
    '## 5. Feedback',
    '• Meera rates the order 5 ⭐. It appears on the bakery page for future customers.',
  ),
  'Can customers book appointments?': A(
    'Anjali runs a hair salon and adds the service “Haircut, 45 min, ₹500”.',
    '1. A customer opens her page and taps Book.',
    '2. They pick Haircut and Saturday. Only free slots show: 10:00, 11:00, 2:30.',
    '3. They choose 11:00 and confirm.',
    '4. The booking appears in Anjali’s Kova and her Google Calendar.',
    '5. The customer gets a reminder before the appointment.',
  ),
  'What saves me time answering customers?': A(
    'It’s 10 PM and Rahul’s bakery is closed.',
    '• A customer writes “Do you have eggless cakes?”. The away message replies: “We’re closed, back at 8 AM!”',
    '• Nexa auto-reply adds: “Yes, our Eggless Black Forest is ₹750.” It sees the customer wants to buy and marks the chat as a lead.',
    '• Next morning Rahul types /hours and his saved opening-hours reply is inserted.',
    '• He labels the chat “VIP” and broadcasts a Diwali offer to all his customers. Each gets it in their own private chat.',
  ),
  'Can my team help?': A(
    '1. Rahul adds his staff Anu (@anu.k) as an Agent.',
    '2. Anu signs in with her own Kova account and sees the bakery’s shared inbox.',
    '3. Rahul assigns the wedding-cake inquiry to Anu.',
    '4. She replies as “Sweet Crumbs Bakery” and leaves a team-only note: “Needs a quote by Friday”. The customer never sees it.',
  ),
  'Can I see how my business is doing?': A(
    'Rahul opens Insights → 30 days and sees:',
    '• 420 messages, 65 new customers',
    '• Average reply time: 6 minutes',
    '• 112 orders, ₹68,400 revenue',
    '• Busiest hours: 6–8 PM',
    'He decides to keep an extra person on shift in the evenings, and exports the orders as a CSV for his accountant.',
  ),

  // Account, data and notifications
  'How do I change my photo, name or username?': A(
    '1. Priya opens Profile and taps her photo.',
    '2. She picks a new selfie, zooms in a little, straightens it and adds a warm filter.',
    '3. She changes her about to “Candles & coffee ☕” and saves.',
  ),
  'Can I change how Kova looks?': A(
    'Arjun chats late at night, so he picks Dark mode and the purple theme.',
    'He sets a beach wallpaper for the “Goa Trip” group and keeps the default for everything else.',
  ),
  'Will I get notifications?': A(
    '• Meera turns on notifications on her laptop and her phone. A new message pops up on both.',
    '• She also turns on Email digest. After a weekend away from Kova, she gets one email: “You have 12 unread messages from Mom, Rohan and Flat 4B.”',
  ),
  'Can I download my data?': A(
    '1. Arjun is switching phones and wants a backup.',
    '2. He taps Profile → Your data & account → Request my data.',
    '3. A few minutes later an email arrives with a download link.',
    '4. He downloads “kova-data.zip” with all his chats, photos and contacts inside.',
  ),
  'How do I delete my account?': A(
    '1. Rohan decides to leave Kova and taps Delete my account.',
    '2. He confirms with his password and is signed out everywhere.',
    '3. Two weeks later he changes his mind and signs in again.',
    '4. The deletion is cancelled and everything is just as he left it.',
    'If he hadn’t signed in within 30 days, his account would have been permanently deleted.',
  ),
  'How long do I stay signed in?': A(
    'Meera signs in on her laptop on 1 June and uses Kova most days. She stays signed in.',
    'If she stops using that laptop for over 30 days, she’ll have to sign in again on it.',
  ),
}
