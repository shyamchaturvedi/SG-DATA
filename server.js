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

// API endpoint to verify passcode
app.post('/verify-passcode', async (req, res) => {
    try {
        const { passcode } = req.body;
        
        // Try getting from Supabase first
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'PASSCODE')
            .single();

        let masterPasscode;
        if (data && !error) {
            masterPasscode = data.value;
        } else {
            // Fallback to .env if not found in Supabase
            masterPasscode = process.env.PASSCODE || '12345';
        }

        if (passcode.trim() === masterPasscode.trim()) {
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Passcode' });
        }
    } catch (err) {
        console.error('Verify error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// API endpoint to update passcode
app.post('/update-passcode', async (req, res) => {
    const { currentPasscode, newPasscode } = req.body;

    try {
        // Get current passcode from Supabase (fallback to .env)
        const { data: currentData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'PASSCODE')
            .single();

        const masterPasscode = (currentData ? currentData.value : (process.env.PASSCODE || '12345')).trim();

        if (currentPasscode.trim() !== masterPasscode) {
            return res.status(401).json({ success: false, message: 'Current passcode is incorrect' });
        }

        if (!newPasscode || newPasscode.length < 4) {
            return res.status(400).json({ success: false, message: 'New passcode must be at least 4 characters long' });
        }

        // Update Supabase
        const { error: updateError } = await supabase
            .from('app_settings')
            .upsert({ key: 'PASSCODE', value: newPasscode });

        if (updateError) throw updateError;

        // Also update local .env as backup (only works locally)
        try {
            const envPath = path.join(__dirname, '.env');
            if (fs.existsSync(envPath)) {
                let envContent = fs.readFileSync(envPath, 'utf8');
                const newPasscodeLine = `PASSCODE=${newPasscode}`;
                if (envContent.includes('PASSCODE=')) {
                    envContent = envContent.replace(/PASSCODE=.*/, newPasscodeLine);
                } else {
                    envContent += `\n${newPasscodeLine}`;
                }
                fs.writeFileSync(envPath, envContent);
            }
        } catch (e) {
            console.log('Local .env update failed (expected on Vercel)');
        }

        process.env.PASSCODE = newPasscode;
        res.json({ success: true, message: 'Passcode updated successfully' });

    } catch (error) {
        console.error('Error updating passcode:', error);
        res.status(500).json({ success: false, message: 'Failed to update passcode in database' });
    }
});

// API endpoint to search data
app.get('/search', (req, res) => {
    if (!cachedData) {
        return res.status(500).json({ error: 'Excel data not loaded. Please check the server logs.' });
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
