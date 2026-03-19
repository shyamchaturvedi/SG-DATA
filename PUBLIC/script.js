document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const passcodeOverlay = document.getElementById('passcodeOverlay');
    const passcodeInput = document.getElementById('passcodeInput');
    const unlockButton = document.getElementById('unlockButton');
    const loginFeedback = document.getElementById('loginFeedback');
    const mainApp = document.getElementById('mainApp');
    const logoutButton = document.getElementById('logoutButton');

    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const printButton = document.getElementById('printButton');
    const resultTable = document.getElementById('resultTable');
    const tableHead = document.getElementById('tableHead');
    const tableBody = resultTable.querySelector('tbody');
    const noResults = document.getElementById('noResults');

    // Config - REMOVED hardcoded passcode for security
    // The passcode is now stored securely on the server in a .env file.

    // Initialize Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // --- Authentication ---

    function checkAuth() {
        if (sessionStorage.getItem('isUnlocked') === 'true') {
            showApp();
        } else {
            showLock();
        }
    }

    async function handleLogin() {
        const code = passcodeInput.value.trim();
        if (!code) return;

        // Visual feedback
        unlockButton.disabled = true;
        unlockButton.querySelector('span').textContent = 'Verifying...';

        try {
            const response = await fetch('/verify-passcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: code })
            });
            const result = await response.json();

            if (result.success) {
                loginFeedback.textContent = 'Access Granted!';
                loginFeedback.className = 'feedback success';
                sessionStorage.setItem('isUnlocked', 'true');
                
                // Success animation
                passcodeOverlay.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                passcodeOverlay.style.opacity = '0';
                passcodeOverlay.style.transform = 'scale(1.1)';
                
                setTimeout(() => {
                    showApp();
                    passcodeOverlay.classList.add('hidden');
                    // Reset styling for next time
                    passcodeOverlay.style.opacity = '';
                    passcodeOverlay.style.transform = '';
                }, 600);
            } else {
                throw new Error(result.message || 'Invalid passcode');
            }
        } catch (error) {
            loginFeedback.textContent = 'Invalid access code. Please try again.';
            loginFeedback.className = 'feedback error';
            passcodeInput.value = '';
            passcodeInput.focus();
            
            // Shake effect
            const card = document.querySelector('.login-card');
            card.style.animation = 'none';
            void card.offsetWidth; // trigger reflow
            card.style.animation = 'shake 0.4s ease';
        } finally {
            unlockButton.disabled = false;
            unlockButton.querySelector('span').textContent = 'Unlock';
        }
    }

    function handleLogout() {
        sessionStorage.removeItem('isUnlocked');
        window.location.reload();
    }

    function showApp() {
        passcodeOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');
        searchInput.focus();
    }

    function showLock() {
        passcodeOverlay.classList.remove('hidden');
        mainApp.classList.add('hidden');
        passcodeInput.focus();
    }

    // --- Search Logic ---

    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        // Visual feedback
        searchButton.disabled = true;
        searchButton.innerHTML = 'Searching...';

        try {
            const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();

            renderResults(data);
        } catch (error) {
            console.error('Search error:', error);
            showNoResults('Network error. Please check if the server is running.');
        } finally {
            searchButton.disabled = false;
            searchButton.innerHTML = 'Search';
        }
    }

    function renderResults(data) {
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';
        
        if (!data || data.length === 0 || data.error) {
            showNoResults();
            printButton.classList.add('hidden');
            return;
        }

        noResults.classList.add('hidden');
        printButton.classList.remove('hidden');

        const custDisplayName = data[0]['CUSTOMER NAME'] || 'CLIENT RECORD';

        // Render Header
        tableHead.innerHTML = `
            <tr class="table-customer-header">
                <th colspan="11">${custDisplayName.toUpperCase()}</th>
            </tr>
            <tr>
                <th>SR NO</th>
                <th>ASSOCIATE</th>
                <th>CUSTOMER NAME</th>
                <th>USER ID</th>
                <th>DATE</th>
                <th>AMOUNT</th>
                <th>TXN #</th>
                <th>PLAN</th>
                <th>RECEIVED</th>
                <th>BALANCE</th>
                <th>COMMISSION</th>
            </tr>
        `;

        let totals = { amt: 0, received: 0, balance: 0, commission: 0 };

        // Render Rows
        data.forEach(row => {
            const tr = document.createElement('tr');
            
            const amt = Number(row['TRANSACTION AMOUNT'] || 0);
            const received = Number(row['RECEIVED AMT'] || 0);
            const balance = Number(row['BALANCE AMOUNT'] || 0);
            const comm = Number(row['ASSOCIATE COMMISSION'] || 0);

            tr.innerHTML = `
                <td>${row['SR NO'] || '-'}</td>
                <td>${row['ASSOCIATE NAME'] || '-'}</td>
                <td>${row['CUSTOMER NAME'] || '-'}</td>
                <td>${row['CUSTOMER USER ID'] || '-'}</td>
                <td>${row['TRANSACTION DATE'] || '-'}</td>
                <td>${formatCurrency(amt)}</td>
                <td>${row['TRANSACTION NUMBER'] || '-'}</td>
                <td>${row['PAYMENT PLAN'] || '-'}</td>
                <td>${formatCurrency(received)}</td>
                <td>${formatCurrency(balance)}</td>
                <td>${formatCurrency(comm)}</td>
            `;
            tableBody.appendChild(tr);

            totals.amt += amt;
            totals.received += received;
            totals.balance += balance;
            totals.commission += comm;
        });

        // Add Totals Row
        const totRow = document.createElement('tr');
        totRow.className = 'totals-row';
        totRow.innerHTML = `
            <td colspan="5" style="text-align:right">PAGE TOTALS</td>
            <td>${formatCurrency(totals.amt)}</td>
            <td colspan="2"></td>
            <td>${formatCurrency(totals.received)}</td>
            <td>${formatCurrency(totals.balance)}</td>
            <td>${formatCurrency(totals.commission)}</td>
        `;
        tableBody.appendChild(totRow);

        // Add Final Balance Box (for visual impact)
        const balanceRow = document.createElement('tr');
        balanceRow.className = 'balance-box-row';
        balanceRow.innerHTML = `
            <td colspan="11">
                <span class="balance-text">NET BALANCE: ₹ ${totals.balance.toLocaleString('en-IN')}</span>
            </td>
        `;
        tableBody.appendChild(balanceRow);
        
        // Re-init icons if any in dynamic content (though none currently)
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function showNoResults(msg) {
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';
        noResults.classList.remove('hidden');
        if (msg) noResults.querySelector('p').textContent = msg;
    }

    function formatCurrency(num) {
        if (isNaN(num)) return '-';
        return num.toLocaleString('en-IN');
    }

    // --- Events ---

    unlockButton.addEventListener('click', handleLogin);
    passcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    logoutButton.addEventListener('click', handleLogout);

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    printButton.addEventListener('click', () => {
        window.print();
    });

    // Check auth on load
    checkAuth();

    // Add CSS for shake animation dynamically if not in CSS
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            50% { transform: translateX(8px); }
            75% { transform: translateX(-8px); }
        }
    `;
    document.head.appendChild(styleSheet);
});
