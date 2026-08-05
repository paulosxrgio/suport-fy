import { useEffect, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MessageAttachment } from '@/types/helpdesk';

const BUCKET = 'email-attachments';

function extractPath(att: MessageAttachment): string | null {
  if (att.path) return att.path;
  if (!att.url) return null;
  const marker = `/${BUCKET}/`;
  const idx = att.url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(att.url.slice(idx + marker.length).split('?')[0]);
}

export function MessageAttachmentItem({ attachment }: { attachment: MessageAttachment }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const path = extractPath(attachment);
    if (!path) {
      setSignedUrl(null);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (active) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [attachment]);

  if (!signedUrl) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Paperclip className="w-4 h-4" />
        {attachment.filename}
      </span>
    );
  }

  if (attachment.content_type?.startsWith('image/')) {
    return (
      <div className="relative">
        <img
          src={signedUrl}
          alt={attachment.filename}
          className="max-w-[300px] max-h-[300px] rounded-lg object-cover border border-border cursor-pointer"
          onClick={() => window.open(signedUrl, '_blank')}
        />
        <span className="text-xs text-muted-foreground mt-1 block">{attachment.filename}</span>
      </div>
    );
  }

  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-primary underline"
    >
      <Paperclip className="w-4 h-4" />
      {attachment.filename}
    </a>
  );
}
