// server.js

// --- ES Module Imports ---
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';

// Necessary for __dirname in ES Modules
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 🌟 NEW IMPORTS 🌟
import nodemailer from 'nodemailer'; // For sending OTP emails
import crypto from 'crypto'; // For generating the OTP

// Recreate __dirname and __filename for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
// NOTE: REPLACE THESE WITH YOUR ACTUAL CONFIGURATION
const MONGODB_URI = ""; 
const JWT_SECRET = "your_super_secret_secret_key_change_me"; 

// 🌟 NEW CONFIGURATION FOR EMAIL (REPLACE WITH YOUR CREDENTIALS!) 🌟
const NODEMAILER_USER = "";     // e.g., "my_app_service_account@gmail.com"
const NODEMAILER_PASS = ""; // e.g., "app_specific_password" (Recommended)
const OTP_EXPIRY_MINUTES = 5; // OTP is valid for 5 minutes
const PAYMENT_GATEWAY_SECRET = "sk_test_xxxxxxxxxxxxxxxxxxxxxxxx"; // YOUR SECRET KEY
const PAYMENT_GATEWAY_PUBLISHABLE = "pk_test_yyyyyyyyyyyyyyyyyyyyyyyy"; // YOUR PUBLIC/PUBLISHABLE KEY
const PAYMENT_CURRENCY = 'INR';
// --- Nodemailer Transporter Setup ---
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use 'gmail' or configure SMTP settings
    auth: {
        user: NODEMAILER_USER,
        pass: NODEMAILER_PASS
    }
});
const otpStore = {};
// --- Middleware ---
app.use(cors());
// IMPORTANT: Increase payload limit to handle large Base64 image strings (default is 100kb)
// Set to '50mb' to accommodate multiple high-res Base64 images
app.use(express.json({ limit: '50mb' })); 

// Serve static files from the root directory
app.use(express.static(__dirname));


// --- Database Connection ---
let db;
MongoClient.connect(MONGODB_URI)
    .then(async client => {
        db = client.db();
        console.log("Successfully connected to MongoDB.");
       
        // Ensure unique index on username and email
        const usersCollection = db.collection('users');
        await usersCollection.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { username: { $exists: true } } });
        await usersCollection.createIndex({ email: 1 }, { unique: true });
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
    });


    async function sendOTPEmail1(toEmail, otp, type) {
    const subject = type === 'reset' ? 'Password Reset Verification Code' : 'Email Verification Code';
    const body = type === 'reset' 
        ? `You have requested to reset your password. Use the following code to verify your request: 
           \n\n**${otp}**\n\nThis code expires in 10 minutes.`
        : `Welcome to Smart Tourism Platform! Your verification code is: 
           \n\n**${otp}**\n\nPlease use this code to complete your registration. This code expires in 10 minutes.`;

    const mailOptions = {
        from: NODEMAILER_USER,
        to: toEmail,
        subject: subject,
        html: `<p>${body.replace(/\n/g, '<br>')}</p>`
    };

    return transporter.sendMail(mailOptions);
}

// --- Middleware to verify JWT and attach user to request ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware to check for the 'guide' role
const requireGuideRole = (req, res, next) => {
    if (req.user && req.user.role === 'guide') {
        next();
    } else {
        res.status(403).json({ message: "Access denied. Guide role required." });
    }
};

const generateOTP = () => {
    // Generate a random 6-digit number and pad with leading zeros if necessary
    return crypto.randomInt(100000, 999999).toString();
};

// Function to send the OTP email (uses existing transporter)
const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: NODEMAILER_USER,
        to: email,
        subject: 'Smart Tourism Platform - Email Verification OTP',
        html: `
            <p>Hello,</p>
            <p>Thank you for registering. Please use the following One-Time Password (OTP) to verify your email and complete your registration:</p>
            <h2 style="color: #10b981; font-size: 24px; text-align: center; border: 2px solid #10b981; padding: 10px;">${otp}</h2>
            <p>This code is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
            <p>If you did not attempt to register, please ignore this email.</p>
            <p>Regards,<br>Jharkhand Tourism Platform</p>
        `
    };

    await transporter.sendMail(mailOptions);
};
app.post('/api/auth/forgot-password-request', async (req, res) => {
    try {
        const { email } = req.body;
        
        // 1. Check if user exists
        const existingUser = await db.collection('users').findOne({ email });
        if (!existingUser) {
            // Respond generically to prevent user enumeration
            return res.status(404).json({ message: 'If the email is registered, a password reset code has been sent.' });
        }

        // 2. Generate OTP and expiration time (10 minutes)
        const otp = generateOTP();
        const expires = Date.now() + 10 * 60 * 1000; 

        // 3. Store the OTP for reset flow
        // Note: isReset: true flag distinguishes this from a registration OTP
        otpStore[email] = { otp, expires, isVerified: false, isReset: true };

        // 4. Send the email
        await sendOTPEmail1(email, otp, 'reset');

        res.status(200).json({ message: 'Password reset code sent to email.', email });

    } catch (error) {
        console.error("Error during forgot-password-request:", error);
        res.status(500).json({ message: 'Failed to send password reset code.' });
    }
});

// Add this route to server.js if it doesn't exist
app.get('/touristhome', (req, res) => {
    // This sends a static HTML file named 'tourist-home.html'
    res.sendFile(path.join(__dirname, 'tourist-home.html'));
    // OR, you can serve a simple message for testing:
    // res.send('<h1>Welcome Home! This is the /touristhome content.</h1>');
});
/**
 * 2. Verify Password Reset OTP
 * User enters OTP -> confirms the user is legitimate and allows the final reset step.
 */
app.post('/api/auth/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const storedOtp = otpStore[email];

        // 1. Check OTP existence, expiry, and flow type
        if (!storedOtp || storedOtp.otp !== otp || storedOtp.expires < Date.now() || !storedOtp.isReset) {
            // Clean up expired or incorrect OTPs
            if (storedOtp) delete otpStore[email];
            return res.status(401).json({ message: 'Invalid or expired OTP. Please try requesting a new code.' });
        }
        
        // 2. Mark as verified and keep stored for the final reset step
        storedOtp.isVerified = true;
        
        // Note: We DO NOT delete the OTP from store yet, as the user still needs to use it for step 3
        res.status(200).json({ message: 'OTP verified successfully. Proceed to reset password.' });

    } catch (error) {
        console.error("Error during verify-reset-otp:", error);
        res.status(500).json({ message: 'Verification failed due to server error.' });
    }
});


/**
 * 3. Reset Password
 * User provides new password -> checks verification state -> updates password in DB.
 */
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const storedOtp = otpStore[email];

        // 1. Check if the user successfully completed OTP verification
        if (!storedOtp || !storedOtp.isReset || !storedOtp.isVerified) {
            return res.status(403).json({ message: 'Verification required. Please request and verify the OTP first.' });
        }
        
        // 2. Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // 3. Update the password in the database
        const result = await db.collection('users').updateOne(
            { email },
            { $set: { password: hashedPassword } }
        );

        if (result.matchedCount === 0) {
            // This should not happen if the earlier check passed, but as a safeguard
            return res.status(404).json({ message: 'User not found.' });
        }

        // 4. Clean up OTP state
        delete otpStore[email];

        res.status(200).json({ message: 'Password successfully reset. You can now log in.' });

    } catch (error) {
        console.error("Error during reset-password:", error);
        res.status(500).json({ message: 'Password reset failed due to server error.' });
    }
});

app.post('/api/auth/request-otp', async (req, res) => {
    try {
        // Includes verification documents for all roles
        const { name, username, email, password, role, aadharNo, licenseNo, panNo } = req.body;

        if (!name || !username || !email || !password || !role) {
            return res.status(400).json({ message: "All required fields (name, username, email, password, role) are required." });
        }

        // 1. Check if user already exists and is verified
        const existingUser = await db.collection('users').findOne({ email, isVerified: true });
        if (existingUser) {
            return res.status(409).json({ message: "Email already registered and verified. Please log in." });
        }

        // 2. Generate and Hash
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const hashedOTP = await bcrypt.hash(otp, 10); // Hash the OTP for secure storage
        const otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000); // OTP expires in X minutes

        // 3. Prepare User Object (marked as unverified and temporary)
        const tempUser = {
            name,
            username,
            email,
            password: hashedPassword,
            role,
            aadharNo,
            licenseNo,
            panNo,
            isVerified: false, // Flag is false initially
            otp: hashedOTP,
            otpExpires: otpExpires,
            createdAt: new Date()
        };

        // 4. Save/Update Temporary Record (Upsert: creates new or updates existing unverified record)
        await db.collection('users').updateOne(
            { email },
            { $set: tempUser },
            { upsert: true }
        );

        // 5. Send Email
        await sendOTPEmail(email, otp);
        
        console.log(`OTP sent successfully to: ${email}`);

        res.status(200).json({ 
            message: "OTP sent to your email. Please verify to complete registration." 
        });

    } catch (error) {
        if (error.code === 11000) { // Duplicate key error (e.g., username already exists)
            return res.status(409).json({ message: "Username or email already exists." });
        }
        console.error("Error in OTP request:", error);
        res.status(500).json({ message: "Server error during OTP request." });
    }
});


/**
 * @route POST /api/auth/register-verify
 * Step 2: Checks the OTP and finalizes user account creation.
 */
app.post('/api/auth/register-verify', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required." });
        }

        // 1. Find the temporary user record
        const user = await db.collection('users').findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found. Please request OTP first." });
        }

        if (user.isVerified) {
            return res.status(409).json({ message: "Account already verified. Please log in." });
        }
        
        // 2. Check OTP expiration
        if (new Date() > user.otpExpires) {
            // Remove the expired record to allow a clean re-register
            await db.collection('users').deleteOne({ _id: user._id });
            return res.status(400).json({ message: "OTP has expired. Please request a new verification code." });
        }

        // 3. Verify OTP
        const isMatch = await bcrypt.compare(otp, user.otp);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid OTP. Please check the code and try again." });
        }

        // 4. Verification Successful: Finalize Registration
        await db.collection('users').updateOne(
            { _id: user._id },
            { 
                $set: { 
                    isVerified: true // Set flag to true
                },
                $unset: { // Remove temporary OTP fields
                    otp: "",
                    otpExpires: ""
                }
            }
        );

        res.status(201).json({ 
            message: "Registration successful. Your account is now verified. You may now log in." 
        });

    } catch (error) {
        console.error("Error in OTP verification:", error);
        res.status(500).json({ message: "Server error during OTP verification." });
    }
});

/**
 * @route POST /api/auth/login
 * Log in a user and return a JWT
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing email or password." });

    try {
        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(401).json({ message: "Invalid credentials." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials." });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Include a redirect URL based on the role for the client-side JavaScript to use
        let redirectUrl = '/index.html';
        if (user.role === 'tourist') {
            redirectUrl = '/tourist-dashboard.html';
        } else if (user.role === 'vendor') {
            redirectUrl = '/vendor-dashboard.html';
        } else if (user.role === 'guide') {
            redirectUrl = '/guide-dashboard.html';
        } else if (user.role === 'admin') {
            redirectUrl = '/admin-dashboard.html'; // Admin stays on index and is shown admin view
        }

        res.json({
            token,
           user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone || '', 
                aadharNo: user.aadharNo || '',  // <--- NEW: Include aadharNo
                licenseNo: user.licenseNo || '', // <--- NEW: Include licenseNo
                panNo: user.panNo || '',        // <--- NEW: Include panNo
                createdAt: user.createdAt, 
                languages: user.languages || [] // Include existing languages if available
            },
            redirectUrl: redirectUrl // Send this URL back to the client
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error during login." });
    }
});



// -----------------------------------------------------------------
// 🌟 --- ADMIN DASHBOARD ROUTES (NEW) --- 🌟
// -----------------------------------------------------------------

/**
 * @route GET /api/admin/sos
 * Fetches all SOS requests logged in the 'emergencies' collection.
 * (Requires Admin role)
 */
