import { createClient } from "https://esm.sh/@libsql/client/web?bundle";

// --- 1. CONNECT TO DB ---
const client = createClient({
  url: "https://anpmart-live-itagi99.aws-ap-south-1.turso.io",
  authToken: "eyJhbGciOiJFZ... (your token) ..."
});

// --- 2. GLOBAL STATE ---
const store = {
  products: [], customers: [], bills: [],
  emps: [], attendanceToday: [],
  filters: {}, cart: [], tab: "dashboard"
};

// --- 3. LOGIN LOGIC ---
function ensureLogin() {
  if (!localStorage.getItem('erp_auth')) renderLogin();
  else loadAllData();
}
window.logout = function() {
  localStorage.removeItem('erp_auth');
  location.reload();
}

function renderLogin() {
  document.getElementById('main').innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen">
      <div class="glass p-8 max-w-xs w-full rounded-2xl shadow-2xl flex flex-col gap-4">
        <h2 class="text-2xl font-extrabold text-slate-900 mb-1 flex items-center justify-center gap-2"><i class="fas fa-lock text-blue-600"></i> ANPMART ERP</h2>
        <input type="password" id="login-pin" placeholder="Enter PIN" class="border px-4 py-3 rounded-lg text-xl text-center font-bold" autocomplete="current-password" />
        <button id="login-btn" class="bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold p-3 rounded-xl shadow">Unlock System</button>
        <p class="text-xs text-slate-400 font-bold text-center">Restricted Access</p>
      </div>
    </div>
  `;
  document.getElementById("login-btn").onclick = async () => {
    const pin = document.getElementById("login-pin").value.trim();
    if (pin === "1234") {
      localStorage.setItem("erp_auth", "true");
      loadAllData();
    } else {
      alert("Incorrect PIN!");
    }
  };
}

// --- 4. FETCH AND SYNC ALL DATA ---
async function loadAllData() {
  try {
    // Products
    store.products = (await client.execute("SELECT id,name,rate,stock,unit_main,unit_pack FROM products ORDER BY name")).rows.map(r => ({
      id: r[0], name: r[1], rate: Number(r[2]), stock: Number(r[3]), unit_main: r[4], unit_pack: r[5]
    }));
    // Customers
    store.customers = (await client.execute("SELECT id,name,mobile,balance,whatsapp FROM customers ORDER BY name")).rows.map(r => ({
      id: r[0], name: r[1], mobile: r[2], balance: Number(r[3]), whatsapp: r[4]
    }));
    // Bills
    store.bills = (await client.execute("SELECT id,bill_no,customer_name,grand_total,created_at,bill_data FROM bills ORDER BY id DESC LIMIT 150")).rows.map(r => ({
      id: r[0], bill_no: r[1], customer_name: r[2], grand_total: Number(r[3]), created_at: r[4], bill_data: r[5]
    }));
    // Employees
    store.emps = (await client.execute("SELECT id,name FROM employees")).rows.map(r => ({
      id: r[0], name: r[1]
    }));
    // Attendance for Today
    const today = new Date().toISOString().slice(0, 10);
    store.attendanceToday = (await client.execute("SELECT emp_id, status FROM attendance WHERE date = ?", [today])).rows;
    // Render App
    renderApp();
  } catch (err) {
    document.getElementById('main').innerHTML = `<div class="p-8 text-center text-red-600">Failed to sync data: ${err.message}</div>`;
  }
}

// --- 5. RENDER APP (Navigation + Section) ---
function renderApp() {
  document.getElementById('main').innerHTML = `
    <header class="w-full bg-blue-600 text-white flex items-center justify-between px-5 py-3 shadow-md">
      <div class="font-bold flex items-center gap-2"><i class="fas fa-store"></i> ANPMART <span class="bg-blue-800 text-xs px-2 py-1 rounded font-mono ml-2">${store.tab.toUpperCase()}</span></div>
      <nav>
        <button onclick="window.logout()" class="bg-blue-700 rounded-full px-3 py-2 text-xs">Logout</button>
      </nav>
    </header>
    <main class="w-full max-w-2xl mx-auto p-4 flex flex-col gap-4 min-h-[60vh]">${renderSection()}</main>
    <footer class="fixed bottom-0 left-0 w-full bg-white border-t flex justify-around items-center p-2 z-50">
      ${["dashboard","pos","sales","ledger","stock","attendance"].map(tab =>
        `<button class="p-2 w-1/6 text-center ${store.tab===tab?'text-blue-700 font-bold':'text-slate-400'}" onclick="window.switchTab('${tab}')">
          <i class="fa${tab==='pos' ? 's fa-cash-register' : tab==='sales' ? 's fa-receipt' : tab==='ledger' ? 's fa-wallet' : tab==='attendance' ? 's fa-user-clock' : tab==='stock' ? 's fa-box-open' : 's fa-home'}"></i>
          <div class="text-[11px]">${tab.charAt(0).toUpperCase()+tab.slice(1)}</div>
        </button>`
      ).join("")}
    </footer>
  `;
}
window.switchTab = function(tab) {
  store.tab = tab;
  renderApp();
}

// --- 6. RENDER SECTION
function renderSection() {
  if (store.tab === "dashboard") return renderDashboard();
  if (store.tab === "pos") return renderPOS();
  if (store.tab === "sales") return renderSales();
  if (store.tab === "ledger") return renderLedger();
  if (store.tab === "stock") return renderStock();
  if (store.tab === "attendance") return renderAttendance();
  return `<div>Section not found</div>`;
}

// --- Dashboard
function renderDashboard() {
  return `
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="glass p-4 rounded-lg shadow">
        <div class="text-xs text-slate-400 font-bold">Total Sales</div>
        <div class="text-2xl font-black">₹${store.bills.reduce((a,b)=>a+b.grand_total,0).toLocaleString()}</div>
      </div>
      <div class="glass p-4 rounded-lg shadow">
        <div class="text-xs text-slate-400 font-bold">Total Due</div>
        <div class="text-2xl text-rose-600 font-black">₹${store.customers.reduce((a,c)=>a+(c.balance>0?c.balance:0),0).toLocaleString()}</div>
      </div>
    </div>
    <div>
      <div class="text-slate-700 font-semibold mb-2">Recent Bills</div>
      <div>
        ${store.bills.slice(0,8).map(b=>`
          <div class="glass mb-2 rounded p-2 flex items-center justify-between shadow-sm">
            <span class="font-bold">${b.customer_name||"Walk-in"}</span>
            <span>₹${b.grand_total}</span>
            <span class="text-xs text-slate-400">${b.created_at.slice(0,10)}</span>
          </div>`).join('')}
      </div>
    </div>
  `;
}

// --- Sales + Search, Filter, Sort
function renderSales() {
  let q = store.filters.salesSearch || "";
  let bills = store.bills.filter(b =>
    b.customer_name.toLowerCase().includes(q) ||
    (""+b.bill_no).toLowerCase().includes(q)
  );
  const sort = store.filters.salesSort || "newest";
  bills.sort((a,b) => sort==="newest" ? b.id-a.id : sort==="oldest" ? a.id-b.id : b.grand_total-a.grand_total);
  return `
    <div class="flex mb-2 gap-2">
      <input type="text" placeholder="Search bills" value="${q}" oninput="window.setSalesSearch(this.value)" class="flex-1 border rounded p-2"/>
      <select onchange="window.setSalesSort(this.value)" class="border rounded p-2">
        <option value="newest" ${sort==="newest"?'selected':''}>Newest</option>
        <option value="oldest" ${sort==="oldest"?'selected':''}>Oldest</option>
        <option value="highest" ${sort==="highest"?'selected':''}>Highest</option>
      </select>
    </div>
    <div>${bills.slice(0,40).map(b => `
      <div class="glass rounded mb-2 p-2 flex items-center justify-between shadow">
        <div class="flex-1">
          <div class="font-bold">${b.customer_name}</div>
          <div class="text-xs text-slate-400">${b.bill_no} • ${b.created_at.slice(0,10)}</div>
        </div>
        <div class="font-black text-blue-700">₹${b.grand_total}</div>
      </div>
    `).join('') || "<div class='py-10 text-slate-400 text-center'>No bills found.</div>"}</div>
  `;
}
window.setSalesSearch = s => {store.filters.salesSearch=s.toLowerCase();renderApp();}
window.setSalesSort = s => {store.filters.salesSort=s;renderApp();}

// You can repeat a similar structure for Ledger, Stock (products), Attendance, POS, etc

// --- INIT ---
ensureLogin();
