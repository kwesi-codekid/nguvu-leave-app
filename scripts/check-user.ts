import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/leave";

async function checkUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error("Database connection not established");
        }

        const staffCollection = db.collection("staff");

        // Find users with phone containing 593
        const users = await staffCollection.find({
            $or: [
                { phone: "0593125184" },
                { phone: { $regex: "593125184" } },
                { email: "gyankwadwomends2001@gmail.com" }
            ]
        }).toArray();

        console.log("\n=== Found Users ===");
        users.forEach(user => {
            console.log("ID:", user._id);
            console.log("Name:", user.name);
            console.log("Phone:", user.phone);
            console.log("Email:", user.email);
            console.log("Status:", user.status);
            console.log("---");
        });

        if (users.length === 0) {
            console.log("No users found with that phone or email");

            // List all users
            console.log("\n=== All Users ===");
            const allUsers = await staffCollection.find({}).toArray();
            allUsers.forEach(user => {
                console.log(`- ${user.name} | Phone: ${user.phone} | Email: ${user.email} | Status: ${user.status}`);
            });
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkUser();
