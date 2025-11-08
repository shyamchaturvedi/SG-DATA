import express from 'express';
import XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const hostname = '0.0.0.0'; // Allow connections from all network interfaces

// Enable CORS and JSON middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const excelFilePath = path.join(__dirname, 'public', 'MAIN BUSINESS UPDATE SHEET.xlsx');

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

        // Filter rows matching customer name or customer ID
        const filtered = cachedData.filter(row => {
            const custName = String(row['CUSTOMER NAME'] || '').toLowerCase();
            const custID = String(row['CUSTOMER USER ID'] || '').toLowerCase();
            return custName.includes(searchValue) || custID.includes(searchValue);
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

// Route to serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, hostname, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to use the application`);
});
