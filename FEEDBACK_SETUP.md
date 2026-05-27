# Setup Instructions for Feedback System

## ✅ What I've Implemented

### 1. Global Search Bar (GSTAT Page)
- Search across ALL fields in real-time
- Works alongside existing column filters
- Located above the table
- Instant filtering as you type

### 2. Floating Feedback Button (Every Page)
- 💬 Teal button in bottom-right corner
- Opens modal form with:
  - Email field
  - Message textarea
  - Image upload
  - Send button

### 3. Email Integration
- Sends feedback emails to: **somyajainworkline@gmail.com**
- Includes: message, user email, image attachments
- Professional HTML template

---

## ⚙️ Required Setup

### Step 1: Get Gmail App Password

1. Go to: https://myaccount.google.com/apppasswords
2. Select Phone > Gmail
3. Click **Generate**
4. Copy the 16-character password shown

### Step 2: Add to `.env.local`

In your `.env.local` file, add:

```
GMAIL_USER=somyajainworkline@gmail.com
GMAIL_APP_PASSWORD=your_16_char_password_here
```

Replace `your_16_char_password_here` with the password from Step 1.

### Step 3: Install Dependencies

Run in terminal:

```bash
npm install
```

### Step 4: Test

1. Start dev server: `npm run dev`
2. Go to http://localhost:3001/gstat
3. Click the 💬 button (bottom right)
4. Fill form and send
5. Check **somyajainworkline@gmail.com** for email ✅

---

## 📝 Files Changed

- ✅ `components/feedback-button.tsx` - New feedback form component
- ✅ `app/api/feedback.ts` - Email sending API route
- ✅ `app/layout.tsx` - Added feedback button to all pages
- ✅ `components/gstat/gstat-register.tsx` - Added global search
- ✅ `package.json` - Added nodemailer dependency
- ✅ `.env.local` - Gmail configuration

---

## 🚀 To Deploy

1. Get the Gmail App Password (see Step 1 above)
2. Add it to `.env.local`
3. Run: `git add -A && git commit -m "Add feedback form and global search" && git push`
4. Vercel auto-deploys
5. Set `GMAIL_APP_PASSWORD` in Vercel environment variables

Done! 🎉
