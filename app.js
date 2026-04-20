// ==========================================
// ⚡ TURSO DATABASE CONNECTION (NATIVE REST)
// ==========================================
const TURSO_URL = "https://anpmart-live-itagi99.aws-ap-south-1.turso.io/v2/pipeline";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY2MTA5MTEsImlkIjoiMDE5ZGE2M2MtMzkwMS03NThiLTg5OWEtYTI3NmIxOTFhMzg0IiwicmlkIjoiOTkxZjViZDItNjQ5Zi00MzZjLThmNWItMDYwMTc5NzQzOTZkIn0.pLcblP09C3B8Ny46Xk1Q3XSVgsJdJCbdtZztLrYaW16Ed3kKBfD89XBdIkWDYZj6oLDpO-nRjRjGE_4jk8I7Cw";

async function runQuery(sql, args = []) {
    const formattedArgs = args.map(arg => {
        if (typeof arg === 'number') return { type: "float", value: arg };
        if (arg === null) return { type: "null" };
        return { type: "text", value: String(arg) };
    });

    try {
        const req = await fetch(TURSO_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${TURSO_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: [
                    { type: "execute", stmt: { sql: sql, args: formattedArgs } },
                    { type: "close" }
                ]
            })
        });
        
        if (!req.ok) return [];
        const data = await req.json();
        if (data.results[0].type === "error") {
            console.log("SQL Safe Skip:", data.results[0].error.message);
            return [];
        }
        
        const res = data.results[0].response.result;
        if (!res || !res.cols || !res.rows) return [];

        const cols = res.cols.map(c => c.name);
        return res.rows.map(row => {
            let obj = {};
            row.forEach((v, i) => { obj[cols[i]] = (v.type === "null") ? null : v.value; });
            return obj;
        });
    } catch (e) {
        console.error("Fetch Error:", e);
        return []; 
    }
}

// ==========================================
// 🔒 APP STATE & LOGIN
// ==========================================
window.erpData = { products: [], customers: [], bills: [], emps: [], cart: [], cartTotal: 0.0 };

function checkLogin() {
    if(document.getElementById('login-pin').value === "1234") {
        localStorage.setItem('erp_auth', 'true');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('flex');
        syncData();
    } else alert("Incorrect PIN.");
}

if(localStorage.getItem('erp_auth') === 'true') {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('flex');
    syncData();
}

// ==========================================
// 🔄 MASTER SYNC & RENDER ENGINE
// ==========================================
async function syncData() {
    const btn = document.getElementById('btn-sync');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        // ⚡ FIX: Force Strict Number Casting for all-time KPIs
        let s_res = await runQuery("SELECT SUM(CAST(grand_total AS REAL)) as t FROM bills");
        document.getElementById('kpi-sales').innerText = '₹' + Number((s_res[0]&&s_res[0].t)||0).toLocaleString('en-IN');
        
        let d_res = await runQuery("SELECT SUM(CAST(balance AS REAL)) as t FROM customers WHERE balance > 0");
        document.getElementById('kpi-due').innerText = '₹' + Number((d_res[0]&&d_res[0].t)||0).toLocaleString('en-IN');

        window.erpData.products = await runQuery("SELECT id, name, rate, stock, unit_main, unit_pack FROM products ORDER BY name");
        window.erpData.customers = await runQuery("SELECT name, mobile, balance, whatsapp FROM customers ORDER BY name");
        window.erpData.bills = await runQuery("SELECT id, bill_no, customer_name, grand_total, created_at, bill_data FROM bills ORDER BY id DESC LIMIT 50");
        
        try { window.erpData.emps = await runQuery("SELECT id, name FROM employees"); } catch(e){}

        renderSales(); renderLedger(); renderStock(); renderAttendance();

    } catch (err) { alert("Sync Failed. Check internet."); }
    btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
}

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('text-blue-600', 'active'); b.classList.add('text-slate-400');
    });
    if(btnElement && btnElement.tagName === 'BUTTON') {
        btnElement.classList.remove('text-slate-400'); btnElement.classList.add('text-blue-600', 'active');
    }
    const titles = { 'dashboard':'DASH', 'pos':'POS', 'sales':'SALES', 'ledger':'LEDGER', 'more':'MENU', 'stock':'MASTER', 'attendance':'ATTEND' };
    document.getElementById('header-title').innerText = titles[tabId];
}

