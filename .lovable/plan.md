

## Plan: Add Print Button to Conversation Header

### Changes

**File: `src/components/helpdesk/ConversationView.tsx`**

1. Import `Printer` from `lucide-react` and `Tooltip` components
2. Add `handlePrint` function that opens a new window with formatted HTML of the conversation and triggers `window.print()`
3. Add a printer icon button in the header's button group (next to the translate button), wrapped in a Tooltip with "Imprimir conversa"

The print output will include:
- Header with customer name, email, subject, and date
- All messages styled as chat bubbles (inbound left-aligned, outbound right-aligned)
- Sender name and timestamp metadata per message
- Clean print-optimized CSS

No other files modified.