// server.js

// ... (Inside the app.get('/api/admin/sos', authenticateToken, checkAdmin, async (req, res) => { ... }) route)

// server.js

// ... (Inside the app.get('/api/admin/sos', authenticateToken, checkAdmin, async (req, res) => { ... }) route)

app.get('/api/admin/sos', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Access denied. Admin role required." });
        }

        const status = req.query.status;
        let matchQuery = {};

        // 1. Updated status filtering logic to handle case-sensitivity
        if (status === 'active') {
            // Match 'Pending', 'Active' (common casings) or missing status field
            matchQuery = { 
                $or: [
                    { status: { $in: ['Pending', 'Active', 'pending', 'active'] } },
                    { status: { $exists: false } } 
                ]
            };
        } else if (status === 'resolved') {
            // Fix: Use a case-insensitive regex to match 'resolved' or 'Resolved'
            matchQuery = { status: { $regex: /^resolved$/i } }; 
        } else if (status === 'cancelled') { 
            // Fix: Use a case-insensitive regex to match 'cancelled' or 'Cancelled'
            matchQuery = { status: { $regex: /^cancelled$/i } }; 
        } else {
            return res.status(400).json({ message: "Invalid SOS status query parameter." });
        }

        // 2. Execute Aggregation Pipeline
        const detailedRequests = await db.collection('emergencies').aggregate([
            { $match: matchQuery }, 
            { $sort: { timestamp: -1 } }, 
            
            // Lookup Tourist Details
            {
                $lookup: {
                    from: 'users',
                    localField: 'touristId',
                    foreignField: '_id',
                    as: 'touristDetails'
                }
            },
            // Lookup Guide Details
            {
                $lookup: {
                    from: 'users',
                    localField: 'guideId',
                    foreignField: '_id',
                    as: 'guideDetails'
                }
            },
            {
                $addFields: {
                    requesterDetails: { 
                        $cond: { 
                            if: { $gt: [{ $size: "$touristDetails" }, 0] }, 
                            then: { $arrayElemAt: ["$touristDetails", 0] }, 
                            else: { $arrayElemAt: ["$guideDetails", 0] }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    touristId: 1,
                    guideId: 1,
                    location: 1,
                    timestamp: 1,
                    message: 1,
                    status: 1,
                    resolvedAt: 1,
                    cancellationTimestamp: 1,
                    // Fix: Use joined details first, but fallback to values stored in the SOS record if join fails
                    requesterName: { $ifNull: ["$requesterDetails.name", "$requesterName"] },
                    requesterUsername: { $ifNull: ["$requesterDetails.username", "$requesterUsername"] },
                    requesterPhone: { $ifNull: ["$requesterDetails.phone", "$requesterPhone"] },
                    requesterEmail: { $ifNull: ["$requesterDetails.email", "$requesterEmail"] }
                }
            }
        ]).toArray();

        res.status(200).json(detailedRequests);

    } catch (error) {
        console.error("Error fetching SOS requests:", error);
        res.status(500).json({ message: "Internal server error while fetching SOS data." });
    }
});

// server.js

// ... (inside the ADMIN DASHBOARD ROUTES section)

// -----------------------------------------------------------------
// 🌟 --- NEW WISHLIST ROUTES --- 🌟
// -----------------------------------------------------------------

/**
 * @route GET /api/tourist/wishlist
 * Fetches the array of listing IDs in the logged-in tourist's wishlist.
 * (Requires Tourist role)
 */
app.get('/api/tourist/wishlist', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id;
        
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Tourist role required." });
        }

        const tourist = await db.collection('users').findOne(
            { _id: new ObjectId(touristId) },
            { projection: { wishlistIds: 1 } } // Fetch only the wishlistIds array
        );

        // Return the array, defaulting to an empty array if the field doesn't exist
        const wishlistIds = tourist && tourist.wishlistIds ? tourist.wishlistIds : [];

        res.json({ wishlistIds });

    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ message: "Server error while fetching wishlist." });
    }
});


/**
 * @route POST /api/tourist/wishlist/toggle
 * Toggles a listing ID in the logged-in tourist's wishlist array.
 * (Requires Tourist role)
 * * Request Body: { listingId: string }
 * Response Body: { message: string, action: 'added' | 'removed', listingId: string }
 */
app.post('/api/tourist/wishlist/toggle', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id;
        const { listingId } = req.body;

        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Tourist role required." });
        }
        
        // Use ObjectId.isValid to ensure the input is a valid MongoDB ID structure
        if (!listingId || !ObjectId.isValid(listingId)) {
            return res.status(400).json({ message: "Invalid or missing listing ID." });
        }

        const touristObjectId = new ObjectId(touristId);
        
        // 1. Check if the listing is already in the wishlist
        const tourist = await db.collection('users').findOne(
            { _id: touristObjectId },
            { projection: { wishlistIds: 1 } }
        );

        // Check if the listingId string is present in the array field 'wishlistIds'
        const isCurrentlyInWishlist = tourist && tourist.wishlistIds && tourist.wishlistIds.includes(listingId);
        let updateOperation;
        let action;

        if (isCurrentlyInWishlist) {
            // 2a. Remove from wishlist (using $pull)
            updateOperation = { $pull: { wishlistIds: listingId } };
            action = 'removed';
        } else {
            // 2b. Add to wishlist (using $addToSet for uniqueness)
            updateOperation = { $addToSet: { wishlistIds: listingId } };
            action = 'added';
        }

        // 3. Perform the update
        await db.collection('users').updateOne(
            { _id: touristObjectId },
            updateOperation
        );

        res.json({
            message: `Listing ${action} successfully.`,
            action: action,
            listingId: listingId
        });

    } catch (error) {
        console.error("Error toggling wishlist item:", error);
        res.status(500).json({ message: "Server error while toggling wishlist item." });
    }
});
/**
 * @route GET /api/admin/tourist-locations
 * Fetches and clusters tourist locations within a 1km range.
 * (Requires Admin role)
 */
app.get('/api/admin/tourist-locations', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Access denied. Admin role required." });
        }

        // 1. Fetch all active tourists with their current location (GeoJSON)
        const allTourists = await db.collection('users').find({ 
            role: 'tourist', 
            currentLocation: { $exists: true } 
        }, { 
            projection: { _id: 1, name: 1, username: 1, currentLocation: 1 } 
        }).toArray();

        if (allTourists.length === 0) {
            return res.json([]);
        }

        // 2. Custom Clustering Logic (Simplified for 1km range)
        const CLUSTER_DISTANCE_METERS = 1000; // 1 km
        const processedClusters = [];
        const touristsRemaining = [...allTourists]; // Copy the array to manipulate

        while (touristsRemaining.length > 0) {
            const referenceTourist = touristsRemaining.shift();
            const cluster = {
                count: 1,
                members: [referenceTourist],
                location: referenceTourist.currentLocation // Center of the cluster (initial reference)
            };

            // Find all other remaining tourists within 1km of the reference tourist
            const neighborsIndices = [];
            for (let i = 0; i < touristsRemaining.length; i++) {
                const tourist = touristsRemaining[i];
                
                // --- Simple Distance Check (Haversine or GeoJSON $geoNear equivalent) ---
                // NOTE: MongoDB's $geoNear is better for large datasets, 
                // but for simplicity, we simulate a grouping check here.
                
                // For a robust implementation, consider using a geospatial library 
                // like node-geolib or implementing the Haversine formula, or 
                // fetching coordinates from $geoNear in a loop (less efficient).
                
                // *Assuming you store lat/lng in currentLocation.coordinates[1]/[0]...*
                
                // For this example, we'll use a simple proxy: any remaining tourist 
                // within the same 1km grid square (not accurate, but shows the clustering intent).
                // If you need accuracy, replace this `if` block with a Haversine check.
                
                const distance = calculateDistance(
                    referenceTourist.currentLocation.coordinates, 
                    tourist.currentLocation.coordinates
                ); 

                if (distance < CLUSTER_DISTANCE_METERS) { // distance in meters
                    neighborsIndices.push(i);
                }
            }

            // Move neighbors from touristsRemaining to the current cluster
            for (let i = neighborsIndices.length - 1; i >= 0; i--) {
                const neighbor = touristsRemaining.splice(neighborsIndices[i], 1)[0];
                cluster.count++;
                cluster.members.push(neighbor);
            }
            
            // If the cluster has multiple members, recalculate the center (optional but good practice)
            if (cluster.count > 1) {
                cluster.location = calculateClusterCenter(cluster.members); 
            }

            processedClusters.push(cluster);
        }

        res.json(processedClusters);

    } catch (error) {
        console.error("Error fetching tourist locations:", error);
        res.status(500).json({ message: 'Server error while fetching tourist locations.' });
    }
});

// --- Helper Functions (Need to be defined in server.js scope) ---

// Dummy function for calculation: REPLACE with a real Haversine formula implementation
const calculateDistance = (coords1, coords2) => {
    // coords are [longitude, latitude]
    // *** Placeholder - Replace with actual Haversine ***
    const [lon1, lat1] = coords1;
    const [lon2, lat2] = coords2;
    // Example: simple distance in degrees * 111,000 meters/degree
    return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2)) * 100000;
};

// Dummy function to find the average center point: REPLACE with a robust method
const calculateClusterCenter = (members) => {
    let avgLon = 0;
    let avgLat = 0;
    
    members.forEach(m => {
        avgLon += m.currentLocation.coordinates[0];
        avgLat += m.currentLocation.coordinates[1];
    });
    
    return {
        type: "Point",
        coordinates: [avgLon / members.length, avgLat / members.length]
    };
};

// server.js

// ... (Existing Admin GET routes)

/**
 * @route PUT /api/admin/sos/:id/resolve
 * Marks a specific SOS request as 'resolved' by an administrator.
 * (Requires Admin role)
 */
app.put('/api/admin/sos/:id/resolve', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: "Access denied. Admin role required." });
        }

        const sosId = req.params.id;

        if (!ObjectId.isValid(sosId)) {
            return res.status(400).json({ message: 'Invalid SOS ID format.' });
        }
        
        // Define the update operation
        const updateOperation = {
            $set: {
                status: 'resolved',
                resolvedBy: new ObjectId(req.user.id), // Log which admin resolved it
                resolvedAt: new Date()
            }
        };

        const result = await db.collection('emergencies').updateOne(
            // Query: Match the ID and ensure it is not already resolved to prevent unnecessary writes
            { _id: new ObjectId(sosId), status: { $ne: 'resolved' } }, 
            updateOperation
        );

        if (result.matchedCount === 0) {
            // Check if it wasn't found (404) or was already resolved (200 OK with warning)
            const existingEmergency = await db.collection('emergencies').findOne({ _id: new ObjectId(sosId) });
            
            if (!existingEmergency) {
                 return res.status(404).json({ message: 'SOS request not found.' });
            }
            
            if (existingEmergency.status === 'resolved') {
                 // Return 200 OK since the desired state is met
                 return res.status(200).json({ message: 'SOS request was already marked as resolved.' });
            }
            
            // Fallback for unexpected update failure
            return res.status(404).json({ message: 'SOS request not found or status could not be updated.' });
        }

        res.json({ 
            message: 'SOS request successfully marked as resolved.',
            sosId: sosId
        });

    } catch (error) {
        console.error("Error resolving SOS request:", error);
        res.status(500).json({ message: 'Server error while resolving SOS request.' });
    }
});

