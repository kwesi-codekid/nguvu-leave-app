import mongoose from "mongoose";
import XLSX from "xlsx";
import path from "path";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/corporate-leave";
const EXCEL_PATH = path.resolve("uploads/HEAD OFFICE LEAVE MASTER SHEET.xlsx");

// Position title normalization map (Excel title -> DB title)
const POSITION_TITLE_MAP: Record<string, string> = {
    "lead and compliance manager": "Lead and Compliance Manager",
    "senior accountant": "Senior Accountant",
    "driver": "Driver",
    "house keeper": "House Keeper",
    "housekeeper": "House Keeper",
    "security guard": "Security Guard",
    "administration officer": "Administrative Officer",
    "administrative officer": "Administrative Officer",
    "security supervisor": "Security Supervisor",
    "hr officer": "HR Officer",
    "executive secetary": "Executive Secretary",
    "executive secretary": "Executive Secretary",
    "group resource geology lead": "Group Resource Geology Lead",
    "group hr/admin manager": "Group HR/Admin Manager",
    "group shsesg manager": "Group SHSESG Manager",
    "group finance manager": "Group Finance Manager",
    "chief operations officer": "Chief Operations Officer",
    "group geology manager": "Group Geology Manager",
    "group met/processing manager": "Group Met/Processing Manager",
    "corporate legal relations mger": "Corporate Legal Relations Manager",
    "corporate legal relations manager": "Corporate Legal Relations Manager",
    "chief executive officer": "Chief Executive Officer",
    "security consultant": "Security Consultant",
    "manager - tyre management": "Manager - Tyre Management",
};

function parseExcelDate(value: any): Date | null {
    if (!value) return null;

    // If it's a number, it's an Excel serial date
    if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) {
            return new Date(date.y, date.m - 1, date.d);
        }
    }

    // If it's a string, try parsing common formats
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;

        // Try JS Date parse
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) return parsed;
    }

    return null;
}

interface ExcelRow {
    staffId: string;
    lastName: string;
    otherName: string;
    position: string;
    startDate: Date | null;
    endDate: Date | null;
}

function readExcel(): ExcelRow[] {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const rows: ExcelRow[] = [];

    // Skip header rows (first 6 rows are headers/blanks), data starts at row 7
    for (let i = 6; i < raw.length; i++) {
        const row = raw[i];
        if (!row || !row.length) continue;

        const no = row[0];
        const lastName = (row[1] || "").toString().trim();
        const otherName = (row[2] || "").toString().trim();
        const staffId = (row[6] || "").toString().trim();
        const position = (row[7] || "").toString().trim();
        const startDate = parseExcelDate(row[11]);
        const endDate = parseExcelDate(row[12]);

        // Skip empty rows or rows without a name
        if (!lastName && !otherName) continue;
        // Skip rows without a position
        if (!position) continue;

        rows.push({ staffId, lastName, otherName, position, startDate, endDate });
    }

    return rows;
}

async function seedContracts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        if (!db) throw new Error("Database connection not established");

        const staffCol = db.collection("staff");
        const positionsCol = db.collection("job_positions");
        const contractsCol = db.collection("staff_contracts");

        // Load all staff, positions, and existing contracts
        const allStaff = await staffCol.find({}).toArray();
        const allPositions = await positionsCol.find({}).toArray();
        const existingContracts = await contractsCol.find({}).toArray();

        const staffWithContracts = new Set(
            existingContracts.map((c) => c.staff.toString())
        );

        // Build position lookup by normalized title
        const positionByTitle = new Map<string, any>();
        for (const pos of allPositions) {
            positionByTitle.set(pos.title.toLowerCase().trim(), pos);
        }

        // Get admin user for createdBy
        const adminUser = allStaff.find((s) =>
            s.permissions?.includes("ADMIN")
        );
        if (!adminUser) throw new Error("No admin user found for createdBy");

        // Read Excel data
        const excelRows = readExcel();
        console.log(`\nParsed ${excelRows.length} rows from Excel\n`);

        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const row of excelRows) {
            // Find matching staff in DB by staffId or by name
            let staff = null;

            if (row.staffId) {
                staff = allStaff.find(
                    (s) =>
                        s.staffId?.trim().toLowerCase() ===
                        row.staffId.trim().toLowerCase()
                );
            }

            // Fallback: match by name
            if (!staff) {
                const fullName =
                    `${row.lastName} ${row.otherName}`.trim().toLowerCase();
                staff = allStaff.find(
                    (s) => s.name?.trim().toLowerCase() === fullName
                );
            }

            if (!staff) {
                console.log(
                    `  SKIP: Staff not found in DB -> ${row.lastName} ${row.otherName} (${row.staffId})`
                );
                skipped++;
                continue;
            }

            // Skip if staff already has a contract
            if (staffWithContracts.has(staff._id.toString())) {
                console.log(
                    `  SKIP: Already has contract -> ${staff.name} (${staff.staffId})`
                );
                skipped++;
                continue;
            }

            // Find matching position
            const normalizedTitle = row.position.toLowerCase().trim();
            const mappedTitle = POSITION_TITLE_MAP[normalizedTitle];
            let position = mappedTitle
                ? positionByTitle.get(mappedTitle.toLowerCase())
                : positionByTitle.get(normalizedTitle);

            if (!position) {
                console.log(
                    `  ERROR: Position not found -> "${row.position}" for ${staff.name}`
                );
                errors++;
                continue;
            }

            if (!row.startDate) {
                console.log(
                    `  ERROR: No start date -> ${staff.name}`
                );
                errors++;
                continue;
            }

            // Determine status based on dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startDate = new Date(row.startDate);
            startDate.setHours(0, 0, 0, 0);

            let status = "pending";
            if (startDate <= today) {
                if (row.endDate) {
                    const endDate = new Date(row.endDate);
                    endDate.setHours(23, 59, 59, 999);
                    status = endDate < today ? "expired" : "active";
                } else {
                    status = "active";
                }
            }

            const contract = {
                staff: staff._id,
                position: position._id,
                startDate: row.startDate,
                endDate: row.endDate || null,
                status,
                salary: null,
                currency: "GHS",
                previousContract: null,
                terminatedBy: null,
                terminationReason: null,
                terminationDate: null,
                createdBy: adminUser._id,
                createdAt: new Date(),
                updatedAt: new Date(),
                __v: 0,
            };

            await contractsCol.insertOne(contract);
            staffWithContracts.add(staff._id.toString());
            created++;
            console.log(
                `  CREATED: ${staff.name} -> ${position.title} (${status}) [${row.startDate.toISOString().slice(0, 10)} to ${row.endDate?.toISOString().slice(0, 10) || "indefinite"}]`
            );
        }

        console.log(`\n--- Summary ---`);
        console.log(`Created: ${created}`);
        console.log(`Skipped: ${skipped}`);
        console.log(`Errors:  ${errors}`);
        console.log(`Total contracts now: ${await contractsCol.countDocuments()}`);
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB");
    }
}

seedContracts();
