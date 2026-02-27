

## Plan: Split Shopify GraphQL into two separate queries

### Problem
The nested `orders` inside `customers` query returns empty despite correct scopes. Splitting into two separate queries works around this.

### Changes

#### 1. `supabase/functions/get-shopify-customer-orders/index.ts`
Replace the single GraphQL query block (after `getShopifyToken` call) with:
- **Query 1**: `customers(first: 1, query: $q)` — fetch customer by email (id, firstName, lastName, numberOfOrders, amountSpent only, no nested orders)
- **Query 2**: `orders(first: 5, query: $customerId, sortKey: CREATED_AT, reverse: true)` — fetch orders using `customer_id:<numeric_id>` extracted from the customer's GID
- Keep all existing debug logs, update them to log both responses separately
- Keep existing response format (`{ orders, customer }`)

#### 2. `supabase/functions/auto-reply-scheduler/index.ts`
Apply the same two-query split in the Shopify context section (~line 110+):
- Query 1: fetch customer by email
- Query 2: fetch orders by customer_id
- Update `shopifyContext` string building to use the new `ordersData` response