// ... (Rest of the code)

/**
 * @route GET /api/admin/users/tourists
 * Fetches a list of all users with role 'tourist'.
 * (Requires Admin role)
 */
app.get('/api/admin/users/tourists', authenticateToken, async (req, res) => {
    try {
        const tourists = await db.collection('users').find({ role: 'tourist' })
            .project({ password: 0 }) // MODIFIED: Removed 'role: 0'
            .sort({ createdAt: -1 })
            .toArray();
            
        // MODIFIED: Map data to include 'role' and maintain consistency
        const touristList = tourists.map(tourist => ({
            _id: tourist._id.toString(),
            name: tourist.name,
            username: tourist.username, // Assuming username is useful
            email: tourist.email,
            phone: tourist.phone || 'N/A',
            aadharNo:tourist.aadharNo,
            licenseNo:tourist.licenseNo,
            panNo:tourist.panNo,
            role: tourist.role // ✅ ADDED: Include the role
        }));
            
        res.json(touristList); // Changed 'tourists' to 'touristList'

    } catch (error) {
        console.error("Error fetching all tourists:", error);
        res.status(500).json({ message: 'Server error while fetching tourist list.' });
    }
});

/**
 * @route GET /api/admin/users/guides
 * Fetches a list of all users with role 'guide', including eKYC status.
 * (Requires Admin role)
 */
/**
 * @route GET /api/admin/users/guides
 * Fetches a list of all users with role 'guide', including eKYC status.
 * (Requires Admin role)
 */
app.get('/api/admin/users/guides', authenticateToken, async (req, res) => {
    try {
        const guides = await db.collection('users').find({ role: 'guide' })
            .project({ 
                password: 0
            }) 
            .sort({ createdAt: -1 })
            .toArray();
            
        // Map data to ensure consistent structure for frontend
        const guideList = guides.map(guide => ({
            _id: guide._id.toString(),
            name: guide.name,
            username: guide.username, // Added for consistency
            email: guide.email,
            phone: guide.phone || 'N/A',
            languages: guide.languages || [],
            isEkycVerified: !!guide.isEkycVerified, // Ensure it's a boolean
            certId: guide.certId || 'Pending', 
            aadharNo: guide.aadharNo || 'N/A', 
            licenseNo: guide.licenseNo || 'N/A', 
            panNo: guide.panNo || 'N/A',
            role: guide.role // ✅ ADDED: Include the role
        }));
            
        res.json(guideList);

    } catch (error) {
        console.error("Error fetching all guides:", error);
        res.status(500).json({ message: 'Server error while fetching guide list.' });
    }
});

/**
 * @route PUT /api/admin/guide/:id/ekyc
 * Toggles the eKYC verification status for a specific guide.
 * (Requires Admin role)
 */
app.put('/api/admin/guide/:id/ekyc', authenticateToken,  async (req, res) => {
    try {
        const guideId = req.params.id;
        // The body should contain { isEkycVerified: true/false }
        const { isEkycVerified } = req.body; 

        if (!ObjectId.isValid(guideId)) {
            return res.status(400).json({ message: 'Invalid Guide ID format.' });
        }

        if (typeof isEkycVerified !== 'boolean') {
            return res.status(400).json({ message: 'eKYC status must be a boolean (true/false).' });
        }

        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(guideId), role: 'guide' },
            { $set: { isEkycVerified: isEkycVerified, ekycUpdatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Guide not found.' });
        }

        res.json({ 
            message: `Guide eKYC status updated to ${isEkycVerified ? 'Verified' : 'Pending'}.`,
            isEkycVerified: isEkycVerified 
        });

    } catch (error) {
        console.error("Error updating guide eKYC status:", error);
        res.status(500).json({ message: 'Server error while updating eKYC status.' });
    }
});
// -----------------------------------------------------------------
// --- OTP Verification Routes (NEW) ---
// -----------------------------------------------------------------

/**
 * @route POST /api/auth/send-otp
 * Generates an OTP and sends it to the specified customer email.
 * This is triggered by the vendor to authorize a status change.
 * (Requires Vendor role authentication)
 */
app.post('/api/auth/send-otp', authenticateToken, async (req, res) => {
    const { email } = req.body;
    const vendorId = req.user.id; 

    // Optional: Basic security check to ensure it's a vendor (if you want to restrict this API)
    if (req.user.role !== 'vendor') {
        return res.status(403).json({ message: "Access denied. Only vendors can initiate OTP for orders." });
    }

    if (!email) {
        return res.status(400).json({ message: "Customer email is required." });
    }

    try {
        // 1. Generate a 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // 2. Store OTP in the database (using 'otps' collection). 
        // Upsert: If an OTP already exists for this vendor/customer pair, update it.
        await db.collection('otps').updateOne(
            { vendorId: new ObjectId(vendorId), customerEmail: email },
            { $set: { otp, expiresAt, createdAt: new Date() } },
            { upsert: true }
        );
        
        // 3. Send email to the customer
        const mailOptions = {
            from: NODEMAILER_USER,
            to: email,
            subject: 'Jharkhand Tourism Order Status Verification Code',
            html: `
                <p>Hello,</p>
                <p>A vendor associated with your recent order is attempting to update its status. To confirm this action, please provide the following 6-digit verification code to the vendor:</p>
                <h2 style="color: #10b981; font-size: 24px; font-weight: bold; background-color: #e0f2f1; padding: 10px; border-radius: 5px; text-align: center;">${otp}</h2>
                <p>This code is valid for ${OTP_EXPIRY_MINUTES} minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
                <p>Thank you,<br>Jharkhand Tourism Team</p>
            `,
        };

        await transporter.sendMail(mailOptions);

        res.json({ message: "OTP sent to customer's email successfully." });

    } catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ 
            message: "Failed to send OTP. Check server logs and Nodemailer configuration.", 
            error: error.message 
        });
    }
});


/**
 * @route POST /api/auth/verify-otp
 * Verifies the OTP provided by the vendor (after receiving it from the customer).
 */
app.post('/api/auth/verify-otp', authenticateToken, async (req, res) => {
    const { email, otp } = req.body;
    const vendorId = req.user.id;

    if (req.user.role !== 'vendor') {
        return res.status(403).json({ message: "Access denied. Only vendors can verify OTP for orders." });
    }

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required for verification." });
    }

    try {
        const otpRecord = await db.collection('otps').findOne({
            vendorId: new ObjectId(vendorId),
            customerEmail: email,
            otp: otp
        });

        if (!otpRecord) {
            return res.status(400).json({ message: "Invalid OTP. Please check the code." });
        }

        // Check for expiration
        if (otpRecord.expiresAt < new Date()) {
            // Cleanup expired OTP
            await db.collection('otps').deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ message: "OTP expired. Please request a new one." });
        }
        
        // OTP is valid! Delete it immediately to prevent reuse.
        await db.collection('otps').deleteOne({ _id: otpRecord._id });

        res.json({ message: "OTP verified successfully. Proceed with order status update." });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).json({ message: "Server error during OTP verification." });
    }
});

const authMiddleware = (req, res, next) => {
    // The client sends the token in the 'Authorization' header as 'Bearer <token>'
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No authentication token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach decoded user ID to the request
        next();
    } catch (ex) {
        // This handles cases where the token is expired or invalid
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
};
// -----------------------------------------------------------------
// --- END NEW OTP ROUTES ---
// -----------------------------------------------------------------


/**
 * @route GET /api/destinations
 * Return a mock list of featured destinations
 */
//const { ObjectId } = require('mongodb'); // 1. REQUIRE ObjectId for fetching by ID

// ----------------------------------------------------------------------
// 1. MODIFIED ENDPOINT: GET /api/destinations (For Carousel View)
// ----------------------------------------------------------------------
// MODIFICATION: Removed secondaryImageBase64 from the projection here.
// The main list doesn't need the large array, reducing data transfer size.
// ----------------------------------------------------------------------
// 1. MODIFIED ENDPOINT: GET /api/destinations (For Carousel/List View)
// ----------------------------------------------------------------------
app.get('/api/destinations', async (req, res) => {
    if (!db) {
        console.error("Database connection not ready when /api/destinations was called.");
        return res.status(503).json({ message: "Service temporarily unavailable. Database connection pending." });
    }
    
    try {
        // Fetch destinations, only including the primary image, title, and description
        const destinations = await db.collection('destinations')
            .find({})
            // Only fetch small fields for the main page
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
// 2. NEW ENDPOINT: GET /api/destinations/:id (For Modal Details View)
// ----------------------------------------------------------------------
app.get('/api/destinations/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ message: "Service temporarily unavailable. Database connection pending." });
    }

    const destinationId = req.params.id;

    // Validate if the ID is a valid MongoDB ObjectId format
    if (!ObjectId.isValid(destinationId)) {
        return res.status(400).json({ message: "Invalid destination ID format." });
    }

    try {
        // Fetch a single document by its _id, returning ALL fields including secondary images
        const destination = await db.collection('destinations').findOne({
            _id: new ObjectId(destinationId)
        });

        if (!destination) {
            return res.status(404).json({ message: "Destination not found." });
        }

        // Return ALL fields, including the full secondaryImageBase64 array
        res.json(destination);

    } catch (error) {
        console.error(`Error fetching destination ${destinationId}:`, error);
        res.status(500).json({ message: "Server error while fetching destination details." });
    }
});

// -----------------------------------------------------------------
// --- USER PROFILE ROUTES (MODIFIED) ---
// -----------------------------------------------------------------

/**
 * @route GET /api/users/profile/:id
 * Fetch a specific user's profile details.
 * (Requires Authentication and checks if the user is fetching their own ID)
 */
app.get('/api/users/profile/:id', authenticateToken, async (req, res) => {
    try {
        const requestedId = req.params.id;
        const currentUserId = req.user.id;
        
        // Security check: Ensure the user is only viewing their own profile
        if (requestedId !== currentUserId) {
             return res.status(403).json({ message: "Access denied. Cannot view other users' profiles." });
        }
        
        if (!ObjectId.isValid(requestedId)) {
            return res.status(400).json({ message: 'Invalid User ID format.' });
        }

        // Fetch the user's profile, including 'upi_id' and 'phone'
        const userProfile = await db.collection('users').findOne(
            { _id: new ObjectId(requestedId) },
            // Project only necessary fields (excluding password and original createdAt)
            { projection: { password: 0, createdAt: 0 } } 
        );

        if (!userProfile) {
            return res.status(404).json({ message: 'User profile not found.' });
        }

        res.json(userProfile);

    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: 'Server error fetching profile data.' });
    }
});

app.put('/api/users/profile/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, upi_id } = req.body;
        
        // Basic validation and security check (ensure only their own profile is updated)
        if (req.user.id !== id) {
             return res.status(403).json({ message: 'Forbidden: You can only update your own profile.' });
        }

        if (!name) {
            return res.status(400).json({ message: 'Name is required.' });
        }
        
        // Update the user's document in MongoDB
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(id) },
            { $set: { 
                name: name,
                upi_id: upi_id.trim() // Store trimmed UPI ID
            }}
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User profile not found for update.' });
        }
        
        // Respond with the updated data
        res.json({ 
            message: 'Profile updated successfully.', 
            id: id,
            name: name, 
            upi_id: upi_id
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        // Respond with a 404 if the ID format is invalid, as seen in your screenshot
        if (error.name === 'BSONTypeError') {
            return res.status(404).json({ message: 'Resource not found (Invalid ID format).' });
        }
        res.status(500).json({ message: 'Server error while updating profile.' });
    }
});

