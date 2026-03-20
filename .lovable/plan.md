

## Plan: Display Email Image Attachments in Chat

### 1. Database Migration

- Add `attachments jsonb default '[]'` column to `messages` table
- Create `email-attachments` storage bucket (public)
- Add RLS policies for public read and service role upload on the bucket

### 2. Update `process-inbound-email` Edge Function

After Step 5 (data preparation, ~line 364) and before Step 8 (message insert, ~line 599):

- Extract image attachments from `webhookData.attachments`
- For each image attachment, fetch from Resend Attachments API using the store's `resendApiKey`
- Download the image binary and upload to `email-attachments` bucket in Supabase Storage
- Collect `{ url, filename, content_type }` array
- Pass `attachments: savedAttachments` into the message insert at line 601

### 3. Update `MessageBubble.tsx`

- Add `attachments` to the `Message` interface (line 97-105)
- After the text/HTML content block and before the translation indicator (~line 219), render attachments:
  - Images: clickable `<img>` with max 300px, rounded, with filename caption
  - Other files: `<a>` link with Paperclip icon
- Import `Paperclip` from lucide-react

### 4. Update `src/types/helpdesk.ts`

- Add `attachments` field to the `Message` type

### Files modified
- New migration SQL (alter table + storage bucket + policies)
- `supabase/functions/process-inbound-email/index.ts` (attachment processing before insert)
- `src/components/helpdesk/MessageBubble.tsx` (render attachments)
- `src/types/helpdesk.ts` (add attachments to Message type)

