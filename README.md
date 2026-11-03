# Talkies 💬

Highlights:

- 🌟 Tech stack: MERN + Socket.io + TailwindCSS + Daisy UI
- 🎃 Authentication && Authorization with JWT
- 👾 Real-time messaging with Socket.io
- 🚀 Online user status
- 👌 Global state management with Zustand
- 🐞 Error handling both on the server and on the client
- ⭐ A Deployment at the end

### Setup .env file

```js
MONGODB_URI=...
PORT=5001
JWT_SECRET=...

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Payments (Razorpay). TEST keys only (rzp_test_...): live keys are refused by the server. Never commit the secret.
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...

# Forgot password emails (Brevo, free 300/day, sent over HTTPS so it works on Render's free tier).
# Create an API key in Brevo -> SMTP & API, and verify the sender address in Brevo -> Senders.
BREVO_API_KEY=...
MAIL_FROM_EMAIL=you@example.com
MAIL_FROM_NAME=Talkies

NODE_ENV=development
```

### Build the app

```shell
npm run build
```

### Start the app

```shell
npm run dev
```
