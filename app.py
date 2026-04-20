from flask import Flask, render_template, request, jsonify
import libsql_client
from datetime import datetime
import json

app = Flask(__name__)

# =======================================================
# 🌐 YOUR TURSO CLOUD CREDENTIALS
# =======================================================
TURSO_DB_URL = "https://anpmart-live-itagi99.aws-ap-south-1.turso.io"
TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY2MTA5MTEsImlkIjoiMDE5ZGE2M2MtMzkwMS03NThiLTg5OWEtYTI3NmIxOTFhMzg0IiwicmlkIjoiOTkxZjViZDItNjQ5Zi00MzZjLThmNWItMDYwMTc5NzQzOTZkIn0.pLcblP09C3B8Ny46Xk1Q3XSVgsJdJCbdtZztLrYaW16Ed3kKBfD89XBdIkWDYZj6oLDpO-nRjRjGE_4jk8I7Cw"

def get_db():
    return libsql_client.create_client_sync(url=TURSO_DB_URL, auth_token=TURSO_AUTH_TOKEN)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/dashboard', methods=['GET'])
def dashboard_data():
    client = get_db()
    try:
        # Get KPIs
        sales_rs = client.execute("SELECT SUM(grand_total) FROM bills")
        total_sales = sales_rs.rows[0][0] if sales_rs.rows and sales_rs.rows[0][0] else 0.0

        due_rs = client.execute("SELECT SUM(balance) FROM customers WHERE balance > 0")
        total_due = due_rs.rows[0][0] if due_rs.rows and due_rs.rows[0][0] else 0.0

        # Get Recent 15 Bills (Mix of D- and M- bills)
        bills_rs = client.execute("SELECT bill_no, customer_name, grand_total, created_at FROM bills ORDER BY id DESC LIMIT 15")
        recent_bills = [{"bill_no": r[0], "customer": r[1], "amount": r[2], "date": r[3][:10]} for r in bills_rs.rows]

        # Get Customer List for Dropdown
        cust_rs = client.execute("SELECT name FROM customers ORDER BY name")
        customers = [r[0] for r in cust_rs.rows]

        return jsonify({
            "status": "success",
            "total_sales": total_sales,
            "total_due": total_due,
            "recent_bills": recent_bills,
            "customers": customers
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        client.close()

@app.route('/api/quick_bill', methods=['POST'])
def quick_bill():
    data = request.json
    client = get_db()
    try:
        cname = data.get('customer', 'Walk-in').strip() or 'Walk-in'
        try: amount = float(data.get('amount', 0))
        except: amount = 0.0
        
        if amount <= 0:
            return jsonify({"status": "error", "message": "Amount must be greater than 0"})

        # ⚡ GENERATE M- (MOBILE) PREFIX BILL NUMBER
        count_rs = client.execute("SELECT COUNT(id) FROM bills WHERE bill_no LIKE 'M-APP-%'")
        count = count_rs.rows[0][0] if count_rs.rows else 0
        bill_no = f"M-APP-{count + 1:04d}"
        
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Check customer and get old balance
        cust_rs = client.execute("SELECT id, balance FROM customers WHERE name = ?", [cname])
        old_bal = 0.0
        if cust_rs.rows:
            old_bal = float(cust_rs.rows[0][1] or 0.0)
            # Add new amount to their balance (since paid = 0 in quick bill)
            client.execute("UPDATE customers SET balance = balance + ? WHERE id = ?", [amount, cust_rs.rows[0][0]])
        else:
            if cname != 'Walk-in':
                client.execute("INSERT INTO customers (name, mobile, address, balance, group_name) VALUES (?, '', '', ?, 'General')", [cname, amount])

        # Create dummy bill data
        bill_data = json.dumps([{"name": "Mobile Quick Sale", "qty": 1, "rate": amount, "tot": amount}])

        # Insert Bill
        client.execute(
            """INSERT INTO bills (bill_no, customer_name, sub_total, discount, grand_total, paid, balance_due, payment_mode, bill_data, created_at, old_balance, narration) 
               VALUES (?, ?, ?, 0, ?, 0, ?, 'Due/Cash', ?, ?, ?, 'Generated via Mobile App')""",
            [bill_no, cname, amount, amount, amount, bill_data, date_str, old_bal]
        )
        
        return jsonify({"status": "success", "message": f"Successfully created {bill_no} for {cname}!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        client.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)