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

        const staffCollection = db.collection("staff");

        // Users to create
        const users = [
            {
                name: "Admin User",
                phone: "0593125184",
                email: "admin@company.com",
                staffId: "ADM001",
                permissions: ["ADMIN", "STAFF"],
                gender: "male",
            },
            {
                name: "Team Lead",
                phone: "0501234567",
                email: "teamlead@company.com",
                staffId: "TL001",
                permissions: ["MANAGER", "STAFF"],
                gender: "male",
            },
            {
                name: "HR Manager",
                phone: "0502234567",
                email: "hr@company.com",
                staffId: "HR001",
                permissions: ["HR", "STAFF"],
                gender: "female",
            },
            {
                name: "John Staff",
                phone: "0503234567",
                email: "staff@company.com",
                staffId: "STF001",
                permissions: ["STAFF"],
                gender: "male",
            },
        ];

        for (const user of users) {
            // Check if user already exists
            const existingUser = await staffCollection.findOne({
                $or: [
                    { email: user.email },
                    { phone: user.phone },
                    { staffId: user.staffId }
                ]
            });

            if (existingUser) {
                console.log(`User ${user.name} already exists, skipping...`);
                continue;
            }

            // Create the user
            const result = await staffCollection.insertOne({
                name: user.name,
                phone: user.phone,
                email: user.email,
                staffId: user.staffId,
                department: department._id,
                permissions: user.permissions,
                gender: user.gender,
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

            console.log(`\nUser created: ${user.name}`);
            console.log(`  Staff ID: ${user.staffId}`);
            console.log(`  Email: ${user.email}`);
            console.log(`  Phone: ${user.phone}`);
            console.log(`  Permissions: ${user.permissions.join(", ")}`);
            console.log(`  Password: password`);
        }

        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

seedUser();
