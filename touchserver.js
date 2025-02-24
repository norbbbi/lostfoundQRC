const express = require("express");
const nodemailer = require("nodemailer");
const app = express();
const cors = require("cors");

app.use(express.json());
app.use(cors());

let messages = [];

// Notify owner when QR is scanned
app.post("/scan", (req, res) => {
    console.log("QR Code Scanned!");
    
    let transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "your-email@gmail.com",
            pass: "your-email-password"
        }
    });

    let mailOptions = {
        from: "your-email@gmail.com",
        to: "owner-email@gmail.com",
        subject: "Your QR Code Was Scanned!",
        text: "Someone just scanned your QR code."
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        } else {
            console.log("Email sent: " + info.response);
        }
    });

    res.json({ message: "Owner Notified" });
});

// Handle messages
app.post("/message", (req, res) => {
    const { sender, text } = req.body;
    messages.push({ sender, text });
    res.json({ message: "Message sent" });
});

app.get("/messages", (req, res) => {
    res.json(messages);
});

app.listen(3000, () => console.log("Server running on port 3000"));