app.post('/api/itineraries', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id;
        // Destructure all expected fields from the frontend payload
        const { 
            name, 
            description, 
            locations, 
            totalCost, 
            days, 
            generated,
            touristName // Data sent from the frontend mock logic 
        } = req.body;
        
        // Security Check: Ensure the user is a tourist 
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Only tourists can save itineraries." });
        }

        // Basic validation for core fields
        if (!name || !description || !totalCost || !days) {
            return res.status(400).json({ message: "Missing required itinerary fields: name, description, totalCost, or days." });
        }
        
        const newItinerary = {
            touristId: new ObjectId(touristId), // Link to the user who created it
            touristName: touristName || req.user.name, // Use name from request body or JWT payload
            name,
            description,
            locations: Array.isArray(locations) ? locations : [], // Array of strings (stops)
            totalCost: parseFloat(totalCost),
            days: parseInt(days),
            generated: !!generated, // Convert to boolean
            filters: req.body.filters || {}, // Store any additional filters used
            createdAt: new Date()
        };

        // Insert the new itinerary document into the 'itenaries' collection
        const result = await db.collection('itenaries').insertOne(newItinerary);

        res.status(201).json({ 
            message: "Itinerary plan saved successfully!", 
            itineraryId: result.insertedId 
        });

    } catch (error) {
        console.error("Error saving itinerary plan:", error);
        res.status(500).json({ message: "Server error while saving itinerary." });
    }
});

/**
 * @route POST /api/admin/culture/invoice
 * Creates a new Culture Invoice post (text and one image).
 * (Requires Admin role)
 */
app.post('/api/admin/culture/invoice', authenticateToken, async (req, res) => {
    // 1. Admin Authorization Check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Must be Admin.' });
    }

    const { text, image } = req.body;

    // 2. Input Validation
    if (!text || !image) {
        return res.status(400).json({ message: 'Text and image (Base64) are required for a Culture Invoice.' });
    }

    const newInvoice = {
        text: text,
        imageBase64: image, // The Base64 string from the frontend
        postedBy: req.user.userId,
        postedAt: new Date()
    };

    try {
        // 3. Database Insertion (using a new collection: cultureInvoices)
        const result = await db.collection('cultureInvoices').insertOne(newInvoice);

        if (result.acknowledged) {
            return res.status(201).json({ 
                message: 'Culture Invoice successfully published.',
                invoiceId: result.insertedId.toString()
            });
        }
        throw new Error('Database insertion failed.');

    } catch (error) {
        console.error("Error publishing Culture Invoice:", error);
        res.status(500).json({ message: 'Server error during Culture Invoice publication.' });
    }
});

// ----------------------------------------------------------------------

/**
 * @route POST /api/admin/destination
 * Creates a new Famous Destination listing (text, one primary image, and multiple secondary images).
 * (Requires Admin role)
 */
app.post('/api/admin/destination', authenticateToken, async (req, res) => {
    // 1. Admin Authorization Check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Must be Admin.' });
    }

    // Expected fields from the frontend form
    // 🌟 MODIFIED: Extract 'title' from the request body
    const { title, text, primaryImage, secondaryImages } = req.body; 

    // 2. Input Validation
    // 🌟 MODIFIED: Check if 'title' is present
    if (!title || !text || !primaryImage) {
        return res.status(400).json({ 
            message: 'Title, Text/Description, and a Primary Image (Base64) are required for a Destination.' 
        });
    }

    // Ensure secondaryImages is an array (can be empty)
    const secondaryList = Array.isArray(secondaryImages) ? secondaryImages : [];

    const newDestination = {
        // 🌟 MODIFIED: Include 'title' in the document
        title: title, 
        description: text,
        primaryImageBase64: primaryImage, // Single Base64 string
        secondaryImagesBase64: secondaryList, // Array of Base64 strings
        postedBy: req.user.userId,
        postedAt: new Date()
    };

    try {
        // 3. Database Insertion (using a new collection: destinations)
        const result = await db.collection('destinations').insertOne(newDestination);

        if (result.acknowledged) {
            return res.status(201).json({ 
                message: 'Famous Destination successfully uploaded.',
                destinationId: result.insertedId.toString()
            });
        }
        throw new Error('Database insertion failed.');

    } catch (error) {
        console.error("Error uploading Famous Destination:", error);
        res.status(500).json({ message: 'Server error during Destination upload.' });
    }
});

// -----------------------------------------------------------------
// 🌟 --- TOURIST-SPECIFIC ROUTES (CULTURAL INVOICES) --- 🌟
// -----------------------------------------------------------------

/**
 * @route GET /api/tourist/culture/invoices
 * Fetches all published Cultural Invoices.
 * (Requires Tourist Authentication)
 */
// 🌟 --- TOURIST-SPECIFIC ROUTES (CULTURAL INVOICES) --- 🌟

/**
 * @route GET /api/tourist/culture/invoices
 * Fetches all published Cultural Invoices.
 * (Requires Tourist Authentication)
 */
app.get('/api/tourist/culture/invoices', authenticateToken, async (req, res) => {
    // Optional: Basic role check (always good practice)
    if (req.user.role !== 'tourist') {
        return res.status(403).json({ message: "Access denied. Only tourists can view cultural invoices." });
    }

    try {
        // Fetch all documents from the 'cultureInvoices' collection
        // 🚨 FIX: Must call .find() first to get a cursor, which supports .project() and .sort()
        const invoices = await db.collection('cultureInvoices')
            .find({}) // <--- ADDED .find({}) to return a cursor
            .project({ postedBy: 0 }) // Exclude the poster's ID from the response
            .sort({ postedAt: -1 }) // Sort by newest first
            .toArray();

        // The imageBase64 field contains the Base64 image data needed for the frontend
        res.json(invoices);

    } catch (error) {
        console.error("Error fetching cultural invoices:", error);
        res.status(500).json({ message: 'Server error while fetching cultural invoices.' });
    }
});

// -----------------------------------------------------------------

// -----------------------------------------------------------------
// --- END TOURIST CULTURAL INVOICES ROUTES ---
// -----------------------------------------------------------------
/**
 * @route PATCH /api/users/profile
 * NEW ROUTE: Update the logged-in user's profile details (Name, Phone, UPI ID, Languages).
 * This route is now the unified update endpoint, using the ID from the token.
 * (Requires Authentication)
 */
// --- DEPENDENCIES (Ensure you have these or equivalents) ---
// const { ObjectId } = require('mongodb'); 
// const db = require('./dbConnection'); 
// const authenticateToken = require('./authMiddleware'); // Your auth middleware

// --- MODIFIED ENDPOINT ---
app.patch('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; 
        
        // Destructure all possible update fields
        const { 
            name, 
            phone, 
            upi_id, 
            languages, 
            aadharNo, 
            licenseNo, 
            panNo,
            about,         // Text description
            profilePhoto   // Base64 string from client (data:image/png;base64,...)
        } = req.body; 
        
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID format from token.' });
        }

        const updateFields = {};
        
        // 1. Basic Profile Fields
        if (name !== undefined) updateFields.name = name;
        if (phone !== undefined) updateFields.phone = phone; 
        if (upi_id !== undefined) updateFields.upi_id = upi_id; 
        
        // 2. Verification Documents
        if (aadharNo !== undefined) updateFields.aadharNo = aadharNo; 
        if (licenseNo !== undefined) updateFields.licenseNo = licenseNo;
        if (panNo !== undefined) updateFields.panNo = panNo;
        
        // 3. About Me Text
        if (about !== undefined) {
            updateFields.about = about.trim();
        }

        // 4. <<< MODIFICATION: Directly store Base64 string in DB >>>
        if (profilePhoto && typeof profilePhoto === 'string') {
            // Note: This stores the full Base64 string, which can be large.
            // If the user wants to remove the photo, they must send a request 
            // with `profilePhoto: ''` or `profilePhoto: null`.
            updateFields.profilePhoto = profilePhoto;
        } 
        // <<< END MODIFICATION >>>
        
        // 5. Languages Array
        if (languages !== undefined) {
             if (!Array.isArray(languages)) {
                 return res.status(400).json({ message: 'Languages must be an array.' });
             }
             const validLanguages = languages.filter(lang => typeof lang === 'string' && lang.trim().length > 0)
                                            .map(lang => lang.trim());
             updateFields.languages = validLanguages;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'No valid fields provided for update.' });
        }
        
        updateFields.updatedAt = new Date();

        // Perform the database update
        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Fetch the updated user document to send back to the client
        // This will include the full Base64 string in `profilePhoto` field.
        const updatedUser = await db.collection('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0 } }
        );
        
        // Prepare a clean user object for the client
        const userForClient = {
            id: updatedUser._id.toString(),
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            phone: updatedUser.phone || '', 
            upi_id: updatedUser.upi_id || '',
            aadharNo: updatedUser.aadharNo || '', 
            licenseNo: updatedUser.licenseNo || '', 
            panNo: updatedUser.panNo || '', 
            languages: updatedUser.languages || [],
            createdAt: updatedUser.createdAt,
            
            // This is now the full Base64 string
            about: updatedUser.about || '',
            profilePhoto: updatedUser.profilePhoto || '', 
        };

        res.json(userForClient); 

    } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).json({ message: 'Server error while updating profile.' });
    }
});
// =======================================================
// ⭐ NEW ENDPOINT: CANCEL TRIP BOOKING (TOURIST)
// PATCH /api/bookings/:id/cancel
// =======================================================
// ========================
/**
 * @route PUT /api/guide/bookings/:id/status
 * Update the status of a booking request (Accept/Reject/Finish).
 * (Requires Guide role)
 */
