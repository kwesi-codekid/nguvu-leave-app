import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/corporate-leave";

async function seedUser() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error("Database connection not established");
        }

        // Check if department exists, create if not
        const departmentsCollection = db.collection("departments");
        let department = await departmentsCollection.findOne({ name: "Information Technology" });

        if (!department) {
            const deptResult = await departmentsCollection.insertOne({
                name: "Information Technology",
                description: "IT and System Administration Department",
                head: null,
                isActive: true,
                createdBy: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0
            });
            department = { _id: deptResult.insertedId };
            console.log("Department created:", deptResult.insertedId);
        } else {
            console.log("Department already exists:", department._id);
        }

        // Hash the password
        const passwordHash = await bcrypt.hash("password", 10);

        // Check if user already exists
        const staffCollection = db.collection("staff");
        const existingUser = await staffCollection.findOne({
            $or: [
                { email: "gyankwadwomends2001@gmail.com" },
                { phone: "0593125184" }
            ]
        });

        if (existingUser) {
            console.log("User already exists with this email or phone");
            await mongoose.disconnect();
            return;
        }

        // Create the user
        const result = await staffCollection.insertOne({
            name: "System Administrator",
            phone: "0593125184",
            email: "gyankwadwomends2001@gmail.com",
            staffId: "ADM002",
            department: department._id,
            permissions: ["ADMIN", "HR", "MANAGER", "STAFF"],
            gender: "male",
            profileImage: null,
            address: {
                city: "Accra",
                country: "Ghana"
            },
            emergencyContact: {
                name: "Emergency Contact",
                phone: "+233201234567"
            },
            status: "active",
            isOnLeave: false,
            currentContract: null,
            createdBy: null,
            passwordHash: passwordHash,
            passwordLastChangedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            __v: 0
        });

        console.log("User created successfully!");
        console.log("User ID:", result.insertedId);
        console.log("Email: gyankwadwomends2001@gmail.com");
        console.log("Phone: 0593125184");
        console.log("Password: password");

        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

seedUser();
