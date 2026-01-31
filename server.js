const http = require('http');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const PORT = 3002;
const MONGO_URL = "";
const client = new MongoClient(MONGO_URL);

async function startServer() {
    try {
        await client.connect();
        const db = client.db('test'); 
        console.log("Connected to MongoDB");

        const server = http.createServer(async (req, res) => {
            if (req.url === '/' || req.url === '/index.html') {
                fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(content);
                });
            } 
            else if (req.url === '/api/sos-data') {
                try {
                    // Aggregation to join emergencies with users based on touristId
                    const detailedEmergencies = await db.collection('emergencies').aggregate([
                        {
                            $lookup: {
                                from: 'users',           // The collection to join
                                localField: 'touristId',  // Field from 'emergencies'
                                foreignField: '_id',      // Field from 'users'
                                as: 'userDetails'         // Output array field
                            }
                        },
                        {
                            // Flatten userDetails (since lookup returns an array)
                            $unwind: {
                                path: "$userDetails",
                                preserveNullAndEmptyArrays: true // Show SOS even if user not found
                            }
                        }
                    ]).toArray();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(detailedEmergencies));
                } catch (error) {
                    console.error(error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: "Aggregation failed" }));
                }
            }
        });

        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (e) { console.error(e); }
}

startServer();