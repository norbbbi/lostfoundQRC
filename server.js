const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const http = require('http');
const nodemailer = require('nodemailer');
const { exec } = require('child_process'); // To run cloudflared
const PORT = 3210;
require("dotenv").config({ path: "./email.env" });

const app = express();
const server = http.createServer(app);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public/uploads'),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Store messages and profiles in memory
const profiles = {};

// ⚠️ Hardcode your domain here:
const publicDomain = 'https://lostandseek.org';

// Email Configuration (Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Serve the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to display a user's profile
app.get('/profile/:id', async (req, res) => {
  const userId = req.params.id;
  const profile = profiles[userId];

  if (!profile) {
    return res.status(404).send("<h1>Profile Not Found</h1>");
  }

  // Use the custom domain for profile links
  const profileLink = `${publicDomain}/profile/${userId}`;

  // Send an email notification when the QR Code is scanned
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: profile.email,
    subject: 'Your Item Has Been Found!',
    text: `Hello ${profile.name},\n\nYour lost item has been found! Click the link below to view details:\n\n${profileLink}\n\nBest regards,\nLost & Found System`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Error sending email:', err);
    } else {
      console.log('📧 Email sent:', info.response);
    }
  });

  // Render the profile page with the unique message box
  res.send(`
    <link rel="stylesheet" href="/style.css"> 
    <h2>User Profile</h2>
    <div id="profile-container">
      <img src="${profile.profilePicture}" alt="Profile Picture" class="profile-picture">
      <p class="profile-info"><strong>Profile ID:</strong> ${userId}</p>
      <p class="profile-info"><strong>Name:</strong> ${profile.name}</p>
      <p class="profile-info"><strong>Email:</strong> ${profile.email}</p>
      <p class="profile-info"><strong>Grade:</strong> ${profile.grade}</p>
      <p class="profile-info"><strong>Section:</strong> ${profile.section}</p>
    </div>    
    <h3>QR Code:</h3>
    <img src="/uploads/${userId}.png" alt="QR Code" style="max-width: 200px;">
    <h4>Message Box</h4>
    <div id="message-box" style="border: 10px solid #000; padding: 10px; height: 200px; overflow-y: scroll;">
      <p>Loading messages...</p>
    </div>
    <h5>Send a Message to Inform the Owner</h5>
    <form id="message-form">
      <input type="text" id="message-input" placeholder="Type your message here..." required>
      <button type="submit">Send</button>
    </form>
    <p id="message-status"></p>
    <script>
      async function loadMessages() {
        const response = await fetch('/messages/${userId}');
        const messages = await response.json();
        const messageBox = document.getElementById('message-box');
        messageBox.innerHTML = '';
        messages.forEach(msg => {
          const messageElement = document.createElement('p');
          messageElement.innerHTML = \`<strong>\${msg.sender}</strong>: \${msg.text} <small>(\${msg.timestamp})</small>\`;
          messageBox.appendChild(messageElement);
        });
        messageBox.scrollTop = messageBox.scrollHeight;
      }

      document.getElementById('message-form').addEventListener('submit', async function(event) {
        event.preventDefault();
        const messageInput = document.getElementById('message-input').value;
        const response = await fetch('/message/${userId}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: "${profile.name}", text: messageInput })
        });
        if (response.ok) {
          document.getElementById('message-status').innerText = 'Message sent!';
          document.getElementById('message-input').value = '';
          loadMessages();
        } else {
          document.getElementById('message-status').innerText = 'Failed to send message.';
        }
      });

      setInterval(loadMessages, 3000);
      loadMessages();
    </script>
  `);
});

// Save profile and generate QR code
app.post('/save-profile', upload.single('profilePicture'), async (req, res) => {
  const { name, email, grade, section } = req.body;
  if (!name || !email || !grade || !section) {
    return res.status(400).json({ error: "All fields are required." });
  }
  const userId = Date.now();
  const profilePicture = req.file ? `/uploads/${req.file.filename}` : '/default-profile.jpg';

  // Hardcode domain for the final link
  const profileUrl = `${publicDomain}/profile/${userId}`;

  // Save the profile data in memory
  profiles[userId] = { name, email, grade, section, profilePicture, profileUrl, messages: [] };

  try {
    // Generate the QR code pointing to your custom domain
    await QRCode.toFile(
      path.join(__dirname, 'public/uploads', `${userId}.png`),
      profileUrl
    );
    // Redirect the user to their saved profile page
    res.redirect(profileUrl);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating QR code');
  }
});

// Route to send a message to a specific profile
app.post('/message/:id', (req, res) => {
  const userId = req.params.id;
  const { sender, text } = req.body;
  if (!sender || !text) {
    return res.status(400).json({ error: 'Missing sender or message text' });
  }
  if (!profiles[userId]) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  const newMessage = { sender, text, timestamp: new Date().toLocaleTimeString() };
  profiles[userId].messages.push(newMessage);
  console.log(`Message from ${sender} to profile ${userId}: ${text}`);
  res.json({ success: true });
});

// Route to get all messages for a specific profile
app.get('/messages/:id', (req, res) => {
  const userId = req.params.id;
  if (!profiles[userId]) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  res.json(profiles[userId].messages || []);
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  
  // Optionally start the ephemeral Cloudflare Tunnel
  // but it won't matter if you're using a named tunnel + domain.
  exec(`cloudflared tunnel --url http://localhost:${PORT}`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Error starting Cloudflare Tunnel:', err);
      return;
    }
    console.log('✅ Ephemeral Tunnel started, but your domain is set to:', publicDomain);
  });
});
