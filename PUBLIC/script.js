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

    // Login Elements
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginButton = document.getElementById('loginButton');

    // Settings Elements
    const settingsButton = document.getElementById('settingsButton');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsButton = document.getElementById('closeSettingsButton');
    const savePasscodeButton = document.getElementById('savePasscodeButton');
    const currentPasscodeInput = document.getElementById('currentPasscodeInput');
    const newPasscodeInput = document.getElementById('newPasscodeInput');
    const settingsFeedback = document.getElementById('settingsFeedback');

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
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!email || !password) return;

        loginButton.disabled = true;
        loginButton.querySelector('span').textContent = 'Authenticating...';

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const result = await response.json();

            if (result.success) {
                loginFeedback.textContent = 'Login Successful!';
                loginFeedback.className = 'feedback success';
                sessionStorage.setItem('isUnlocked', 'true');
                sessionStorage.setItem('authToken', result.token);
                sessionStorage.setItem('isAdmin', 'true'); // Auth users are admins
                
                setTimeout(() => {
                    showApp();
                    passcodeOverlay.classList.add('hidden');
                }, 600);
            } else {
                throw new Error(result.message || 'Login failed');
            }
        } catch (error) {
            loginFeedback.textContent = error.message;
            loginFeedback.className = 'feedback error';
        } finally {
            loginButton.disabled = false;
            loginButton.querySelector('span').textContent = 'Login';
        }
    }

    function handleLogout() {
        sessionStorage.removeItem('isUnlocked');
        window.location.reload();
    }

    function showApp() {
        passcodeOverlay.classList.add('hidden');
        mainApp.classList.remove('hidden');
        
        // Ensure settings button is correct on refresh
        if (sessionStorage.getItem('isAdmin') === 'true') {
            settingsButton.classList.remove('hidden');
        } else {
            settingsButton.classList.add('hidden');
        }
        
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

        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
        
        noResults.classList.add('hidden'); // Hide it when beginning search
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';

        try {
            const token = sessionStorage.getItem('authToken');
            const response = await fetch(`/search?q=${encodeURIComponent(query)}`, {
                headers: { 'x-auth-token': token }
            });
            const data = await response.json();
            renderResults(data);
        } catch (error) {
            showNoResults('Session expired. Please login again.');
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = 'Search';
        }
    }

    function renderResults(data) {
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';
        noResults.classList.add('hidden'); // Success! Hide the error message
        
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
                <td data-label="SR NO">${row['SR NO'] || '-'}</td>
                <td data-label="ASSOCIATE">${row['ASSOCIATE NAME'] || '-'}</td>
                <td data-label="CUSTOMER">${row['CUSTOMER NAME'] || '-'}</td>
                <td data-label="USER ID">${row['CUSTOMER USER ID'] || '-'}</td>
                <td data-label="DATE">${row['TRANSACTION DATE'] || '-'}</td>
                <td data-label="AMOUNT">${formatCurrency(amt)}</td>
                <td data-label="TXN #">${row['TRANSACTION NUMBER'] || '-'}</td>
                <td data-label="PLAN">${row['PAYMENT PLAN'] || '-'}</td>
                <td data-label="RECEIVED">${formatCurrency(received)}</td>
                <td data-label="BALANCE">${formatCurrency(balance)}</td>
                <td data-label="COMMISSION">${formatCurrency(comm)}</td>
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

    if (loginButton) loginButton.addEventListener('click', handleLogin);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    if (searchButton) searchButton.addEventListener('click', performSearch);
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    if (printButton) {
        printButton.addEventListener('click', () => {
            window.print();
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    settingsButton.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        settingsFeedback.textContent = '';
        settingsFeedback.className = 'feedback';
        currentPasscodeInput.value = '';
        newPasscodeInput.value = '';
        currentPasscodeInput.focus();
    });

    closeSettingsButton.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    savePasscodeButton.addEventListener('click', async () => {
        const currentCode = currentPasscodeInput.value.trim(); // Not needed for auth but kept in UI
        const newCode = newPasscodeInput.value.trim();
        const token = sessionStorage.getItem('authToken');

        if (!newCode) return;

        savePasscodeButton.disabled = true;
        savePasscodeButton.textContent = 'Updating...';

        try {
            const response = await fetch('/update-setting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, key: 'ADMIN_PASSCODE', value: newCode })
            });

            const result = await response.json();

            if (result.success) {
                settingsFeedback.textContent = 'Success! System updated.';
                settingsFeedback.className = 'feedback success';
                setTimeout(() => settingsModal.classList.add('hidden'), 1500);
            } else {
                throw new Error(result.message || 'Update failed');
            }
        } catch (error) {
            settingsFeedback.textContent = error.message;
            settingsFeedback.className = 'feedback error';
        } finally {
            savePasscodeButton.disabled = false;
            savePasscodeButton.textContent = 'Update';
        }
    });

    // Check auth and quick-links on load
    checkAuth();
    
    // Auto-search if ID is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const autoId = urlParams.get('ID') || urlParams.get('q');
    
    if (autoId) {
        searchInput.value = autoId;
        // If already unlocked, search immediately. 
        // If not, it will be searched once handleLogin succeeds since we keep the input value.
        if (sessionStorage.getItem('isUnlocked') === 'true') {
            performSearch();
        }
    }
});