// ==========================================
// 🔍 AUTOCOMPLETE ENGINE
// ==========================================
function filterAC(inputId, dropId) {
    const val = document.getElementById(inputId).value.toLowerCase();
    const drop = document.getElementById(dropId);
    drop.innerHTML = '';
    if(!val) { drop.style.display = 'none'; return; }
    
    let list = inputId === 'pos-cust' ? window.erpData.customers.map(c=>c.name) : window.erpData.products.map(p=>p.name);
    let matches = list.filter(i => i && i.toLowerCase().includes(val)).slice(0, 10);
    
    matches.forEach(m => {
        let div = document.createElement('div');
        div.className = 'ac-item'; div.innerText = m;
        div.onclick = function() {
            document.getElementById(inputId).value = m;
            drop.style.display = 'none';
            if(inputId === 'pos-item') autoFillPrice();
        };
        drop.appendChild(div);
    });
    drop.style.display = matches.length ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    if(!e.target.closest('.relative')) { document.querySelectorAll('.ac-dropdown').forEach(el => el.style.display = 'none'); }
});

// ==========================================
// 🧾 POS ENGINE
// ==========================================
function autoFillPrice() {
    const name = document.getElementById('pos-item').value;
    const p = window.erpData.products.find(x => x.name === name);
    if(p) {
        document.getElementById('pos-rate').value = p.rate || 0;
        const uSel = document.getElementById('pos-unit');
        uSel.innerHTML = `<option value="${p.unit_main || 'Pcs'}">${p.unit_main || 'Pcs'}</option>`;
        if(p.unit_pack) uSel.innerHTML += `<option value="${p.unit_pack}">${p.unit_pack}</option>`;
    }
}

function addToCart() {
    const name = document.getElementById('pos-item').value;
    const qty = parseFloat(document.getElementById('pos-qty').value) || 1;
    const rate = parseFloat(document.getElementById('pos-rate').value) || 0;
    const unit = document.getElementById('pos-unit').value || 'Pcs';
    
    if(!name || rate <= 0) return alert("Valid item and rate required.");

    window.erpData.cart.push({name, qty, rate, unit, tot: qty*rate});
    document.getElementById('pos-item').value = '';
    document.getElementById('pos-qty').value = '1';
    document.getElementById('pos-rate').value = '';
    document.getElementById('pos-unit').innerHTML = '';
    renderCart();
}

function removeCartItem(index) { window.erpData.cart.splice(index, 1); renderCart(); }

function renderCart() {
    const ui = document.getElementById('pos-cart-ui'); ui.innerHTML = '';
    window.erpData.cartTotal = 0;
    if(window.erpData.cart.length === 0) ui.innerHTML = '<p class="text-center text-slate-400 text-[10px] mt-4">Cart Empty</p>';
    else {
        window.erpData.cart.forEach((item, i) => {
            window.erpData.cartTotal += item.tot;
            ui.innerHTML += `
                <div class="bg-slate-50 p-2 rounded border border-slate-100 flex justify-between items-center text-xs shadow-sm mb-1">
                    <div class="flex-1"><p class="font-bold text-slate-800 line-clamp-1">${item.name}</p><p class="text-[9px] text-slate-500">${item.qty} ${item.unit} x ₹${item.rate}</p></div>
                    <div class="flex items-center space-x-2"><p class="font-black text-blue-600">₹${item.tot.toFixed(2)}</p><button onclick="removeCartItem(${i})" class="text-red-400 py-1 px-2"><i class="fas fa-times"></i></button></div>
                </div>`;
        });
    }
    document.getElementById('pos-total').innerText = '₹' + window.erpData.cartTotal.toFixed(2);
}

