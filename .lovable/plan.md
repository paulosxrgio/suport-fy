

## Analysis: Orders query returns empty despite correct customer

### Current State (from logs)
- **Customer query**: Works. Finds `GOMES` (ID: `11131624947978`), `numberOfOrders: "1"`, `amountSpent: 3.1 GBP`
- **Orders query**: `orders(first: 5, query: "customer_id:11131624947978")` returns `nodes: []`
- Query cost is only 5 (vs requested 29), confirming zero results — not a parsing error

### Root Cause
The `client_credentials` grant type used in `getShopifyToken` generates a token whose scopes are defined by the **Shopify app configuration**. The token can read customers (proven by the working query) but cannot read orders.

This is **not a code issue** — the code and queries are correct. The problem is in the Shopify Dev Dashboard app configuration.

### Required Action (Manual — outside codebase)
1. Go to **Shopify Partners Dashboard** → Your App → **Configuration**
2. Under **Admin API access scopes**, ensure **`read_orders`** is checked
3. **Important**: After adding the scope, you may need to **reinstall the app** on the store or **re-authorize** for the new scope to take effect with client credentials
4. Some Shopify development stores also have a setting under **Settings → Checkout → Order processing** that restricts API access to orders — ensure that is not blocking

### No Code Changes Required
The two-query split is correctly implemented. Once the `read_orders` scope is properly granted and active, the orders will appear.

