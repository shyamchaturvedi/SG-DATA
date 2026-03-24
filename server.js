import 'dotenv/config';
import express from 'express';
import XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const hostname = '0.0.0.0'; // Allow connections from all network interfaces

// Enable CORS and JSON middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'PUBLIC')));

const excelFilePath = path.join(__dirname, 'PUBLIC', 'MAIN BUSINESS UPDATE SHEET.xlsx');

let cachedData = null;

function loadData() {
    try {
        const workbook = XLSX.readFile(excelFilePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        cachedData = XLSX.utils.sheet_to_json(worksheet, {
            defval: "",
            raw: false,
            cellDates: true // Dates ko JavaScript Date objects ki tarah parse karega
        });
        console.log('Excel data loaded and cached.');
    } catch (error) {
        console.error('Error loading Excel file:', error);
        cachedData = null;
    }
}

// Initial data load
loadData();

// Helper function to get passcodes (cache locally is tough in serverless, so we fetch each time or use env)
async function getConfigs() {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('key, value');

        const configs = {
            PASSCODE: process.env.PASSCODE || 'SG@ALLDATA',
            ADMIN_PASSCODE: process.env.ADMIN_PASSCODE || 'ADMIN@SG'
        };

        if (data && !error) {
            data.forEach(item => {
                if (item.key === 'PASSCODE') configs.PASSCODE = item.value;
                if (item.key === 'ADMIN_PASSCODE') configs.ADMIN_PASSCODE = item.value;
            });
        }
        return configs;
    } catch (e) {
        return { PASSCODE: process.env.PASSCODE, ADMIN_PASSCODE: process.env.ADMIN_PASSCODE };
    }
}

// API endpoint to verify passcode
app.post('/verify-passcode', async (req, res) => {
    try {
        const { passcode } = req.body;
        const configs = await getConfigs();
        
        if (passcode.trim() === configs.PASSCODE.trim() || passcode.trim() === configs.ADMIN_PASSCODE.trim()) {
            // Return which role they have (though not used on frontend yet)
            res.json({ success: true, isAdmin: passcode.trim() === configs.ADMIN_PASSCODE.trim() });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Passcode' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// API endpoint to update passcode
app.post('/update-passcode', async (req, res) => {
    const { currentPasscode, newPasscode, type } = req.body; // type: 'USER' or 'ADMIN'

    try {
        const configs = await getConfigs();
        
        // Only ADMIN_PASSCODE can update any passcode
        if (currentPasscode.trim() !== configs.ADMIN_PASSCODE.trim()) {
            return res.status(401).json({ success: false, message: 'Access Denied: Admin authorization required' });
        }

        if (!newPasscode || newPasscode.length < 4) {
            return res.status(400).json({ success: false, message: 'New passcode must be at least 4 characters long' });
        }

        const targetKey = type === 'ADMIN' ? 'ADMIN_PASSCODE' : 'PASSCODE';

        // Update Supabase
        const { error: updateError } = await supabase
            .from('app_settings')
            .upsert({ key: targetKey, value: newPasscode });

        if (updateError) throw updateError;

        res.json({ success: true, message: `${type} passcode updated successfully` });

    } catch (error) {
        console.error('Error updating passcode:', error);
        res.status(500).json({ success: false, message: 'Failed to update passcode' });
    }
});

// API endpoint to search data - PROTECTED
app.get('/search', async (req, res) => {
    if (!cachedData) {
        return res.status(500).json({ error: 'Excel data not loaded' });
    }

    // Security Check: Token/Passcode must be provided in header
    const providedPasscode = req.headers['x-passcode'];
    const configs = await getConfigs();

    if (!providedPasscode || (providedPasscode.trim() !== configs.PASSCODE.trim() && providedPasscode.trim() !== configs.ADMIN_PASSCODE.trim())) {
        return res.status(403).json({ error: 'Unauthorized access: Valid passcode required' });
    }

    try {
        const searchValue = req.query.q ? req.query.q.toLowerCase() : '';
        if (!searchValue) {
            return res.json({ error: 'No search value provided' });
        }

        // Filter rows matching customer name, customer ID, associate name, or associate ID
        const filtered = cachedData.filter(row => {
            const custName = String(row['CUSTOMER NAME'] || '').toLowerCase();
            const custID = String(row['CUSTOMER USER ID'] || '').toLowerCase();
            const associateName = String(row['ASSOCIATE NAME'] || '').toLowerCase();
            const associateId = String(row['ASSOCIATE ID'] || '').toLowerCase();
            return custName.includes(searchValue) || custID.includes(searchValue) || associateName.includes(searchValue) || associateId.includes(searchValue);
        });

        // Normalize column names to ensure consistency
        const normalizedData = filtered.map(row => ({
            'SR NO': row['SR NO'] || '',
            'ASSOCIATE NAME': row['ASSOCIATE NAME'] || '',
            'CUSTOMER NAME': row['CUSTOMER NAME'] || '',
            'CUSTOMER USER ID': row['CUSTOMER USER ID'] || '',
            'TRANSACTION DATE': row['TRANSACTION DATE'] instanceof Date 
                ? row['TRANSACTION DATE'].toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) 
                : row['TRANSACTION DATE'] || '',
            'TRANSACTION AMOUNT': row['TRANSACTION AMOUNT'] || '',
            'TRANSACTION NUMBER': row['TRANSACTION NUMBER'] || '',
            'PAYMENT PLAN': row['PAYMENT PLAN'] || '',
            'RECEIVED AMT': row['RECEIVED AMT'] || '',
            'BALANCE AMOUNT': row['BALANCE AMOUNT'] || '',
            'ASSOCIATE COMMISSION': row['ASSOCIATE COMMISSION'] || ''
        }));

        res.json(normalizedData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route to handle /ID=... links
app.get('/ID=:id', (req, res) => {
    res.redirect(`/?ID=${req.params.id}`);
});

// Route to serve the main HTML file
app.get('/', (req, res) => {
    // Note: Frontend will handle the ID query parameter
    res.sendFile(path.join(__dirname, 'PUBLIC', 'index.html'));
});

app.listen(PORT, hostname, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to use the application`);
});