async function saveMobileBill() {
    if(window.erpData.cart.length === 0) return;
    const btn = document.getElementById('btn-save-bill');
    let cust = document.getElementById('pos-cust').value.trim() || "Walk-in";
    let total = window.erpData.cartTotal;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SAVING...'; btn.disabled = true;

    try {
        let cntRs = await runQuery("SELECT COUNT(id) as c FROM bills WHERE bill_no LIKE 'M-APP-%'");
        const bno = `M-APP-${String((Number(cntRs[0]?.c)||0) + 1).padStart(4, '0')}`;
        
        const d = new Date(); const pad = n => String(n).padStart(2, '0');
        const dt = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        let old_bal = 0.0;
        let custRs = await runQuery(`SELECT id, balance FROM customers WHERE name = '${cust.replace(/'/g, "''")}'`);
        
        if (custRs.length > 0) {
            old_bal = Number(custRs[0].balance || 0);
            await runQuery(`UPDATE customers SET balance = balance + ${total} WHERE name = '${cust.replace(/'/g, "''")}'`);
        } else if (cust !== 'Walk-in') {
            await runQuery(`INSERT INTO customers (name, mobile, address, balance, group_name) VALUES ('${cust.replace(/'/g, "''")}', '', '', ${total}, 'General')`);
        }

        for(let item of window.erpData.cart) {
            await runQuery(`UPDATE products SET stock = stock - ${item.qty} WHERE name = '${item.name.replace(/'/g, "''")}'`);
        }

        const cartJson = JSON.stringify(window.erpData.cart).replace(/'/g, "''");
        await runQuery(`INSERT INTO bills (bill_no, customer_name, sub_total, discount, grand_total, paid, balance_due, payment_mode, bill_data, created_at, old_balance, narration) VALUES ('${bno}', '${cust.replace(/'/g, "''")}', ${total}, 0, ${total}, 0, ${total}, 'Due/Cash', '${cartJson}', '${dt}', ${old_bal}, 'Mobile PWA')`);

        document.getElementById('pos-cust').value = ''; window.erpData.cart = []; renderCart();
        await syncData(); switchTab('dashboard', document.querySelectorAll('.nav-btn')[0]);
        alert("Bill Saved Successfully!");
    } catch (err) { alert("Save failed. Check Connection."); console.error(err); }
    btn.innerHTML = 'COMPLETE SALE'; btn.disabled = false;
}

// ==========================================
// 📜 TAB RENDERERS (Compact UI)
// ==========================================
function renderSales() {
    const val = (document.getElementById('search-sales').value || "").toLowerCase();
    const list = document.getElementById('sales-list'); list.innerHTML = '';
    const feed = document.getElementById('dashboard-feed'); feed.innerHTML = '';
    
    let filtered = window.erpData.bills.filter(b => (b.customer_name||"").toLowerCase().includes(val) || (b.bill_no||"").toLowerCase().includes(val));
    
    filtered.slice(0, 20).forEach((b, i) => {
        const bno = b.bill_no || "Unknown", cust = b.customer_name || "Walk-in", amt = Number(b.grand_total || 0), dt = String(b.created_at || "").substring(0,10);
        const badge = bno.startsWith('M-') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
        const html = `
            <div onclick="viewBill(${b.id})" class="glass-card p-2.5 rounded-xl border border-slate-200 flex justify-between items-center active:bg-slate-50 mb-1.5 shadow-sm">
                <div><p class="text-xs font-bold text-slate-800">${cust}</p><p class="text-[9px] text-slate-500">${dt}</p></div>
                <div class="text-right"><p class="text-sm font-black text-slate-800">₹${amt.toLocaleString()}</p><span class="text-[8px] font-bold px-1 rounded ${badge}">${bno}</span></div>
            </div>`;
        list.innerHTML += html;
        if(i < 5 && val === "") feed.innerHTML += html;
    });
}

function viewBill(id) {
    const b = window.erpData.bills.find(x => x.id === id);
    if(!b) return;
    document.getElementById('m-bill-title').innerText = b.bill_no || "Bill";
    
    let html = `Customer : ${b.customer_name}\nDate     : ${b.created_at}\n--------------------------\n`;
    try {
        let items = JSON.parse(b.bill_data || "[]");
        items.forEach(i => html += `${(i.name||"Item").substring(0,15).padEnd(15)} ${i.qty} x ${i.rate} = ${i.tot}\n`);
    } catch(e){}
    html += `--------------------------\nGRAND TOTAL : ₹${b.grand_total}\n`;
    
    document.getElementById('m-bill-content').innerText = html;
    
    const cObj = window.erpData.customers.find(c => c.name === b.customer_name);
    const mob = cObj ? (cObj.whatsapp || cObj.mobile) : '';
    document.getElementById('btn-wa').onclick = () => {
        if(!mob) return alert("No phone number saved for this customer.");
        window.open(`https://wa.me/${mob}?text=${encodeURIComponent(html)}`, '_blank');
    };
    document.getElementById('modal-bill').classList.remove('hidden');
}

function renderLedger() {
    const val = (document.getElementById('search-ledger').value || "").toLowerCase();
    const list = document.getElementById('ledger-list'); list.innerHTML = '';
    
    window.erpData.customers.filter(c => Number(c.balance || 0) > 0 && (c.name||"").toLowerCase().includes(val)).forEach(c => {
        const safeName = (c.name||"").replace(/'/g, "\\'");
        list.innerHTML += `
            <div onclick="openPayModal('${safeName}', ${c.balance})" class="glass-card p-2.5 rounded-xl border border-slate-200 flex justify-between items-center active:bg-rose-50 mb-1.5 shadow-sm">
                <div><p class="text-xs font-bold text-slate-800">${c.name}</p><p class="text-[9px] text-slate-400"><i class="fas fa-phone mr-1"></i>${c.mobile||'N/A'}</p></div>
                <div class="text-right"><p class="text-[9px] text-slate-400">Due</p><p class="text-sm font-black text-rose-500">₹${Number(c.balance).toFixed(2)}</p></div>
            </div>`;
    });
}

function openPayModal(name, due) {
    document.getElementById('pay-cust-name').innerText = name;
    document.getElementById('pay-due').innerText = `₹${due.toFixed(2)}`;
    document.getElementById('pay-amt').value = due.toFixed(2);
    document.getElementById('modal-pay').classList.remove('hidden');
}

async function savePayment() {
    const name = document.getElementById('pay-cust-name').innerText;
    const amt = parseFloat(document.getElementById('pay-amt').value);
    if(!amt || amt <= 0) return alert("Invalid amount.");
    
    try {
        const dt = new Date().toISOString().replace('T',' ').substring(0, 19);
        await runQuery(`UPDATE customers SET balance = balance - ${amt} WHERE name = '${name.replace(/'/g, "''")}'`);
        await runQuery(`INSERT INTO payment_history (customer_name, amount_paid, created_at, payment_mode, narration) VALUES ('${name.replace(/'/g, "''")}', ${amt}, '${dt}', 'Cash', 'Mobile Received')`);
        
        document.getElementById('modal-pay').classList.add('hidden');
        await syncData(); alert("Payment Logged!");
    } catch(e) { alert("Error saving payment."); }
}

function renderStock() {
    const val = (document.getElementById('search-stock').value || "").toLowerCase();
    const list = document.getElementById('stock-list'); list.innerHTML = '';
    
    window.erpData.products.filter(p => (p.name||"").toLowerCase().includes(val)).slice(0,30).forEach(p => {
        const stk = Number(p.stock || 0);
        let color = stk <= 0 ? 'text-red-500' : 'text-emerald-500';
        const safeName = (p.name||"").replace(/'/g, "\\'");
        list.innerHTML += `
            <div onclick="openEditItem(${p.id}, '${safeName}', ${p.rate||0}, ${stk})" class="glass-card p-2.5 rounded-xl border border-slate-200 flex justify-between items-center active:bg-blue-50 mb-1.5 shadow-sm">
                <p class="text-xs font-bold text-slate-800">${p.name}</p>
                <div class="text-right"><p class="text-sm font-black text-slate-800">₹${p.rate||0}</p><p class="text-[9px] font-bold ${color}">Stock: ${stk}</p></div>
            </div>`;
    });
}

function openEditItem(id, name, rate, stock) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-rate').value = rate;
    document.getElementById('edit-stock').value = stock;
    document.getElementById('modal-edit-item').classList.remove('hidden');
}

async function saveMasterEdit() {
    const id = document.getElementById('edit-id').value;
    const rate = parseFloat(document.getElementById('edit-rate').value);
    const stock = parseFloat(document.getElementById('edit-stock').value);
    try {
        await runQuery(`UPDATE products SET rate=${rate}, stock=${stock} WHERE id=${id}`);
        document.getElementById('modal-edit-item').classList.add('hidden');
        await syncData();
    } catch(e) { alert("Error saving."); }
}

function renderAttendance() {
    const list = document.getElementById('attendance-list'); list.innerHTML = '';
    if(!window.erpData.emps || window.erpData.emps.length === 0) return list.innerHTML = "<p class='text-[10px] text-slate-500'>No employees found.</p>";
    
    window.erpData.emps.forEach(e => {
        list.innerHTML += `
            <div class="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm mb-1.5">
                <p class="font-bold text-slate-800 text-xs mb-2">${e.name}</p>
                <div class="flex space-x-1.5">
                    <label class="flex-1 text-center bg-emerald-50 text-emerald-700 p-1.5 rounded text-[10px] font-bold"><input type="radio" name="att_${e.id}" value="Present" checked> P</label>
                    <label class="flex-1 text-center bg-yellow-50 text-yellow-700 p-1.5 rounded text-[10px] font-bold"><input type="radio" name="att_${e.id}" value="Half Day"> HD</label>
                    <label class="flex-1 text-center bg-red-50 text-red-700 p-1.5 rounded text-[10px] font-bold"><input type="radio" name="att_${e.id}" value="Absent"> A</label>
                </div>
            </div>`;
    });
}

async function saveAttendance() {
    const dt = new Date().toISOString().substring(0, 10);
    try {
        for(let e of window.erpData.emps) {
            const status = document.querySelector(`input[name="att_${e.id}"]:checked`).value;
            await runQuery(`INSERT INTO attendance (emp_id, emp_name, date, status) VALUES (${e.id}, '${e.name.replace(/'/g, "''")}', '${dt}', '${status}')`);
        }
        alert("Attendance Saved!"); switchTab('dashboard', document.querySelectorAll('.nav-btn')[0]);
    } catch(err) { alert("Error saving attendance."); }
}

// Attach globals
window.checkLogin = checkLogin; window.syncData = syncData; window.switchTab = switchTab;
window.filterAC = filterAC; window.autoFillPrice = autoFillPrice; window.addToCart = addToCart;
window.removeCartItem = removeCartItem; window.saveMobileBill = saveMobileBill;
window.renderSales = renderSales; window.viewBill = viewBill; window.renderLedger = renderLedger;
window.openPayModal = openPayModal; window.savePayment = savePayment; window.renderStock = renderStock;
window.openEditItem = openEditItem; window.saveMasterEdit = saveMasterEdit; window.saveAttendance = saveAttendance;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
