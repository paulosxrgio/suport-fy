

## Plan: Add `stripMarkdownLinks` to both edge functions

### 1. `auto-reply-scheduler/index.ts`

**Add function** (before the main `Deno.serve` or at top-level, near `stripQuotedText`): Insert the `stripMarkdownLinks` helper function.

**Line 768**: After getting `aiReply`, add `const cleanedReply = stripMarkdownLinks(aiReply);` right after the null check (line 772).

**Replace all downstream `aiReply` references with `cleanedReply`** at lines:
- 774 (log)
- 866-867 (fullContent/emailSignature)
- 908 (message insert content)
- 964 (memory update prompt)

### 2. `generate-ai-reply/index.ts`

**Add function**: Same `stripMarkdownLinks` helper at top-level.

**Line 626**: After getting `suggestedReply`, add `const cleanedReply = stripMarkdownLinks(suggestedReply);` after the null check.

**Line 638**: Return `cleanedReply` instead of `suggestedReply`.

### No other changes

