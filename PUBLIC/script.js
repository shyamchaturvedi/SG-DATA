document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const printButton = document.getElementById('printButton');

    searchButton.addEventListener('click', searchData);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchData();
        }
    });

    printButton.addEventListener('click', printResults);
});

async function searchData() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        alert('Please enter a search value');
        return;
    }

    try {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        const tbody = document.querySelector('#resultTable tbody');
        const head = document.getElementById('tableHead');
        const customerNameHeader = document.getElementById('customerName');
        tbody.innerHTML = '';
        head.innerHTML = '';

        if (data.error || data.length === 0) {
            customerNameHeader.style.display = 'block';
            customerNameHeader.innerText = 'No records found';
            updatePrintButton(false);
            return;
        }

        const custDisplayName = data[0]['CUSTOMER NAME'] || '';
        customerNameHeader.style.display = 'none';

        head.innerHTML = `
            <tr class="table-customer-header"><th colspan="11">${custDisplayName.toUpperCase()}</th></tr>
            <tr>
                <th class="col-sr">SR NO</th>
                <th class="col-associate">ASSOCIATE NAME</th>
                <th class="col-customer">CUSTOMER NAME</th>
                <th class="col-custid">CUSTOMER USER ID</th>
                <th class="col-date">TRANSACTION DATE</th>
                <th class="col-amount">TRANSACTION AMOUNT</th>
                <th class="col-txnum">TRANSACTION NUMBER</th>
                <th class="col-plan">PAYMENT PLAN</th>
                <th class="col-received">RECEIVED AMT</th>
                <th class="col-balance">BALANCE AMOUNT</th>
                <th class="col-commission">ASSOCIATE COMMISSION</th>
            </tr>
        `;

        let totals = {
            transactionAmount: 0,
            receivedAmount: 0,
            balanceAmount: 0,
            commission: 0
        };

        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row['SR NO'] || ''}</td>
                <td>${row['ASSOCIATE NAME'] || ''}</td>
                <td>${row['CUSTOMER NAME'] || ''}</td>
                <td>${row['CUSTOMER USER ID'] || ''}</td>
                <td>${row['TRANSACTION DATE'] || ''}</td>
                <td>${row['TRANSACTION AMOUNT'] || ''}</td>
                <td>${row['TRANSACTION NUMBER'] || ''}</td>
                <td>${row['PAYMENT PLAN'] || ''}</td>
                <td>${row['RECEIVED AMT'] || ''}</td>
                <td>${row['BALANCE AMOUNT'] || ''}</td>
                <td>${row['ASSOCIATE COMMISSION'] || ''}</td>
            `;
            tbody.appendChild(tr);

            totals.transactionAmount += Number(row['TRANSACTION AMOUNT'] || 0);
            totals.receivedAmount += Number(row['RECEIVED AMT'] || 0);
            totals.balanceAmount += Number(row['BALANCE AMOUNT'] || 0);
            totals.commission += Number(row['ASSOCIATE COMMISSION'] || 0);
        });

        const totalsRow = document.createElement('tr');
        totalsRow.className = 'totals-row';
        totalsRow.innerHTML = `
            <td colspan="5" style="text-align:center">TOTAL</td>
            <td style="font-weight:bold">${totals.transactionAmount.toFixed(0)}</td>
            <td colspan="2"></td>
            <td style="font-weight:bold">${totals.receivedAmount.toFixed(0)}</td>
            <td style="font-weight:bold">${totals.balanceAmount.toFixed(0)}</td>
            <td style="font-weight:bold">${totals.commission.toFixed(0)}</td>
        `;
        tbody.appendChild(totalsRow);

        const balanceRow = document.createElement('tr');
        balanceRow.innerHTML = `
            <td colspan="11" style="text-align: right; padding: 4px 50px 4px 0; background-color: #c8f7c8; border: 2px solid #000;">
                <span style="font-weight: bold;">Balance = ₹${totals.balanceAmount.toFixed(0)}</span>
            </td>
        `;
        tbody.appendChild(balanceRow);

        updatePrintButton(true);

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('customerName').innerText = 'Error occurred while fetching data';
        updatePrintButton(false);
    }
}

function printResults() {
    window.print();
}

function updatePrintButton(hasResults) {
    document.getElementById('printButton').style.display = hasResults ? 'inline-block' : 'none';
}
