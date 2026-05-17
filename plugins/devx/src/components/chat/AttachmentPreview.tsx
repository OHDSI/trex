import { File as FileIcon } from "lucide-react";
import { API_BASE } from "@/lib/config";
import type { Attachment } from "@/lib/types";

interface AttachmentPreviewProps {
  attachments: Attachment[];
}

export function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((a) => {
        const isImage = a.content_type.startsWith("image/");
        const url = `${API_BASE}/attachments/${a.id}`;

        if (isImage) {
          return (
            <a
              key={a.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md overflow-hidden border max-w-48"
            >
              <img src={url} alt={a.filename} className="max-h-32 object-contain" />
            </a>
          );
        }

        return (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded border text-xs hover:bg-muted"
          >
            <FileIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-32">{a.filename}</span>
          </a>
        );
      })}
    </div>
  );
}