app.put('/api/guide/bookings/:id/status', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const guideId = req.user.id;
        const { status } = req.body;

        // MODIFIED: Expected status now includes "Finished"
        const validStatuses = ['Accepted', 'Rejected', 'Finished']; 

        if (!ObjectId.isValid(bookingId)) {
            return res.status(400).json({ message: 'Invalid Booking ID format.' });
        }
        
        // MODIFIED VALIDATION: Check if status is one of the valid options
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status provided. Must be one of: ${validStatuses.join(', ')}` });
        }

        // 1. Ensure the booking exists and belongs to this guide
        const result = await db.collection('bookings').updateOne(
            { 
                _id: new ObjectId(bookingId), 
                guideId: new ObjectId(guideId) // Security check: Only the owner guide can modify 
            },
            { 
                $set: { 
                    status: status, // Set the new status dynamically
                    updatedAt: new Date()
                } 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Booking not found or does not belong to this guide.' });
        }
        
        if (result.modifiedCount === 0) {
            return res.status(200).json({ message: `Booking status was already set to ${status}.` });
        }

        res.json({ 
            message: `Booking request successfully ${status.toLowerCase()}.`, 
            newStatus: status 
        });

    } catch (error) {
        console.error("Error updating booking status:", error);
        res.status(500).json({ message: 'Server error while updating booking status.' });
    }
});
// ===============================
// ⭐ NEW ENDPOINT: CANCEL TRIP BOOKING (TOURIST)
// PATCH /api/bookings/:id/cancel
// Updates the booking status to 'Cancelled'.
// =======================================================
app.patch('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
    // NOTE: This function uses the global 'db' variable, which is set 
    // when connectToDb() successfully runs.

    try {
        const bookingId = req.params.id;
        // The ID of the currently logged-in tourist, set by protectTourist middleware
        const touristId = req.user.id; 
        
        // 1. Validate the Booking ID format
        if (!ObjectId.isValid(bookingId)) {
            return res.status(400).json({ message: "Invalid booking ID format." });
        }

        // 2. Find the booking and perform checks
        // Using the global 'db' variable here
        const booking = await db.collection('bookings').findOne({
            _id: new ObjectId(bookingId)
        });

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        // Security Check: Ensure the booking belongs to the logged-in tourist
        if (booking.touristId.toString() !== touristId.toString()) {
            return res.status(403).json({ message: "You are not authorized to cancel this booking." });
        }

        // Status Check: Only allow cancellation if the current status is 'Pending' or 'Accepted'
        const allowedToCancel = ['Pending', 'Accepted'];
        if (!allowedToCancel.includes(booking.status)) {
            return res.status(400).json({ 
                message: `Cannot cancel a trip that is already ${booking.status}.` 
            });
        }
        
        // Optional Date Check: Prevent cancellation if the trip date is in the past
        const bookingDate = new Date(booking.bookingDate);
        if (bookingDate < new Date()) {
             return res.status(400).json({ message: "Cannot cancel a trip on or after the start date." });
        }


        // 3. Update the status to 'Cancelled'
        // Using the global 'db' variable here
        const result = await db.collection('bookings').updateOne(
            { _id: new ObjectId(bookingId) },
            { 
                $set: { 
                    status: 'Cancelled',
                    cancellationTimestamp: new Date()
                } 
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(500).json({ message: "Failed to update booking status." });
        }
        
        // 4. Success Response
        res.status(200).json({
            status: 'Cancelled', // Return the new status
            message: 'Trip successfully cancelled.',
            bookingId: bookingId
        });

    } catch (error) {
        console.error("Error cancelling trip booking:", error);
        res.status(500).json({ message: 'Server error while processing cancellation.' });
    }
});
// REMOVED: The old `app.put('/api/users/profile/:id', ...)` route is removed, 
// replaced by the more flexible and secure `PATCH /api/users/profile` above.


// -----------------------------------------------------------------
// --- GUIDE-SPECIFIC ROUTES ---
// -----------------------------------------------------------------

/**
 * @route POST /api/guide/trips
 * Create a new trip package listing (requires Guide role)
 */
app.post('/api/guide/trips', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        // ADDED 'price' and 'locations'
        const { from, to, requirement, package: packageName, price, images, locations } = req.body;
        
        // Validation for required fields, including the new 'price'
        if (!from || !to || !requirement || !packageName || !price) {
            return res.status(400).json({ message: 'Missing required trip fields: From, To, Description, Package Name, or Price.' });
        }
        
        // Basic check for price format
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
             return res.status(400).json({ message: 'Invalid price format.' });
        }

        // Construct the new trip document
        const newTrip = {
            guideId: req.user.id, // Guide's ID from JWT payload
            from,
            to,
            requirement,
            package: packageName,
            price: parsedPrice, // Storing as a float
            // Validate and structure locations
            locations: Array.isArray(locations) ? locations : [], // Array of { name, lat, lng }
            // Validate and structure images
            images: Array.isArray(images) ? images.map(img => ({
                base64: img.base64,
                comment: img.comment || ''
            })) : [],
            createdAt: new Date(),
            status: 'active' 
        };

        const result = await db.collection('trips').insertOne(newTrip);
        
        res.status(201).json({ 
            _id: result.insertedId, 
            message: 'Trip package created successfully and is now live.', 
            trip: newTrip 
        });

    } catch (error) {
        console.error("Error creating guide trip package:", error);
        if (error.name === 'PayloadTooLargeError') {
             return res.status(413).json({ message: 'Request entity too large. Too many/large images.' });
        }
        res.status(500).json({ message: 'Server error while creating trip package.' });
    }
});


app.get('/api/guide/trips', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const guideId = req.user.id; // Guide's ID from JWT payload
        
        // Find all trips where the guideId matches the logged-in user's ID
        const trips = await db.collection('trips')
            .find({ guideId: guideId }) 
            .sort({ createdAt: -1 })
            .toArray();

        res.json(trips);

    } catch (error) {
        console.error("Error fetching guide's trip packages:", error);
        res.status(500).json({ message: 'Server error while fetching trip packages.' });
    }
});

app.delete('/api/guide/trips/:id', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const tripId = req.params.id;
        const guideId = req.user.id;

        // Ensure the ID is valid
        if (!ObjectId.isValid(tripId)) {
            return res.status(400).json({ message: 'Invalid Trip ID format.' });
        }

        // Delete the trip, but only if it belongs to the logged-in guide
        const result = await db.collection('trips').deleteOne({
            _id: new ObjectId(tripId),
            guideId: guideId // Crucial security check!
        });

        if (result.deletedCount === 0) {
            // Check if the trip existed but didn't belong to the guide, or if ID was just wrong.
            const tripExists = await db.collection('trips').findOne({ _id: new ObjectId(tripId) });
            if (tripExists) {
                return res.status(403).json({ message: 'Forbidden: You do not have permission to delete this trip.' });
            }
            return res.status(404).json({ message: 'Trip package not found.' });
        }

        res.json({ message: 'Trip package deleted successfully.' });

    } catch (error) {
        console.error("Error deleting trip package:", error);
        res.status(500).json({ message: 'Server error while deleting trip package.' });
    }
});


app.put('/api/guide/trips/:id', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const tripId = req.params.id;
        const guideId = req.user.id;
        const updateData = req.body;

        // Ensure the ID is valid
        if (!ObjectId.isValid(tripId)) {
            return res.status(400).json({ message: 'Invalid Trip ID format.' });
        }

        // Remove properties that should not be updated directly by the user (like guideId)
        delete updateData._id;
        delete updateData.guideId;
        delete updateData.createdAt;

        const result = await db.collection('trips').updateOne(
            { 
                _id: new ObjectId(tripId), 
                guideId: guideId // Crucial security check!
            },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Trip package not found or does not belong to you.' });
        }

        res.json({ message: 'Trip package updated successfully.' });

    } catch (error) {
        console.error("Error updating trip package:", error);
        res.status(500).json({ message: 'Server error while updating trip package.' });
    }
});


/**
 * @route GET /api/guide/bookings
 * Fetch all booking requests pending or approved for the logged-in guide.
 * (Requires Guide role)
 */
app.get('/api/guide/bookings', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const guideId = req.user.id; // Guide's ID from JWT payload

        // Find bookings where the guideId matches the logged-in guide,
        // ordered by creation date (newest first).
        const bookings = await db.collection('bookings')
            .find({ guideId: new ObjectId(guideId) })
            .sort({ createdAt: -1 })
            .toArray();
            
        // For each booking, we need to fetch the tourist's name/details
        const touristIds = [...new Set(bookings.map(b => b.touristId.toString()))];
        const tourists = await db.collection('users')
            .find({ _id: { $in: touristIds.map(id => new ObjectId(id)) } })
            .project({ name: 1, email: 1 })
            .toArray();

        // Create a map for quick lookup
        const touristMap = tourists.reduce((acc, tourist) => {
            acc[tourist._id.toString()] = tourist;
            return acc;
        }, {});

        // Combine booking data with tourist name
        const bookingsWithNames = bookings.map(booking => ({
            ...booking,
            touristName: touristMap[booking.touristId.toString()]?.name || 'Unknown Tourist',
            touristEmail: touristMap[booking.touristId.toString()]?.email || 'N/A'
        }));


        res.json(bookingsWithNames);

    } catch (error) {
        console.error("Error fetching guide bookings:", error);
        res.status(500).json({ message: 'Server error while fetching guide bookings.' });
    }
});


/**
 * @route PUT /api/guide/bookings/:id/status
 * Update the status of a booking request (Accept/Reject).
 * (Requires Guide role)
 */
app.put('/api/guide/bookings/:id/status', authenticateToken, requireGuideRole, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const guideId = req.user.id;
        const { status } = req.body; // Expected status: "Accepted" or "Rejected"

        if (!ObjectId.isValid(bookingId)) {
            return res.status(400).json({ message: 'Invalid Booking ID format.' });
        }

        if (!status || (status !== 'Accepted' && status !== 'Rejected')) {
            return res.status(400).json({ message: 'Invalid or missing status provided.' });
        }

        // 1. Find the booking to ensure it exists and belongs to the guide
        const booking = await db.collection('bookings').findOne({
            _id: new ObjectId(bookingId)
        });

        if (!booking) {
            return res.status(404).json({ message: 'Booking request not found.' });
        }
        
        // Security Check: Ensure the logged-in guide owns this booking
        if (booking.guideId.toString() !== guideId) {
            return res.status(403).json({ message: 'Access denied. You do not manage this booking.' });
        }
        
        // Prevent re-updating an already final status
        if (booking.status === 'Accepted' || booking.status === 'Rejected') {
            return res.status(400).json({ message: `Booking is already finalized as ${booking.status}. Cannot change.` });
        }


        // 2. Update the status
        const updateResult = await db.collection('bookings').updateOne(
            { _id: new ObjectId(bookingId) },
            { 
                $set: { 
                    status: status,
                    updatedAt: new Date()
                } 
            }
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(500).json({ message: 'Booking status update failed (no change made).' });
        }
        
        // Optional: Implement a notification or email to the tourist here.

        res.json({ 
            message: `Booking request successfully ${status.toLowerCase()}.`, 
            newStatus: status
        });

    } catch (error) {
        console.error("Error updating booking status:", error);
        res.status(500).json({ message: 'Server error while updating booking status.' });
    }
});


// -----------------------------------------------------------------
// --- TOURIST BOOKING & ORDER ROUTES (For Tourist Dashboard) ---
// -----------------------------------------------------------------

/**
 * @route GET /api/tourist/bookings
 * Fetch all trip booking requests made by the logged-in tourist.
 * (Requires Tourist role)
 */
app.get('/api/tourist/bookings', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id; 

        // Ensure the user is a tourist (optional but good security practice)
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Tourist role required." });
        }

        // Find bookings where the touristId matches the logged-in user's ID
        const bookings = await db.collection('bookings')
            .find({ touristId: new ObjectId(touristId) }) // Find by ObjectId
            .sort({ createdAt: -1 })
            .toArray();
            
        // To display full information, we also need the Guide's name and email
        const guideIds = [...new Set(bookings.map(b => b.guideId.toString()))];
        const guides = await db.collection('users')
            .find({ _id: { $in: guideIds.map(id => new ObjectId(id)) } })
            .project({ name: 1, email: 1 })
            .toArray();

        // Create a map for quick lookup
        const guideMap = guides.reduce((acc, guide) => {
            acc[guide._id.toString()] = guide;
            return acc;
        }, {});

        // Combine booking data with guide name
        const bookingsWithNames = bookings.map(booking => ({
            ...booking,
            guideName: guideMap[booking.guideId.toString()]?.name || 'Unknown Guide',
            guideEmail: guideMap[booking.guideId.toString()]?.email || 'N/A'
        }));


        res.json(bookingsWithNames);

    } catch (error) {
        console.error("Error fetching tourist bookings:", error);
        res.status(500).json({ message: 'Server error while fetching tourist bookings.' });
    }
});


/**
 * @route GET /api/tourist/orders
 * NEW ROUTE: Fetch all marketplace item orders made by the logged-in tourist.
 * (Requires Tourist role)
 */
app.get('/api/tourist/orders', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id; 

        // Ensure the user is a tourist
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Tourist role required." });
        }

        // Aggregate to find orders by touristId and join with listing details
        const orders = await db.collection('orders').aggregate([
            {
                // 1. Filter orders by the logged-in tourist's ID
                $match: { touristId: new ObjectId(touristId) }
            },
            {
                // 2. Perform a left outer join to the 'listings' collection for product details
                $lookup: {
                    from: "listings",
                    localField: "listingId",
                    foreignField: "_id",
                    as: "listingDetails"
                }
            },
            {
                // 3. Deconstruct the listingDetails array
                $unwind: {
                    path: "$listingDetails",
                    preserveNullAndEmptyArrays: true 
                }
            },
            {
                // 4. Reshape the output document (Projection)
                $project: {
                    _id: 1,
                    listingId: 1,
                    quantity: 1,
                    totalAmount: 1,
                    paymentMethod: 1, 
                    status: 1,
                    orderDate: 1, 
                    createdAt: 1,
                    // Pull the product name from the joined collection
                    listingName: "$listingDetails.name",
                    listingPrice: "$listingDetails.price",
                    listingImageUrl: "$listingDetails.imageUrl",
                }
            },
            {
                // 5. Sort by newest order first
                $sort: { orderDate: -1 }
            }
        ]).toArray();
        
        res.json(orders);

    } catch (error) {
        console.error("Error fetching tourist item orders:", error);
        res.status(500).json({ message: 'Server error while fetching item orders.' });
    }
});


// -----------------------------------------------------------------
// --- GUIDE PROFILE & BOOKING ROUTES (For Tourist Dashboard) ---
// -----------------------------------------------------------------

/**
 * @route GET /api/guide/profile/:id
 * Fetch a specific guide's profile and their published trips.
 * (Accessible by anyone, no authentication required to view a public profile)
 */
app.get('/api/guide/profile/:id', async (req, res) => {
    try {
        const guideId = req.params.id;

        if (!ObjectId.isValid(guideId)) {
            return res.status(400).json({ message: 'Invalid Guide ID format.' });
        }

        // 1. Fetch the guide's public profile (excluding sensitive fields)
        const guideProfile = await db.collection('users').findOne(
            { _id: new ObjectId(guideId), role: 'guide' },
            { projection: { password: 0, role: 0, email: 0 } } // Exclude sensitive/unnecessary fields
        );

        if (!guideProfile) {
            return res.status(404).json({ message: 'Guide profile not found.' });
        }

        // 2. Fetch all trips created by this guide
        const guideTrips = await db.collection('trips').find({ 
            guideId: guideProfile._id.toString() // guideId in trips is stored as a string
        }).toArray();

        res.json({
            guide: {
                _id: guideProfile._id,
                name: guideProfile.name,
                // Add any other profile fields you might have (e.g., specialties)
            },
            trips: guideTrips
        });

    } catch (error) {
        console.error("Error fetching guide profile and trips:", error);
        res.status(500).json({ message: 'Server error fetching guide data.' });
    }
});

/**
 * @route POST /api/bookings/trip
 * Create a new trip booking request (requires Tourist role)
 */
app.post('/api/bookings/trip', authenticateToken, async (req, res) => {
    try {
        const { guideId, tripId, bookingDate, touristCount } = req.body;
        const touristId = req.user.id; // Tourist ID from JWT payload

        if (!guideId || !tripId || !bookingDate || !touristCount) {
            return res.status(400).json({ message: "Missing required booking fields." });
        }
        
        // Ensure the tourist is logged in and not trying to book as a guide/vendor
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Only tourists can initiate a trip booking." });
        }

        // 1. Validate IDs
        if (!ObjectId.isValid(tripId) || !ObjectId.isValid(touristId) || !ObjectId.isValid(guideId)) {
             return res.status(400).json({ message: "Invalid ID format in request." });
        }

        // 2. Look up the specific trip to get details like price and package name
        // tripId is an ObjectId, but guideId in the trips collection is a string.
        const trip = await db.collection('trips').findOne({ _id: new ObjectId(tripId) });
        if (!trip) {
            return res.status(404).json({ message: "Selected trip not found." });
        }
        
        // 3. Create the new booking document
        const newBooking = {
            // Store IDs as ObjectIds for easy database lookups
            touristId: new ObjectId(touristId), 
            guideId: new ObjectId(guideId),
            tripId: new ObjectId(tripId),
            tripPackage: trip.package, // Save package name for easy reference
            bookingDate: new Date(bookingDate), 
            touristCount: parseInt(touristCount),
            status: 'Pending Guide Approval', // Initial status
            totalEstimatedPrice: trip.price * parseInt(touristCount),
            createdAt: new Date()
        };

        const result = await db.collection('bookings').insertOne(newBooking);

        res.status(201).json({ 
            message: "Trip booking request sent successfully to the guide!", 
            bookingId: result.insertedId 
        });

    } catch (error) {
        console.error("Error creating trip booking:", error);
        res.status(500).json({ message: "Failed to create trip booking request." });
    }
});

// -----------------------------------------------------------------
// --- VENDOR ORDER ROUTES (Modified) ---
// -----------------------------------------------------------------

/**
 * @route GET /api/orders/my-vendor-orders
 * Fetch all orders associated with the logged-in vendor's ID, 
 * including tourist name and email via aggregation.
 * (Requires Authentication)
 */
app.get('/api/orders/my-vendor-orders', authenticateToken, async (req, res) => {
    try {
        const vendorId = req.user.id; 
        // ... (authentication/role check remains the same) ...

        const orders = await db.collection('orders').aggregate([
            {
                // 1. Filter orders by the logged-in vendor's ID (converted to ObjectId)
                $match: { vendorId: new ObjectId(vendorId) }
            },
            {
                // 2. Perform a left outer join to the 'users' collection for tourist details
                $lookup: {
                    from: "users",
                    localField: "touristId",
                    foreignField: "_id",
                    as: "touristDetails"
                }
            },
            {
                // 3. Deconstruct the touristDetails array
                $unwind: {
                    path: "$touristDetails",
                    preserveNullAndEmptyArrays: true 
                }
            },
            {
                // 4. Reshape the output document (Projection)
                $project: {
                    _id: 1,
                    listingId: 1,
                    touristId: 1,
                    vendorId: 1,
                    quantity: 1,
                    totalAmount: 1,
                    status: 1,
                    createdAt: 1, // Used for date logic
                    orderDate: 1, // Simple formatted date
                    
                    // Fields needed for client-side rendering
                    paymentMethod: "$paymentMethod", // This field is at the top level
                    fullAddress: "$deliveryAddress.fullAddress",
                    city: "$deliveryAddress.city",
                    pincode: "$deliveryAddress.pincode",
                    
                    // Tourist fields
                    touristName: "$touristDetails.name",
                    touristEmail: "$touristDetails.email",
                }
            },
            {
                // 5. Sort by newest order first
                $sort: { createdAt: -1 }
            }
        ]).toArray();

        res.json(orders);

    } catch (error) {
        console.error("Error fetching vendor orders:", error);
        res.status(500).json({ message: 'Server error while fetching vendor orders.' });
    }
});



// -----------------------------------------------------------------
// --- EXISTING VENDOR/OTHER ROUTES ---
// -----------------------------------------------------------------

/**
 * @route POST /api/listings
 * Create a new product listing (requires Vendor role)
 */
app.post('/api/listings', authenticateToken, async (req, res) => {
    try {
        const { name, description, price, imageUrl } = req.body;
        
        if (!name || !description || !price || !imageUrl) {
            return res.status(400).json({ message: 'Missing required fields: name, description, price, or image.' });
        }

        // 🌟 CRITICAL MODIFICATION: Convert the string ID from the JWT to a MongoDB ObjectId
        // We also use 'vendorId' instead of 'userId' for clarity since the user is a vendor.
        const vendorObjectId = new ObjectId(req.user.id);
        
        const newListing = {
            vendorId: vendorObjectId, // ⬅️ Stores the ID as ObjectId
            name,
            description,
            price: parseFloat(price),
            imageUrl, 
            createdAt: new Date()
        };

        const result = await db.collection('listings').insertOne(newListing);
        
        res.status(201).json({ 
            _id: result.insertedId, 
            message: 'Listing created successfully.', 
            listing: {
                ...newListing,
                _id: result.insertedId,
                // When returning, the vendorId will be a string representation of the ObjectId
                vendorId: req.user.id 
            }
        });

    } catch (error) {
        console.error("Error creating listing:", error);
        // Handle potential errors like an invalid ID format failing the new ObjectId() conversion
        res.status(500).json({ message: 'Server error while creating listing.' });
    }
});
app.get('/api/listings/my-listings', authenticateToken, async (req, res) => {
    try {
        // 🌟 CRITICAL MODIFICATION: Convert the string ID to a MongoDB ObjectId
        const vendorObjectId = new ObjectId(req.user.id);

        const listings = await db.collection('listings')
            // ⬅️ Query using the new field 'vendorId' and the ObjectId
            .find({ vendorId: vendorObjectId }) 
            .sort({ createdAt: -1 })
            .toArray();

        res.json(listings);

    } catch (error) {
        console.error("Error fetching vendor listings:", error);
        // Added a check for potential invalid ID format errors
        if (error.name === 'BSONTypeError' || error.message.includes('Argument passed in must be a string of 12 bytes or a string of 24 hex characters')) {
             return res.status(400).json({ message: 'Invalid vendor ID format provided.' });
        }
        res.status(500).json({ message: 'Server error while fetching listings.' });
    }
});

app.get('/api/listings/all', async (req, res) => {
    try {
        // Find all listings, no vendorId filter needed
        const listings = await db.collection('listings')
            .find({}) 
            .sort({ createdAt: -1 })
            .toArray();

        res.json(listings);
    } catch (error) {
        console.error("Error fetching all listings:", error);
        res.status(500).json({ message: 'Server error while fetching all listings.' });
    }
});
app.get('/api/users/guides', async (req, res) => {
    // db variable must be defined and connected to your MongoDB instance
    try {
        // Find all documents in the 'users' collection where the role is 'guide'
        // This fetches the full documents, including 'languages'.
        const guides = await db.collection('users').find({ role: 'guide' }).toArray();
        
        // Filter sensitive information and explicitly include the 'languages' field
        const safeGuides = guides.map(guide => ({
            _id: guide._id,
            name: guide.name,
            email: guide.email,
            profile: guide.profile || { specialties: [] }, // Include profile info if available
            
            // 🌟 MODIFICATION: Include the languages array
            languages: guide.languages || [] ,
            isEkycVerified:guide.isEkycVerified
        }));
        
        res.json(safeGuides);
    } catch (error) {
        console.error("Error fetching guides:", error);
        res.status(500).json({ message: "Failed to retrieve guides." });
    }
});

/**
 * @route POST /api/orders
 * Place a new order, handling both COD and UPI payments.
 */
app.post('/api/orders', authenticateToken, async (req, res) => {
    const { 
        listingId, 
        quantity, 
        totalAmount, 
        deliveryAddress, 
        paymentMethod,
        transactionDetails // <-- New field to store UPI data
    } = req.body;
    
    // Basic validation
    if (!listingId || !quantity || !totalAmount || !deliveryAddress || !paymentMethod) {
        return res.status(400).json({ message: "Missing required order fields." });
    }

    // 1. Fetch the listing to confirm price and get vendorId
    let listing;
    try {
        listing = await db.collection('listings').findOne({ _id: new ObjectId(listingId) });
    } catch (e) {
        return res.status(400).json({ message: "Invalid Listing ID." });
    }

    if (!listing) {
        return res.status(404).json({ message: "Product not found." });
    }

    // Determine initial status based on payment method
    const initialStatus = paymentMethod === 'COD' ? 'PENDING' : 'PAID'; 

    const newOrder = {
        touristId: new ObjectId(req.user.id), // Assumes req.user.id is set by authenticateToken
        vendorId: listing.vendorId, // Assuming 'listings' stores the vendorId as an ObjectId
        listingId: new ObjectId(listingId),
        quantity: parseInt(quantity),
        totalAmount: parseFloat(totalAmount),
        deliveryAddress,
        paymentMethod,
        transactionDetails: transactionDetails || {}, // Store UPI details (empty object if COD)
        status: initialStatus, // Initial status: PAID (for successful UPI) or PENDING (for COD)
        orderDate: new Date(),
    };

    try {
        const result = await db.collection('orders').insertOne(newOrder);
        res.status(201).json({ message: "Order placed successfully.", orderId: result.insertedId });
    } catch (error) {
        console.error("Order placement error:", error);
        res.status(500).json({ message: "Server error during order placement." });
    }
});

// -----------------------------------------------------------------
// 🌟 --- PAYMENT GATEWAY ROUTES (NEW) --- 🌟
// -----------------------------------------------------------------

/**
 * @route POST /api/create-payment-session
 * Creates a secure order/session ID on the payment gateway backend.
 * This route uses the SECRET key and must be called from the server.
 * (Requires Authentication)
 */
app.post('/api/create-payment-session', authenticateToken, async (req, res) => {
    try {
        // 1. Validate input and authenticate user
        const touristId = req.user.id;
        // Fields received from the delivery.html frontend:
        const { totalAmount, customerEmail, customerName, orderMetadata } = req.body; 
        
        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({ message: "Invalid payment amount." });
        }

        // IMPORTANT: Always re-verify the price server-side in a production environment
        // to prevent client-side price manipulation.
        const amountInPaise = Math.round(parseFloat(totalAmount) * 100); // Amount converted to the smallest unit (e.g., paise)
        
        // 2. CONCEPTUAL CALL TO PAYMENT GATEWAY SDK (using the SECRET KEY)
        // NOTE: You must replace this conceptual logic with your actual Payment Gateway SDK calls.
        // E.g., If using Razorpay, you would use 'const Razorpay = require('razorpay');' and call 'instance.orders.create(options)'.
        
        // --- START Conceptual Gateway Logic ---
        // For demonstration, we are mocking a successful order creation response:
        console.log(`[MOCK GATEWAY] Creating order for Tourist ${touristId} with amount ${amountInPaise} ${PAYMENT_CURRENCY}`);
        const gatewayOrderId = `order_JT_${Date.now()}`;
        // --- END Conceptual Gateway Logic ---


        // 3. Respond with PUBLIC details needed by the frontend widget (delivery.html)
        res.status(200).json({
            publishableKey: PAYMENT_GATEWAY_PUBLISHABLE, // Public key is safe to expose
            orderId: gatewayOrderId, // Secure ID created on the gateway's server
            amount: amountInPaise,
            currency: PAYMENT_CURRENCY,
            customerName: customerName,
            customerEmail: customerEmail
        });

    } catch (error) {
        console.error("Error creating payment session:", error);
        res.status(500).json({ message: 'Failed to initialize online payment session due to a server error.' });
    }
});

// -----------------------------------------------------------------
// --- END PAYMENT GATEWAY ROUTES ---
// -----------------------------------------------------------------
app.put('/api/listings/:id', authenticateToken, async (req, res) => {
// ... (rest of the route remains the same) ...
    try {
        const listingId = req.params.id;
        const { name, description, price } = req.body;
        
        const updateDoc = {
            $set: {
                name,
                description,
                price: parseFloat(price),
                updatedAt: new Date()
            }
        };

        const result = await db.collection('listings').updateOne(
            // FIX: Changed 'userId' to 'vendorId' and ensured req.user.id is converted to ObjectId
            { _id: new ObjectId(listingId), vendorId: new ObjectId(req.user.id) },
            updateDoc
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Listing not found or not owned by vendor.' });
        }

        res.json({ message: 'Listing updated successfully.' });
    } catch (error) {
        console.error("Error updating listing:", error);
        res.status(500).json({ message: 'Server error while updating listing.' });
    }
});

app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
// ... (rest of the route remains the same) ...
    try {
        const listingId = req.params.id;
        
        const result = await db.collection('listings').deleteOne(
            // FIX: Changed 'userId' to 'vendorId' and ensured req.user.id is converted to ObjectId
            { _id: new ObjectId(listingId), vendorId: new ObjectId(req.user.id) }
        );

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Listing not found or not owned by vendor.' });
        }

        res.json({ message: 'Listing deleted successfully.' });
    } catch (error) {
        console.error("Error deleting listing:", error);
        res.status(500).json({ message: 'Server error while deleting listing.' });
    }
});

// --- CHATBOT ROUTE ---
app.post('/api/chatbot', async (req, res) => {
    const { message } = req.body;
    const API_KEY = "AIzaSyDBq2ixDqJ5pEC7URMf6Rjuh1FB7uUBwuI"; 
    
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(API_KEY);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        const prompt = `Please act as a helpful travel guide for Jharkhand. Respond to the following user query using markdown formatting (headings, lists, bold text, etc.) to make it clear and easy to read.\r\n        \r\n        User quer
y: ${message}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        res.json({ botResponse: response.text() });
    } catch (error) {
        console.error("Error generating AI response:", error);
        res.status(500).json({ error: "I'm sorry, I'm having trouble connecting right now. Please try again later." });
    }
});

