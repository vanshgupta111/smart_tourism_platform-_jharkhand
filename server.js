const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');


const app = express();
const PORT = 3004;


app.use(cors());
app.use(express.json());
// This allows the server to find your CSS/JS files in the current folder
app.use(express.static(__dirname));


// --- CSV DATA LOADER ---
const loadCSV = (file) => {
   const filePath = path.join(__dirname, file);
   if (!fs.existsSync(filePath)) return [];
   const data = fs.readFileSync(filePath, 'utf8');
   const lines = data.split('\n').filter(l => l.trim());
   const headers = lines[0].split(',');
   return lines.slice(1).map(line => {
       const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
       let obj = {};
       headers.forEach((h, i) => obj[h.trim()] = values[i]?.replace(/^"|"$/g, '').trim());
       return obj;
   });
};


const districts = loadCSV('districts.csv');
const landmarks = loadCSV('landmarks.csv');
const gastronomy = loadCSV('gastronomy.csv');


// --- ROUTES ---


// Fixes the "Cannot GET /" error
app.get('/', (req, res) => {
   res.sendFile(path.join(__dirname, 'index.html'));
});


// Fixes the Weather Issue
app.post('/get-weather', async (req, res) => {
   const { cityName } = req.body;
   // Clean the city name (e.g., "Ranchi, Jharkhand" -> "Ranchi")
   const cleanCity = cityName.split(',')[0].trim();
   const API_KEY = '';


   try {
       const url = `https://api.openweathermap.org/data/2.5/weather?q=${cleanCity}&units=metric&appid=${API_KEY}`;
       const response = await axios.get(url);
       res.json({ temp: Math.round(response.data.main.temp), description: response.data.weather[0].description });
   } catch (err) {
       res.json({ temp: "--", description: "Weather info unavailable" });
   }
});


// Fixes the Insight/Location mismatch issue
app.post('/get-ai-insight', (req, res) => {
   const { cityName } = req.body;
   const search = cityName.toLowerCase();


   // 1. Search Landmarks first (Fuzzy match)
   const landmark = landmarks.find(l =>
       search.includes(l.Name.toLowerCase()) || l.Name.toLowerCase().includes(search)
   );


   // 2. Identify District
   const dKey = landmark ? landmark.District : cityName;
   const dist = districts.find(d =>
       d['District Name'].toLowerCase().includes(dKey.toLowerCase()) ||
       dKey.toLowerCase().includes(d['District Name'].toLowerCase())
   );


   if (landmark || dist) {
       let html = "";
       if (landmark) {
           html += `<b style="color:#d35400;">📍 ${landmark.Name}</b><br><i>${landmark.Tags}</i><br><br>`;
       }
       if (dist) {
           html += `<b>Known For:</b> ${dist['Famous For']}<br>`;
       }
      
       // Match food from gastronomy.csv
       const food = gastronomy.find(f => f.special_occurrence.toLowerCase().includes(dKey.toLowerCase()));
       if (food) html += `<br>🍴 <b>Food:</b> ${food.dish_name}`;


       res.json({ insight: html });
   } else {
       res.json({ insight: "Exploring a beautiful part of Jharkhand!" });
   }
});


app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));

