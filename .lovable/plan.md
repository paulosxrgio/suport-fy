

## Plan: Migrate Shopify order lookup to customer-first GraphQL approach

### Problem
The current GraphQL query searches orders directly by email, which returns empty results. The correct approach is to first find the customer by email, then fetch their orders through the customer object.

### Changes

#### 1. Update `get-shopify-customer-orders` Edge Function
Replace the current `orders(query: "email:...")` GraphQL query with a two-step approach:
- Use `customers(first: 1, query: $q)` with variable `q = email:"<email>"` to find the customer
- Fetch orders nested under the customer node (`customer.orders`)
- Use `nodes` instead of `edges` for cleaner syntax
- Include customer metadata (firstName, lastName, numberOfOrders, amountSpent)
- Return `{ orders, customer }` instead of just `{ orders }`
- Keep existing debug logs, update them for the new response shape

#### 2. Update `auto-reply-scheduler` Edge Function
Apply the same customer-first GraphQL query in the Shopify context section (~line 110-170):
- Replace `orders(first: 5, query: "email:...")` with `customers(first: 1, query: $q)` + nested orders
- Update the response parsing to use `data.customers.nodes[0].orders.nodes`
- Use parameterized variables instead of string interpolation for the email

#### 3. Note to user
Add a reminder that `read_customers` scope must be enabled in the Shopify Dev Dashboard app settings (this is a manual step outside the codebase).

### Technical details
- GraphQL query uses `$q: String!` variable with value `email:"exact@email.com"` (quotes inside the variable for exact match)
- Response structure changes from `data.orders.edges[].node` to `data.customers.nodes[0].orders.nodes[]`
- Customer info added to response: `firstName`, `lastName`, `numberOfOrders`, `amountSpent`