/**
 * @route POST /api/emergency/sos
 * Tourist SOS request: Logs the emergency and retrieves the booked guide's contact.
 * Requires authentication.
 * NOTE: This assumes 'bookings' and 'emergencies' collections exist, and 'users' has a 'phone' field.
 */
app.post('/api/emergency/sos', authenticateToken, async (req, res) => {
    // Expected body: { location: { latitude: 23.456, longitude: 85.123 }, timestamp: "..." }
    const { location } = req.body;
    const touristId = req.user.id; // User ID from the authenticated token

    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        return res.status(400).json({ message: "Missing or invalid location data (latitude, longitude) in the request body." });
    }

    let guideContact = null;
    let guideId = null;

    try {
        // 1. Find the tourist's most recent *active* booking to get the guide's ID
        // The booking status should be 'Accepted' or 'Confirmed' to consider it active.
        const booking = await db.collection('bookings').findOne(
            { 
                touristId: new ObjectId(touristId), 
                status: { $in: ['Accepted', 'Confirmed'] } // Search for an active/confirmed booking
            }, 
            { sort: { createdAt: -1 }, projection: { guideId: 1 } } // Get the latest one, only need guideId
        );

        if (booking && booking.guideId) {
            guideId = booking.guideId;
            // 2. Retrieve the guide's contact information
            const guide = await db.collection('users').findOne(
                { _id: new ObjectId(guideId), role: 'guide' },
                // Retrieve name, email, and phone for emergency contact
                { projection: { name: 1, email: 1, phone: 1 } } 
            );

            if (guide) {
                guideContact = {
                    name: guide.name,
                    email: guide.email,
                    phone: guide.phone || "Not available" // Fallback if phone is not set
                };
            }
        }
        
        // 3. Log the emergency event, including location and guide info
        const emergencyLog = {
            touristId: new ObjectId(touristId),
            guideId: guideId ? new ObjectId(guideId) : null,
            location: { latitude: location.latitude, longitude: location.longitude },
            status: 'Sent',
            timestamp: new Date()
            // In a production app, you'd integrate a service here to send an SMS/Email to local police/authorities.
        };
        await db.collection('emergencies').insertOne(emergencyLog);


        // 4. Send the response back to the client
        if (guideContact) {
            res.json({
                message: "SOS logged. Contact information for your booked guide is provided.",
                guideContact: guideContact,
                emergencyLogged: true
            });
        } else {
            // Use 202 Accepted status if the logging succeeded but no guide was found
            res.status(202).json({
                message: "SOS logged. No active booked guide found. Local authorities have been alerted.",
                guideContact: null,
                emergencyLogged: true
            });
        }

    } catch (error) {
        console.error("SOS Emergency processing error:", error);
        res.status(500).json({ message: "Server error during emergency processing. Please contact local emergency services immediately." });
    }
});

