// server.js

// Import necessary modules
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
// --- NEW IMPORTS FOR AI ---
require('dotenv').config(); // Load environment variables from .env
const { GoogleGenerativeAI } = require("@google/generative-ai");
// --------------------------

// --- Configuration ---
const app = express();
const port = 3001; // The port for your Home service
const MONGODB_URI = ""; // Replace with your MongoDB connection string

// --- AI Configuration ---
// The AI Key is loaded from the .env file using process.env.GOOGLE_AI_KEY
const geminiAi = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const aiModel = geminiAi.getGenerativeModel({ model: "gemini-pro" });
// --------------------------


let db; 

// --- Middleware ---
app.use(cors()); // Allow cross-origin requests from the tourist-dashboard
app.use(express.json()); // To parse JSON bodies
app.use(express.static('public')); // Serve static files (like index.html, main.js) from a 'public' folder

// Simple route to serve the front-end file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'tourist-home.html'));
});

// --- Database Connection ---
const connectDB = async () => {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db('test');
        console.log("MongoDB connected successfully.");

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); 
    }
};

// Initialize connection
connectDB();


// ----------------------------------------------------------------------
// 1. ENDPOINT: GET /api/destinations (For Main Page Cards)
// ----------------------------------------------------------------------
app.get('/api/destinations', async (req, res) => {
    if (!db) {
        return res.status(503).json({ message: "Service temporarily unavailable. Database connection pending." });
    }
    
    try {
        // Fetch destinations, only including the primary image, title, description, and ID
        const destinations = await db.collection('destinations')
            .find({})
            .project({ primaryImageBase64: 1, title: 1, description: 1, _id: 1 }) 
            .sort({ postedAt: -1 })
            .toArray();

        res.json(destinations);
        
    } catch (error) {
        console.error("Error fetching destinations:", error);
        res.status(500).json({ message: "Server error while fetching destinations." });
    }
});


// ----------------------------------------------------------------------
// 2. ENDPOINT: GET /api/destinations/:id (For Modal Details View)
// ----------------------------------------------------------------------
app.get('/api/destinations/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ message: "Service temporarily unavailable. Database connection pending." });
    }

    const destinationId = req.params.id;

    if (!ObjectId.isValid(destinationId)) {
        return res.status(400).json({ message: "Invalid destination ID format." });
    }

    try {
        const destination = await db.collection('destinations').findOne({
            _id: new ObjectId(destinationId)
        });

        if (!destination) {
            return res.status(404).json({ message: "Destination not found." });
        }

        res.json(destination);

    } catch (error) {
        console.error(`Error fetching destination ${destinationId}:`, error);
        res.status(500).json({ message: "Server error while fetching destination details." });
    }
});


// ----------------------------------------------------------------------
// 3. NEW ENDPOINT: POST /api/get-destination-details (For AI Integration)
// ----------------------------------------------------------------------
app.post('/api/get-destination-details', async (req, res) => {
    // 1. Check for AI Key
    if (!process.env.GOOGLE_AI_KEY) {
        console.error("GOOGLE_AI_KEY is not set in the environment variables.");
        return res.status(500).json({ error: "AI service key is missing on the server." });
    }

    try {
        const { placeName } = req.body;
        
        if (!placeName) {
            return res.status(400).json({ error: "Place name is required in the request body." });
        }

        // Define the prompt for Gemini
        const prompt = `Write a concise, engaging paragraph (max 100 words) about what ${placeName} is famous for. Focus on unique tourist spots, local food, and cultural significance.`;

        // Call the Gemini API
        const result = await aiModel.generateContent(prompt);
        const responseText = result.response.text.trim();

        // Respond with the AI-generated text
        res.json({ aiDescription: responseText });

    } catch (error) {
        console.error("Error generating AI content:", error);
        // Send a generic error message to the client
        res.status(500).json({ error: "Failed to generate AI details due to a server error." });
    }
});