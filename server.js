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

// API endpoint to login with Email and Password (Supabase Auth)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({ success: false, message: error.message });
        }

        // Return the session token to the client
        res.json({ 
            success: true, 
            token: data.session.access_token,
            user: data.user.email
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// API endpoint to update passcode (Now an administrative setting in DB)
app.post('/update-setting', async (req, res) => {
    const { token, key, value } = req.body;

    try {
        // Authenticate with the provided token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ success: false, message: 'Unauthorized session' });
        }

        const { error: updateError } = await supabase
            .from('app_settings')
            .upsert({ key, value });

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Setting updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
});

// API endpoint to search data - PROTECTED (Token Required)
app.get('/search', async (req, res) => {
    if (!cachedData) {
        return res.status(500).json({ error: 'Excel data not loaded' });
    }

    // Security Check: Token must be valid in Supabase
    const authToken = req.headers['x-auth-token'];
    
    if (!authToken) {
        return res.status(401).json({ error: 'Missing auth token' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(authToken);

    if (error || !user) {
        return res.status(403).json({ error: 'Invalid or expired session' });
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