app.get('/api/guide/emergencies', authenticateToken, requireGuideRole, async (req, res) => {
    // req.user is set by authenticateToken and contains { id: guideId, role: 'guide' }
    const guideId = req.user.id; 

    try {
        // Aggregation pipeline to find emergencies associated with the guide and enrich with tourist data
        const alerts = await db.collection('emergencies').aggregate([
            {
                // 1. Filter: Find only emergencies where the guideId matches the logged-in guide
                $match: {
                    guideId: new ObjectId(guideId)
                }
            },
            {
                // 2. Join: Look up the tourist's details from the 'users' collection using touristId
                $lookup: {
                    from: 'users',
                    localField: 'touristId',
                    foreignField: '_id',
                    as: 'touristDetails'
                }
            },
            {
                // 3. Flatten: Ensure the touristDetails array is treated as a single object
                $unwind: '$touristDetails'
            },
            {
                // 4. Project: Select and rename fields to match the guide-dashboard.html frontend expectation
                $project: {
                    _id: 1,
                    timestamp: 1,
                    location: 1,
                    touristName: '$touristDetails.name',
                    touristEmail: '$touristDetails.email',
                    // Assuming 'phone' is a field in the user document
                    touristPhone: '$touristDetails.phone' 
                }
            },
            {
                // 5. Sort: Display the newest alert first
                $sort: { timestamp: -1 }
            }
        ]).toArray();

        res.json(alerts);

    } catch (error) {
        console.error("Error fetching guide emergencies:", error);
        res.status(500).json({ message: "Server error while fetching emergency alerts." });
    }
});

/**
 * @route GET /api/vendor-upi/:vendorId
 * Fetches the UPI ID and name of a vendor based on their ID (MongoDB ObjectId).
 */
/**
 * @route GET /api/vendor-upi/:vendorId
 * Fetches the UPI ID and name of a vendor based on their ID (MongoDB ObjectId).
 */
app.get('/api/vendor-upi/:vendorId', async (req, res) => {
    const { vendorId } = req.params;

    if (!ObjectId.isValid(vendorId)) {
        return res.status(400).json({ 
            message: "Vendor UPI is unavailable. Invalid Vendor ID format provided." 
        });
    }

    try {
        const vendor = await db.collection('users').findOne(
            { 
                _id: new ObjectId(vendorId), 
                role: 'vendor'
            },
            { 
                // Projection: Now requesting the field as 'upi_id'
                projection: { 
                    name: 1, 
                    upi_id: 1 // <--- MODIFIED TO upi_id
                } 
            }
        );

        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found." });
        }

        if (!vendor.upi_id) { // <--- MODIFIED TO upi_id for the check
            return res.status(404).json({ 
                message: "Vendor UPI ID is not configured for this account. Please use COD." 
            });
        }

        // Success: Sending the field as 'upiId' to the client for consistency, 
        // even though it's stored as 'upi_id' in the database.
        res.json({
            vendorName: vendor.name,
            upiId: vendor.upi_id // <--- MAPPED from upi_id (DB) to upiId (Response)
        });

    } catch (error) {
        console.error("Error fetching vendor UPI details:", error);
        res.status(500).json({ message: "Server error while fetching vendor details." });
    }
});

