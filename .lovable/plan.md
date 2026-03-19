

## Plan: Add "Exportar Dados" section to SettingsPage

### Changes

**File: `src/components/helpdesk/SettingsPage.tsx`**

1. Add `FileText`, `Download` to the lucide-react import
2. Add `const [exporting, setExporting] = useState(false)` state
3. Add `handleExportChats` async function that:
   - Fetches all tickets and messages for the current store
   - Groups messages by ticket_id
   - Builds a formatted `.txt` string with headers, ticket info, and chronological messages
   - Creates a Blob and triggers download
4. Add a new Card after the "Email Signature" card and before the Save button, containing:
   - `FileText` icon + "Exportar Dados" title
   - Description text explaining the export
   - A `<pre>` block showing a preview of the output format
   - A button with `Download` icon to trigger the export

No other files modified.