app.put('/api/orders/:id/status', authenticateToken,  async (req, res) => {
    const orderId = req.params.id;
    const { status: newStatus } = req.body;
    const vendorId = req.user.id;

    if (!ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: "Invalid order ID format." });
    }

    if (!newStatus || typeof newStatus !== 'string' || newStatus.trim() === '') {
        return res.status(400).json({ message: "New status is required and must be a non-empty string." });
    }
    
    // Sanitize and normalize the status string (optional but good practice)
    const normalizedStatus = newStatus.trim().charAt(0).toUpperCase() + newStatus.trim().slice(1).toLowerCase();

    // Optionally validate status against a list of acceptable statuses (e.g., Pending, Shipped, Delivered, Cancelled)
    const validStatuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled', 'Processing', 'Paid'];
    if (!validStatuses.includes(normalizedStatus)) {
        // return res.status(400).json({ message: `Invalid status provided. Must be one of: ${validStatuses.join(', ')}` });
        // Allowing custom status for now to avoid breaking existing logic, but logging a warning is better.
        console.warn(`Vendor ${vendorId} set order ${orderId} to non-standard status: ${normalizedStatus}`);
    }


    try {
        const result = await db.collection('orders').updateOne(
            { 
                _id: new ObjectId(orderId), 
                vendorId: new ObjectId(vendorId) // Ensure vendorId is an ObjectId for comparison
            },
            { 
                $set: { 
                    status: normalizedStatus,
                    updatedAt: new Date() // Record the update time
                } 
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Order not found or you are not the vendor for this order." });
        }
        
        if (result.modifiedCount === 0) {
            // Check if status was already set to the new value
            return res.status(200).json({ message: `Order status already set to ${normalizedStatus}.` });
        }

        res.json({ message: "Order status updated successfully.", newStatus: normalizedStatus });

    } catch (error) {
        console.error("Order status update error:", error);
        res.status(500).json({ message: "Server error during order status update." });
    }
});

/**
 * @route POST /api/ratings
 * Allows a logged-in tourist to submit a rating and feedback for a guide, listing, or trip.
 * (Requires Authentication, specifically Tourist role)
 */
app.post('/api/ratings', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id;
        const { rating, feedback, entityType, entityId } = req.body;

        if (req.user.role !== 'tourist') {
            return res.status(403).json({ message: "Access denied. Only tourists can submit ratings." });
        }

        if (!rating || !entityType || !entityId) {
            return res.status(400).json({ message: "Missing required fields: rating, entityType, or entityId." });
        }
        
        const parsedRating = parseInt(rating);
        if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ message: "Rating must be a number between 1 and 5." });
        }
        
        // Ensure entityId is a valid ObjectId, regardless of type
        if (!ObjectId.isValid(entityId)) {
            return res.status(400).json({ message: "Invalid entity ID format." });
        }

        const newRating = {
            touristId: new ObjectId(touristId),
            entityId: new ObjectId(entityId), // The ID of the item, guide, or trip
            entityType: entityType.toLowerCase(), // 'guide', 'listing' (item), or 'trip'
            rating: parsedRating,
            feedback: feedback || '',
            createdAt: new Date()
        };

        // Check if the tourist has already rated this entity
        const existingRating = await db.collection('ratings').findOne({
            touristId: new ObjectId(touristId),
            entityId: new ObjectId(entityId),
            entityType: entityType.toLowerCase()
        });
        
        if (existingRating) {
             return res.status(409).json({ message: `You have already rated this ${entityType}.` });
        }


        const result = await db.collection('ratings').insertOne(newRating);

        res.status(201).json({ 
            message: `Rating and feedback submitted successfully for ${entityType}!`, 
            ratingId: result.insertedId 
        });

    } catch (error) {
        console.error("Error submitting rating:", error);
        res.status(500).json({ message: "Server error while submitting rating." });
    }
});

// *****************************************************************
// --- NEW API ROUTE FOR RATING CHECK ---
// *****************************************************************

/**
 * @route GET /api/ratings/check/:entityType/:entityId
 * Checks if the logged-in tourist has already submitted a rating for a specific entity (guide, listing, or trip).
 */
app.get('/api/ratings/check/:entityType/:entityId', authenticateToken, async (req, res) => {
    try {
        const touristId = req.user.id;
        const { entityType, entityId } = req.params;

        if (req.user.role !== 'tourist') {
            // Even if not a tourist, we can return false, but 403 is more secure.
            return res.status(403).json({ isRated: false, message: "Access denied. Only tourists can check their ratings." });
        }

        if (!ObjectId.isValid(entityId)) {
            return res.status(400).json({ isRated: false, message: "Invalid entity ID format." });
        }

        const validTypes = ['guide', 'listing', 'trip'];
        const normalizedType = entityType.toLowerCase();

        if (!validTypes.includes(normalizedType)) {
            return res.status(400).json({ isRated: false, message: "Invalid entityType. Must be 'guide', 'listing', or 'trip'." });
        }

        // Check the ratings collection for an existing rating by this tourist for this entity
        const existingRating = await db.collection('ratings').findOne({
            touristId: new ObjectId(touristId),
            entityId: new ObjectId(entityId),
            entityType: normalizedType
        });

        res.json({
            isRated: !!existingRating, // Convert existence to boolean (true if found, false if not)
            ratingId: existingRating ? existingRating._id : null
        });

    } catch (error) {
        console.error("Error checking rating status:", error);
        res.status(500).json({ isRated: false, message: "Server error while checking rating status." });
    }
});

// *****************************************************************
// --- END OF NEW API ROUTE ---
// *****************************************************************


/**
 * @route GET /api/ratings/average/:entityType/:entityId
 * Fetches the average rating and count for a specific entity.
 */
app.get('/api/ratings/average/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;

        if (!ObjectId.isValid(entityId)) {
            return res.status(400).json({ averageRating: 0, count: 0, message: "Invalid entity ID format." });
        }

        const validTypes = ['guide', 'listing', 'trip'];
        const normalizedType = entityType.toLowerCase();

        if (!validTypes.includes(normalizedType)) {
            return res.status(400).json({ averageRating: 0, count: 0, message: "Invalid entityType. Must be 'guide', 'listing', or 'trip'." });
        }

        const aggregationResult = await db.collection('ratings').aggregate([
            {
                $match: {
                    entityId: new ObjectId(entityId),
                    entityType: normalizedType
                }
            },
            {
                $group: {
                    _id: '$entityId', // Group by entityId
                    averageRating: { $avg: '$rating' },
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        if (aggregationResult.length === 0) {
            return res.json({ averageRating: 0, count: 0, message: "No ratings found for this entity." });
        }

        const { averageRating, count } = aggregationResult[0];

        // Format the average rating to one decimal place
        const formattedRating = parseFloat(averageRating.toFixed(1));

        res.json({
            averageRating: formattedRating,
            count: count,
            entityId: entityId
        });

    } catch (error) {
        console.error("Error fetching average rating:", error);
        res.status(500).json({ averageRating: 0, count: 0, message: "Server error while fetching average rating." });
    }
});

// --- NEW SOS ROUTES FOR TOURISTS (Insert into server.js) --- 🌟
/**
 * @route POST /api/sos/send
 * Logs a new SOS emergency request for the logged-in tourist.
 * (Requires authenticateToken)
 */
app.post('/api/sos/send', authenticateToken, async (req, res) => {
    // 1. Role Check
    if (req.user.role !== 'tourist') {
        return res.status(403).json({ message: "Access denied. Only tourists can send SOS alerts." });
    }

    const touristId = req.user.id;
    // Client-side sends these as separate numbers
    const { latitude, longitude } = req.body; 
    
    // 2. Location Validation (Crucial for an emergency service)
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ message: "Missing or invalid location data (latitude, longitude) in the request body." });
    }

    try {
        // 3. Prevent Multiple Active SOS Requests
        const activeEmergency = await db.collection('emergencies').findOne({ 
            touristId: new ObjectId(touristId),
            // Check for 'Pending' (waiting for guide/admin response) or 'Active' (response underway)
            status: { $in: ['Pending', 'Active'] } 
        });

        if (activeEmergency) {
            return res.status(200).json({ 
                message: "An active SOS request is already registered. Only one pending/active request is allowed.", 
                status: activeEmergency.status,
                emergencyId: activeEmergency._id
            });
        }
        
        // --- Guide Linking Logic (Re-introduced from old code) ---
        let guideId = null;
        
        // Find the tourist's most recent *active* booking
        const booking = await db.collection('bookings').findOne(
            { 
                touristId: new ObjectId(touristId), 
                status: { $in: ['Accepted', 'Confirmed'] } // Search for an active/confirmed booking
            }, 
            { sort: { createdAt: -1 }, projection: { guideId: 1 } } // Get the latest one
        );

        if (booking && booking.guideId) {
            guideId = booking.guideId;
        }
        // -----------------------------------------------------------

        // 4. Prepare Emergency Document
        const newEmergency = {
            touristId: new ObjectId(touristId),
            guideId: guideId ? new ObjectId(guideId) : null, // Include guideId if found
            timestamp: new Date(),
            status: 'Pending', // Initial status
            // Use GeoJSON format for optimal location indexing and querying
            location:  {longitude:parseFloat(longitude),latitude: parseFloat(latitude)} ,
            // Basic requester info for quick lookup
            requesterName: req.user.name || 'Unknown Tourist', 
            requesterEmail: req.user.email, // Assume email is present in token payload
            requesterPhone: req.user.phone || null // Assuming phone might also be in the token
        };

        // 5. Insert into 'emergencies' collection
        const result = await db.collection('emergencies').insertOne(newEmergency);

        // 6. Response
        const responseMessage = guideId
            ? "SOS request successfully logged and linked to your active guide."
            : "SOS request successfully logged. No active guide was found; alerting local services.";
            
        res.status(201).json({ 
            message: responseMessage, 
            emergencyId: result.insertedId,
            guideAlerted: !!guideId // Boolean flag indicating if a guide was linked
        });

    } catch (error) {
        console.error("Error sending SOS request:", error);
        res.status(500).json({ 
            message: 'Server error while processing SOS request. Please contact local emergency services immediately.' 
        });
    }
});

/**
 * @route POST /api/sos/cancel
 * Updates the status of the latest 'Pending' SOS request to 'Cancelled'.
 * (Requires authenticateToken)
 */
app.post('/api/sos/cancel', authenticateToken, async (req, res) => {
    if (req.user.role !== 'tourist') {
        return res.status(403).json({ message: "Access denied. Only tourists can cancel their own SOS alerts." });
    }

    try {
        const touristId = req.user.id;
        
        // 1. Find the latest 'Pending' or 'Active' SOS request by this tourist
        const latestPendingSOS = await db.collection('emergencies').findOne(
            { touristId: new ObjectId(touristId), status: { $in: ['Pending', 'Active'] } },
            { sort: { timestamp: -1 } } // Get the most recent one
        );

        if (!latestPendingSOS) {
            return res.status(404).json({ message: "No active SOS request found to cancel." });
        }

        // 2. Update the status to 'Cancelled'
        const result = await db.collection('emergencies').updateOne(
            { _id: latestPendingSOS._id },
            { $set: { status: 'Cancelled', cancellationTimestamp: new Date() } }
        );

        if (result.modifiedCount === 0) {
            return res.status(500).json({ message: "Failed to update SOS status to Cancelled." });
        }

        res.status(200).json({ 
            message: "SOS request successfully cancelled.",
            emergencyId: latestPendingSOS._id
        });

    } catch (error) {
        console.error("Error cancelling SOS request:", error);
        res.status(500).json({ message: 'Server error while processing SOS cancellation.' });
    }
});
// --- END SOS ROUTES ---

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});